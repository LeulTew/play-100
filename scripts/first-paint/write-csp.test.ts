import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { textDigest, writeFirstPaintRecord } from '../build-metadata.ts';
import { mainDocumentPolicy, sha256Source } from './csp.ts';
import { writeCsp, writeFirstPaintHashes } from './write-csp.ts';

const hash = (text: string) => sha256Source(text);
const record = {
  script: textDigest('boot script'),
  styles: { online: textDigest('online style'), offline: textDigest('offline style') },
};
const vercel = (script: string, online: string, offline: string) =>
  `{
  "headers": [
    {
      "source": "/((?!__/auth/).*)",
      "headers": [
        { "key": "Reporting-Endpoints", "value": "csp=\\"/api/csp-report\\"" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' https://apis.google.com ${script}; style-src 'self' ${online} ${offline}; img-src 'self' data:; report-uri /api/csp-report; report-to csp" }
      ]
    },
    {
      "source": "/pwa/offline.html",
      "headers": [{ "key": "Content-Security-Policy", "value": "default-src 'none'; style-src 'self' 'unsafe-inline'" }]
    }
  ]
}
`;
const stale = vercel(hash('old boot'), hash('old online'), hash('old offline'));
const current = vercel(record.script.source, record.styles.online.source, record.styles.offline.source);

describe('first-paint CSP writer', () => {
  it("writes the build's hashes into the main-document policy and leaves every other byte as it was", () => {
    const next = writeFirstPaintHashes(stale, record);
    expect(next).toBe(current);
    expect(mainDocumentPolicy(JSON.parse(next))).toBe(
      `default-src 'self'; script-src 'self' https://apis.google.com ${record.script.source}; style-src 'self' ${record.styles.online.source} ${record.styles.offline.source}; img-src 'self' data:; report-uri /api/csp-report; report-to csp`,
    );
    expect(writeFirstPaintHashes(current, record)).toBe(current);
  });

  it('adds the hashes a policy lacks and drops the ones no inline block has', () => {
    const bare = stale.replace(` ${hash('old boot')}`, '').replace(` ${hash('old online')} ${hash('old offline')}`, '');
    expect(writeFirstPaintHashes(bare, record)).toBe(current);
    const extra = stale.replace(`${hash('old offline')};`, `${hash('old offline')} ${hash('removed shell')};`);
    expect(writeFirstPaintHashes(extra, record)).toBe(current);
  });

  it('refuses a vercel.json whose main-document policy it cannot find exactly once', () => {
    expect(() => writeFirstPaintHashes('{ "headers": [] }', record)).toThrow('exactly one /((?!__/auth/).*) rule');
    const twice = stale.replace(
      '"source": "/pwa/offline.html"',
      `"source": "/pwa/offline.html", "note": ${JSON.stringify(mainDocumentPolicy(JSON.parse(stale)))}`,
    );
    expect(() => writeFirstPaintHashes(twice, record)).toThrow('main-document Content-Security-Policy value once');
    expect(() =>
      writeFirstPaintHashes(stale.replace("script-src 'self' https://apis.google.com", 'worker-src'), record),
    ).toThrow('no script-src');
  });
});

describe('npm run csp:write', () => {
  let root = '';
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  /** A root with this vercel.json and a build that writes a first-paint record, noting each build's mode and policy. */
  const setup = async (policy: string, recorded = record) => {
    root = await mkdtemp(path.join(tmpdir(), 'play100-csp-write-'));
    await writeFile(path.join(root, 'vercel.json'), policy);
    const builds: { write: boolean; policy: string }[] = [];
    const build = async (environment: NodeJS.ProcessEnv) => {
      builds.push({
        write: environment.PLAY100_CSP_WRITE === '1',
        policy: await readFile(path.join(root, 'vercel.json'), 'utf8'),
      });
      const html = `<!doctype html><title>build ${builds.length}</title>`;
      await mkdir(path.join(root, 'dist'), { recursive: true });
      await writeFile(path.join(root, 'dist', 'index.html'), html);
      await writeFirstPaintRecord(path.join(root, 'dist'), {
        format: 1,
        variant: 'offline',
        indexHtml: textDigest(html),
        ...recorded,
      });
    };
    return { builds, build };
  };

  it('records the hashes in a write build, writes vercel.json, then builds again with the guard on', async () => {
    const { builds, build } = await setup(stale);
    const logged: string[] = [];
    expect(await writeCsp(root, build, (message) => logged.push(message))).toBe(true);
    expect(builds).toEqual([
      { write: true, policy: stale },
      { write: false, policy: current },
    ]);
    expect(await readFile(path.join(root, 'vercel.json'), 'utf8')).toBe(current);
    expect(logged.join('\n')).toContain(`${record.styles.online.source} (online)`);
  });

  it('leaves a vercel.json that already allows the build as it is, after one build', async () => {
    const { builds, build } = await setup(current);
    expect(await writeCsp(root, build, () => undefined)).toBe(false);
    expect(builds.map((entry) => entry.write)).toEqual([true]);
    expect(await readFile(path.join(root, 'vercel.json'), 'utf8')).toBe(current);
  });

  it('refuses a record that belongs to another build, and stops when a build fails', async () => {
    const { build } = await setup(stale);
    await expect(
      writeCsp(
        root,
        async (environment) => {
          await build(environment);
          await writeFile(path.join(root, 'dist', 'index.html'), '<!doctype html><title>other</title>');
        },
        () => undefined,
      ),
    ).rejects.toThrow('belongs to another build');
    await expect(
      writeCsp(
        root,
        () => {
          throw new Error('vite build failed (1).');
        },
        () => undefined,
      ),
    ).rejects.toThrow('vite build failed (1).');
    expect(await readFile(path.join(root, 'vercel.json'), 'utf8')).toBe(stale);
  });
});

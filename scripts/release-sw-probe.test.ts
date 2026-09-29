import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildInventory, parseSwArguments, parseSwInput, verifySwBuild } from './release-sw-inputs';
import { failedSwChecks, swProtocolChecks } from './release-sw-browser';
import { startSwServer, staticProbePath } from './release-sw-server';

const temporary: string[] = [];
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'release-sw-'));
  temporary.push(dir);
  const root = path.join(dir, 'dist');
  await mkdir(root);
  const config = JSON.stringify({
    headers: [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'self'" },
          { key: 'Permissions-Policy', value: 'camera=()' },
        ],
      },
    ],
  });
  await writeFile(path.join(dir, 'vercel.json'), config);
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('add', 'vercel.json');
  // commit-tree creates fixture history without running or altering the owner's commit hooks.
  const tree = git('write-tree');
  const commit = git(
    '-c',
    'user.name=LeulTew',
    '-c',
    'user.email=107800362+LeulTew@users.noreply.github.com',
    'commit-tree',
    tree,
    '-m',
    'Fixture policy',
  );
  const files = {
    'index.html': '<script type="module" src="/index.js"></script>',
    'index.js': 'console.log("fixture");',
    '404.html': '<h1>Not found</h1>',
    'sw.js': '/* worker fixture */',
    'pwa-assets.json': JSON.stringify({ version: 'fixture-version' }),
  };
  for (const [file, bytes] of Object.entries(files)) await writeFile(path.join(root, file), bytes);
  const inventory = await buildInventory(root);
  const manifest = JSON.stringify({ Files: inventory.rows });
  await writeFile(path.join(dir, 'manifest.json'), manifest);
  const receipt = {
    Source: commit,
    Passed: true,
    Status: 'CONFIGURED_BUILD_PASSED',
    Build: {
      Archive: { Root: 'dist', Path: 'manifest.json', SHA256: sha(manifest) },
      IndexHtml: sha(files['index.html']),
      SwJs: sha(files['sw.js']),
      PwaVersion: 'fixture-version',
    },
    Gate: { ConfiguredIdentity: { fingerprint: inventory.fingerprint } },
    Fingerprints: { Archive: inventory.fingerprint },
  };
  const text = JSON.stringify(receipt);
  await writeFile(path.join(dir, 'receipt.json'), text);
  const input = {
    receipt: path.join(dir, 'receipt.json'),
    receiptSha256: sha(text),
    commit,
    vercel: path.join(dir, 'vercel.json'),
    vercelSha256: sha(config),
  };
  return { dir, root, input, receipt };
}

describe('two-version release probe acceptance', () => {
  it('requires two immutable builds and a numeric loopback port', () => {
    const build = {
      receipt: 'r.json',
      receiptSha256: 'a'.repeat(64),
      vercel: 'v.json',
      vercelSha256: 'b'.repeat(64),
      commit: 'c'.repeat(40),
    };
    const input = {
      version: 1,
      baseline: build,
      candidate: { ...build, commit: 'd'.repeat(40) },
      evidence: 'fresh',
      port: 4290,
    };
    expect(parseSwInput(input, tmpdir()).port).toBe(4290);
    expect(() => parseSwInput({ ...input, candidate: build }, tmpdir())).toThrow('different');
    for (const port of [0, 80, 65536, 4290.5, '4290', 'https://example.com'])
      expect(() => parseSwInput({ ...input, port }, tmpdir())).toThrow('loopback');
    expect(() => parseSwArguments(['--input', 'a', '--input', 'b'])).toThrow();
  });
  it('binds complete archive bytes, source policy and candidate gate fingerprint', async () => {
    const { dir, root, input, receipt } = await fixture();
    const build = await verifySwBuild(input, true, dir);
    expect(build.files).toBe(5);
    expect(build.pwaVersion).toBe('fixture-version');
    await writeFile(path.join(root, 'index.js'), 'tampered');
    await expect(verifySwBuild(input, true, dir)).rejects.toThrow('changed');
    await writeFile(path.join(root, 'index.js'), 'console.log("fixture");');
    const altered = JSON.stringify({ ...receipt, Gate: { ConfiguredIdentity: { fingerprint: '0'.repeat(64) } } });
    await writeFile(input.receipt, altered);
    await expect(verifySwBuild({ ...input, receiptSha256: sha(altered) }, true, dir)).rejects.toThrow('gated');
  });
  it('rejects changed receipt digests, extra archive files and wrong source policies', async () => {
    const { dir, root, input } = await fixture();
    await expect(verifySwBuild({ ...input, receiptSha256: '0'.repeat(64) }, false, dir)).rejects.toThrow('digest');
    await writeFile(path.join(root, 'extra'), '');
    await expect(verifySwBuild(input, false, dir)).rejects.toThrow('extra');
    await rm(path.join(root, 'extra'));
    const changed = (await readFile(input.vercel, 'utf8')).replace('camera=()', 'camera=*');
    await writeFile(input.vercel, changed);
    await expect(verifySwBuild({ ...input, vercelSha256: sha(changed) }, false, dir)).rejects.toThrow('bound commit');
  });
  it('cannot pass with missing, false or merely truthy required checks', () => {
    expect(failedSwChecks({})).toEqual(swProtocolChecks);
    const checks = Object.fromEntries(swProtocolChecks.map((name) => [name, true]));
    expect(failedSwChecks(checks)).toEqual([]);
    expect(failedSwChecks({ ...checks, oneGuardedReload: false })).toEqual(['oneGuardedReload']);
  });
  it('serves both routes and exact worker bytes with the bound policy; no upstream proxy', async () => {
    const { dir, input } = await fixture();
    const build = await verifySwBuild(input, true, dir);
    // Port 0 is used only by this unit; the command accepts a fixed same-origin port.
    const server = await startSwServer(build, 0);
    try {
      const origin = server.origin;
      for (const pathname of ['/', '/my-games', '/sw.js']) {
        const response = await fetch(origin + pathname);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-security-policy')).toBe(build.csp);
        const expected = pathname === '/sw.js' ? build.swSha256 : build.indexSha256;
        expect(sha(Buffer.from(await response.arrayBuffer()))).toBe(expected);
      }
      expect((await fetch(origin + '/api/catalog')).status).toBe(503);
      expect((await fetch(origin + '/unknown')).status).toBe(404);
      expect(server.errors).toEqual([]);
    } finally {
      await server.stop();
    }
  });
  it('rejects encoded separator escapes rather than serving outside the archive', () => {
    expect(() => staticProbePath('/%5C..%5Csecret')).toThrow('Unsafe');
    expect(() => staticProbePath('/%00')).toThrow('Unsafe');
  });
});

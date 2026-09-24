import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCsp, emittedDocumentPolicy } from '../check-csp.ts';
import { cspProblems, directiveSources, inlineBlocks, mainDocumentPolicy, sha256Source } from './csp.ts';
import { stripBootScript } from './plugin.ts';

const vercel: unknown = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const bootScript = stripBootScript(readFileSync(new URL('../../src/first-paint/boot.js', import.meta.url), 'utf8'));
const script = 'window.booted = true;';
const policy = `default-src 'self'; script-src 'self' ${sha256Source(script)}; style-src 'self' 'unsafe-inline'`;
const page = `<!doctype html><html><head><style>a{color:red}</style><script>${script}</script><script type="module" crossorigin src="/assets/index-A.js"></script></head><body></body></html>`;
const folders: string[] = [];

afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true, maxRetries: 5 });
});

describe('inline blocks', () => {
  it('hashes the exact element content like a browser does', () => {
    expect(sha256Source('')).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
    expect(sha256Source('é')).not.toBe(sha256Source('e'));
  });

  it('lists active inline scripts and styles in document order', () => {
    const html = '<!-- <script>ignored()</script> --><style>b{}</style><noscript><style>c{}</style></noscript>' +
      '<script src="/a.js"></script><script type="module" crossorigin src="/b.js"></script><SCRIPT>go()</SCRIPT>';
    expect(inlineBlocks(html)).toEqual([
      { kind: 'style', bytes: 3, source: sha256Source('b{}') },
      { kind: 'script', bytes: 4, source: sha256Source('go()') },
    ]);
  });
});

describe('main-document policy', () => {
  it('reads the single main-document CSP from vercel.json', () => {
    const csp = mainDocumentPolicy(vercel);
    expect(directiveSources(csp, 'style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directiveSources(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directiveSources(csp, 'require-trusted-types-for')).toBeNull();
  });

  it('allows exactly the shipped boot script by hash (hash sync with src/first-paint/boot.js)', () => {
    const sources = directiveSources(mainDocumentPolicy(vercel), 'script-src') ?? [];
    expect(sources.filter(source => source.startsWith("'sha256-"))).toEqual([sha256Source(bootScript)]);
    expect(sources).toEqual(["'self'", 'https://apis.google.com', sha256Source(bootScript)]);
  });

  it('rejects configurations without exactly one main-document policy', () => {
    expect(() => mainDocumentPolicy({ headers: [] })).toThrow('exactly one');
    expect(() => mainDocumentPolicy({ headers: [{ source: '/((?!__/auth/).*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] }] })).toThrow('exactly one');
  });
});

describe('CSP problems', () => {
  it('accepts hashed inline scripts and inline styles under unsafe-inline', () => {
    expect(cspProblems([{ name: 'index.html', html: page }], policy)).toEqual([]);
  });

  it('names a missing hash and the source to add', () => {
    const [problem, ...rest] = cspProblems([{ name: 'index.html', html: page.replace(script, 'window.booted = 1;') }], policy);
    expect(problem).toContain(`add ${sha256Source('window.booted = 1;')} to script-src`);
    expect(rest).toEqual([expect.stringContaining('stale hash')]);
  });

  it('reports a hash that no inline script uses', () => {
    expect(cspProblems([{ name: 'index.html', html: page.replace(`<script>${script}</script>`, '') }], policy))
      .toEqual([expect.stringContaining(`${sha256Source(script)}, which matches no inline script`)]);
  });

  it('counts inline scripts across all documents under the policy', () => {
    expect(cspProblems([{ name: 'index.html', html: page }, { name: 'pwa/offline.html', html: '<h1>Offline</h1>' }], policy)).toEqual([]);
  });

  it('refuses unsafe-inline mixed with a hash or nonce', () => {
    expect(cspProblems([{ name: 'index.html', html: page }], `${policy} 'nonce-a'`))
      .toContain("style-src mixes 'unsafe-inline' with a hash or nonce, so browsers ignore 'unsafe-inline'.");
  });

  it('requires style hashes once style-src drops unsafe-inline', () => {
    const strict = policy.replace("'unsafe-inline'", sha256Source('a{color:red}'));
    expect(cspProblems([{ name: 'index.html', html: page }], strict)).toEqual([]);
    expect(cspProblems([{ name: 'index.html', html: page.replace('a{color:red}', 'a{color:blue}') }], strict))
      .toEqual([expect.stringContaining(`add ${sha256Source('a{color:blue}')} to style-src`)]);
  });

  it('falls back to default-src and refuses inline event handlers', () => {
    expect(cspProblems([{ name: 'index.html', html: page }], "default-src 'self'")).toEqual([
      expect.stringContaining('inline style #0'), expect.stringContaining('inline script #1'),
    ]);
    expect(cspProblems([{ name: 'index.html', html: page.replace('<body>', '<body><img src="/a.png" onerror="go()">') }], policy))
      .toEqual([expect.stringContaining('inline event-handler attribute')]);
  });
});

describe('check:csp', () => {
  async function dist(files: Record<string, string>) {
    const root = await mkdtemp(path.join(tmpdir(), 'play100-csp-test-'));
    folders.push(root);
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), content);
    }
    return root;
  }
  const configuration = { headers: [{ source: '/((?!__/auth/).*)', headers: [{ key: 'Content-Security-Policy', value: policy }] }] };
  const manifest = (value: string) => JSON.stringify({ documentPolicy: { headers: [{ name: 'content-security-policy', value }], sha256: '0'.repeat(64) } });

  it('passes a build whose documents and emitted offline policy match vercel.json, listing every inline block', async () => {
    const root = await dist({ 'index.html': page, 'pwa/offline.html': '<h1>Offline</h1>', 'pwa-assets.json': manifest(policy) });
    expect(await checkCsp(root, configuration)).toEqual({
      lines: [`index.html inline style #0: 12 B ${sha256Source('a{color:red}')}`, `index.html inline script #1: 21 B ${sha256Source(script)}`],
      problems: [],
    });
  });

  it('fails when the service worker would serve documents with another policy', async () => {
    const root = await dist({ 'index.html': page, 'pwa-assets.json': manifest("default-src 'self'") });
    expect((await checkCsp(root, configuration)).problems).toEqual([expect.stringContaining('pwa-assets.json embeds a different')]);
  });

  it('reads the emitted policy defensively', () => {
    expect(emittedDocumentPolicy(null)).toBeNull();
    expect(emittedDocumentPolicy({ documentPolicy: { headers: [{ name: 'x-frame-options', value: 'DENY' }] } })).toBeNull();
    expect(emittedDocumentPolicy(JSON.parse(manifest(policy)))).toBe(policy);
  });
});

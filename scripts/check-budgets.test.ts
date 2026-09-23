import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { budgetRows, eagerHtmlFiles, measureBuild, parseBudgetLimits } from './check-budgets';

const folders: string[] = [];
const source: Record<string, string> = {
  'index.html': '<script type="module" src="/assets/main-12345678.js"></script><link rel="modulepreload" href="/assets/shared-12345678.js"><link rel="stylesheet" href="/assets/main-12345678.css">',
  'assets/main-12345678.js': 'import "./shared-12345678.js"; export const value = 1;',
  'assets/shared-12345678.js': 'export const shared = 2;',
  'assets/nested-12345678.js': 'export const nested = 3;',
  'assets/main-12345678.css': 'body { color: black; }',
  'assets/lazy-12345678.js': 'export const lazy = "Only on demand";',
  'assets/lazy-12345678.css': '.lazy { color: green; }',
  'data/collection.json': '{"games":[]}',
};

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'play100-budget-test-'));
  folders.push(directory);
  for (const [file, content] of Object.entries(source)) {
    const target = path.join(directory, ...file.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await mkdir(path.join(directory, '.vite'));
  await writeFile(path.join(directory, '.vite', 'manifest.json'), JSON.stringify({
    'index.html': { file: 'assets/main-12345678.js', imports: ['shared'], css: ['assets/main-12345678.css'], dynamicImports: ['lazy'] },
    shared: { file: 'assets/shared-12345678.js', imports: ['nested'] },
    nested: { file: 'assets/nested-12345678.js', imports: ['index.html'] },
    lazy: { file: 'assets/lazy-12345678.js', css: ['assets/lazy-12345678.css'] },
  }));
  const core = ['index.html', 'data/collection.json'].map(file => ({
    url: `/${file}`, bytes: Buffer.byteLength(source[file]!),
  }));
  await writeFile(path.join(directory, 'pwa-assets.json'), JSON.stringify({
    format: 1, core, coreBytes: core.reduce((sum, entry) => sum + entry.bytes, 0),
    budget: { metadataBytes: 32768 },
  }));
  return directory;
}

afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

describe('offline built-output budgets', () => {
  it('finds module/preload/stylesheet assets regardless of attribute order and deduplicates them', () => {
    expect(eagerHtmlFiles(`
      <!-- <script type="module" src="/assets/comment.js"></script> -->
      <script crossorigin src='./assets/main.js' type = 'module'></script>
      <link href="/assets/main.js?v=1" rel="modulepreload">
      <LINK REL='stylesheet' HREF='/assets/style.css'>
      <link rel="modulepreload" href="/assets/shared.js">
      <link rel="preload" as="font" href="/assets/font.woff2">
      <script type="application/json">{"example": true}</script>
      <script>const example = '<link rel="stylesheet" href="/not-a-real-style.css">'</script>
    `)).toEqual(['assets/main.js', 'assets/shared.js', 'assets/style.css']);
  });

  it('refuses missing entries and nonlocal assets rather than omitting their cost', () => {
    expect(() => eagerHtmlFiles('<script>inlineOnly()</script>')).toThrow(/no external module/);
    expect(() => eagerHtmlFiles('<script type="module" src="https://cdn.test/app.js"></script>')).toThrow(/nonlocal/);
    expect(() => eagerHtmlFiles('<script type="module" src="/assets/%5csecret.js"></script>')).toThrow(/Invalid/);
  });

  it('sums gzip9 per eager JS/CSS file, follows static imports once, and excludes dynamic chunks', async () => {
    const directory = await fixture();
    const measured = await measureBuild(directory);
    const expected = [
      'assets/main-12345678.js', 'assets/main-12345678.css',
      'assets/shared-12345678.js', 'assets/nested-12345678.js',
    ];
    expect(measured.eager.map(asset => asset.file)).toEqual([...expected].sort());
    expect(measured.values.eagerCombinedGzipBytes).toBe(expected.reduce((sum, file) =>
      sum + gzipSync(source[file]!, { level: 9 }).byteLength, 0));
    expect(measured.eagerJsGzipBytes + measured.eagerCssGzipBytes).toBe(measured.values.eagerCombinedGzipBytes);
    expect(measured.eagerCssGzipBytes).toBe(gzipSync(source['assets/main-12345678.css']!, { level: 9 }).byteLength);
    expect(measured.css.map(asset => asset.file)).toEqual(['assets/lazy-12345678.css', 'assets/main-12345678.css']);
    expect(measured.values.cssRawBytes).toBe(Buffer.byteLength(source['assets/main-12345678.css']!) + Buffer.byteLength(source['assets/lazy-12345678.css']!));
    expect(measured.values.cssGzipBytes).toBe(measured.css.reduce((sum, asset) => sum + asset.gzipBytes, 0));
    expect(measured.largestLazy?.file).toBe('assets/lazy-12345678.js');
    expect(measured.largestLazyRaw?.file).toBe('assets/lazy-12345678.js');
    expect(measured.values.largestLazyRawBytes).toBe(Buffer.byteLength(source['assets/lazy-12345678.js']!));
    expect(measured.values.largestLazyGzipBytes).toBe(gzipSync(source['assets/lazy-12345678.js']!, { level: 9 }).byteLength);
    expect(measured.values.pwaCoreFiles).toBe(4);
    expect(measured.values.pwaCoreBytes).toBe(Buffer.byteLength(source['index.html']!) + Buffer.byteLength(source['data/collection.json']!) + 32768);
  });

  it('fails inconsistent or missing output instead of trusting manifest byte declarations', async () => {
    const directory = await fixture();
    const file = path.join(directory, 'pwa-assets.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.core[0].bytes += 1;
    await writeFile(file, JSON.stringify(manifest));
    await expect(measureBuild(directory)).rejects.toThrow(/differs from disk/);
    await rm(path.join(directory, 'assets', 'main-12345678.js'));
    await expect(measureBuild(directory)).rejects.toThrow(/Missing built asset/);
  });

  it.each([0, 32767, 32769])('rejects changing the fixed format-1 metadata reserve to %s', async metadataBytes => {
    const directory = await fixture();
    const file = path.join(directory, 'pwa-assets.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.budget.metadataBytes = metadataBytes;
    await writeFile(file, JSON.stringify(manifest));
    await expect(measureBuild(directory)).rejects.toThrow('PWA format 1 must reserve exactly 32768 metadata bytes.');
  });

  it('passes exact limits and reports each exceeded metric as a failure', async () => {
    const measured = await measureBuild(await fixture());
    const limits = parseBudgetLimits({ version: 1, limits: measured.values });
    expect(budgetRows(measured, limits).every(row => row.result === 'PASS')).toBe(true);
    for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
      const rows = budgetRows(measured, { ...limits, [key]: limits[key] - 1 });
      expect(rows.filter(row => row.result === 'FAIL').map(row => row.metric)).toEqual([key]);
    }
    expect(() => parseBudgetLimits({ version: 1, limits: { ...limits, eagerCombinedGzipBytes: 'unbounded' } })).toThrow(/Invalid budget/);
    expect(() => parseBudgetLimits({ version: 1, limits: {} })).toThrow(/Invalid budget/);
  });
});

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { budgetRows, eagerHtmlFiles, measureBuild, parseBudgetArguments, parseBudgetLimits, reportBudgets } from './check-budgets';
import type { BuildMeasurement } from './check-budgets';
import { buildManifestPath } from './build-metadata';

const folders: string[] = [];
const source: Record<string, string> = {
  'index.html': '<script type="module" src="/assets/main-12345678.js"></script><link rel="modulepreload" href="/assets/shared-12345678.js"><link rel="stylesheet" href="/assets/main-12345678.css"><noscript><link rel="stylesheet" href="/pwa/fallback.css"></noscript>',
  'assets/main-12345678.js': 'import "./shared-12345678.js"; export const value = 1;',
  'assets/shared-12345678.js': 'export const shared = 2;',
  'assets/nested-12345678.js': 'export const nested = 3;',
  'assets/main-12345678.css': 'body { color: black; }',
  'assets/lazy-12345678.js': 'export const lazy = "Only on demand";',
  'assets/lazy-12345678.css': '.lazy { color: green; }',
  'data/collection.json': '{"games":[]}',
  'pwa/offline.html': '<link rel="stylesheet" href="/pwa/fallback.css"><h1>Offline</h1>',
  'pwa/fallback.css': '.fallback { color: black; }',
};

async function fixture(inline = '') {
  const workspace = await mkdtemp(path.join(tmpdir(), 'play100-budget-test-'));
  folders.push(workspace);
  const directory = path.join(workspace, 'dist');
  const contents: Record<string, string> = { ...source, 'index.html': source['index.html']! + inline };
  for (const [file, content] of Object.entries(contents)) {
    const target = path.join(directory, ...file.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await mkdir(path.dirname(buildManifestPath(directory)), { recursive: true });
  await writeFile(buildManifestPath(directory), JSON.stringify({
    'index.html': { file: 'assets/main-12345678.js', imports: ['shared'], css: ['assets/main-12345678.css'], dynamicImports: ['lazy'] },
    shared: { file: 'assets/shared-12345678.js', imports: ['nested'] },
    nested: { file: 'assets/nested-12345678.js', imports: ['index.html'] },
    lazy: { file: 'assets/lazy-12345678.js', css: ['assets/lazy-12345678.css'] },
  }));
  const core = ['index.html', 'data/collection.json', 'pwa/offline.html', 'pwa/fallback.css'].map(file => ({
    url: `/${file}`, bytes: Buffer.byteLength(contents[file]!),
  }));
  await writeFile(path.join(directory, 'pwa-assets.json'), JSON.stringify({
    format: 1, core, coreBytes: core.reduce((sum, entry) => sum + entry.bytes, 0),
    budget: { metadataBytes: 32768 },
  }));
  return directory;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true, maxRetries: 5 });
});

describe('offline built-output budgets', () => {
  it.each(['.vite', 'assets/main.js.map'])('rejects deploy-only metadata leak %s even with a valid private manifest', async leak => {
    const directory = await fixture();
    const file = path.join(directory, ...leak.split('/'));
    if (leak === '.vite') await mkdir(file);
    else await writeFile(file, '{}');
    await expect(measureBuild(directory)).rejects.toThrow('Build metadata must not be deployed');
    await rm(file, { recursive: true });
    await expect(measureBuild(directory)).resolves.toBeDefined();
  });

  describe('artifacted budget results', () => {
    function measurement(): BuildMeasurement {
      const eager = [
        { file: 'assets/main.css', rawBytes: 20, gzipBytes: 10 },
        { file: 'assets/main.js', rawBytes: 80, gzipBytes: 40 },
      ];
      const largestLazy = { file: 'assets/lazy.js', rawBytes: 100, gzipBytes: 50 };
      return {
        values: {
          eagerCombinedGzipBytes: 50, cssRawBytes: 40, cssGzipBytes: 20, standaloneCssRawBytes: 10, standaloneCssGzipBytes: 8,
          pwaCoreBytes: 33168, pwaCoreFiles: 6, largestLazyRawBytes: 100, largestLazyGzipBytes: 50,
        },
        eager, eagerJsGzipBytes: 40, eagerCssGzipBytes: 10,
        css: [eager[0]!, { file: 'assets/lazy.css', rawBytes: 20, gzipBytes: 10 }],
        standaloneCss: [{ file: 'pwa/fallback.css', rawBytes: 10, gzipBytes: 8 }],
        inlineCss: [{ file: 'index.html#inline-0.css', rawBytes: 5, gzipBytes: 25 }],
        html: [{ file: 'index.html', rawBytes: 300, gzipBytes: 100 }, { file: 'pwa/offline.html', rawBytes: 100, gzipBytes: 60 }],
        combinedCssRawBytes: 50, combinedCssGzipBytes: 28, largestLazy, largestLazyRaw: largestLazy,
        pwa: { assetFiles: 4, assetBytes: 400, metadataBytes: 32768, metadataFiles: 2 },
      };
    }
    async function reportPath() {
      const folder = await mkdtemp(path.join(tmpdir(), 'play100-budget-report-'));
      folders.push(folder);
      vi.spyOn(console, 'table').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      return path.join(folder, 'budget-report.json');
    }

    it('writes deterministic passing JSON with every gate, reported-only total and eager file', async () => {
      const file = await reportPath();
      const measured = measurement();
      const commit = 'a'.repeat(40);
      vi.stubEnv('GITHUB_SHA', commit);
      expect(await reportBudgets(measured, measured.values, file)).toBe(0);
      const first = await readFile(file, 'utf8');
      const report = JSON.parse(first);
      expect(report).toEqual({
        schemaVersion: 1, sourceCommit: commit, pass: true,
        budgets: Object.entries(measured.values).map(([metric, value]) => ({
          metric, measured: value, cap: value, headroom: 0, pass: true,
        })),
        reportedOnly: {
          eagerJsGzipBytes: 40, eagerCssGzipBytes: 10, combinedCssRawBytes: 50, combinedCssGzipBytes: 28,
          html: measured.html, activeInlineCssRawBytes: 5, pwa: measured.pwa,
          largestLazyRaw: measured.largestLazyRaw, largestLazyGzip: measured.largestLazy,
        },
        eagerFiles: measured.eager,
      });
      expect(report.budgets).toHaveLength(9);
      expect(first.endsWith('\n')).toBe(true);
      expect(await reportBudgets(measured, measured.values, file)).toBe(0);
      expect(await readFile(file, 'utf8')).toBe(first);
    });

    it('writes over-cap JSON before returning failure, with a null commit outside CI', async () => {
      const file = await reportPath();
      const measured = measurement();
      vi.stubEnv('GITHUB_SHA', undefined);
      expect(await reportBudgets(measured, { ...measured.values, cssGzipBytes: 19 }, file)).toBe(1);
      const report = JSON.parse(await readFile(file, 'utf8'));
      expect(report).toMatchObject({ schemaVersion: 1, sourceCommit: null, pass: false });
      expect(report.budgets.filter((row: { pass: boolean }) => !row.pass)).toEqual([
        { metric: 'cssGzipBytes', measured: 20, cap: 19, headroom: -1, pass: false },
      ]);
      expect(report.budgets.filter((row: { pass: boolean }) => row.pass)).toHaveLength(8);
    });

    it('accepts only an optional --json path and rejects missing, unknown or extra arguments', () => {
      expect(parseBudgetArguments([])).toEqual({});
      expect(parseBudgetArguments(['--json', 'budget-report.json'])).toEqual({ jsonPath: 'budget-report.json' });
      for (const args of [
        ['--json'], ['--json', ''], ['--json', ' '], ['--json', '--other'], ['--other', 'report.json'],
        ['report.json'], ['--json=report.json'], ['--json', 'report.json', 'extra'], ['--json', 'one.json', '--json', 'two.json'],
      ]) expect(() => parseBudgetArguments(args)).toThrow('Usage: check-budgets [--json <path>].');
    });
  });

  it('rejects a generated precache metadata entry before trusting asset sizes', async () => {
    const directory = await fixture();
    const file = path.join(directory, 'pwa-assets.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const original = await readFile(file, 'utf8');
    manifest.core.push({ url: '/.vite/manifest.json', bytes: 0 });
    await writeFile(file, JSON.stringify(manifest));
    await expect(measureBuild(directory)).rejects.toThrow('Build metadata must not enter the public precache');
    await writeFile(file, original);
    await expect(measureBuild(directory)).resolves.toBeDefined();
  });

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
      <noscript><link rel="stylesheet" href="/pwa/fallback.css"></noscript>
    `)).toEqual(['assets/main.js', 'assets/shared.js', 'assets/style.css']);
  });

  it('tokenizes documents instead of pattern-matching them (comments, raw text, noscript, quoting, case)', () => {
    const entry = '<script type="module" src="/assets/main.js"></script>';
    expect(eagerHtmlFiles(`${entry}
      <!-- <script type="module" src="/assets/commented.js"></script> <link rel="stylesheet" href="/assets/commented.css"> -->
      <!--> <link rel="stylesheet" href="/assets/after-abrupt-comment.css">
      <script>const s = '<link rel="stylesheet" href="/assets/in-script.css">'</script\t\n bar><link rel="modulepreload" href="/assets/after-odd-end-tag.js">
      <style>a::after{content:'<link rel="stylesheet" href="/assets/in-style.css">'}</style>
      <noscript><link rel="stylesheet" href="/assets/in-noscript.css"><script type="module" src="/assets/in-noscript.js"></script></noscript>
      <link rel=stylesheet href=/assets/unquoted.css>
      <link rel='stylesheet' href="/assets/mixed-quotes.css" data-x='a"b'>
      <LINK REL="MODULEPRELOAD" HREF="/assets/upper.js">
      <link rel="stylesheet" href="/assets/first.css" href="/assets/duplicate.css">
      <title><link rel="stylesheet" href="/assets/in-title.css"></title>
    `)).toEqual([
      'assets/after-abrupt-comment.css', 'assets/after-odd-end-tag.js', 'assets/first.css', 'assets/main.js',
      'assets/mixed-quotes.css', 'assets/unquoted.css', 'assets/upper.js',
    ]);
  });

  it('reads only active inline styles, whatever the comment or end-tag spelling', async () => {
    const css = '.critical{display:block}';
    const markup = `<!-- <style>.commented{}</style> --><STYLE media="all">${css}</style\n><noscript><style>.fallback{}</style></noscript>` +
      '<script>document.write("<style>.in-script{}</style>")</script>';
    const measured = await measureBuild(await fixture(markup));
    expect(measured.inlineCss.map(asset => asset.rawBytes)).toEqual([Buffer.byteLength(css)]);
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
    expect(measured.standaloneCss.map(asset => asset.file)).toEqual(['pwa/fallback.css']);
    expect(measured.values.standaloneCssRawBytes).toBe(Buffer.byteLength(source['pwa/fallback.css']!));
    expect(measured.values.standaloneCssGzipBytes).toBe(gzipSync(source['pwa/fallback.css']!, { level: 9 }).byteLength);
    expect(measured.combinedCssRawBytes).toBe(measured.values.cssRawBytes + measured.values.standaloneCssRawBytes);
    expect(measured.combinedCssGzipBytes).toBe(measured.values.cssGzipBytes + measured.values.standaloneCssGzipBytes);
    expect(measured.values.pwaCoreFiles).toBe(6);
    expect(measured.values.pwaCoreBytes).toBe(['index.html', 'data/collection.json', 'pwa/offline.html', 'pwa/fallback.css']
      .reduce((sum, file) => sum + Buffer.byteLength(source[file]!), 32768));
  });

  it.each([
    ['index.html', '<link rel="stylesheet" href="/pwa/fallback.css">'],
    ['extra.html', '<link rel="stylesheet" href="/pwa/fallback.css">'],
    ['extra.html', '<noscript><link rel="stylesheet" href="/pwa/fallback.css"></noscript>'],
  ])('rejects a standalone stylesheet outside the two allowed document scopes: %s', async (file, markup) => {
    const directory = await fixture();
    await writeFile(path.join(directory, file), (file === 'index.html' ? source[file]! : '') + markup);
    await expect(measureBuild(directory)).rejects.toThrow(/Standalone stylesheet is only allowed/);
  });

  it('rejects app chunk and CSS-import references to standalone styles', async () => {
    const directory = await fixture();
    const file = buildManifestPath(directory);
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.lazy.css.push('pwa/fallback.css');
    await writeFile(file, JSON.stringify(manifest));
    await expect(measureBuild(directory)).rejects.toThrow(/Standalone stylesheet referenced by Vite app chunk/);
    manifest.lazy.css.pop();
    await writeFile(file, JSON.stringify(manifest));
    await writeFile(path.join(directory, 'assets', 'main-12345678.css'), '@import "../pwa/fallback.css";');
    await expect(measureBuild(directory)).rejects.toThrow(/Standalone stylesheet imported by app CSS/);
  });

  it('reports active inline critical CSS in its HTML without changing the emitted-CSS series', async () => {
    const css = '.critical { display: block; }';
    const before = await measureBuild(await fixture());
    const after = await measureBuild(await fixture(`<style>${css}</style>`));
    expect(after.inlineCss).toHaveLength(1);
    expect(after.inlineCss[0]?.rawBytes).toBe(Buffer.byteLength(css));
    expect(after.values.cssRawBytes).toBe(before.values.cssRawBytes);
    expect(after.values.cssGzipBytes).toBe(before.values.cssGzipBytes);
    expect(after.values.eagerCombinedGzipBytes).toBe(before.values.eagerCombinedGzipBytes);
    expect(after.values.standaloneCssRawBytes).toBe(before.values.standaloneCssRawBytes);
    const expected = source['index.html']! + `<style>${css}</style>`;
    expect(after.html.find(asset => asset.file === 'index.html')).toMatchObject({
      rawBytes: Buffer.byteLength(expected), gzipBytes: gzipSync(expected, { level: 9 }).byteLength,
    });
  });

  it('requires standalone styles to remain inside the bounded offline core', async () => {
    const directory = await fixture();
    const file = path.join(directory, 'pwa-assets.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.core = manifest.core.filter((asset: { url: string }) => asset.url !== '/pwa/fallback.css');
    manifest.coreBytes = manifest.core.reduce((sum: number, asset: { bytes: number }) => sum + asset.bytes, 0);
    await writeFile(file, JSON.stringify(manifest));
    await expect(measureBuild(directory)).rejects.toThrow(/Standalone CSS must also be included/);
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

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { assertPublicBuildOutput, assertPublicPrecachePaths, readBuildManifest } from './build-metadata';
export { assertDeferredBundleModules } from './eager-module-guard';

const metrics = [
  'eagerCombinedGzipBytes', 'cssRawBytes', 'cssGzipBytes',
  'standaloneCssRawBytes', 'standaloneCssGzipBytes',
  'pwaCoreBytes', 'pwaCoreFiles', 'largestLazyRawBytes', 'largestLazyGzipBytes',
] as const;
type Metric = typeof metrics[number];
export type BudgetLimits = Record<Metric, number>;
interface AssetSize { file: string; rawBytes: number; gzipBytes: number }
export interface BuildMeasurement {
  values: BudgetLimits;
  eager: AssetSize[];
  eagerJsGzipBytes: number;
  eagerCssGzipBytes: number;
  css: AssetSize[];
  standaloneCss: AssetSize[];
  inlineCss: AssetSize[];
  html: AssetSize[];
  combinedCssRawBytes: number;
  combinedCssGzipBytes: number;
  largestLazy: AssetSize | null;
  largestLazyRaw: AssetSize | null;
  pwa: { assetFiles: number; assetBytes: number; metadataBytes: number; metadataFiles: number };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseBudgetLimits(input: unknown): BudgetLimits {
  if (!object(input) || input.version !== 1 || !object(input.limits)) throw new Error('Invalid budgets.json format.');
  const values = input.limits;
  const read = (key: Metric) => {
    const value = values[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid budget: ${key}.`);
    return value;
  };
  return {
    eagerCombinedGzipBytes: read('eagerCombinedGzipBytes'), cssRawBytes: read('cssRawBytes'),
    cssGzipBytes: read('cssGzipBytes'), standaloneCssRawBytes: read('standaloneCssRawBytes'),
    standaloneCssGzipBytes: read('standaloneCssGzipBytes'), pwaCoreBytes: read('pwaCoreBytes'),
    pwaCoreFiles: read('pwaCoreFiles'), largestLazyRawBytes: read('largestLazyRawBytes'),
    largestLazyGzipBytes: read('largestLazyGzipBytes'),
  };
}

function localFile(value: string): string {
  const url = new URL(value, 'https://build.invalid/');
  if (url.origin !== 'https://build.invalid' || url.username || url.password) {
    throw new Error(`Cannot measure a nonlocal build asset: ${value}`);
  }
  const file = decodeURIComponent(url.pathname).slice(1);
  if (!file || file.includes('\\') || file.includes('\0') ||
    file.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid build asset path: ${value}`);
  }
  return file;
}

function activeHtml(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, '$1</script>')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, '');
}

function documentTags(html: string) {
  const markup = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, '$1</script>')
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style\s*>/gi, '$1</style>');
  const tags: { name: string; attributes: Map<string, string> }[] = [];
  for (const tag of markup.matchAll(/<(script|link)\b([^>]*?)>/gi)) {
    const attributes = new Map<string, string>();
    for (const attribute of (tag[2] ?? '').matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      attributes.set(attribute[1]!.toLowerCase(), attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    tags.push({ name: tag[1]!.toLowerCase(), attributes });
  }
  return tags;
}

export function eagerHtmlFiles(html: string): string[] {
  const files = new Set<string>();
  let modules = 0;
  for (const { name, attributes } of documentTags(activeHtml(html))) {
    const rel = attributes.get('rel')?.toLowerCase().split(/\s+/) ?? [];
    if (name === 'script' && attributes.get('type')?.toLowerCase() === 'module' && attributes.has('src')) {
      modules += 1;
      files.add(localFile(attributes.get('src')!));
    } else if (name === 'link' && attributes.has('href') &&
      (rel.includes('modulepreload') || rel.includes('stylesheet'))) {
      files.add(localFile(attributes.get('href')!));
    }
  }
  if (!modules) throw new Error('dist/index.html has no external module entry.');
  return [...files].sort();
}

function standalone(file: string): boolean {
  return file.startsWith('pwa/') && file.endsWith('.css');
}

function rejectStandaloneImports(css: string, from: string): void {
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
    const url = new URL(match[1]!, `https://build.invalid/${from}`);
    if (url.origin === 'https://build.invalid' && standalone(localFile(url.href))) {
      throw new Error(`Standalone stylesheet imported by app CSS: ${from}`);
    }
  }
}

async function buildFiles(root: string, relative = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Build assets must not be symbolic links: ${name}`);
    if (entry.isDirectory()) files.push(...await buildFiles(root, name));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

export async function measureBuild(root: string): Promise<BuildMeasurement> {
  await assertPublicBuildOutput(root);
  const files = new Set(await buildFiles(root));
  const sizes = new Map<string, AssetSize>();
  const size = async (file: string) => {
    if (!files.has(file)) throw new Error(`Missing built asset: ${file}. Build before checking budgets.`);
    const cached = sizes.get(file);
    if (cached) return cached;
    const bytes = await readFile(path.join(root, ...file.split('/')));
    const result = { file, rawBytes: bytes.byteLength, gzipBytes: gzipSync(bytes, { level: 9 }).byteLength };
    sizes.set(file, result);
    return result;
  };
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const eagerFiles = new Set(eagerHtmlFiles(html));
  const inlineCss: AssetSize[] = [];
  const documents: AssetSize[] = [];
  for (const document of [...files].filter(file => file.endsWith('.html'))) {
    const source = await readFile(path.join(root, ...document.split('/')), 'utf8');
    documents.push({ file: document, rawBytes: Buffer.byteLength(source),
      gzipBytes: gzipSync(source, { level: 9 }).byteLength });
    const active = activeHtml(source);
    if (document !== 'pwa/offline.html') {
      for (const { name, attributes } of documentTags(document === 'index.html' ? active : source)) {
        const rel = attributes.get('rel')?.toLowerCase().split(/\s+/) ?? [];
        if (name !== 'link' || !attributes.has('href') ||
          !rel.some(value => ['stylesheet', 'preload', 'prefetch'].includes(value))) continue;
        if (standalone(localFile(attributes.get('href')!))) {
          throw new Error(`Standalone stylesheet is only allowed in offline.html or index.html noscript: ${document}`);
        }
      }
      for (const [index, match] of Array.from(active.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)).entries()) {
        const css = match[1]!;
        rejectStandaloneImports(css, document);
        inlineCss.push({ file: `${document}#inline-${index}.css`, rawBytes: Buffer.byteLength(css),
          gzipBytes: gzipSync(css, { level: 9 }).byteLength });
      }
    }
  }
  const manifest: unknown = await readBuildManifest(root);
  if (!object(manifest)) throw new Error('Invalid Vite build manifest.');
  for (const [key, chunk] of Object.entries(manifest)) {
    if (!object(chunk) || chunk.css === undefined) continue;
    if (!Array.isArray(chunk.css) || chunk.css.some(value => typeof value !== 'string')) throw new Error(`Invalid Vite css: ${key}`);
    if (chunk.css.some(value => standalone(localFile(`/${value}`)))) {
      throw new Error(`Standalone stylesheet referenced by Vite app chunk: ${key}`);
    }
  }
  const visited = new Set<string>();
  const visit = (key: string) => {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    if (!object(chunk) || typeof chunk.file !== 'string') throw new Error(`Missing Vite manifest entry: ${key}`);
    visited.add(key);
    eagerFiles.add(localFile(`/${chunk.file}`));
    for (const field of ['imports', 'css'] as const) {
      const values = chunk[field] ?? [];
      if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new Error(`Invalid Vite ${field}: ${key}`);
      for (const value of values) {
        if (field === 'imports') visit(value);
        else eagerFiles.add(localFile(`/${value}`));
      }
    }
  };
  for (const [key, chunk] of Object.entries(manifest)) {
    if (object(chunk) && typeof chunk.file === 'string' && eagerFiles.has(localFile(`/${chunk.file}`))) visit(key);
  }
  if ([...eagerFiles].some(standalone)) throw new Error('Standalone CSS cannot enter the JavaScript-enabled eager graph.');
  const eager = await Promise.all([...eagerFiles].sort().map(size));
  const allCss = [...files].filter(file => file.endsWith('.css'));
  if (allCss.some(file => !file.startsWith('assets/') && !standalone(file))) {
    throw new Error('A stylesheet is outside the declared app/standalone CSS scopes.');
  }
  const css = await Promise.all(allCss.filter(file => file.startsWith('assets/')).map(size));
  const standaloneCss = await Promise.all(allCss.filter(standalone).map(size));
  for (const asset of css) rejectStandaloneImports(await readFile(path.join(root, ...asset.file.split('/')), 'utf8'), asset.file);
  const lazy = await Promise.all([...files].filter(file => file.startsWith('assets/') && file.endsWith('.js') && !eagerFiles.has(file)).map(size));
  lazy.sort((a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file));
  const largestLazyRaw = [...lazy].sort((a, b) => b.rawBytes - a.rawBytes || a.file.localeCompare(b.file))[0] ?? null;
  const pwa: unknown = JSON.parse(await readFile(path.join(root, 'pwa-assets.json'), 'utf8'));
  if (!object(pwa) || pwa.format !== 1 || !Array.isArray(pwa.core) || !object(pwa.budget)) {
    throw new Error('Invalid built PWA asset manifest.');
  }
  if (pwa.budget.metadataBytes !== 32768) throw new Error('PWA format 1 must reserve exactly 32768 metadata bytes.');
  const coreFiles = new Set<string>();
  let coreBytes = 0;
  for (const asset of pwa.core) {
    if (!object(asset) || typeof asset.url !== 'string' || typeof asset.bytes !== 'number') throw new Error('Invalid PWA core asset.');
    assertPublicPrecachePaths([asset.url]);
    const file = localFile(asset.url);
    if (coreFiles.has(file)) throw new Error(`Duplicate PWA core asset: ${file}`);
    coreFiles.add(file);
    const actual = await size(file);
    if (actual.rawBytes !== asset.bytes) throw new Error(`PWA core byte declaration differs from disk: ${file}`);
    coreBytes += actual.rawBytes;
  }
  if (!coreFiles.size || pwa.coreBytes !== coreBytes) throw new Error('PWA core byte total is missing or inconsistent.');
  if (standaloneCss.some(asset => !coreFiles.has(asset.file))) {
    throw new Error('Standalone CSS must also be included in the bounded PWA core.');
  }
  // Format 1 reserves the ready marker and page-version map in addition to public files.
  const metadataFiles = 2;
  return {
    values: {
      eagerCombinedGzipBytes: eager.reduce((sum, asset) => sum + asset.gzipBytes, 0),
      cssRawBytes: css.reduce((sum, asset) => sum + asset.rawBytes, 0),
      cssGzipBytes: css.reduce((sum, asset) => sum + asset.gzipBytes, 0),
      standaloneCssRawBytes: standaloneCss.reduce((sum, asset) => sum + asset.rawBytes, 0),
      standaloneCssGzipBytes: standaloneCss.reduce((sum, asset) => sum + asset.gzipBytes, 0),
      pwaCoreBytes: coreBytes + pwa.budget.metadataBytes,
      pwaCoreFiles: coreFiles.size + metadataFiles,
      largestLazyRawBytes: largestLazyRaw?.rawBytes ?? 0,
      largestLazyGzipBytes: lazy[0]?.gzipBytes ?? 0,
    },
    eager,
    eagerJsGzipBytes: eager.filter(asset => asset.file.endsWith('.js')).reduce((sum, asset) => sum + asset.gzipBytes, 0),
    eagerCssGzipBytes: eager.filter(asset => asset.file.endsWith('.css')).reduce((sum, asset) => sum + asset.gzipBytes, 0),
    css, standaloneCss, inlineCss, html: documents,
    combinedCssRawBytes: [...css, ...standaloneCss].reduce((sum, asset) => sum + asset.rawBytes, 0),
    combinedCssGzipBytes: [...css, ...standaloneCss].reduce((sum, asset) => sum + asset.gzipBytes, 0),
    largestLazy: lazy[0] ?? null, largestLazyRaw,
    pwa: { assetFiles: coreFiles.size, assetBytes: coreBytes, metadataBytes: pwa.budget.metadataBytes, metadataFiles },
  };
}

export function budgetRows(measured: BuildMeasurement, limits: BudgetLimits) {
  return metrics.map(metric => ({
    metric, actual: measured.values[metric], limit: limits[metric],
    result: measured.values[metric] <= limits[metric] ? 'PASS' : 'FAIL',
  }));
}

export function parseBudgetArguments(args: readonly string[]): { jsonPath?: string } {
  if (args.length === 0) return {};
  if (args.length !== 2 || args[0] !== '--json' || !args[1]?.trim() || args[1].startsWith('-')) {
    throw new Error('Usage: check-budgets [--json <path>].');
  }
  return { jsonPath: args[1] };
}

export async function reportBudgets(
  measured: BuildMeasurement, limits: BudgetLimits, jsonPath?: string, sourceCommit: string | null = process.env.GITHUB_SHA || null,
): Promise<0 | 1> {
  const rows = budgetRows(measured, limits);
  console.table(rows);
  console.log(`Eager JS gzip9: ${measured.eagerJsGzipBytes}; eager CSS gzip9: ${measured.eagerCssGzipBytes}. The enforced eager cap covers both.`);
  console.log(`App CSS (Vite assets): ${measured.values.cssRawBytes} raw / ${measured.values.cssGzipBytes} gzip9.`);
  console.log(`Standalone-document CSS: ${measured.values.standaloneCssRawBytes} raw / ${measured.values.standaloneCssGzipBytes} gzip9; also counted in PWA core.`);
  console.log(`Combined CSS, reported without a combined gate: ${measured.combinedCssRawBytes} raw / ${measured.combinedCssGzipBytes} gzip9.`);
  console.log(`HTML (including inline styles): ${measured.html.map(asset => `${asset.file}: ${asset.rawBytes} raw / ${asset.gzipBytes} gzip9`).join('; ')}`);
  console.log(`Active inline CSS: ${measured.inlineCss.reduce((sum, asset) => sum + asset.rawBytes, 0)} raw bytes, already included in the HTML totals; fragment gzip values are not added to transfer totals.`);
  console.log(`Eager JS/CSS (deduplicated, gzip level 9 per file): ${measured.eager.map(asset => asset.file).join(', ')}`);
  console.log(`PWA: ${measured.pwa.assetFiles} public files / ${measured.pwa.assetBytes} bytes, plus ${measured.pwa.metadataFiles} metadata entries / ${measured.pwa.metadataBytes} reserved bytes.`);
  if (measured.largestLazy) console.log(`Largest lazy gzip chunk: ${measured.largestLazy.file}`);
  if (measured.largestLazyRaw) console.log(`Largest lazy raw chunk: ${measured.largestLazyRaw.file}`);
  const pass = rows.every(row => row.result === 'PASS');
  if (jsonPath !== undefined) {
    const report = {
      schemaVersion: 1,
      sourceCommit,
      pass,
      budgets: rows.map(row => ({
        metric: row.metric, measured: row.actual, cap: row.limit, headroom: row.limit - row.actual, pass: row.result === 'PASS',
      })),
      reportedOnly: {
        eagerJsGzipBytes: measured.eagerJsGzipBytes,
        eagerCssGzipBytes: measured.eagerCssGzipBytes,
        combinedCssRawBytes: measured.combinedCssRawBytes,
        combinedCssGzipBytes: measured.combinedCssGzipBytes,
        html: measured.html,
        activeInlineCssRawBytes: measured.inlineCss.reduce((sum, asset) => sum + asset.rawBytes, 0),
        pwa: measured.pwa,
        largestLazyRaw: measured.largestLazyRaw,
        largestLazyGzip: measured.largestLazy,
      },
      eagerFiles: measured.eager,
    };
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return pass ? 0 : 1;
}

async function main() {
  const { jsonPath } = parseBudgetArguments(process.argv.slice(2));
  const limits = parseBudgetLimits(JSON.parse(await readFile('budgets.json', 'utf8')));
  const measured = await measureBuild(path.resolve('dist'));
  if (await reportBudgets(measured, limits, jsonPath) === 1) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((cause: unknown) => {
    console.error('Build budget check failed:', cause instanceof Error ? cause.message : 'Unknown measurement error.');
    process.exitCode = 1;
  });
}

import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertDeferredBundleModules, eagerHtmlFiles } from './check-budgets.ts';
import { assertPublicBuildOutput, assertPublicPrecachePaths, retainBuildManifest } from './build-metadata.ts';
import { build } from 'vite';
import type { Manifest, Plugin, ResolvedConfig } from 'vite';
import { PWA_ICONS, writePwaIcons } from './pwa-icons.ts';
import {
  isPublicPwaFile,
  parsePwaDocumentPolicy,
  PWA_BUDGET,
  PWA_DOCUMENT_HEADERS,
  validatePwaManifest,
} from '../src/pwa/worker.ts';
import type { PwaAsset, PwaBuildManifest, PwaDocumentPolicy } from '../src/pwa/types.ts';
import { isMainDocumentRule } from '../src/lib/vercel-routes.ts';

export const PWA_ROOTS = [
  'index.html',
  'src/lib/storage-recovery.ts',
  'src/components/personal/MyGamesPage.tsx',
  'src/components/personal/CatalogDetail.tsx',
  'src/components/catalog/DiscoverPage.tsx',
  'src/pwa/apply-update.ts',
  'src/components/DataUseContent.tsx',
  'src/lib/discovery-catalog.ts',
  'src/lib/google-intent.ts',
  'src/lib/comparison-game-filter.ts',
  'src/lib/friend-comparison-intent.ts',
  'src/components/AboutDialog.tsx',
  'src/components/app/SettingsPanel.tsx',
  'src/pwa/client-entry.ts',
  'src/components/CollectionExtras.tsx',
] as const;
const publicCore = [
  '/index.html',
  '/manifest.webmanifest',
  '/pwa/offline.html',
  '/pwa/fallback.css',
  '/favicon.svg',
  '/data/collection.json',
  '/data/discovery/catalog.v1.json',
  ...PWA_ICONS.map((icon) => `/pwa/${icon.file}`),
];

export function pwaCorePaths(manifest: Manifest): string[] {
  const seen = new Set<string>();
  const paths = new Set(publicCore);
  const visit = (key: string) => {
    if (seen.has(key)) return;
    if (key.startsWith('src/cloud/') || key.startsWith('src/components/scene/')) {
      throw new Error(`The offline core unexpectedly imports an online/3D entry: ${key}`);
    }
    const chunk = manifest[key];
    if (!chunk) throw new Error(`The offline build is missing required Vite entry ${key}.`);
    seen.add(key);
    for (const file of [
      chunk.file,
      ...(chunk.css ?? []),
      ...(chunk.assets ?? []).filter((file) => file.endsWith('.woff2')),
    ]) {
      const url = `/${file}`;
      if (!isPublicPwaFile(url)) throw new Error(`The offline build contains an unapproved asset: ${file}`);
      paths.add(url);
    }
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  for (const root of PWA_ROOTS) visit(root);
  assertPublicPrecachePaths([...paths]);
  return [...paths].sort();
}

function assetType(url: string): PwaAsset['type'] {
  if (url.endsWith('.html')) return 'html';
  if (url.endsWith('.webmanifest')) return 'manifest';
  if (url.endsWith('.json')) return 'json';
  if (url.endsWith('.js')) return 'script';
  if (url.endsWith('.css')) return 'style';
  if (url.endsWith('.woff2')) return 'font';
  return 'image';
}
const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function pwaDocumentPolicy(configuration: unknown): PwaDocumentPolicy {
  if (
    !configuration ||
    typeof configuration !== 'object' ||
    !('headers' in configuration) ||
    !Array.isArray(configuration.headers)
  ) {
    throw new Error('The deployment security-header configuration is missing.');
  }
  const rules: unknown[] = configuration.headers;
  const matches = rules.filter(isMainDocumentRule);
  const rule: unknown = matches[0];
  if (
    matches.length !== 1 ||
    !rule ||
    typeof rule !== 'object' ||
    !('headers' in rule) ||
    !Array.isArray(rule.headers)
  ) {
    throw new Error('The deployment must have exactly one main document security-header rule.');
  }
  const headers: Array<{ name: string; value: string }> = [];
  for (const name of PWA_DOCUMENT_HEADERS) {
    const ruleHeaders: unknown[] = rule.headers;
    const entries = ruleHeaders.filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        'key' in entry &&
        typeof entry.key === 'string' &&
        entry.key.toLowerCase() === name,
    );
    if (entries.length > 1) throw new Error(`Duplicate document security header: ${name}`);
    const entry: unknown = entries[0];
    if (!entry) continue;
    if (typeof entry !== 'object' || !('value' in entry) || typeof entry.value !== 'string')
      throw new Error(`Invalid document security header: ${name}`);
    headers.push({ name, value: entry.value });
  }
  return parsePwaDocumentPolicy({ headers, sha256: digest(JSON.stringify(headers)) });
}

export function pwaBuildVersion(
  core: readonly PwaAsset[],
  images: readonly PwaAsset[],
  worker: string,
  documentPolicy: PwaDocumentPolicy,
): string {
  return digest(JSON.stringify({ core, images, worker, documentPolicySha256: documentPolicy.sha256 }));
}

async function describeAsset(output: string, url: string): Promise<PwaAsset> {
  if (!isPublicPwaFile(url)) throw new Error('Refusing to inventory an unapproved offline asset.');
  const bytes = await readFile(path.join(output, ...url.slice(1).split('/')));
  return { url, bytes: bytes.byteLength, sha256: digest(bytes), type: assetType(url) };
}

/**
 * sw.js, the worker as one self-contained ES module: Rolldown (through Vite's build API) bundles src/pwa/worker.ts and
 * the modules it imports, such as the route list in src/lib/routes.ts, and keeps the worker's exports. The build fails
 * if the bundle would load anything else.
 */
export async function emitPwaWorker(root: string): Promise<string> {
  const result = await build({
    configFile: false,
    envFile: false,
    root,
    logLevel: 'silent',
    publicDir: false,
    build: {
      write: false,
      emptyOutDir: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      minify: false,
      target: 'es2022',
      lib: { entry: path.join(root, 'src', 'pwa', 'worker.ts'), formats: ['es'], fileName: () => 'sw.js' },
      rolldownOptions: { output: { codeSplitting: false, comments: false } },
    },
  });
  const files = (Array.isArray(result) ? result : [result]).flatMap((output) =>
    'output' in output ? output.output : [],
  );
  const [chunk] = files;
  if (
    files.length !== 1 ||
    chunk?.type !== 'chunk' ||
    chunk.imports.length ||
    chunk.dynamicImports.length ||
    /^\s*import[\s({]/m.test(chunk.code)
  )
    throw new Error('The offline worker must bundle into one self-contained module.');
  return chunk.code;
}
const NOT_FOUND_SOURCE_STYLESHEET = '<link rel="stylesheet" href="/pwa/fallback.css">';

/**
 * public/404.html and the worker's copy of it link the plain offline stylesheet in source. The built page links the
 * app's own entry stylesheets instead, so it wears the app's type, wordmark and buttons; they are eager, so the
 * worker has them cached for its offline copy too.
 */
export function styleNotFoundPage(text: string, stylesheets: readonly string[]): string {
  if (!stylesheets.length) throw new Error('The not-found page needs the app entry stylesheet.');
  const parts = text.split(NOT_FOUND_SOURCE_STYLESHEET);
  if (parts.length !== 2) throw new Error(`The not-found page must link /pwa/fallback.css exactly once.`);
  return parts.join(stylesheets.map((file) => `<link rel="stylesheet" href="/${file}">`).join('\n  '));
}

export async function generatePwaBuild(root: string, output: string): Promise<PwaBuildManifest> {
  const viteManifest = await retainBuildManifest(output);
  await writePwaIcons(root, output);
  const core = await Promise.all(pwaCorePaths(viteManifest).map((url) => describeAsset(output, url)));
  const images: PwaAsset[] = [];
  for (const directory of ['covers', 'images/discovery']) {
    const physical = path.join(output, ...directory.split('/'));
    for (const entry of await readdir(physical, { withFileTypes: true })) {
      const url = `/${directory}/${entry.name}`;
      if (!entry.isFile() || !isPublicPwaFile(url) || !url.endsWith('.webp')) continue;
      if ((await stat(path.join(physical, entry.name))).size > PWA_BUDGET.imageFileBytes) continue;
      images.push(await describeAsset(output, url));
    }
  }
  images.sort((a, b) => a.url.localeCompare(b.url));
  const entryStylesheets = eagerHtmlFiles(await readFile(path.join(output, 'index.html'), 'utf8')).filter((file) =>
    file.endsWith('.css'),
  );
  const notFound = path.join(output, '404.html');
  await writeFile(notFound, styleNotFoundPage(await readFile(notFound, 'utf8'), entryStylesheets));
  const workerText = styleNotFoundPage(await emitPwaWorker(root), entryStylesheets);
  const documentPolicy = pwaDocumentPolicy(JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8')));
  const manifest: PwaBuildManifest = {
    format: 1,
    version: pwaBuildVersion(core, images, workerText, documentPolicy),
    core,
    images,
    documentPolicy,
  };
  assertPublicPrecachePaths(manifest.core.map((asset) => asset.url));
  validatePwaManifest(manifest);
  const script = `${workerText}\ninstallPwaWorker(self, ${JSON.stringify(manifest)});\n`;
  await writeFile(path.join(output, 'sw.js'), script);
  await writeFile(
    path.join(output, 'pwa-assets.json'),
    `${JSON.stringify(
      {
        ...manifest,
        budget: PWA_BUDGET,
        coreBytes: core.reduce((sum, asset) => sum + asset.bytes, 0),
        imagePolicy: 'runtime-only; no image precache',
      },
      null,
      2,
    )}\n`,
  );
  await assertPublicBuildOutput(output);
  return manifest;
}

export function play100Pwa(): Plugin {
  let resolved: ResolvedConfig;
  return {
    name: 'play100-public-offline',
    apply: 'build',
    config: () => ({ build: { manifest: true } }),
    configResolved(config) {
      resolved = config;
    },
    async writeBundle(_options, bundle) {
      if (!resolved || resolved.base !== '/')
        throw new Error('Play 100 offline scope requires the existing origin-root deployment.');
      const output = path.resolve(resolved.root, resolved.build.outDir);
      assertDeferredBundleModules(
        resolved.root,
        bundle,
        eagerHtmlFiles(await readFile(path.join(output, 'index.html'), 'utf8')),
      );
      await generatePwaBuild(resolved.root, output);
    },
  };
}

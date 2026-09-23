import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { Manifest, Plugin, ResolvedConfig } from 'vite';
import { PWA_ICONS, writePwaIcons } from './pwa-icons';
import { isPublicPwaFile, PWA_BUDGET, validatePwaManifest } from '../src/pwa/worker';
import type { PwaAsset, PwaBuildManifest } from '../src/pwa/types';

export const PWA_ROOTS = [
  'index.html', 'src/components/personal/MyGamesPage.tsx',
  'src/components/personal/CatalogDetail.tsx', 'src/components/catalog/DiscoverPage.tsx',
  'src/pwa/apply-update.ts',
  'src/components/DataUseContent.tsx',
  'src/lib/discovery-catalog.ts', 'src/lib/google-intent.ts',
  'src/lib/comparison-game-filter.ts', 'src/lib/friend-comparison-intent.ts',
] as const;
const publicCore = [
  '/index.html', '/manifest.webmanifest', '/pwa/offline.html', '/favicon.svg',
  '/data/collection.json', '/data/discovery/catalog.v1.json',
  ...PWA_ICONS.map(icon => `/pwa/${icon.file}`),
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
    for (const file of [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? []).filter(file => file.endsWith('.woff2'))]) {
      const url = `/${file}`;
      if (!isPublicPwaFile(url)) throw new Error(`The offline build contains an unapproved asset: ${file}`);
      paths.add(url);
    }
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  for (const root of PWA_ROOTS) visit(root);
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

async function describeAsset(output: string, url: string): Promise<PwaAsset> {
  if (!isPublicPwaFile(url)) throw new Error('Refusing to inventory an unapproved offline asset.');
  const bytes = await readFile(path.join(output, ...url.slice(1).split('/')));
  return { url, bytes: bytes.byteLength, sha256: digest(bytes), type: assetType(url) };
}

export async function generatePwaBuild(root: string, output: string): Promise<PwaBuildManifest> {
  const viteManifest: Manifest = JSON.parse(await readFile(path.join(output, '.vite', 'manifest.json'), 'utf8'));
  await writePwaIcons(root, output);
  const core = await Promise.all(pwaCorePaths(viteManifest).map(url => describeAsset(output, url)));
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
  const source = await readFile(path.join(root, 'src', 'pwa', 'worker.ts'), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true },
    reportDiagnostics: true,
  });
  if (result.diagnostics?.some(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)) {
    throw new Error('The offline worker could not be emitted.');
  }
  const manifest: PwaBuildManifest = {
    format: 1, version: digest(JSON.stringify({ core, images, worker: result.outputText })), core, images,
  };
  validatePwaManifest(manifest);
  const script = `${result.outputText}\ninstallPwaWorker(self, ${JSON.stringify(manifest)});\n`;
  await writeFile(path.join(output, 'sw.js'), script);
  await writeFile(path.join(output, 'pwa-assets.json'), `${JSON.stringify({
    ...manifest,
    budget: PWA_BUDGET,
    coreBytes: core.reduce((sum, asset) => sum + asset.bytes, 0),
    imagePolicy: 'runtime-only; no image precache',
  }, null, 2)}\n`);
  return manifest;
}

export function play100Pwa(): Plugin {
  let resolved: ResolvedConfig;
  return {
    name: 'play100-public-offline',
    apply: 'build',
    config: () => ({ build: { manifest: true } }),
    configResolved(config) { resolved = config; },
    async writeBundle() {
      if (!resolved || resolved.base !== '/') throw new Error('Play 100 offline scope requires the existing origin-root deployment.');
      const output = path.resolve(resolved.root, resolved.build.outDir);
      await generatePwaBuild(resolved.root, output);
    },
  };
}

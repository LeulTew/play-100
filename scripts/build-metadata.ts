import { lstat, mkdir, readFile, readdir, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import type { Manifest } from 'vite';

export function buildManifestPath(output: string): string {
  const directory = path.resolve(output);
  const destination = path.join(path.dirname(directory), '.build-meta', path.basename(directory), 'vite-manifest.json');
  const relative = path.relative(directory, destination);
  if (!relative.startsWith(`..${path.sep}`)) throw new Error('Retained build metadata must be outside the deploy output.');
  return destination;
}

export async function readBuildManifest(output: string): Promise<Manifest> {
  const manifest: Manifest = JSON.parse(await readFile(buildManifestPath(output), 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid Vite build manifest.');
  return manifest;
}

export async function retainBuildManifest(output: string): Promise<Manifest> {
  const staging = path.join(path.resolve(output), '.vite');
  const source = path.join(staging, 'manifest.json');
  if (!(await lstat(staging)).isDirectory() || !(await lstat(source)).isFile()) {
    throw new Error('Vite manifest staging must be a regular directory and file.');
  }
  const entries = await readdir(staging);
  if (entries.length !== 1 || entries[0] !== 'manifest.json') {
    throw new Error('Unexpected files in Vite manifest staging; refusing to publish or discard them.');
  }
  const destination = buildManifestPath(output);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(source, destination);
  await rmdir(staging);
  return readBuildManifest(output);
}

export function assertPublicPrecachePaths(urls: readonly string[]): void {
  for (const url of urls) {
    const pathname = decodeURIComponent(new URL(url, 'https://build.invalid/').pathname).replaceAll('\\', '/');
    if (pathname.split('/').some(part => part.toLowerCase() === '.vite') || /\.map$/i.test(pathname)) {
      throw new Error(`Build metadata must not enter the public precache: ${url}`);
    }
  }
}

export async function assertPublicBuildOutput(output: string): Promise<void> {
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.name.toLowerCase() === '.vite' || /\.map$/i.test(entry.name)) {
        throw new Error(`Build metadata must not be deployed: ${path.relative(output, file)}`);
      }
      if (entry.isSymbolicLink()) throw new Error(`Build assets must not be symbolic links: ${file}`);
      if (entry.isDirectory()) await visit(file);
    }
  };
  await visit(path.resolve(output));
}

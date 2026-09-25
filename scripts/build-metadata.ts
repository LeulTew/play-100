import { lstat, mkdir, readFile, readdir, rename, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Manifest } from 'vite';
import { sha256Source } from './first-paint/csp';
import type { ShellVariant } from './first-paint/shell-html';

export function buildManifestPath(output: string): string {
  const directory = path.resolve(output);
  const destination = path.join(path.dirname(directory), '.build-meta', path.basename(directory), 'vite-manifest.json');
  const relative = path.relative(directory, destination);
  if (!relative.startsWith(`..${path.sep}`))
    throw new Error('Retained build metadata must be outside the deploy output.');
  return destination;
}

/** A text's UTF-8 byte length and SHA-256 digest, as the CSP source expression that allows exactly it. */
export interface TextDigest {
  readonly bytes: number;
  /** For example 'sha256-…'. */
  readonly source: string;
}

export function textDigest(text: string): TextDigest {
  return { bytes: Buffer.byteLength(text, 'utf8'), source: sha256Source(text) };
}

/**
 * What the first-paint build (scripts/first-paint/plugin.ts) records for check:budgets once Vite has written
 * index.html: that document, which binds the record to this build, the header variant it carries, the inline style of
 * both variants (the build computes the other one for the CSP too) and the boot script, which both variants share.
 */
export interface FirstPaintRecord {
  readonly format: 1;
  readonly indexHtml: TextDigest;
  readonly variant: ShellVariant;
  readonly script: TextDigest;
  readonly styles: Readonly<Record<ShellVariant, TextDigest>>;
}

/** The first-paint record, retained beside the Vite manifest outside the deploy output. */
export function firstPaintRecordPath(output: string): string {
  return path.join(path.dirname(buildManifestPath(output)), 'first-paint.json');
}

export async function writeFirstPaintRecord(output: string, record: FirstPaintRecord): Promise<void> {
  const file = firstPaintRecordPath(output);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function isTextDigest(value: unknown): value is TextDigest {
  const { bytes, source } = object(value);
  return (
    typeof bytes === 'number' &&
    Number.isSafeInteger(bytes) &&
    bytes > 0 &&
    typeof source === 'string' &&
    /^'sha256-[A-Za-z0-9+/]{43}='$/.test(source)
  );
}

/** Reads the first-paint record, failing closed: without it, or without either header variant, nothing is gated. */
export async function readFirstPaintRecord(output: string): Promise<FirstPaintRecord> {
  const file = firstPaintRecordPath(output);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error(`Missing or unreadable first-paint build record: ${file}. Build before checking budgets.`);
  }
  const record = object(parsed);
  const { indexHtml, script } = record;
  const { offline, online } = object(record.styles);
  if (
    record.format !== 1 ||
    (record.variant !== 'offline' && record.variant !== 'online') ||
    !isTextDigest(indexHtml) ||
    !isTextDigest(script) ||
    !isTextDigest(offline) ||
    !isTextDigest(online)
  ) {
    throw new Error(
      `Invalid first-paint build record: ${file} needs format 1, the built index.html and header variant, the boot script and the inline style of both the offline and the online variant.`,
    );
  }
  return {
    format: 1,
    indexHtml,
    variant: record.variant === 'online' ? 'online' : 'offline',
    script,
    styles: { offline, online },
  };
}

export async function readBuildManifest(output: string): Promise<Manifest> {
  const manifest: Manifest = JSON.parse(await readFile(buildManifestPath(output), 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    throw new Error('Invalid Vite build manifest.');
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
    if (pathname.split('/').some((part) => part.toLowerCase() === '.vite') || /\.map$/i.test(pathname)) {
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

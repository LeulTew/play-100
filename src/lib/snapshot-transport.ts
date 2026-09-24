import { CHUNK_BYTES, MAX_CHUNKS, MAX_SNAPSHOT_BYTES } from './cloud-types';
import type { SnapshotChunk, SnapshotManifest } from './cloud-types';
import { parsePersonalLibrary } from './personal-library';
import type { PersonalLibraryState } from './personal-types';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(Reflect.get(value, key))]),
    );
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol')
    throw new Error('Unsupported snapshot value.');
  return value;
}

export async function digestBytes(value: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(value).buffer);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encode(value: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < value.length; start += 8192) {
    binary += String.fromCharCode(...value.subarray(start, start + 8192));
  }
  return btoa(binary);
}

function decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0)
    throw new Error('An online snapshot chunk has invalid encoding.');
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function parseManifest(value: unknown): SnapshotManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The online snapshot manifest is unreadable.');
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(',') !== 'bytes,chunks,digest,format,generation' ||
    row.format !== 1 ||
    typeof row.generation !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(row.generation) ||
    typeof row.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(row.digest) ||
    typeof row.bytes !== 'number' ||
    !Number.isSafeInteger(row.bytes) ||
    row.bytes < 1 ||
    row.bytes > MAX_SNAPSHOT_BYTES ||
    !Array.isArray(row.chunks) ||
    row.chunks.length !== Math.ceil(row.bytes / CHUNK_BYTES) ||
    row.chunks.length > MAX_CHUNKS ||
    !row.chunks.every((part): part is string => typeof part === 'string' && /^[a-f0-9]{64}$/.test(part))
  ) {
    throw new Error('This online snapshot has an unsupported version, size or digest. Local data is unchanged.');
  }
  return { format: 1, generation: row.generation, digest: row.digest, bytes: row.bytes, chunks: row.chunks };
}

export function parseChunk(value: unknown): SnapshotChunk {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('An online snapshot chunk is missing.');
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some((key) => !['digest', 'data', 'bytes', 'createdAt', 'holders', 'holder'].includes(key)) ||
    typeof row.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(row.digest) ||
    typeof row.data !== 'string' ||
    row.data.length > Math.ceil(CHUNK_BYTES / 3) * 4 ||
    typeof row.bytes !== 'number' ||
    !Number.isInteger(row.bytes) ||
    row.bytes < 1 ||
    row.bytes > CHUNK_BYTES
  ) {
    throw new Error('An online snapshot chunk has invalid fields or size.');
  }
  return { digest: row.digest, data: row.data, bytes: row.bytes };
}

export async function packSnapshot(value: unknown): Promise<{ manifest: SnapshotManifest; chunks: SnapshotChunk[] }> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  if (bytes.length > MAX_SNAPSHOT_BYTES)
    throw new Error(
      'This library exceeds the 20 MiB online snapshot limit. All local data is retained; export a backup before reducing it.',
    );
  if (!bytes.length) throw new Error('An empty snapshot cannot be uploaded.');
  const chunks: SnapshotChunk[] = [];
  for (let start = 0; start < bytes.length; start += CHUNK_BYTES) {
    const part = bytes.subarray(start, start + CHUNK_BYTES);
    chunks.push({ digest: await digestBytes(part), data: encode(part), bytes: part.length });
  }
  return {
    manifest: {
      format: 1,
      generation: crypto.randomUUID(),
      digest: await digestBytes(bytes),
      bytes: bytes.length,
      chunks: chunks.map((chunk) => chunk.digest),
    },
    chunks,
  };
}

export async function unpackSnapshot(
  manifestInput: unknown,
  getChunk: (digest: string) => Promise<unknown>,
): Promise<unknown> {
  const manifest = parseManifest(manifestInput);
  const joined = new Uint8Array(manifest.bytes);
  let offset = 0;
  for (const digest of manifest.chunks) {
    const chunk = parseChunk(await getChunk(digest));
    if (chunk.digest !== digest) throw new Error('An online chunk does not match its manifest.');
    const bytes = decode(chunk.data);
    if (
      bytes.length !== chunk.bytes ||
      offset + bytes.length > joined.length ||
      (await digestBytes(bytes)) !== digest
    ) {
      throw new Error('The online snapshot failed its integrity check. Local data has not been replaced.');
    }
    joined.set(bytes, offset);
    offset += bytes.length;
  }
  if (offset !== joined.length || (await digestBytes(joined)) !== manifest.digest)
    throw new Error('The online snapshot is incomplete or damaged. Local data is unchanged.');
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
  } catch {
    throw new Error('The online snapshot is not valid UTF-8 library data. Local data is unchanged.');
  }
}

export async function unpackLibrary(manifest: unknown, getChunk: (digest: string) => Promise<unknown>) {
  const data = await unpackSnapshot(manifest, getChunk);
  if (
    !data ||
    typeof data !== 'object' ||
    !('library' in data) ||
    !('format' in data) ||
    data.format !== 1 ||
    Object.keys(data).sort().join() !== 'format,library' ||
    !data.library ||
    typeof data.library !== 'object' ||
    'motion' in data.library ||
    'revision' in data.library
  )
    throw new Error('The online library envelope has unsupported fields. Local data is unchanged.');
  return parsePersonalLibrary({ ...data.library, motion: 'auto', revision: 0 });
}

export function packLibrary(state: PersonalLibraryState) {
  const { version, records, progress, queueOrder, ranking } = parsePersonalLibrary(state);
  return packSnapshot({ format: 1, library: { version, records, progress, queueOrder, ranking } });
}

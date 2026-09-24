import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHUNK_BYTES, MAX_SNAPSHOT_BYTES } from './cloud-types';
import { packLibrary, packSnapshot, parseManifest, unpackLibrary, unpackSnapshot } from './snapshot-transport';
import { parseCollection } from './collection';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';
import { recordFromGame } from './personal-types';
import type { LibraryRecord } from './personal-types';

const games = parseCollection(
  JSON.parse(readFileSync(new URL('../../data/collection.json', import.meta.url), 'utf8')),
).games;
describe('bounded immutable snapshot transport', () => {
  it('roundtrips a normal 100-game library with exact private scores, notes and manual positions', async () => {
    const state = applyPersonalAction(emptyPersonalLibrary(), {
      type: 'add-ranking',
      records: games.map(recordFromGame),
    });
    const first = state.ranking[0];
    if (!first) throw new Error('Missing fixture.');
    first.score = 9.7;
    first.note = 'Private note \u4e16\u754c';
    first.manualPosition = 1;
    const packed = await packLibrary(state);
    const chunks = new Map(packed.chunks.map((chunk) => [chunk.digest, chunk]));
    expect(await unpackLibrary(packed.manifest, async (digest) => chunks.get(digest))).toEqual({
      ...state,
      revision: 0,
      motion: 'auto',
    });
    expect(packed.chunks).toHaveLength(1);
    const reorderedKeys = { ...state, records: Object.fromEntries(Object.entries(state.records).reverse()) };
    expect((await packLibrary(reorderedKeys)).manifest.digest).toBe(packed.manifest.digest);
    expect((await packLibrary({ ...state, revision: 700, motion: 'full' })).manifest.digest).toBe(
      packed.manifest.digest,
    );
  });

  it('roundtrips 10,000 valid records beyond a Firestore document without truncation', async () => {
    const records: LibraryRecord[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: `wikidata:Q${index + 1}`,
      source: 'wikidata',
      sourceId: `Q${index + 1}`,
      sourceUrl: null,
      title: `Game ${index} ${'long title '.repeat(8)}`,
      year: 2020,
      genre: null,
      studio: null,
      collectionRank: null,
    }));
    const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'add-ranking', records });
    for (const entry of state.ranking) entry.note = 'A private note. '.repeat(50);
    const packed = await packLibrary(state);
    expect(packed.manifest.bytes).toBeGreaterThan(1024 * 1024);
    expect(packed.chunks.length).toBeGreaterThan(5);
    expect(packed.chunks.every((chunk) => chunk.bytes <= CHUNK_BYTES && JSON.stringify(chunk).length < 300_000)).toBe(
      true,
    );
    const chunks = new Map(packed.chunks.map((chunk) => [chunk.digest, chunk]));
    const decoded = await unpackLibrary(packed.manifest, async (digest) => chunks.get(digest));
    expect(Object.keys(decoded.records)).toHaveLength(10_000);
    expect(decoded).toEqual({ ...state, revision: 0, motion: 'auto' });
  }, 30_000);

  it('accepts the exact 20 MiB encoding boundary and rejects overflow without truncation', async () => {
    const value = 'a'.repeat(MAX_SNAPSHOT_BYTES - 2);
    const packed = await packSnapshot(value);
    expect(packed.manifest.bytes).toBe(MAX_SNAPSHOT_BYTES);
    expect(packed.chunks.at(-1)?.bytes).toBeLessThanOrEqual(CHUNK_BYTES);
    await expect(packSnapshot(value + 'b')).rejects.toThrow(/20 MiB/);
  }, 30_000);

  it('rejects missing chunks, altered digests and future versions before replacing state', async () => {
    const packed = await packLibrary(emptyPersonalLibrary());
    const chunk = packed.chunks[0];
    if (!chunk) throw new Error('Missing fixture chunk.');
    await expect(unpackLibrary(packed.manifest, async () => undefined)).rejects.toThrow(/missing/);
    await expect(
      unpackLibrary(packed.manifest, async () => ({ ...chunk, data: 'A' + chunk.data.slice(1) })),
    ).rejects.toThrow(/integrity/);
    await expect(unpackLibrary({ ...packed.manifest, digest: 'a'.repeat(64) }, async () => chunk)).rejects.toThrow(
      /damaged/,
    );
    expect(() => parseManifest({ ...packed.manifest, format: 2 })).toThrow(/unsupported/);
    expect(() => parseManifest({ ...packed.manifest, bytes: MAX_SNAPSHOT_BYTES + 1 })).toThrow(/unsupported/);
  });

  it('does not accept a valid envelope containing an invalid domain library', async () => {
    const packed = await packSnapshot({ ...emptyPersonalLibrary(), version: 999 });
    await expect(unpackLibrary(packed.manifest, async () => packed.chunks[0])).rejects.toThrow();
    expect(await unpackSnapshot(packed.manifest, async () => packed.chunks[0])).toHaveProperty('version', 999);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHUNK_BYTES,
  creatorRanks,
  MAX_RANKING_CHUNKS,
  MAX_RANKING_JSON_BYTES,
  MAX_RANKING_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_BYTES,
} from './cloud-types';
import { emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import { MAX_LIBRARY_ID_CHARACTERS, MAX_LIBRARY_RECORDS, MAX_LIBRARY_TITLE_CHARACTERS } from './personal-types';
import { packLibrary, packSnapshot, parseManifest, unpackSnapshot } from './snapshot-transport';

describe('parser-derived creator ranking envelope', () => {
  it('derives the accepted sixteen-MiB allocation cap from the real library parser limits and pins the rules', () => {
    expect(MAX_RANKING_JSON_BYTES).toBe(14_790_001);
    expect(MAX_RANKING_SNAPSHOT_BYTES).toBe(16 * 1024 * 1024);
    expect(MAX_RANKING_SNAPSHOT_BYTES).toBeLessThan(MAX_SNAPSHOT_BYTES);
    expect(MAX_RANKING_CHUNKS).toBe(86);
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    expect(rules).toContain(
      `manifest(value) && value.bytes <= ${MAX_RANKING_SNAPSHOT_BYTES} && value.chunks.size() <= ${MAX_RANKING_CHUNKS}`,
    );
  });

  it('serializes a representable ten-thousand-record maximum with genuine control and lone-surrogate escaping', async () => {
    const input = emptyPersonalLibrary();
    const digits = String(MAX_LIBRARY_RECORDS).length;
    const half = Math.floor(MAX_LIBRARY_TITLE_CHARACTERS / 2);
    const title = '\u0000'.repeat(half) + '\ud800'.repeat(MAX_LIBRARY_TITLE_CHARACTERS - half);
    for (let index = 1; index <= MAX_LIBRARY_RECORDS; index += 1) {
      const id = 'g' + 'x'.repeat(MAX_LIBRARY_ID_CHARACTERS - digits - 1) + String(index).padStart(digits, '0');
      input.records[id] = {
        id,
        title,
        source: 'manual',
        sourceId: 'local',
        sourceUrl: null,
        year: null,
        studio: null,
        genre: null,
        collectionRank: null,
      };
      input.ranking.push({ id, score: 0.0000010000000000000002, note: '', manualPosition: null });
    }
    const state = parsePersonalLibrary(input);
    const privateCopy = await packLibrary(state);
    const ranking = await packSnapshot(creatorRanks(state));
    const serialized = Buffer.concat(ranking.chunks.map((chunk) => Buffer.from(chunk.data, 'base64'))).toString('utf8');
    expect(serialized).toContain('\\u0000');
    expect(serialized).toContain('\\ud800');
    expect(Buffer.byteLength(serialized, 'utf8')).toBe(ranking.manifest.bytes);
    expect(ranking.manifest.bytes).toBeGreaterThan(12 * 1024 * 1024);
    expect(ranking.manifest.bytes).toBeLessThanOrEqual(MAX_RANKING_JSON_BYTES);
    expect(ranking.manifest.bytes).toBeLessThanOrEqual(MAX_RANKING_SNAPSHOT_BYTES);
    expect(privateCopy.manifest.bytes).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
    expect(ranking.chunks).toHaveLength(Math.ceil(ranking.manifest.bytes / CHUNK_BYTES));
    console.info('Synthetic maximum ranking envelope', {
      records: state.ranking.length,
      privateBytes: privateCopy.manifest.bytes,
      rankingBytes: ranking.manifest.bytes,
      rankingChunks: ranking.chunks.length,
      base64Characters: ranking.chunks.reduce((sum, chunk) => sum + chunk.data.length, 0),
    });
  }, 60000);

  it.each([100, 1000])(
    'records deterministic representative sizes for %s games without claiming a user average',
    async (count) => {
      const input = emptyPersonalLibrary();
      for (let index = 1; index <= count; index += 1) {
        const id = `manual:example-${index}`;
        input.records[id] = {
          id,
          title: `Example game ${index}`,
          source: 'manual',
          sourceId: `example-${index}`,
          sourceUrl: null,
          year: 2020,
          studio: 'Example studio',
          genre: 'Adventure',
          collectionRank: null,
        };
        input.progress[id] = { later: index % 4 === 0, played: index % 3 === 0, completed: false };
        if (input.progress[id]!.later) input.queueOrder.push(id);
        input.ranking.push({
          id,
          score: index % 5 ? 8 : null,
          note: index % 10 ? '' : 'A short note about this game.',
          manualPosition: null,
        });
      }
      const state = parsePersonalLibrary(input);
      const privateCopy = await packLibrary(state);
      const ranking = await packSnapshot(creatorRanks(state));
      expect(state.ranking).toHaveLength(count);
      expect(ranking.manifest.bytes).toBeLessThan(MAX_RANKING_SNAPSHOT_BYTES);
      console.info('Synthetic representative library', {
        records: count,
        privateBytes: privateCopy.manifest.bytes,
        rankingBytes: ranking.manifest.bytes,
        privateBase64Characters: privateCopy.chunks.reduce((sum, chunk) => sum + chunk.data.length, 0),
        rankingBase64Characters: ranking.chunks.reduce((sum, chunk) => sum + chunk.data.length, 0),
      });
    },
  );

  it('retains generic twenty-MiB legacy manifest and payload read compatibility', async () => {
    const value = 'x'.repeat(MAX_SNAPSHOT_BYTES - 2);
    const packed = await packSnapshot(value);
    expect(packed.manifest.bytes).toBeGreaterThan(MAX_RANKING_SNAPSHOT_BYTES);
    expect(parseManifest(packed.manifest).bytes).toBe(MAX_SNAPSHOT_BYTES);
    const chunks = new Map(packed.chunks.map((chunk) => [chunk.digest, chunk]));
    expect(await unpackSnapshot(packed.manifest, async (digest) => chunks.get(digest))).toBe(value);
  }, 60000);
});

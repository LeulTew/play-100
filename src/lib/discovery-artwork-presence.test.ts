import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import artworkIds from './discovery-artwork-ids.json';
import { EMPTY_DISCOVERY_ARTWORK, hasKnownDiscoveryArtwork } from './discovery-artwork-presence';
import { indexDiscoveryArtwork, parseDiscoveryCatalogJson } from './discovery-catalog';
import { discoveryArtworkPresenceJson } from '../../scripts/generate-discovery-artwork-presence';

const seed = parseDiscoveryCatalogJson(readFileSync(new URL('../../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8'));

it('ships exactly the validated seed artwork IDs, with deterministic generation and a small ID-only budget', () => {
  const expected = [...indexDiscoveryArtwork(seed).keys()].sort();
  expect(artworkIds).toEqual(expected);
  expect(new Set(artworkIds).size).toBe(artworkIds.length);
  expect(discoveryArtworkPresenceJson(seed)).toBe(`${JSON.stringify(artworkIds)}\n`);
  expect(discoveryArtworkPresenceJson({ ...seed, items: [...seed.items].reverse() })).toBe(discoveryArtworkPresenceJson(seed));
  const shipped = readFileSync(new URL('./discovery-artwork-ids.json', import.meta.url), 'utf8');
  expect(shipped).toBe(discoveryArtworkPresenceJson(seed));
  expect(Buffer.byteLength(shipped)).toBeLessThanOrEqual(8192);
  for (const item of seed.items) expect(hasKnownDiscoveryArtwork(item.record.id)).toBe(item.artwork !== null);
});

it('distinguishes known no-art records, manual records and licensed 0 A.D. artwork using exact identities', () => {
  expect(seed.items.find(item => item.record.id === 'freetogame:615')?.artwork).toBeNull();
  expect(hasKnownDiscoveryArtwork('freetogame:615')).toBe(false);
  expect(hasKnownDiscoveryArtwork('manual:owned-game')).toBe(false);
  const zeroAd = seed.items.find(item => item.record.title === '0 A.D.');
  expect(zeroAd?.artwork).toBeTruthy();
  expect(hasKnownDiscoveryArtwork(zeroAd!.record.id)).toBe(true);
  expect(hasKnownDiscoveryArtwork('0 A.D.')).toBe(false);
  expect(hasKnownDiscoveryArtwork(`${zeroAd!.record.id}:other`)).toBe(false);
});

it('keeps an unknown public deep link distinct from metadata resolution and returns a stable empty artwork map', () => {
  const unknown = 'wikidata:Q999999999999999';
  expect(seed.items.some(item => item.record.id === unknown)).toBe(false);
  expect(hasKnownDiscoveryArtwork(unknown)).toBe(false);
  const empty = EMPTY_DISCOVERY_ARTWORK;
  expect(empty.size).toBe(0);
  expect(empty.get(unknown)).toBeUndefined();
  expect(EMPTY_DISCOVERY_ARTWORK).toBe(empty);
});

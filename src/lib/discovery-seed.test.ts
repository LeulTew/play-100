import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDiscoveryCatalogJson } from './discovery-catalog';
import { defaultDiscoveryFilters, searchDiscoveryItems } from './discovery-search';

const seed = parseDiscoveryCatalogJson(readFileSync(new URL('../../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8'));

describe('shipped discovery seed integration', () => {
  it.each(['Kingdomcome', 'Kingdom Come', 'Kingdom Come: Deliverance', 'KCD', 'KCD1', 'Kingdom Come Deliverance: Royal Edition'])('finds the actual provider identity for %s without provider requests', (q) => {
    const found = searchDiscoveryItems(seed.items, { ...defaultDiscoveryFilters, q });
    expect(found[0]?.record.id).toBe('wikidata:Q15408545');
    expect(found[0]?.artwork?.src).toMatch(/^\/images\/discovery\/[a-f0-9]{64}\.webp$/);
  });
  it('starts with a full, genuinely illustrated first page without hiding metadata-only records', () => {
    const found = searchDiscoveryItems(seed.items, defaultDiscoveryFilters);
    expect(found).toHaveLength(seed.items.length);
    expect(found.slice(0, 24).every((item) => item.artwork !== null)).toBe(true);
    expect(found.some((item) => item.artwork === null)).toBe(true);
  });
  it('supports paging/filtering both sources without synthesizing source metadata', () => {
    const wiki = searchDiscoveryItems(seed.items, { ...defaultDiscoveryFilters, source: 'wikidata' });
    const free = searchDiscoveryItems(seed.items, { ...defaultDiscoveryFilters, source: 'freetogame' });
    expect(wiki.length + free.length).toBe(seed.items.length);
    expect(new Set([...wiki, ...free].map((item) => item.record.id)).size).toBe(seed.items.length);
    expect(wiki.slice(24, 48)).toHaveLength(24);
    const first = wiki[0]!;
    if (first.record.genre) {
      const genre = searchDiscoveryItems(seed.items, { ...defaultDiscoveryFilters, genre: first.record.genre });
      expect(genre.every((item) => item.record.genre === first.record.genre)).toBe(true);
    }
    expect(seed.items.every((item) => !('artwork' in item.record) && !('score' in item.record))).toBe(true);
  });
});

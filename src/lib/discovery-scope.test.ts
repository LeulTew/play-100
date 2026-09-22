import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCollection } from './collection';
import { catalogSearchItems } from './catalog-identity';
import { defaultDiscoveryFilters, parseDiscoverySearch, patchDiscoverySearch } from './discovery-search';
import { discoveryScope } from './discovery-scope';
import { discoveryFixture } from './discovery-test-fixtures';

const games = parseCollection(JSON.parse(readFileSync(new URL('../../public/data/collection.json', import.meta.url), 'utf8'))).games;
const items = catalogSearchItems(games, [discoveryFixture]);

describe('Discover outside-The-100 result scope', () => {
  it('keeps only outside records as cards by default, without deleting canonical entries', () => {
    const scope = discoveryScope(items, defaultDiscoveryFilters);
    expect(scope.cards.map(item => item.record.id)).toEqual([discoveryFixture.record.id]);
    expect(scope.collectionMatches).toHaveLength(100);
    expect(items).toHaveLength(101);
  });
  it('keeps an explicit include and legacy collection source as one canonical entry each', () => {
    expect(discoveryScope(items, { ...defaultDiscoveryFilters, include100: 'on' }).cards).toHaveLength(101);
    const scoped = discoveryScope(items, { ...defaultDiscoveryFilters, source: 'collection' });
    expect(scoped.cards).toHaveLength(100);
    expect(scoped.showCollection).toBe(true);
  });
  it('resolves reviewed source aliases before returning recovery links, not duplicate cards', () => {
    const provider = { ...discoveryFixture, record: { ...discoveryFixture.record, id: 'wikidata:Q27438121', sourceId: 'Q27438121', title: 'RDR2' }, aliases: ['RDR2'] };
    const found = catalogSearchItems(games, [provider, discoveryFixture]);
    const scope = discoveryScope(found, { ...defaultDiscoveryFilters, q: 'RDR2' });
    expect(scope.cards).toEqual([]);
    expect(scope.collectionMatches.map(item => item.record.id)).toEqual(['red-dead-redemption-2']);
    expect(scope.exactCollectionMatch).toBe(true);
  });
  it('does not merge an unknown same-title edition and applies genre family and exact filters together', () => {
    const edition = { ...discoveryFixture, record: { ...discoveryFixture.record, id: 'wikidata:Q90000001', sourceId: 'Q90000001', title: 'Red Dead Redemption 2', genre: 'RPG' } };
    const scope = discoveryScope(catalogSearchItems(games, [edition]), { ...defaultDiscoveryFilters, q: edition.record.title, genreFamily: 'role-playing', genre: 'RPG' });
    expect(scope.cards.map(item => item.record.id)).toEqual([edition.record.id]);
  });
  it('persists include scope without changing legacy genre, detail or unrelated parameters', () => {
    const next = patchDiscoverySearch('?genre=Action+RPG&genreFamily=role-playing&game=wikidata%3AQ15408545&campaign=retained', { include100: 'on', offset: 0 });
    expect(parseDiscoverySearch(next)).toMatchObject({ genre: 'Action RPG', genreFamily: 'role-playing', include100: 'on' });
    expect(new URLSearchParams(next).get('game')).toBe('wikidata:Q15408545');
    expect(new URLSearchParams(next).get('campaign')).toBe('retained');
  });
});

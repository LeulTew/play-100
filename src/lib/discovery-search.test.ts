import { describe, expect, it } from 'vitest';
import { catalogRelevance, matchesCatalogQuery, normalizeCatalogQuery } from './catalog-query';
import { createDiscoverySearch, defaultDiscoveryFilters, parseDiscoverySearch, patchDiscoverySearch, searchDiscoveryItems, shouldSearchOnline } from './discovery-search';
import { artworkFixture, discoveryFixture } from './discovery-test-fixtures';

describe('public seed search independent of personal state', () => {
  it.each(['Kingdomcome', 'Kingdom Come', 'Kingdom Come: Deliverance', '  KINGDOM   CÔME ', 'KCD', 'KCD1'])('finds the verified Kingdom Come identity for %s', (q) => {
    expect(searchDiscoveryItems([discoveryFixture], { ...defaultDiscoveryFilters, q }).map((item) => item.record.id)).toEqual(['wikidata:Q15408545']);
  });
  it('normalizes Unicode, punctuation, apostrophes and compact boundaries without merging numbers', () => {
    expect(normalizeCatalogQuery("Baldur’s Gate: Édition")).toBe('baldurs gate edition');
    expect(matchesCatalogQuery('Pokémon X', 'POKEMON')).toBe(true);
    expect(matchesCatalogQuery('Final Fantasy 20', 'fantasy 2')).toBe(false);
    expect(matchesCatalogQuery('Kingdom Come: Deliverance', 'Kingdomcome')).toBe(true);
  });
  it('prioritizes exact title and alias relevance over imagery; only blank browsing is illustrated-first', () => {
    const illustrated = { ...discoveryFixture, record: { ...discoveryFixture.record, id: 'wikidata:Q1', title: 'Kingdom Come: Deliverance II' }, aliases: [], artwork: artworkFixture };
    expect(searchDiscoveryItems([illustrated, discoveryFixture], { ...defaultDiscoveryFilters, q: discoveryFixture.record.title })).toEqual([discoveryFixture, illustrated]);
    expect(searchDiscoveryItems([discoveryFixture, illustrated], defaultDiscoveryFilters)).toEqual([illustrated, discoveryFixture]);
    expect(catalogRelevance(discoveryFixture.record.title, discoveryFixture.aliases, 'KCD')).toBe(1);
  });
  it('applies source/year/genre filters even when an alias matches and preserves exact source IDs', () => {
    expect(searchDiscoveryItems([discoveryFixture], { ...defaultDiscoveryFilters, source: 'freetogame' })).toEqual([]);
    expect(searchDiscoveryItems([discoveryFixture], { ...defaultDiscoveryFilters, q: 'KCD', year: '2025' })).toEqual([]);
    expect(searchDiscoveryItems([discoveryFixture], { ...defaultDiscoveryFilters, q: 'KCD', genre: 'Puzzle' })).toEqual([]);
    const edition = { ...discoveryFixture, record: { ...discoveryFixture.record, id: 'wikidata:Q2' } };
    expect(searchDiscoveryItems([discoveryFixture, edition], defaultDiscoveryFilters)).toHaveLength(2);
  });
  it('matches metadata without mutating source records or adding personal fields', () => {
    const before = JSON.stringify(discoveryFixture);
    expect(searchDiscoveryItems([discoveryFixture], { ...defaultDiscoveryFilters, q: 'Warhorse RPG 2018' })).toEqual([discoveryFixture]);
    expect(JSON.stringify(discoveryFixture)).toBe(before);
  });
  it('bounds automatic fallback to fewer than six hits, never blank browsing or opted-out scopes', () => {
    expect(shouldSearchOnline('KCD', true, 'ready', 5)).toBe(true);
    expect(shouldSearchOnline('KCD', true, 'ready', 6)).toBe(false);
    expect(shouldSearchOnline('', true, 'ready', 0)).toBe(false);
    expect(shouldSearchOnline('a', true, 'ready', 0)).toBe(false);
    expect(shouldSearchOnline('KCD', true, 'loading', 0)).toBe(false);
    expect(shouldSearchOnline('', true, 'error', 0)).toBe(true);
    expect(shouldSearchOnline('KCD', true, 'ready', 100, true)).toBe(true);
    expect(shouldSearchOnline('KCD', false, 'error', 0, true)).toBe(false);
  });
});

describe('stable, public discovery URLs', () => {
  it('keeps new family URLs separate from unchanged legacy exact genre matching', () => {
    const legacy = parseDiscoverySearch('?genre=RPG&source=wikidata&year=2018');
    expect(legacy.genre).toBe('RPG');
    expect(legacy.genreFamily).toBe('');
    expect(searchDiscoveryItems([discoveryFixture], legacy)).toEqual([discoveryFixture]);
    const filters = { ...legacy, genreFamily: 'role-playing' as const, offset: 24 };
    expect(parseDiscoverySearch(createDiscoverySearch(filters))).toEqual(filters);
    expect(parseDiscoverySearch('?genre=shooter&genreFamily=Unknown')).toMatchObject({ genre: 'shooter', genreFamily: '' });
    expect(searchDiscoveryItems([discoveryFixture], { ...legacy, genreFamily: 'shooter' })).toEqual([]);
  });
  it('patches only Discover-owned query keys, retaining unrelated preview and repeated parameters through reset', () => {
    const original = '?genre=Action+RPG&offset=48&source=wikidata&view=list&catalogs=off&game=wikidata%3AQ1&campaign=a&campaign=b';
    const updated = patchDiscoverySearch(original, { genreFamily: 'role-playing', genre: '', offset: 0, online: 'auto' });
    expect(parseDiscoverySearch(updated)).toMatchObject({ genreFamily: 'role-playing', genre: '', offset: 0, source: 'wikidata', view: 'list', catalogs: 'off' });
    expect(new URLSearchParams(updated).get('game')).toBe('wikidata:Q1');
    expect(new URLSearchParams(updated).getAll('campaign')).toEqual(['a', 'b']);
    const reset = patchDiscoverySearch(updated, { ...defaultDiscoveryFilters, catalogs: 'off', view: 'list' });
    expect(parseDiscoverySearch(reset)).toEqual({ ...defaultDiscoveryFilters, catalogs: 'off', view: 'list' });
    expect(new URLSearchParams(reset).getAll('campaign')).toEqual(['a', 'b']);
    expect(new URLSearchParams(reset).get('game')).toBe('wikidata:Q1');
    expect(createDiscoverySearch(parseDiscoverySearch(`${updated}&uid=private&note=secret`))).not.toMatch(/uid|note|campaign|game=/);
  });
  it('roundtrips source/filter/offset/online and opt-out; excludes private/unrecognized query parameters', () => {
    const filters = { ...defaultDiscoveryFilters, q: 'KCD', source: 'wikidata' as const, year: '2018', genre: 'RPG', offset: 24, view: 'list' as const, catalogs: 'off' as const, online: 'on' as const };
    const url = createDiscoverySearch(filters);
    expect(parseDiscoverySearch(url)).toEqual(filters);
    expect(createDiscoverySearch(parseDiscoverySearch('?q=KCD&note=private&uid=secret&score=10'))).toBe('?q=KCD');
    expect(createDiscoverySearch(defaultDiscoveryFilters)).toBe('');
  });
  it.each(['-1', 'NaN', 'Infinity', '1e3', '10001', '24.5'])('rejects invalid offsets %s', (offset) => {
    expect(parseDiscoverySearch(`?offset=${offset}`).offset).toBe(0);
  });
  it('bounds input, sanitizes control characters and defaults unknown sources/filters', () => {
    expect(parseDiscoverySearch('?q=a%00b&source=steam&view=table&year=123&catalogs=no').q).toBe('a b');
    expect(parseDiscoverySearch('?source=steam&view=table&year=123&catalogs=no')).toEqual(defaultDiscoveryFilters);
    expect(parseDiscoverySearch(`?q=${'a'.repeat(1000)}`).q).toHaveLength(80);
  });
});

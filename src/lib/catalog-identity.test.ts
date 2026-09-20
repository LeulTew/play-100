import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseCollection } from './collection';
import { parseDiscoveryCatalog } from './discovery-catalog';
import { CATALOG_EDITION_HINTS, COLLECTION_IDENTITIES } from './collection-identities';
import { canonicalCatalogId, catalogActionRecord, catalogOwnership, catalogPageRecords, catalogPinnedIds, catalogProgress, catalogSearchItems, collectionGameForId, resolveCatalogRecord, resolveCatalogRecords } from './catalog-identity';
import { createDiscoverySearch, defaultDiscoveryFilters, parseDiscoverySearch, searchDiscoveryItems } from './discovery-search';
import { recordFromGame } from './personal-types';
import type { LibraryRecord, PersonalAction } from './personal-types';
import { applyPersonalAction, emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import { createCompareTrayStore } from './compare-tray';
import { filterGames } from './collection';
import { unrankedRecords } from './extended-search';

const games = parseCollection(JSON.parse(readFileSync(new URL('../../data/collection.json', import.meta.url), 'utf8'))).games;
const seed = parseDiscoveryCatalog(JSON.parse(readFileSync(new URL('../../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')));
const first = games[0]!;
const canonical = recordFromGame(first);
const provider = seed.items.find(item => item.record.id === 'wikidata:Q27438121')!.record;
const unknown: LibraryRecord = { ...provider, id: 'manual:same-title', source: 'manual', sourceId: 'same-title', sourceUrl: null };
const initial = () => emptyPersonalLibrary();

describe('reviewed public identities, not fuzzy title matching', () => {
  it('has99 unique game crosswalks and deliberately does not assert a Hitman edition', () => {
    expect(COLLECTION_IDENTITIES).toHaveLength(99);
    expect(new Set(COLLECTION_IDENTITIES.map(([slug]) => slug)).size).toBe(99);
    expect(new Set(COLLECTION_IDENTITIES.map(([, id]) => id)).size).toBe(99);
    for (const [slug, id] of COLLECTION_IDENTITIES) {
      expect(games.find(game => game.slug === slug)).toBeDefined();
      expect(id).toMatch(/^Q[1-9]\d*$/);
      expect(collectionGameForId(games, `wikidata:${id}`)?.slug).toBe(slug);
    }
    expect(COLLECTION_IDENTITIES.some(([slug]) => String(slug) === 'hitman-world-of-assassination')).toBe(false);
  });
  it.each([
    ['Q112231148', 'resident-evil-4'], ['Q1757876', 'tomb-raider'], ['Q29154231', 'star-wars-battlefront-ii'],
    ['Q18345138', 'god-of-war'], ['Q18515944', 'overwatch'], ['Q275960', 'mass-effect'],
  ])('uses reviewed %s, not the title to choose %s', (id, slug) => {
    const fromProvider = { ...provider, id: `wikidata:${id}`, sourceId: id, title: 'Changed upstream label', year: null };
    expect(resolveCatalogRecord(fromProvider, games)).toEqual(recordFromGame(games.find(game => game.slug === slug)!));
  });
  it.each(['wikidata:Q275950', 'wikidata:Q317620', 'wikidata:Q54865', 'freetogame:540', 'wikidata:Q28062624', 'wikidata:Q953242', 'manual:same-title'])('does not map a different edition, franchise or unknown exact-title ID: %s', id => {
    expect(canonicalCatalogId(id)).toBe(id);
    expect(collectionGameForId(games, id)).toBeUndefined();
  });
  it('keeps untouched validated source records, facts, all100 ranks and metadata shapes', () => {
    const before = JSON.stringify({ games, seed });
    expect(resolveCatalogRecord(provider, games)).toEqual(canonical);
    expect(resolveCatalogRecords([provider, canonical, provider, unknown], games)).toEqual([canonical, unknown]);
    expect(Object.keys(resolveCatalogRecord(provider, games)).sort()).toEqual(Object.keys(canonical).sort());
    expect(JSON.stringify({ games, seed })).toBe(before);
    expect(games.map(game => game.rank)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  });
});

describe('canonical-first local and remote result composition', () => {
  const items = catalogSearchItems(games, seed.items);
  it.each(games.map(game => [game.slug, game.title]))('includes %s without either provider or seed', (slug, title) => {
    const result = searchDiscoveryItems(catalogSearchItems(games, []), { ...defaultDiscoveryFilters, q: title });
    expect(result.some(item => item.record.id === slug)).toBe(true);
  });
  it.each(['RDR2', 'Red Dead Redemption II', 'Red Dead 2'])('keeps verified alias %s on the original record, artwork and rank', q => {
    const result = searchDiscoveryItems(items, { ...defaultDiscoveryFilters, q });
    expect(result.map(item => item.record.id)).toEqual([first.slug]);
    expect(result[0]?.game).toBe(first);
    expect(result[0]?.artwork).toBeNull();
    expect(result[0]?.record).toEqual(canonical);
  });
  it('does not lose matches under source/year/genre filters or leak provider metadata into originals', () => {
    const filters = { ...defaultDiscoveryFilters, source: 'wikidata' as const, q: 'RDR2', year: '2018', genre: first.genre };
    expect(searchDiscoveryItems(items, filters).map(item => item.record.id)).toEqual([canonical.id]);
    expect(searchDiscoveryItems(items, { ...filters, source: 'freetogame' })).toEqual([]);
    expect(searchDiscoveryItems(items, { ...filters, year: '2017' })).toEqual([]);
    expect(searchDiscoveryItems(items, { ...defaultDiscoveryFilters, source: 'collection' })).toHaveLength(100);
    expect(parseDiscoverySearch(createDiscoverySearch({ ...filters, source: 'collection' }))).toEqual({ ...filters, source: 'collection' });
  });
  it('deduplicates all local results before paging, not just the visible page, and deduplicates remote IDs', () => {
    const local = searchDiscoveryItems(items, defaultDiscoveryFilters);
    const pages = Array.from({ length: Math.ceil(local.length / 24) }, (_, index) => catalogPageRecords(local, [], index * 24, 24));
    const ids = pages.flat().map(record => record.id);
    expect(new Set(ids).size).toBe(local.length);
    const firstPage = pages[0]!;
    const laterCanonical = pages.slice(1).flat().find(record => record.source === 'collection')!;
    const crosswalk = COLLECTION_IDENTITIES.find(([slug]) => slug === laterCanonical.id)!;
    const echo = { ...provider, id: `wikidata:${crosswalk[1]}`, sourceId: crosswalk[1] };
    const remote = resolveCatalogRecords([echo, provider, unknown, unknown], games);
    const result = catalogPageRecords(local, remote, 0, 24);
    expect(result).toEqual([...firstPage, unknown]);
    expect(result.some(record => record.id === laterCanonical.id)).toBe(false);
  });
  it('preserves actual same-title originals and remakes as separate results', () => {
    const records = searchDiscoveryItems(items, { ...defaultDiscoveryFilters, q: 'Resident Evil 4' }).map(item => item.record.id);
    expect(records).toContain('resident-evil-4'); expect(records).toContain('wikidata:Q275950');
    expect(records).not.toContain('wikidata:Q112231148');
    expect(CATALOG_EDITION_HINTS.get('wikidata:Q275950')).toBe('2005 original');
    expect(seed.items.find(item => item.record.id === 'wikidata:Q275950')?.record.year).toBeNull();
  });
  it('moves canonical aliases into main100 results, not Beyond the100, while retaining unknown private games', () => {
    const matched = searchDiscoveryItems(items, { ...defaultDiscoveryFilters, q: 'RDR2' });
    const records = matched.map(item => item.record);
    expect(filterGames(games, { q: 'RDR2', genre: '', year: '', tier: 'all', list: 'all', sort: 'rank', direction: 'auto', view: 'grid', catalogs: 'off', progress: 'all' }, {}, new Set(records.map(record => record.id)))).toEqual([first]);
    expect(unrankedRecords(games, { [provider.id]: provider, [unknown.id]: unknown }, records)).toEqual([unknown]);
  });
});

describe('existing private opinions and identities are not migrated', () => {
  const actions = (record: LibraryRecord): PersonalAction[] => [
    { type: 'add-records', records: [record] }, { type: 'set-progress', records: [record], key: 'played', value: true },
    { type: 'set-progress', records: [record], key: 'completed', value: true }, { type: 'set-progress', records: [record], key: 'completed', value: false },
    { type: 'toggle-progress', record, key: 'later' }, { type: 'add-ranking', records: [record] }, { type: 'rate-game', record, score: 8.4 },
  ];
  it('uses canonical IDs for every new mutation without inferring progress from save/rating', () => {
    let state = initial();
    const target = catalogActionRecord(resolveCatalogRecord(provider, games), catalogOwnership(state.records));
    expect(target).toEqual(canonical);
    state = applyPersonalAction(state, { type: 'rate-game', record: target, score: 9 });
    expect(state.progress[target.id]?.played ?? false).toBe(false);
    for (const action of actions(target)) state = applyPersonalAction(state, action);
    expect(Object.keys(state.records)).toEqual([canonical.id]);
    expect(state.progress[canonical.id]).toEqual({ played: true, completed: false, later: true });
    expect(state.queueOrder).toEqual([canonical.id]); expect(state.ranking[0]?.id).toBe(canonical.id);
  });
  it('binds all personal controls to the only owned provider copy without duplicating it or replacing its metadata/note', () => {
    let state = applyPersonalAction(initial(), { type: 'add-ranking', records: [provider] });
    state = applyPersonalAction(state, { type: 'edit-ranking', id: provider.id, score: 7.2, note: 'Keep my old opinion.' });
    const metadata = structuredClone(state.records);
    const target = catalogActionRecord(canonical, catalogOwnership(state.records));
    expect(target).toEqual(provider);
    for (const action of actions(target)) state = applyPersonalAction(state, action);
    expect(state.records).toEqual(metadata);
    expect(state.ranking[0]).toMatchObject({ id: provider.id, score: 8.4, note: 'Keep my old opinion.' });
    expect(catalogProgress(state, catalogOwnership(state.records))[canonical.id]).toEqual(state.progress[provider.id]);
    expect(state.progress[canonical.id]).toBeUndefined();
    expect(parsePersonalLibrary(state)).toEqual(state);
  });
  it('keeps both conflicting opinions and unknown same-title manual entries; canonical controls only edit canonical', () => {
    let state = applyPersonalAction(initial(), { type: 'add-ranking', records: [canonical, provider, unknown] });
    state = applyPersonalAction(state, { type: 'edit-ranking', id: provider.id, score: 3.1, note: 'Provider-copy note.' });
    state = applyPersonalAction(state, { type: 'edit-ranking', id: canonical.id, score: 9.8, note: 'Canonical-copy note.' });
    const before = structuredClone(state);
    const ownership = catalogOwnership(state.records);
    expect(ownership.get(canonical.id)?.map(record => record.id)).toEqual([canonical.id, provider.id]);
    expect(ownership.get(unknown.id)).toEqual([unknown]);
    const record = catalogActionRecord(canonical, ownership);
    expect(record.id).toBe(canonical.id);
    state = applyPersonalAction(state, { type: 'rate-game', record, score: 8 });
    expect(state.records).toEqual(before.records);
    expect(state.ranking.find(entry => entry.id === provider.id)).toEqual(before.ranking.find(entry => entry.id === provider.id));
    expect(state.ranking.find(entry => entry.id === canonical.id)?.note).toBe('Canonical-copy note.');
    expect(Object.keys(state.records)).toHaveLength(3);
  });
  it('does not transfer an unknown same-title record or private progress into a canonical record', () => {
    const state = applyPersonalAction(initial(), { type: 'set-progress', records: [unknown], key: 'completed', value: true });
    const ownership = catalogOwnership(state.records);
    expect(catalogActionRecord(canonical, ownership)).toEqual(canonical);
    expect(catalogProgress(state, ownership)[canonical.id]).toBeUndefined();
  });
});

describe('bounded tray identity without migration or opinion fields', () => {
  it.each([[provider, canonical], [canonical, provider]])('does not spend another slot or rewrite an already pinned equivalent', (first, second) => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { data.set(key, value); }), removeItem: (key: string) => { data.delete(key); } };
    const store = createCompareTrayStore('guest', () => storage);
    expect(store.pin(first)).toBe(true); const before = [...data.values()][0];
    expect(store.pin(second)).toBe(true); expect(store.getSnapshot().items).toEqual([first]);
    expect(storage.setItem).toHaveBeenCalledTimes(1); expect([...data.values()][0]).toBe(before);
    expect(catalogPinnedIds(store.getSnapshot().items)).toEqual(new Set([canonical.id, provider.id]));
    expect(createCompareTrayStore('guest', () => storage).getSnapshot().items).toEqual([first]);
    expect(createCompareTrayStore('account:demo-play100:other', () => storage).getSnapshot().items).toEqual([]);
    expect(store.pin(unknown)).toBe(true);
    expect(store.getSnapshot().items).toHaveLength(2);
    expect(store.unpin(second.id)).toBe(true);
    expect(store.getSnapshot().items).toEqual([unknown]);
  });
});

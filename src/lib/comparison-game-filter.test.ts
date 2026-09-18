import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import type { LibraryRecord } from './personal-types';
import { clearComparisonGameFilter, COMPARISON_GAMES_KEY, createComparisonGameFilter, parseComparisonGameFilter, readComparisonGameFilter, rememberComparisonGameFilter } from './comparison-game-filter';
import { compareFriendRankings, getComparisonPage } from './friend-comparison';
import type { ComparisonEntry } from './friend-comparison';

const scope = accountScope('filter-owner');
const record: LibraryRecord = { id: 'wikidata:Q123', source: 'wikidata', sourceId: 'Q123', sourceUrl: 'https://www.wikidata.org/wiki/Q123', title: 'Chosen game', year: 2020, studio: null, genre: null, collectionRank: null };
const different = { ...record, id: 'wikidata:Q124', sourceId: 'Q124', sourceUrl: 'https://www.wikidata.org/wiki/Q124' };
function browser() {
  const data = new Map<string, string>();
  const history = { state: {} as Record<string, unknown>, replaceState: vi.fn((next: Record<string, unknown>) => { history.state = next; }) };
  const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }), removeItem: vi.fn((key: string) => { data.delete(key); }) };
  vi.stubGlobal('history', history); vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { pathname: '/compare', href: 'https://play100.test/compare' });
  return { data, history, storage };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('separate private game comparison filter', () => {
  it('stores only strict record metadata under the actual account scope, not scores or imagery', () => {
    const value = createComparisonGameFilter(scope, [record, different]);
    expect(value.records).toEqual([record, different]);
    expect(() => createComparisonGameFilter('guest', [record])).toThrow();
    expect(() => createComparisonGameFilter(scope, [])).toThrow();
    expect(() => createComparisonGameFilter(scope, [record, record])).toThrow();
    expect(() => createComparisonGameFilter(scope, Array(7).fill(record))).toThrow();
    expect(() => parseComparisonGameFilter({ version: 1, scope, records: [{ ...record, note: 'private' }] }, scope)).toThrow();
    expect(parseComparisonGameFilter(value, accountScope('different'))).toBeNull();
  });
  it('does not consume an overridden input iterator beyond its bounded indexed records', () => {
    const records = [record];
    records[Symbol.iterator] = function* () { while (true) yield different; };
    expect(createComparisonGameFilter(scope, records).records).toEqual([record]);
  });
  it('keeps people history unchanged, survives refresh and can be cleared independently', () => {
    const b = browser(); b.history.state = { play100Compare: { selected: ['owner', 'peer'] } };
    const filter = createComparisonGameFilter(scope, [record]);
    expect(rememberComparisonGameFilter(filter)).toBeNull();
    expect(b.history.state.play100Compare).toEqual({ selected: ['owner', 'peer'] });
    expect(b.history.replaceState).toHaveBeenCalledWith(b.history.state, '', 'https://play100.test/compare');
    b.history.state = {};
    expect(readComparisonGameFilter(scope).value).toEqual(filter);
    expect(readComparisonGameFilter(accountScope('different')).value).toBeNull();
    clearComparisonGameFilter(scope);
    expect(b.data.has(COMPARISON_GAMES_KEY)).toBe(false);
  });
  it('reports blocked or corrupt storage without losing valid history data or modifying a library', () => {
    const b = browser(); vi.spyOn(console, 'warn').mockImplementation(() => {});
    b.storage.setItem.mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    const filter = createComparisonGameFilter(scope, [record]);
    expect(rememberComparisonGameFilter(filter)).toMatch(/history/);
    expect(readComparisonGameFilter(scope).value).toEqual(filter);
    b.history.state = {}; b.data.set(COMPARISON_GAMES_KEY, '{bad');
    expect(readComparisonGameFilter(scope)).toMatchObject({ value: null, warning: expect.stringMatching(/could not/) });
  });
  it('a failed persistent clear still removes this view filter and explains that its old saved copy may return', () => {
    const b = browser(); vi.spyOn(console, 'warn').mockImplementation(() => {});
    rememberComparisonGameFilter(createComparisonGameFilter(scope, [record]));
    b.storage.removeItem.mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(clearComparisonGameFilter(scope)).toMatch(/may return/);
    expect(readComparisonGameFilter(scope).value).toBeNull();
    expect(b.data.has(COMPARISON_GAMES_KEY)).toBe(true);
    b.history.state = {};
    expect(readComparisonGameFilter(scope).value?.records).toEqual([record]);
  });
});

describe('game filters never fabricate participant entries', () => {
  const entry: ComparisonEntry = { id: record.id, title: record.title, year: record.year, source: record.source, sourceId: record.sourceId, sourceUrl: record.sourceUrl, score: 0, position: 1 };
  const full = compareFriendRankings([
    { id: 'self', displayName: 'You', kind: 'self', freshness: 'fresh', availability: 'ready',
      entries: [entry, { ...entry, id: different.id, sourceId: different.sourceId, sourceUrl: different.sourceUrl, score: 8, position: 2 }] },
    { id: 'peer', displayName: 'Friend', kind: 'friend', freshness: 'unknown', availability: 'unshared' },
  ]);
  it('filters exact source IDs while retaining zero and unavailable cells', () => {
    const page = getComparisonPage(full, { mode: 'all-shared', games: [record] });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]?.cells).toMatchObject([{ status: 'ranked', score: 0 }, { status: 'unshared', score: null }]);
    expect(full.rows['all-shared']).toHaveLength(2);
    expect(getComparisonPage(full, { games: [record] }).rows).toEqual([]);
  });
  it('does not invent a row or title match for an unranked pinned game', () => {
    expect(getComparisonPage(full, { mode: 'all-shared', games: [{ ...record, id: 'wikidata:Q999', sourceId: 'Q999' }] }).rows).toEqual([]);
  });
  it('rejects malformed, duplicated and excessive game filters', () => {
    expect(() => getComparisonPage(full, { games: [] })).toThrow();
    expect(() => getComparisonPage(full, { games: [record, record] })).toThrow();
    expect(() => getComparisonPage(full, { games: Array(7).fill(record) })).toThrow();
    expect(() => getComparisonPage(full, { games: [{ ...record, sourceId: 'Q888' }] })).toThrow();
  });
});

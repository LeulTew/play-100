import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCollection } from './collection';
import { filterUnranked, unrankedRecords } from './extended-search';
import { defaultFilters } from './url';
import { recordFromGame } from './personal-types';
import type { LibraryRecord, PersonalProgress } from './personal-types';

const data = parseCollection(JSON.parse(readFileSync(new URL('../../data/collection.json', import.meta.url), 'utf8')));
const first = data.games[0];
if (!first) throw new Error('The canonical fixture is missing its first game.');
const canonical = recordFromGame(first);
const a: LibraryRecord = {
  id: 'wikidata:Q900001',
  source: 'wikidata',
  sourceId: 'Q900001',
  title: 'Atlas 2',
  year: 2020,
  genre: 'Action RPG',
  studio: 'Example Studio',
  sourceUrl: 'https://www.wikidata.org/wiki/Q900001',
  collectionRank: null,
};
const b: LibraryRecord = {
  ...a,
  id: 'freetogame:900001',
  source: 'freetogame',
  sourceId: '900001',
  sourceUrl: null,
  title: 'Atlas 20',
  year: 2024,
};
const c: LibraryRecord = {
  ...a,
  id: 'wikidata:Q900002',
  sourceId: 'Q900002',
  sourceUrl: null,
  title: 'Zero Edition',
  year: null,
};
const records = [a, b, c];

describe('saved and live unranked search', () => {
  it('deduplicates exact IDs, gives saved metadata priority and excludes canonical IDs', () => {
    const saved = { [a.id]: a, [canonical.id]: canonical };
    const online = [{ ...a, title: 'An updated source title' }, b, b];
    const before = JSON.stringify({ saved, online });
    expect(unrankedRecords(data.games, saved, online)).toEqual([a, b]);
    expect(JSON.stringify({ saved, online })).toBe(before);
    expect(data.games.map((game) => game.rank)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  });

  it('does not silently merge source IDs or editions with identical titles', () => {
    const duplicateTitle = { ...b, title: a.title };
    expect(unrankedRecords(data.games, { [a.id]: a }, [duplicateTitle]).map((record) => record.id)).toEqual([
      b.id,
      a.id,
    ]);
  });

  it('finds stored additions across title, studio, genre and exact numeric search terms', () => {
    expect(filterUnranked(records, { ...defaultFilters, q: 'atlas 2 example RPG' }, {})).toEqual([a]);
    expect(filterUnranked(records, { ...defaultFilters, q: '2024' }, {})).toEqual([b]);
    expect(filterUnranked(records, { ...defaultFilters, q: 'not present' }, {})).toEqual([]);
  });
  it('matches compact and accented titles in returning-profile records just as in the public seed', () => {
    const record = { ...a, title: 'Kingdom Come: Deliverance' };
    expect(filterUnranked([record], { ...defaultFilters, q: 'Kingdomcome' }, {})).toEqual([record]);
    expect(filterUnranked([record], { ...defaultFilters, q: 'Kíngdom Côme' }, {})).toEqual([record]);
  });

  it('keeps provider alias matches while still applying year and genre filters', () => {
    const aliases = new Set([a.id]);
    expect(filterUnranked(records, { ...defaultFilters, q: 'an upstream alias' }, {}, aliases)).toEqual([a]);
    expect(filterUnranked(records, { ...defaultFilters, q: 'an upstream alias', year: '2024' }, {}, aliases)).toEqual(
      [],
    );
    expect(filterUnranked(records, { ...defaultFilters, genre: 'Not this genre' }, {}, aliases)).toEqual([]);
  });

  it.each(['core', 'essential'] as const)('never gives unranked additions a %s collection position', (tier) => {
    expect(filterUnranked(records, { ...defaultFilters, tier }, {})).toEqual([]);
  });

  it('applies the same device progress filters without inferring a played state', () => {
    const progress: Record<string, PersonalProgress> = {
      [a.id]: { later: true, played: false, completed: false },
      [b.id]: { later: false, played: true, completed: true },
    };
    expect(filterUnranked(records, { ...defaultFilters, list: 'later' }, progress)).toEqual([a]);
    expect(filterUnranked(records, { ...defaultFilters, list: 'completed' }, progress)).toEqual([b]);
    expect(filterUnranked(records, { ...defaultFilters, list: 'unplayed' }, progress)).toEqual([a, c]);
  });

  it('sorts available title/year metadata, leaves unknown years last and never mutates input', () => {
    expect(filterUnranked(records, { ...defaultFilters, sort: 'newest' }, {})).toEqual([b, a, c]);
    expect(filterUnranked(records, { ...defaultFilters, sort: 'oldest' }, {})).toEqual([a, b, c]);
    expect(filterUnranked(records, { ...defaultFilters, sort: 'title', direction: 'desc' }, {})).toEqual([c, b, a]);
    expect(filterUnranked(records, { ...defaultFilters, sort: 'author-rating' }, {})).toEqual([a, b, c]);
    expect(records).toEqual([a, b, c]);
    expect(records.every((record) => !('authorRating' in record) && !('critics' in record))).toBe(true);
  });
});

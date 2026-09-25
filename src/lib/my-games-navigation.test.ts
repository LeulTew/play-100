import { describe, expect, it } from 'vitest';
import {
  gameDetailSearch,
  libraryPageSearch,
  myGamesSearch,
  myGamesTab,
  parseLibraryPage,
} from './my-games-navigation';
import { defaultFilters, pageFromPath, parseUrl } from './url';
import { googleReturnPath } from './google-intent';

describe('My games route compatibility', () => {
  it('uses one new destination without discarding old queue/ranking links', () => {
    expect(pageFromPath('/my-games')).toBe('games');
    expect(myGamesTab('/my-games', '')).toBe('library');
    expect(myGamesTab('/my-games', '?tab=ranking')).toBe('ranking');
    expect(myGamesTab('/my-games', '?tab=queue')).toBe('queue');
    expect(myGamesTab('/my-library', '?list=later')).toBe('queue');
    expect(myGamesTab('/my-library', '?list=completed')).toBe('library');
    expect(myGamesTab('/my-rankings/', '?tab=library')).toBe('ranking');
    expect(myGamesTab('/my-games', '?tab=unknown')).toBe('library');
  });
  it('keeps workspace tabs distinct from list/grid/table filters', () => {
    const search = myGamesSearch(
      { ...defaultFilters, view: 'table', q: 'Crusader & kings', list: 'completed', catalogs: 'off' },
      'ranking',
    );
    expect(myGamesTab('/my-games', search)).toBe('ranking');
    expect(parseUrl(search).filters).toMatchObject({
      view: 'table',
      list: 'completed',
      q: 'Crusader & kings',
      catalogs: 'off',
    });
    expect(myGamesSearch(defaultFilters, 'library')).toBe('');
    expect(myGamesSearch({ ...defaultFilters, list: 'later' }, 'queue')).toBe('?tab=queue');
    const completedQueue = myGamesSearch({ ...defaultFilters, list: 'completed' }, 'queue');
    expect(myGamesTab('/my-games', completedQueue)).toBe('queue');
    expect(parseUrl(completedQueue).filters.list).toBe('completed');
  });
  it('opening or replacing a game preserves each surface query and closing restores it', () => {
    for (const search of [
      '?tab=queue&q=RPG&view=list',
      '?tab=ranking&catalogs=off',
      '?progress=any-played&page=4',
      '?q=Kingdomcome&source=wikidata',
      '?group=12345678-abcd-abcd-abcd-123456789abc',
    ]) {
      const opened = gameDetailSearch(search, 'wikidata:Q123');
      expect(new URLSearchParams(opened).get('game')).toBe('wikidata:Q123');
      expect(gameDetailSearch(opened, null)).toBe(search);
      expect(gameDetailSearch(gameDetailSearch(opened, 'red-dead-redemption-2'), null)).toBe(search);
    }
  });
  it.each(['', '?page=0', '?page=-2', '?page=1.5', '?page=Infinity', '?page=10000', '?page=secret'])(
    'bounds an invalid Library page without accepting private text: %s',
    (search) => {
      expect(parseLibraryPage(search)).toBe(1);
    },
  );
  it('stores only the numeric Library page and preserves filters and the detail route', () => {
    const search = '?catalogs=off&progress=any-played&game=alpha';
    const second = libraryPageSearch(search, 2);
    expect(parseLibraryPage(second)).toBe(2);
    expect(libraryPageSearch(second, 4)).toBe(`${search}&page=4`);
    expect(libraryPageSearch(second, 1)).toBe(search);
    expect(gameDetailSearch(libraryPageSearch('?catalogs=off', 4), 'alpha')).toBe('?catalogs=off&page=4&game=alpha');
    expect(() => libraryPageSearch(search, -1)).toThrow(RangeError);
    expect(() => libraryPageSearch(search, 1.5)).toThrow(RangeError);
    expect(() => libraryPageSearch(search, 10000)).toThrow(RangeError);
  });
  it('retains the Library page through Ranking tabs but resets it for Queue or new filters', () => {
    expect(myGamesSearch(defaultFilters, 'ranking', null, 4)).toBe('?tab=ranking&page=4');
    expect(myGamesSearch(defaultFilters, 'library', null, 4)).toBe('?page=4');
    expect(myGamesSearch(defaultFilters, 'queue', null, 4)).toBe('?tab=queue');
    expect(myGamesSearch({ ...defaultFilters, progress: 'any-played' }, 'library')).toBe('?progress=any-played');
  });
  it('retains a valid My games Google return tab without forwarding private or unknown parameters', () => {
    expect(googleReturnPath('/my-games?tab=queue&catalogs=off&participants=private-peer&token=secret')).toBe(
      '/my-games?catalogs=off&tab=queue',
    );
    expect(googleReturnPath('/my-games?tab=ranking')).toBe('/my-games?tab=ranking');
    expect(googleReturnPath('/my-games?tab=bad')).toBe('/my-games');
  });
});

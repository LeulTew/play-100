import { describe, expect, it } from 'vitest';
import { gameDetailSearch, myGamesSearch, myGamesTab } from './my-games-navigation';
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
      '?q=Kingdomcome&source=wikidata',
      '?group=12345678-abcd-abcd-abcd-123456789abc',
    ]) {
      const opened = gameDetailSearch(search, 'wikidata:Q123');
      expect(new URLSearchParams(opened).get('game')).toBe('wikidata:Q123');
      expect(gameDetailSearch(opened, null)).toBe(search);
      expect(gameDetailSearch(gameDetailSearch(opened, 'red-dead-redemption-2'), null)).toBe(search);
    }
  });
  it('retains a valid My games Google return tab without forwarding private or unknown parameters', () => {
    expect(googleReturnPath('/my-games?tab=queue&catalogs=off&participants=private-peer&token=secret')).toBe(
      '/my-games?catalogs=off&tab=queue',
    );
    expect(googleReturnPath('/my-games?tab=ranking')).toBe('/my-games?tab=ranking');
    expect(googleReturnPath('/my-games?tab=bad')).toBe('/my-games');
  });
});

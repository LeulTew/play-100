import { describe, expect, it } from 'vitest';
import { createShareUrl, pageFromPath, parseUrl } from './url';

describe('preserved entry points during the My games navigation merge', () => {
  it.each([
    ['/my-library', 'library'],
    ['/my-library/', 'library'],
    ['/my-rankings', 'rankings'],
    ['/my-rankings/', 'rankings'],
    ['/discover', 'discover'],
    ['/compare', 'compare'],
    ['/friends', 'friends'],
    ['/friends/sharing', 'friend-sharing'],
    ['/friends/player-1', 'friend'],
    ['/invite', 'invite'],
    ['/u/player_one', 'profile'],
  ])('keeps %s assigned to its existing experience', (path, page) => {
    expect(pageFromPath(path)).toBe(page);
  });
  it('keeps old queue and ranking details usable without rewriting their stored models', () => {
    const queue = new URL('https://play100.test/my-library?list=later&game=wikidata%3AQ123&catalogs=off');
    expect(pageFromPath(queue.pathname)).toBe('library');
    expect(parseUrl(queue.search)).toMatchObject({ filters: { list: 'later', catalogs: 'off' }, game: 'wikidata:Q123' });
    const ranking = new URL('https://play100.test/my-rankings?game=red-dead-redemption-2');
    expect(pageFromPath(ranking.pathname)).toBe('rankings');
    expect(parseUrl(ranking.search).game).toBe('red-dead-redemption-2');
  });
  it('does not confuse game cards, people comparisons, sharing setup or the original collection', () => {
    expect(pageFromPath('/compare')).toBe('compare');
    expect(pageFromPath('/friends/sharing')).not.toBe('friend');
    expect(pageFromPath('/friends/player-1')).not.toBe('compare');
    expect(pageFromPath('/')).toBe('collection');
  });
  it('public collection links contain neither private library scope nor people/group intent', () => {
    const source = parseUrl('?q=Mass&list=later&catalogs=off&group=private-group&participants=friend-1&token=private-capability&scope=account');
    const url = new URL(createShareUrl('https://play100.test', source.filters, 'mass-effect-2'));
    expect([...url.searchParams.keys()].sort()).toEqual(['catalogs', 'game', 'q']);
    expect(url.searchParams.get('catalogs')).toBe('off');
    expect(url.searchParams.get('q')).toBe('Mass');
    expect(url.hash).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { pageDestination } from './page-navigation';
import { defaultFilters, parseUrl } from './url';

describe('shared page destinations for navigation and real Menu hrefs', () => {
  it.each([
    ['games', {}, '/my-games', ''],
    ['library', {}, '/my-games', ''],
    ['library', { list: 'later' }, '/my-games', '?tab=queue'],
    ['games', { list: 'later' }, '/my-games', '?tab=queue'],
    ['rankings', {}, '/my-games', '?tab=ranking'],
    ['discover', {}, '/discover', ''],
    ['friends', {}, '/friends', ''],
    ['compare', {}, '/compare', ''],
    ['community', {}, '/community', ''],
    ['publish', {}, '/publish', ''],
    ['friend-sharing', {}, '/friends/sharing', ''],
    ['friend-shelf', {}, '/friends/sharing/games', ''],
    ['account', {}, '/account', ''],
    ['creator', {}, '/creator', ''],
  ] as const)('keeps %s a real existing destination', (page, patch, path, search) => {
    expect(pageDestination(page, defaultFilters, patch)).toEqual({ path, search });
  });

  it('keeps the public catalog opt-out without carrying private filters or game context', () => {
    const { filters } = parseUrl(
      '?catalogs=off&list=completed&progress=played&q=private&game=mass-effect-2&participants=peer&token=capability',
    );
    expect(pageDestination('discover', filters)).toEqual({ path: '/discover', search: '?catalogs=off' });
    expect(pageDestination('rankings', filters)).toEqual({ path: '/my-games', search: '?catalogs=off&tab=ranking' });
    expect(pageDestination('games', filters, { list: 'later' })).toEqual({
      path: '/my-games',
      search: '?catalogs=off&tab=queue',
    });
  });

  it('retains explicit legacy progress patches used by existing callers', () => {
    expect(pageDestination('library', defaultFilters, { list: 'completed' })).toEqual({
      path: '/my-games',
      search: '?list=completed',
    });
  });
});

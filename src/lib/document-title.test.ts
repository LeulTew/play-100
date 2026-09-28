import { describe, expect, it } from 'vitest';
import { appDocumentTitle } from './document-title';
import { myGamesTab } from './my-games-navigation';
import { pageFromPath } from './url';

describe('committed-state document titles', () => {
  it.each([
    ['/my-library', '?list=later&catalogs=off', 'Queue'],
    ['/my-library/', '?list=later', 'Queue'],
    ['/my-games', '?tab=queue', 'Queue'],
    ['/my-games', '?list=later', 'Queue'],
    ['/my-games', '?tab=library&list=later', 'Library'],
    ['/my-games', '?tab=ranking&list=later', 'Ranking'],
    ['/my-rankings', '?list=later', 'Ranking'],
    ['/my-library', '?list=completed', 'Library'],
    ['/my-games', '', 'Library'],
  ])('uses the resolved workspace tab for %s%s', (path, search, title) => {
    expect(appDocumentTitle(pageFromPath(path), undefined, undefined, null, myGamesTab(path, search))).toBe(
      `My games · ${title} | Play 100`,
    );
  });

  it('keeps game, record and utility titles ahead of the resolved Queue tab', () => {
    expect(appDocumentTitle('library', { title: 'Game', rank: 1 }, undefined, null, 'queue')).toBe(
      'Game · #1 | Play 100',
    );
    expect(appDocumentTitle('games', undefined, { title: 'Private game' }, null, 'queue')).toBe(
      'Private game | Play 100',
    );
    expect(appDocumentTitle('games', undefined, { title: 'Private game' }, 'settings', 'queue')).toBe(
      'Settings & backups | Play 100',
    );
    expect(appDocumentTitle('games', undefined, undefined, 'about', 'queue')).toBe('About & credits | Play 100');
    expect(appDocumentTitle('collection', undefined, undefined, null, 'queue')).toBe(
      'Good games. Great escapes. | Play 100',
    );
  });

  it.each([
    ['collection', 'Good games. Great escapes.'],
    ['library', 'My games · Library'],
    ['rankings', 'My games · Ranking'],
    ['account', 'Account'],
    ['compare', 'Compare rankings'],
  ] as const)('preserves the existing %s route convention', (page, title) => {
    expect(appDocumentTitle(page)).toBe(`${title} | Play 100`);
  });

  it('retains original-game rank and noncanonical catalog titles', () => {
    const game = { title: 'Red Dead Redemption 2', rank: 1 };
    expect(appDocumentTitle('collection', game)).toBe('Red Dead Redemption 2 · #1 | Play 100');
    expect(appDocumentTitle('discover', undefined, { title: '0 A.D.' })).toBe('0 A.D. | Play 100');
  });

  it.each([
    ['settings', 'Settings & backups'],
    ['about', 'About & credits'],
    ['menu', 'Menu'],
    ['compare-tray', 'Compare tray'],
    ['account', 'Sign in'],
  ] as const)('gives committed %s precedence without exposing the underlying record title', (panel, title) => {
    const game = { title: 'Underlying game', rank: 2 };
    const record = { title: 'Private record title' };
    expect(appDocumentTitle('collection', game, record, panel)).toBe(`${title} | Play 100`);
    expect(appDocumentTitle('discover', undefined, record, panel)).toBe(`${title} | Play 100`);
    expect(appDocumentTitle('games', undefined, undefined, panel)).toBe(`${title} | Play 100`);
    expect(appDocumentTitle('games', game, record, panel, 'ranking')).toBe(`${title} | Play 100`);
    expect(appDocumentTitle('collection', game, record, null)).toBe('Underlying game · #2 | Play 100');
    expect(appDocumentTitle('games', undefined, undefined, null, 'ranking')).toBe('My games · Ranking | Play 100');
  });

  it.each([null, undefined])('retains the route or game title without an active modal (%s)', (panel) => {
    const game = { title: 'Red Dead Redemption 2', rank: 1 };
    expect(appDocumentTitle('collection', game, undefined, panel)).toBe('Red Dead Redemption 2 · #1 | Play 100');
    expect(appDocumentTitle('compare', undefined, undefined, panel)).toBe('Compare rankings | Play 100');
  });
});

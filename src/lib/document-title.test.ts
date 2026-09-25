import { describe, expect, it } from 'vitest';
import { appDocumentTitle } from './document-title';

describe('committed-state document titles', () => {
  it.each([
    ['collection', 'Find your next game'],
    ['library', 'My games · Library'],
    ['rankings', 'My games · Ranking'],
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
  ] as const)('gives committed %s precedence without exposing the underlying record title', (panel, title) => {
    const game = { title: 'Underlying game', rank: 2 };
    const record = { title: 'Private record title' };
    expect(appDocumentTitle('collection', game, record, panel)).toBe(`${title} | Play 100`);
    expect(appDocumentTitle('discover', undefined, record, panel)).toBe(`${title} | Play 100`);
    expect(appDocumentTitle('games', undefined, undefined, panel)).toBe(`${title} | Play 100`);
    expect(appDocumentTitle('collection', game, record, null)).toBe('Underlying game · #2 | Play 100');
  });

  it.each([null, 'menu', 'account'] as const)('retains the route or game title for %s', (panel) => {
    const game = { title: 'Red Dead Redemption 2', rank: 1 };
    expect(appDocumentTitle('collection', game, undefined, panel)).toBe('Red Dead Redemption 2 · #1 | Play 100');
    expect(appDocumentTitle('compare', undefined, undefined, panel)).toBe('Compare rankings | Play 100');
  });
});

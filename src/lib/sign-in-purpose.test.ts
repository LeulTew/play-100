import { describe, expect, it, vi } from 'vitest';
import { authPanelPurposes, currentSignInPurpose, signInPurposeTicket } from './sign-in-purpose';

describe('sign-in purpose', () => {
  it('gives only an explicit Compare invocation a ticket', () => {
    const isCurrent = vi.fn(() => true);
    expect(signInPurposeTicket('account', isCurrent)).toBeNull();
    expect(signInPurposeTicket('compare', isCurrent)).toEqual({ purpose: 'compare', isCurrent });
    expect(isCurrent).not.toHaveBeenCalled();
  });
  it('reports the purpose only while the sheet is open and the ticket is current', () => {
    let current = true;
    const ticket = signInPurposeTicket('compare', () => current);
    expect(currentSignInPurpose(ticket, true)).toBe('compare');
    expect(currentSignInPurpose(ticket, false)).toBeUndefined();
    expect(currentSignInPurpose(null, true)).toBeUndefined();
    current = false;
    expect(currentSignInPurpose(ticket, true)).toBeUndefined();
  });
  it('does not read currentness for a closed sheet', () => {
    const isCurrent = vi.fn(() => true);
    expect(currentSignInPurpose(signInPurposeTicket('compare', isCurrent), false)).toBeUndefined();
    expect(isCurrent).not.toHaveBeenCalled();
  });
  it('carries a tray purpose into the sheet on any route without changing the page panel', () => {
    for (const page of ['collection', 'discover', 'games', 'library', 'rankings', 'invite', 'community'] as const) {
      expect(authPanelPurposes(page, 'compare')).toEqual({ page: undefined, sheet: 'compare' });
      expect(authPanelPurposes(page, undefined)).toEqual({ page: undefined, sheet: undefined });
    }
    expect(authPanelPurposes('friends', 'compare')).toEqual({ page: 'friends', sheet: 'compare' });
  });
  it('keeps the existing Compare route purpose for both panels', () => {
    expect(authPanelPurposes('compare', undefined)).toEqual({ page: 'compare', sheet: 'compare' });
    expect(authPanelPurposes('compare', 'compare')).toEqual({ page: 'compare', sheet: 'compare' });
  });
  it.each([
    ['account', 'account'],
    ['friends', 'friends'],
    ['friend', 'friends'],
    ['publish', 'publish'],
    ['friend-sharing', 'friend-sharing'],
    ['friend-shelf', 'friend-shelf'],
    ['creator', 'creator'],
  ] as const)('explains the signed-out %s page on the page only, not in a sheet opened over it', (page, purpose) => {
    expect(authPanelPurposes(page, undefined)).toEqual({ page: purpose, sheet: undefined });
  });
});

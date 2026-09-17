import { describe, expect, it } from 'vitest';
import { friendsViewUrl, invitationStatus, nextInvitationExpiry, parseFriendsView, uniqueFriendPairs, visibleFriendPairs } from './friend-manager';
import type { FriendIdentityState } from './friend-manager';
import type { FriendInvitation, FriendPair } from './friend-types';

const avatar = { version: 1 as const, palette: 'lime' as const, seed: 'a'.repeat(32) };
function pair(peer: string, from = 'owner', state: FriendPair['state'] = 'pending', updatedAt = 10): FriendPair {
  const a = 'owner' < peer ? 'owner' : peer; const b = a === 'owner' ? peer : 'owner';
  return { format: 1, a, b, participants: [a, b], from, state, epoch: 1, inviteSlot: null, createdAt: 1, updatedAt };
}
const profile = (uid: string, displayName: string): FriendIdentityState => ({ status: 'ready', value: { format: 1, uid, displayName, avatar, revision: 1, updatedAt: 1 } });
const invite: FriendInvitation = { ownerUid: 'owner', displayName: 'Owner', avatar, token: 'b'.repeat(64), slot: 0, state: 'active', createdAt: 100, expiresAt: 1000, lifetimeDays: 7, singleUse: true };

describe('loaded-only friends manager', () => {
  it('round-trips all views, escaped name filters and ordering without private selections', () => {
    for (const view of ['friends', 'incoming', 'sent', 'invites', 'blocked'] as const) {
      const state = { view, name: 'A & B + café', order: 'name' as const };
      const url = friendsViewUrl(state);
      expect(parseFriendsView(new URL(url, 'https://example.test').search)).toEqual(state);
      expect(url).not.toMatch(/token|participants|uid/);
    }
    expect(parseFriendsView('?view=unknown&name=' + 'x'.repeat(90) + '&order=bad')).toEqual({ view: 'friends', name: 'x'.repeat(60), order: 'recent' });
  });
  it('separates incoming from sent without treating one scanned page as the full inbox', () => {
    const sent = Array.from({ length: 20 }, (_, index) => pair(`peer-${index}`));
    const incoming = pair('incoming-peer', 'incoming-peer');
    expect(visibleFriendPairs(sent, {}, 'owner', { view: 'incoming', name: '', order: 'recent' })).toEqual([]);
    expect(visibleFriendPairs([...sent, incoming], {}, 'owner', { view: 'incoming', name: '', order: 'recent' })).toEqual([incoming]);
    expect(visibleFriendPairs([...sent, incoming], {}, 'owner', { view: 'sent', name: '', order: 'recent' })).toHaveLength(20);
  });
  it('filters and sorts loaded names with unavailable names last and stable ties', () => {
    const rows = [pair('z', 'owner', 'accepted', 30), pair('a', 'owner', 'accepted', 10), pair('missing', 'owner', 'accepted', 50)];
    const names = { a: profile('a', 'ALPHA'), z: profile('z', 'Zulu') };
    expect(visibleFriendPairs(rows, names, 'owner', { view: 'friends', name: '', order: 'name' }).map((row) => row.a === 'owner' ? row.b : row.a)).toEqual(['a', 'z', 'missing']);
    expect(visibleFriendPairs(rows, names, 'owner', { view: 'friends', name: 'alpha', order: 'recent' })).toEqual([rows[1]]);
    expect(rows[0]?.updatedAt).toBe(30);
  });
  it('deduplicates page boundaries without regressing a newer relationship epoch', () => {
    const older = pair('peer'); const newer = { ...older, epoch: 2, updatedAt: 20 };
    expect(uniqueFriendPairs([newer, older])).toEqual([newer]);
    expect(uniqueFriendPairs([older, newer])).toEqual([newer]);
  });
});
describe('invitation display boundaries', () => {
  it('expires exactly at the deadline and preserves Used/Revoked after expiry', () => {
    expect(invitationStatus(invite, 999)).toBe('Active');
    expect(invitationStatus(invite, 1000)).toBe('Expired');
    expect(invitationStatus({ ...invite, state: 'consumed' }, 2000)).toBe('Used');
    expect(invitationStatus({ ...invite, state: 'revoked' }, 2000)).toBe('Revoked');
  });
  it('schedules only the next still-active deadline and stops when nothing can expire', () => {
    const later = { ...invite, expiresAt: 4000 };
    expect(nextInvitationExpiry([later, invite, { ...invite, state: 'revoked', expiresAt: 500 }], 100)).toBe(1000);
    expect(nextInvitationExpiry([later, invite], 1000)).toBe(4000);
    expect(nextInvitationExpiry([later, invite], 4000)).toBeNull();
  });
});

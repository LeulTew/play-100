import type { FriendIdentity, FriendInvitation, FriendPair } from './friend-types';

export type FriendsView = 'friends' | 'incoming' | 'sent' | 'invites' | 'blocked';
export interface FriendsViewState {
  view: FriendsView;
  name: string;
  order: 'recent' | 'name';
}
export type FriendIdentityState =
  | { status: 'loading' }
  | { status: 'ready'; value: FriendIdentity }
  | { status: 'unavailable'; reason: 'missing' | 'denied' }
  | { status: 'error'; cause: unknown };

export function parseFriendsView(search: string): FriendsViewState {
  const params = new URLSearchParams(search);
  const value = params.get('view');
  return {
    view: value === 'incoming' || value === 'sent' || value === 'invites' || value === 'blocked' ? value : 'friends',
    name: (params.get('name') ?? '').slice(0, 60),
    order: params.get('order') === 'name' ? 'name' : 'recent',
  };
}
export function friendsViewUrl(state: FriendsViewState): string {
  const params = new URLSearchParams();
  if (state.view !== 'friends') params.set('view', state.view);
  if (state.name) params.set('name', state.name.slice(0, 60));
  if (state.order !== 'recent') params.set('order', state.order);
  return `/friends${params.size ? `?${params}` : ''}`;
}
export function friendPeer(pair: FriendPair, uid: string): string {
  return pair.a === uid ? pair.b : pair.a;
}
export function uniqueFriendPairs(rows: FriendPair[]): FriendPair[] {
  const pairs = new Map<string, FriendPair>();
  for (const row of rows) {
    const key = `${row.a}~${row.b}`;
    if ((pairs.get(key)?.epoch ?? -1) <= row.epoch) pairs.set(key, row);
  }
  return [...pairs.values()];
}
export function friendPageSignature(rows: FriendPair[]): string {
  return rows.map((row) => `${row.a}~${row.b}:${row.epoch}:${row.state}:${row.updatedAt}`).join('|');
}
export function visibleFriendPairs(
  rows: FriendPair[],
  identities: Record<string, FriendIdentityState>,
  uid: string,
  view: FriendsViewState,
): FriendPair[] {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const nameOf = (row: FriendPair) => {
    const profile = identities[friendPeer(row, uid)];
    return profile?.status === 'ready' ? profile.value.displayName : '';
  };
  const search = view.name.trim().toLocaleLowerCase();
  return rows
    .filter(
      (row) =>
        (view.view === 'friends'
          ? row.state === 'accepted'
          : row.state === 'pending' && (view.view === 'sent' ? row.from === uid : row.from !== uid)) &&
        (!search || nameOf(row).toLocaleLowerCase().includes(search)),
    )
    .sort((a, b) => {
      if (view.order === 'name') {
        const left = nameOf(a);
        const right = nameOf(b);
        const byName = left && right ? collator.compare(left, right) : left ? -1 : right ? 1 : 0;
        if (byName) return byName;
      }
      return b.updatedAt - a.updatedAt || collator.compare(friendPeer(a, uid), friendPeer(b, uid));
    });
}
export function invitationStatus(invite: FriendInvitation, now: number): 'Active' | 'Used' | 'Expired' | 'Revoked' {
  if (invite.state === 'consumed') return 'Used';
  if (invite.state === 'revoked') return 'Revoked';
  return invite.expiresAt > now ? 'Active' : 'Expired';
}
export function nextInvitationExpiry(invites: FriendInvitation[], now: number): number | null {
  const future = invites
    .filter((invite) => invitationStatus(invite, now) === 'Active')
    .map((invite) => invite.expiresAt);
  return future.length ? Math.min(...future) : null;
}

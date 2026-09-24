import type { FriendIdentity, FriendSettings } from '../lib/friend-types';
import type { FriendStore } from './friend-store';
import { FriendAllStore } from './friend-all-store';
import { cloudAuth } from './firebase-client';

export function navigateFriend(uid: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('This player link is invalid.');
  history.pushState(null, '', `/friends/${uid}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}
export type OwnFriendIdentity = {
  uid: string;
  verified: boolean;
  displayName: string;
  avatar: FriendIdentity['avatar'];
};
export async function prepareFriendIdentity(store: FriendStore, identity: OwnFriendIdentity): Promise<FriendSettings> {
  if (!identity.verified || cloudAuth.currentUser?.uid !== identity.uid)
    throw new Error('Verify your signed-in account before continuing.');
  const current = () => cloudAuth.currentUser?.uid === identity.uid;
  const [settings, previous] = await Promise.all([
    store.settings(identity.uid).then(async (existing) => {
      if (!current()) throw new Error('The account changed. Review before continuing.');
      if (existing) return existing;
      // No friend settings means no sharing choice yet. Start the automatic default so this first friend action
      // cannot pre-empt it with off controls that would read as an existing legacy choice.
      await new FriendAllStore(store.db).startDefault(identity.uid, current);
      if (!current()) throw new Error('The account changed. Review before continuing.');
      return (await store.settings(identity.uid)) ?? store.initialize(identity.uid);
    }),
    store.identity(identity.uid),
  ]);
  if (cloudAuth.currentUser?.uid !== identity.uid) throw new Error('The account changed. Review before continuing.');
  if (settings.deleted) throw new Error('This account is being deleted.');
  if (
    !previous ||
    previous.displayName !== identity.displayName ||
    JSON.stringify(previous.avatar) !== JSON.stringify(identity.avatar)
  ) {
    await store.saveIdentity(
      identity.uid,
      { displayName: identity.displayName, avatar: identity.avatar },
      previous?.revision ?? 0,
    );
  }
  return settings;
}

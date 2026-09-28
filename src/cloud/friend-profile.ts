import { runTransaction, serverTimestamp } from 'firebase/firestore';
import { parseAvatar } from '../lib/community';
import type { AvatarValue } from '../lib/community';
import { displayNameProblem } from '../lib/text-controls';
import {
  FriendStoreError,
  friendName,
  friendSelection,
  friendUid,
  parseFriendIdentity,
  parseFriendSettings,
} from '../lib/friend-types';
import type { FriendIdentity, FriendSettings } from '../lib/friend-types';
import { ensureAccountActivity } from './account-lifecycle';
import { SocialStore } from './social-store';
import type { FriendStore } from './friend-store';
import { activeSettings, conflict, expectedSettings, online } from './friend-store-core';

// The friend profile, which FriendStore's methods of the same names run: preparing and saving the sharing settings,
// and saving or publicly resolving the friend-facing name and icon. A call to another store method goes through the
// store, as when these were its own methods, so a patched FriendStore.prototype method still intercepts it.

export async function initialize(store: FriendStore, uid: string): Promise<FriendSettings> {
  friendUid(uid);
  online();
  await ensureAccountActivity(store.db, uid);
  const ref = store.ref('friendSettings', uid);
  await runTransaction(store.db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      activeSettings(parseFriendSettings(snap.data()));
      return;
    }
    tx.set(ref, {
      format: 1,
      enabled: false,
      deleted: false,
      selection: '',
      epoch: 1,
      revision: 1,
      updatedAt: serverTimestamp(),
    });
  });
  return store.afterCommit({ operation: 'initialize', uid }, async () =>
    activeSettings(await store.readCommitted(ref, parseFriendSettings)),
  );
}
export async function saveSettings(
  store: FriendStore,
  uid: string,
  input: { enabled: boolean; selectedIds: string[] },
  expected: FriendSettings,
): Promise<FriendSettings> {
  const selectedIds = friendSelection(input.selectedIds);
  if (typeof input.enabled !== 'boolean')
    throw new FriendStoreError('invalid', 'Choose whether friends-only sharing is enabled.');
  online();
  const ref = store.ref('friendSettings', uid);
  await runTransaction(store.db, async (tx) => {
    const snap = await tx.get(ref);
    const current = activeSettings(snap.exists() ? parseFriendSettings(snap.data()) : null);
    expectedSettings(current, expected);
    if (current.enabled === input.enabled && current.selectedIds.join('|') === selectedIds.join('|')) return;
    tx.update(ref, {
      enabled: input.enabled,
      selection: selectedIds.join('|'),
      epoch: current.epoch + 1,
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  return store.afterCommit({ operation: 'save-settings', uid }, async () =>
    activeSettings(await store.readCommitted(ref, parseFriendSettings)),
  );
}
export async function publicIdentity(store: FriendStore, uid: string): Promise<FriendIdentity | null> {
  friendUid(uid);
  try {
    const profile = await new SocialStore(store.db).ownProfile(uid);
    return profile?.published && !profile.hidden
      ? {
          format: 1,
          uid,
          displayName: profile.displayName,
          avatar: profile.avatar,
          revision: 1,
          updatedAt: profile.updatedAt,
        }
      : null;
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied') return null;
    throw cause;
  }
}
export async function saveIdentity(
  store: FriendStore,
  uid: string,
  input: { displayName: string; avatar: AvatarValue },
  expectedRevision: number,
): Promise<FriendIdentity> {
  const displayName = friendName(input.displayName);
  const avatar = parseAvatar(input.avatar);
  online();
  const ref = store.ref('friendIdentities', uid);
  await runTransaction(store.db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? parseFriendIdentity(snap.data()) : null;
    if ((current?.revision ?? 0) !== expectedRevision)
      conflict('Your friend profile changed. Reload before saving its name or icon.');
    if (current && current.displayName === displayName && JSON.stringify(current.avatar) === JSON.stringify(avatar))
      return;
    // Rules accept an unchanged legacy name; a new or changed name must pass the display-name rule.
    const nameProblem = current?.displayName === displayName ? null : displayNameProblem(displayName);
    if (nameProblem) throw new FriendStoreError('invalid', nameProblem);
    tx.set(ref, {
      format: 1,
      uid,
      displayName,
      avatar,
      revision: expectedRevision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  return store.afterCommit({ operation: 'save-identity', uid }, async () => {
    const result = await store.readCommitted(ref, parseFriendIdentity);
    if (!result || result.uid !== uid) conflict();
    return result;
  });
}

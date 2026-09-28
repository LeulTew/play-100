import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
} from 'firebase/firestore';
import { friendName, friendParticipants, friendUid, friendUuid, parseFriendGroup } from '../lib/friend-types';
import type { FriendCursor, FriendGroup, FriendPage } from '../lib/friend-types';
import {
  occupyQuotaSlot,
  quotaRef,
  quotaSupported,
  readQuotaSlots,
  releaseQuotaSlot,
  requireVisibleCapacity,
} from './account-quota';
import type { FriendStore } from './friend-store';
import { conflict, online, page } from './friend-store-core';

// Saved friend groups, which FriendStore's methods of the same names run. A call to another store method goes through
// the store, as when these were its own methods, so a patched FriendStore.prototype method still intercepts it.

export async function getGroup(store: FriendStore, uid: string, id: string): Promise<FriendGroup | null> {
  return store.read(doc(store.db, 'friendGroups', friendUid(uid), 'items', friendUuid(id)), (data) =>
    parseFriendGroup(id, data),
  );
}
export async function listGroups(
  store: FriendStore,
  uid: string,
  cursor?: FriendCursor,
): Promise<FriendPage<FriendGroup>> {
  const result = await getDocsFromServer(
    query(
      collection(store.db, 'friendGroups', friendUid(uid), 'items'),
      orderBy('updatedAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(20),
    ),
  );
  return page(result.docs, (row) => parseFriendGroup(row.id, row.data()));
}
export async function saveGroup(
  store: FriendStore,
  uid: string,
  input: { id?: string; name: string; participantUids: string[] },
  expectedRevision: number,
): Promise<FriendGroup> {
  const id = input.id ? friendUuid(input.id) : crypto.randomUUID();
  const name = friendName(input.name, 80);
  const participantUids = friendParticipants(input.participantUids);
  const ref = doc(store.db, 'friendGroups', friendUid(uid), 'items', id);
  online();
  const quota = quotaRef(store.db, uid, 'groups');
  const counted = await quotaSupported(quota);
  if (!(await getDocFromServer(ref)).exists())
    await requireVisibleCapacity<FriendCursor>('groups', (cursor) => store.listGroups(uid, cursor));
  const existing = await runTransaction(store.db, async (tx) => {
    const [snap, slots] = await Promise.all([
      tx.get(ref),
      counted ? readQuotaSlots(tx, quota, 'groups') : Promise.resolve(null),
    ]);
    const current = snap.exists() ? parseFriendGroup(id, snap.data()) : null;
    if (
      input.id &&
      expectedRevision === 0 &&
      current &&
      current.name === name &&
      current.participantUids.join('|') === participantUids.join('|')
    )
      return current;
    if ((current?.revision ?? 0) !== expectedRevision) conflict('This saved group changed. Reload before saving.');
    if (slots && !current) occupyQuotaSlot(tx, quota, slots, id, 'groups');
    tx.set(ref, {
      format: 1,
      name,
      participantUids,
      revision: expectedRevision + 1,
      createdAt: snap.exists() ? snap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return null;
  });
  if (existing) return existing;
  return store.afterCommit({ operation: 'save-group', uid, groupId: id, revision: expectedRevision + 1 }, async () => {
    const result = await store.readCommitted(ref, (data) => parseFriendGroup(id, data));
    if (!result) conflict();
    return result;
  });
}
export async function deleteGroup(
  store: FriendStore,
  uid: string,
  id: string,
  expectedRevision: number,
  quotaAvailable?: boolean,
): Promise<void> {
  const ref = doc(store.db, 'friendGroups', friendUid(uid), 'items', friendUuid(id));
  online();
  const quota = quotaRef(store.db, uid, 'groups');
  const counted = quotaAvailable ?? (await quotaSupported(quota));
  await runTransaction(store.db, async (tx) => {
    const [snap, slots] = await Promise.all([
      tx.get(ref),
      counted ? readQuotaSlots(tx, quota, 'groups') : Promise.resolve(null),
    ]);
    if (!snap.exists() || parseFriendGroup(id, snap.data()).revision !== expectedRevision)
      conflict('This saved group changed or was already deleted.');
    tx.delete(ref);
    if (slots) releaseQuotaSlot(tx, quota, slots, id);
  });
}

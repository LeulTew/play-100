import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
} from 'firebase/firestore';
import type { DocumentData, Query, Transaction } from 'firebase/firestore';
import { FriendStoreError, friendPairId, friendUid, parseFriendBlock, parseFriendPair } from '../lib/friend-types';
import type { FriendBlock, FriendCursor, FriendPage, FriendPair, FriendPairState } from '../lib/friend-types';
import {
  ACCOUNT_LIMITS,
  AccountQuotaFull,
  occupyQuotaSlot,
  quotaRef,
  quotaSupported,
  readQuotaSlots,
  releaseQuotaSlot,
  requireVisibleCapacity,
} from './account-quota';
import type { FriendStore } from './friend-store';
import { conflict, errorValue, online, page } from './friend-store-core';

// Friendship pairs and blocks, which FriendStore's methods of the same names run: listing and watching relations,
// sending and answering requests, releasing a pair, and blocking. A call to another store method goes through the
// store, as when these were its own methods, so a patched FriendStore.prototype method still intercepts it. The store's
// private methods are called as store['name'](...), which TypeScript allows, so they stay private. friend-store.ts
// re-exports the cooldowns.

export const FRIEND_REQUEST_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
/** After cancelling, the sender waits this long before requesting again or releasing the pair (rules fPairAction). */
export const FRIEND_CANCEL_COOLDOWN_MS = 10 * 60 * 1000;
const requestUnavailable = "You can't send this person a request right now.";
const recentlyCancelled = 'You cancelled a request to this person a moment ago. Try again in a few minutes.';

export function relationsQuery(
  store: FriendStore,
  uid: string,
  state?: FriendPairState,
  cursor?: FriendCursor,
): Query<DocumentData> {
  return query(
    collection(store.db, 'friendPairs'),
    where('participants', 'array-contains', friendUid(uid)),
    ...(state ? [where('state', '==', state)] : []),
    orderBy('updatedAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(20),
  );
}
export async function listRelations(
  store: FriendStore,
  uid: string,
  state?: FriendPairState,
  cursor?: FriendCursor,
): Promise<FriendPage<FriendPair>> {
  const result = await getDocsFromServer(store['relationsQuery'](uid, state, cursor));
  return page(result.docs, (row) => parseFriendPair(row.data()));
}
export function watchRelations(
  store: FriendStore,
  uid: string,
  state: FriendPairState,
  next: (value: FriendPage<FriendPair>) => void,
  error: (cause: Error) => void,
): () => void {
  return onSnapshot(
    store['relationsQuery'](uid, state),
    { includeMetadataChanges: true },
    (result) => {
      if (result.metadata.fromCache || result.metadata.hasPendingWrites) return;
      try {
        next(page(result.docs, (row) => parseFriendPair(row.data())));
      } catch (cause) {
        error(errorValue(cause));
      }
    },
    error,
  );
}
export async function touchPairCount(store: FriendStore, tx: Transaction, uid: string, id: string, created: boolean) {
  const ref = quotaRef(store.db, uid, 'pairs');
  const snapshot = await tx.get(ref);
  const value = snapshot.exists() ? snapshot.data() : { count: 0, revision: 0 };
  if (
    !Number.isSafeInteger(value.count) ||
    value.count < 0 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) {
    throw new FriendStoreError('invalid', 'Your connection count could not be read. Refresh the page, then try again.');
  }
  if (created && value.count >= ACCOUNT_LIMITS.pairs) throw new AccountQuotaFull('pairs');
  tx.set(ref, { count: value.count + Number(created), revision: value.revision + 1, lastPair: id });
}
export async function releasePair(
  store: FriendStore,
  uid: string,
  otherUid: string,
  expectedEpoch?: number,
): Promise<boolean> {
  online();
  const ref = store.pairRef(uid, otherUid);
  return runTransaction(store.db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) return false;
    const current = parseFriendPair(snapshot.data());
    if (expectedEpoch !== undefined && current.epoch !== expectedEpoch) conflict();
    if (current.format === 2)
      tx.update(quotaRef(store.db, current.creatorUid, 'pairs'), {
        count: increment(-1),
        lastPair: ref.id,
      });
    tx.delete(ref);
    return true;
  });
}
export async function sendRequest(store: FriendStore, uid: string, otherUid: string): Promise<FriendPair> {
  const ref = store.pairRef(uid, otherUid);
  online();
  await store.graphReady(uid);
  const counted = await quotaSupported(quotaRef(store.db, uid, 'pairs'));
  const epoch = await store['withPairCapacity'](uid, () =>
    runTransaction(store.db, async (tx) => {
      online();
      const snap = await tx.get(ref);
      const current = snap.exists() ? parseFriendPair(snap.data()) : null;
      if (current?.state === 'accepted') conflict('You are already friends.');
      if (current?.state === 'pending')
        conflict(
          current.from === uid
            ? 'Your request is already waiting for a response.'
            : 'This person already sent you a request. Accept or decline that request instead.',
        );
      if (
        current?.state === 'declined' &&
        current.from === uid &&
        Date.now() < current.updatedAt + FRIEND_REQUEST_COOLDOWN_MS
      ) {
        throw new FriendStoreError('request-unavailable', requestUnavailable);
      }
      if (
        current?.state === 'cancelled' &&
        current.from === uid &&
        Date.now() < current.updatedAt + FRIEND_CANCEL_COOLDOWN_MS
      ) {
        throw new FriendStoreError('request-unavailable', recentlyCancelled);
      }
      const [a, b] = [uid, otherUid].sort();
      if (counted) await store['touchPairCount'](tx, uid, ref.id, current === null);
      tx.set(ref, {
        format: current?.format ?? (counted ? 2 : 1),
        ...(current?.format === 2
          ? { creatorUid: current.creatorUid }
          : !current && counted
            ? { creatorUid: uid }
            : {}),
        a,
        b,
        participants: [a, b],
        from: uid,
        state: 'pending',
        epoch: (current?.epoch ?? 0) + 1,
        inviteSlot: null,
        createdAt: snap.exists() ? snap.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return (current?.epoch ?? 0) + 1;
    }),
  );
  return store.afterCommit({ operation: 'send-request', uid, otherUid, epoch }, async () => {
    const result = await store.readCommitted(ref, parseFriendPair);
    if (!result) conflict();
    return result;
  });
}
export async function respond(
  store: FriendStore,
  uid: string,
  otherUid: string,
  action: 'accept' | 'decline' | 'cancel' | 'remove',
  expectedEpoch: number,
): Promise<FriendPair> {
  const ref = store.pairRef(uid, otherUid);
  online();
  await store.graphReady(uid);
  const counted = action === 'accept' && (await quotaSupported(quotaRef(store.db, uid, 'pairs')));
  await runTransaction(store.db, async (tx) => {
    online();
    const snap = await tx.get(ref);
    const current = snap.exists() ? parseFriendPair(snap.data()) : null;
    if (!current || current.epoch !== expectedEpoch) conflict();
    if (action === 'remove' ? current.state !== 'accepted' : current.state !== 'pending')
      conflict('That relationship no longer has this action available.');
    if ((action === 'accept' || action === 'decline') && current.from === uid)
      conflict('Only the recipient can respond to this request.');
    if (action === 'cancel' && current.from !== uid) conflict('Only the sender can cancel this request.');
    const state: FriendPairState =
      action === 'accept'
        ? 'accepted'
        : action === 'decline'
          ? 'declined'
          : action === 'cancel'
            ? 'cancelled'
            : 'removed';
    if (counted) await store['touchPairCount'](tx, uid, ref.id, false);
    tx.update(ref, { state, epoch: current.epoch + 1, inviteSlot: null, updatedAt: serverTimestamp() });
  });
  return store.afterCommit({ operation: 'respond', uid, otherUid, epoch: expectedEpoch + 1 }, async () => {
    const result = await store.readCommitted(ref, parseFriendPair);
    if (!result) conflict();
    return result;
  });
}
export async function block(store: FriendStore, uid: string, otherUid: string): Promise<void> {
  const pairRef = store.pairRef(uid, otherUid);
  online();
  await store.graphReady(uid);
  const ref = doc(store.db, 'friendBlocks', uid, 'items', otherUid);
  const quota = quotaRef(store.db, uid, 'blocks');
  const counted = await quotaSupported(quota);
  if (!(await getDocFromServer(ref)).exists())
    await requireVisibleCapacity<FriendCursor>('blocks', (cursor) => store.listBlocks(uid, cursor));
  await runTransaction(store.db, async (tx) => {
    online();
    const [pair, block, slots] = await Promise.all([
      tx.get(pairRef),
      tx.get(ref),
      counted ? readQuotaSlots(tx, quota, 'blocks') : Promise.resolve(null),
    ]);
    const current = pair.exists() ? parseFriendPair(pair.data()) : null;
    if (!block.exists()) {
      if (slots) occupyQuotaSlot(tx, quota, slots, otherUid, 'blocks');
      tx.set(ref, { createdAt: serverTimestamp() });
    }
    if (current && (current.state === 'pending' || current.state === 'accepted'))
      tx.update(pairRef, {
        state: 'removed',
        epoch: current.epoch + 1,
        inviteSlot: null,
        updatedAt: serverTimestamp(),
      });
  });
}
export async function unblock(store: FriendStore, uid: string, otherUid: string): Promise<void> {
  friendPairId(uid, otherUid);
  online();
  await store.graphReady(uid);
  await store['releaseBlock'](uid, otherUid);
}
export async function releaseBlock(
  store: FriendStore,
  uid: string,
  otherUid: string,
  quotaAvailable?: boolean,
): Promise<void> {
  const ref = doc(store.db, 'friendBlocks', uid, 'items', otherUid);
  const quota = quotaRef(store.db, uid, 'blocks');
  const counted = quotaAvailable ?? (await quotaSupported(quota));
  await runTransaction(store.db, async (tx) => {
    online();
    const [block, slots] = await Promise.all([
      tx.get(ref),
      counted ? readQuotaSlots(tx, quota, 'blocks') : Promise.resolve(null),
    ]);
    if (!block.exists()) return;
    tx.delete(ref);
    if (slots) releaseQuotaSlot(tx, quota, slots, otherUid);
  });
}
export async function listBlocks(
  store: FriendStore,
  uid: string,
  cursor?: FriendCursor,
): Promise<FriendPage<FriendBlock>> {
  const result = await getDocsFromServer(
    query(
      collection(store.db, 'friendBlocks', friendUid(uid), 'items'),
      orderBy(documentId()),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(20),
    ),
  );
  return page(result.docs, (row) => parseFriendBlock(row.id, row.data()));
}

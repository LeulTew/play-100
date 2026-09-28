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
  writeBatch,
} from 'firebase/firestore';
import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  Transaction,
} from 'firebase/firestore';
import type { AvatarValue, PublicEntry } from '../lib/community';
import {
  FRIEND_CHUNK_LIMIT,
  FriendCommittedError,
  FriendStoreError,
  friendPairId,
  friendUid,
  parseFriendBlock,
  parseFriendGeneration,
  parseFriendHead,
  parseFriendIdentity,
  parseFriendPair,
  parseFriendRegistry,
  parseFriendSettings,
  retainsFriendGeneration,
} from '../lib/friend-types';
import type {
  FriendBlock,
  FriendCleanupResult,
  FriendCursor,
  FriendExport,
  FriendGroup,
  FriendIdentity,
  FriendInvitation,
  FriendInvitePreview,
  FriendMutationReceipt,
  FriendPage,
  FriendPair,
  FriendPairState,
  FriendRanking,
  FriendSettings,
  FriendShareHead,
  FriendSourceRevision,
} from '../lib/friend-types';
import { ensureAccountActivity } from './account-lifecycle';
import { releaseIndexedPayload } from './generation-cleanup';
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
import type { SlotQuotaKind } from './account-quota';
import { activeSettings, conflict, errorValue, online, page } from './friend-store-core';
import { deleteGroup, getGroup, listGroups, saveGroup } from './friend-groups';
import { acceptInvite, createInvite, listInvites, previewInvite, revokeInvite } from './friend-invites';
import { initialize, publicIdentity, saveIdentity, saveSettings } from './friend-profile';
import { publishRanking, ranking } from './friend-ranking-share';

export const FRIEND_REQUEST_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
/** After cancelling, the sender waits this long before requesting again or releasing the pair (rules fPairAction). */
export const FRIEND_CANCEL_COOLDOWN_MS = 10 * 60 * 1000;
const requestUnavailable = "You can't send this person a request right now.";
const recentlyCancelled = 'You cancelled a request to this person a moment ago. Try again in a few minutes.';

const EXPORT_PAGE_LIMIT = 100;
// Pages one collection only until its own last page; a failed sibling stream stops further reads.
async function exportPages<T>(
  read: (cursor?: FriendCursor) => Promise<FriendPage<T>>,
  isCurrent: () => boolean,
  stopped: () => boolean,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: FriendCursor | undefined;
  for (let index = 0; index < EXPORT_PAGE_LIMIT; index += 1) {
    const next = await read(cursor);
    if (!isCurrent()) throw new Error('The account changed before export completed.');
    items.push(...next.items);
    if (!next.cursor || stopped()) return items;
    cursor = next.cursor;
  }
  throw new Error(
    'This account export is too large to download at once. Save a library backup in Settings before deleting anything.',
  );
}

// A method that delegates runs the function of the same name in its concern's friend-* module. That function calls
// other store methods through the store, as the method did, so a patched FriendStore.prototype method still
// intercepts those calls. The helpers such functions need are public for that reason; the private methods they need
// stay private and are called as store['name'](...).
export class FriendStore {
  constructor(readonly db: Firestore) {}
  ref(collectionName: string, uid: string): DocumentReference<DocumentData> {
    return doc(this.db, collectionName, friendUid(uid));
  }
  pairRef(uid: string, otherUid: string): DocumentReference<DocumentData> {
    return doc(this.db, 'friendPairs', friendPairId(uid, otherUid));
  }
  async read<T>(ref: DocumentReference<DocumentData>, parse: (data: DocumentData) => T): Promise<T | null> {
    const snap = await getDocFromServer(ref);
    return snap.exists() ? parse(snap.data()) : null;
  }
  async readCommitted<T>(ref: DocumentReference<DocumentData>, parse: (data: DocumentData) => T): Promise<T | null> {
    // Read transaction RPCs bypass stale RemoteStore listener snapshots after the mutation ACK.
    return runTransaction(
      this.db,
      async (tx) => {
        const snap = await tx.get(ref);
        return snap.exists() ? parse(snap.data()) : null;
      },
      { maxAttempts: 3 },
    );
  }
  async readInvite(ref: DocumentReference<DocumentData>): Promise<DocumentSnapshot<DocumentData>> {
    try {
      return await getDocFromServer(ref);
    } catch (cause) {
      if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
      // A reused listener can deny a current capability that a fresh transaction read authorizes.
      online();
      return runTransaction(this.db, (tx) => tx.get(ref), { maxAttempts: 1 });
    }
  }
  async graphReady(uid: string): Promise<void> {
    online();
    // Transaction RPCs bypass disableNetwork(); a server-only read checks the SDK's stream state before any graph write.
    const settings = await this.settings(uid);
    if (settings) activeSettings(settings);
    online();
  }
  async afterCommit<T>(
    receipt: FriendMutationReceipt,
    operation: () => Promise<T>,
    phase: 'refresh' | 'cleanup' = 'refresh',
  ): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      throw new FriendCommittedError(receipt, errorValue(cause), phase);
    }
  }
  private watch<T>(
    ref: DocumentReference<DocumentData>,
    parse: (data: DocumentData) => T,
    next: (value: T | null) => void,
    error: (cause: Error) => void,
  ): () => void {
    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
        try {
          next(snap.exists() ? parse(snap.data()) : null);
        } catch (cause) {
          error(errorValue(cause));
        }
      },
      error,
    );
  }
  initialize(uid: string): Promise<FriendSettings> {
    return initialize(this, uid);
  }
  settings(uid: string): Promise<FriendSettings | null> {
    return this.read(this.ref('friendSettings', uid), parseFriendSettings);
  }
  watchSettings(uid: string, next: (value: FriendSettings | null) => void, error: (cause: Error) => void): () => void {
    return this.watch(this.ref('friendSettings', uid), parseFriendSettings, next, error);
  }
  saveSettings(
    uid: string,
    input: { enabled: boolean; selectedIds: string[] },
    expected: FriendSettings,
  ): Promise<FriendSettings> {
    return saveSettings(this, uid, input, expected);
  }
  identity(uid: string): Promise<FriendIdentity | null> {
    return this.read(this.ref('friendIdentities', uid), (data) => {
      const identity = parseFriendIdentity(data);
      if (identity.uid !== uid)
        throw new FriendStoreError('invalid', 'This friend identity belongs to a different account.');
      return identity;
    });
  }
  publicIdentity(uid: string): Promise<FriendIdentity | null> {
    return publicIdentity(this, uid);
  }
  watchIdentity(uid: string, next: (value: FriendIdentity | null) => void, error: (cause: Error) => void): () => void {
    return this.watch(this.ref('friendIdentities', uid), parseFriendIdentity, next, error);
  }
  saveIdentity(
    uid: string,
    input: { displayName: string; avatar: AvatarValue },
    expectedRevision: number,
  ): Promise<FriendIdentity> {
    return saveIdentity(this, uid, input, expectedRevision);
  }
  pair(uid: string, otherUid: string): Promise<FriendPair | null> {
    return this.read(this.pairRef(uid, otherUid), parseFriendPair);
  }
  watchPair(
    uid: string,
    otherUid: string,
    next: (value: FriendPair | null) => void,
    error: (cause: Error) => void,
  ): () => void {
    return this.watch(this.pairRef(uid, otherUid), parseFriendPair, next, error);
  }
  private relationsQuery(uid: string, state?: FriendPairState, cursor?: FriendCursor): Query<DocumentData> {
    return query(
      collection(this.db, 'friendPairs'),
      where('participants', 'array-contains', friendUid(uid)),
      ...(state ? [where('state', '==', state)] : []),
      orderBy('updatedAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(20),
    );
  }
  async listRelations(uid: string, state?: FriendPairState, cursor?: FriendCursor): Promise<FriendPage<FriendPair>> {
    const result = await getDocsFromServer(this.relationsQuery(uid, state, cursor));
    return page(result.docs, (row) => parseFriendPair(row.data()));
  }
  watchRelations(
    uid: string,
    state: FriendPairState,
    next: (value: FriendPage<FriendPair>) => void,
    error: (cause: Error) => void,
  ): () => void {
    return onSnapshot(
      this.relationsQuery(uid, state),
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
  private async touchPairCount(tx: Transaction, uid: string, id: string, created: boolean) {
    const ref = quotaRef(this.db, uid, 'pairs');
    const snapshot = await tx.get(ref);
    const value = snapshot.exists() ? snapshot.data() : { count: 0, revision: 0 };
    if (
      !Number.isSafeInteger(value.count) ||
      value.count < 0 ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0
    ) {
      throw new FriendStoreError(
        'invalid',
        'Your connection count could not be read. Refresh the page, then try again.',
      );
    }
    if (created && value.count >= ACCOUNT_LIMITS.pairs) throw new AccountQuotaFull('pairs');
    tx.set(ref, { count: value.count + Number(created), revision: value.revision + 1, lastPair: id });
  }
  async releasePair(uid: string, otherUid: string, expectedEpoch?: number): Promise<boolean> {
    online();
    const ref = this.pairRef(uid, otherUid);
    return runTransaction(this.db, async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) return false;
      const current = parseFriendPair(snapshot.data());
      if (expectedEpoch !== undefined && current.epoch !== expectedEpoch) conflict();
      if (current.format === 2)
        tx.update(quotaRef(this.db, current.creatorUid, 'pairs'), {
          count: increment(-1),
          lastPair: ref.id,
        });
      tx.delete(ref);
      return true;
    });
  }
  private async freePairCapacity(uid: string): Promise<void> {
    let cursor: FriendCursor | undefined;
    for (let page = 0; page < Math.ceil(ACCOUNT_LIMITS.pairs / 20); page += 1) {
      const rows = await getDocsFromServer(
        query(
          collection(this.db, 'friendPairs'),
          where('participants', 'array-contains', uid),
          where('creatorUid', '==', uid),
          where('state', 'in', ['cancelled', 'removed', 'declined']),
          orderBy('updatedAt'),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(20),
        ),
      ).catch((cause) => {
        if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'failed-precondition') {
          throw new FriendStoreError('limit', 'Connection cleanup is not ready yet. Try again later.');
        }
        throw cause;
      });
      for (const row of rows.docs) {
        const pair = parseFriendPair(row.data());
        if (pair.state === 'declined' && Date.now() < pair.updatedAt + FRIEND_REQUEST_COOLDOWN_MS) continue;
        if (pair.state === 'cancelled' && pair.from === uid && Date.now() < pair.updatedAt + FRIEND_CANCEL_COOLDOWN_MS)
          continue;
        const peer = pair.a === uid ? pair.b : pair.a;
        if (await this.releasePair(uid, peer, pair.epoch)) return;
      }
      if (rows.size < 20) return;
      cursor = rows.docs.at(-1);
    }
  }
  private async withPairCapacity<T>(uid: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (!(cause instanceof AccountQuotaFull)) throw cause;
      await this.freePairCapacity(uid);
      return operation();
    }
  }
  async sendRequest(uid: string, otherUid: string): Promise<FriendPair> {
    const ref = this.pairRef(uid, otherUid);
    online();
    await this.graphReady(uid);
    const counted = await quotaSupported(quotaRef(this.db, uid, 'pairs'));
    const epoch = await this.withPairCapacity(uid, () =>
      runTransaction(this.db, async (tx) => {
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
        if (counted) await this.touchPairCount(tx, uid, ref.id, current === null);
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
    return this.afterCommit({ operation: 'send-request', uid, otherUid, epoch }, async () => {
      const result = await this.readCommitted(ref, parseFriendPair);
      if (!result) conflict();
      return result;
    });
  }
  async respond(
    uid: string,
    otherUid: string,
    action: 'accept' | 'decline' | 'cancel' | 'remove',
    expectedEpoch: number,
  ): Promise<FriendPair> {
    const ref = this.pairRef(uid, otherUid);
    online();
    await this.graphReady(uid);
    const counted = action === 'accept' && (await quotaSupported(quotaRef(this.db, uid, 'pairs')));
    await runTransaction(this.db, async (tx) => {
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
      if (counted) await this.touchPairCount(tx, uid, ref.id, false);
      tx.update(ref, { state, epoch: current.epoch + 1, inviteSlot: null, updatedAt: serverTimestamp() });
    });
    return this.afterCommit({ operation: 'respond', uid, otherUid, epoch: expectedEpoch + 1 }, async () => {
      const result = await this.readCommitted(ref, parseFriendPair);
      if (!result) conflict();
      return result;
    });
  }
  async block(uid: string, otherUid: string): Promise<void> {
    const pairRef = this.pairRef(uid, otherUid);
    online();
    await this.graphReady(uid);
    const ref = doc(this.db, 'friendBlocks', uid, 'items', otherUid);
    const quota = quotaRef(this.db, uid, 'blocks');
    const counted = await quotaSupported(quota);
    if (!(await getDocFromServer(ref)).exists())
      await requireVisibleCapacity<FriendCursor>('blocks', (cursor) => this.listBlocks(uid, cursor));
    await runTransaction(this.db, async (tx) => {
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
  async unblock(uid: string, otherUid: string): Promise<void> {
    friendPairId(uid, otherUid);
    online();
    await this.graphReady(uid);
    await this.releaseBlock(uid, otherUid);
  }
  private async releaseBlock(uid: string, otherUid: string, quotaAvailable?: boolean): Promise<void> {
    const ref = doc(this.db, 'friendBlocks', uid, 'items', otherUid);
    const quota = quotaRef(this.db, uid, 'blocks');
    const counted = quotaAvailable ?? (await quotaSupported(quota));
    await runTransaction(this.db, async (tx) => {
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
  async listBlocks(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendBlock>> {
    const result = await getDocsFromServer(
      query(
        collection(this.db, 'friendBlocks', friendUid(uid), 'items'),
        orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(20),
      ),
    );
    return page(result.docs, (row) => parseFriendBlock(row.id, row.data()));
  }
  createInvite(uid: string): Promise<FriendInvitation> {
    return createInvite(this, uid);
  }
  previewInvite(tokenInput: string): Promise<FriendInvitePreview> {
    return previewInvite(this, tokenInput);
  }
  listInvites(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendInvitation>> {
    return listInvites(this, uid, cursor);
  }
  revokeInvite(uid: string, tokenInput: string): Promise<void> {
    return revokeInvite(this, uid, tokenInput);
  }
  acceptInvite(uid: string, tokenInput: string): Promise<FriendPair> {
    return acceptInvite(this, uid, tokenInput);
  }
  shareHead(ownerUid: string): Promise<FriendShareHead | null> {
    return this.read(this.ref('friendShareHeads', ownerUid), parseFriendHead);
  }
  watchShareHead(
    uid: string,
    next: (value: FriendShareHead | null) => void,
    error: (cause: Error) => void,
  ): () => void {
    return this.watch(this.ref('friendShareHeads', uid), parseFriendHead, next, error);
  }
  ranking(ownerUid: string): Promise<FriendRanking> {
    return ranking(this, ownerUid);
  }
  publishRanking(
    uid: string,
    input: PublicEntry[],
    expected: FriendSettings,
    sourceInput: FriendSourceRevision,
    expectedHeadRevision: number,
    isCurrent?: () => boolean,
  ): Promise<{ changed: boolean; head: FriendShareHead }> {
    return publishRanking(this, uid, input, expected, sourceInput, expectedHeadRevision, isCurrent);
  }
  getGroup(uid: string, id: string): Promise<FriendGroup | null> {
    return getGroup(this, uid, id);
  }
  listGroups(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendGroup>> {
    return listGroups(this, uid, cursor);
  }
  saveGroup(
    uid: string,
    input: { id?: string; name: string; participantUids: string[] },
    expectedRevision: number,
  ): Promise<FriendGroup> {
    return saveGroup(this, uid, input, expectedRevision);
  }
  deleteGroup(uid: string, id: string, expectedRevision: number, quotaAvailable?: boolean): Promise<void> {
    return deleteGroup(this, uid, id, expectedRevision, quotaAvailable);
  }
  /** Reads identity and settings once, then pages each collection only until its own last page. */
  async exportAll(uid: string, isCurrent: () => boolean): Promise<FriendExport> {
    let failed = false;
    const settle = <T>(work: Promise<T>) =>
      work.catch((cause: unknown) => {
        failed = true;
        throw cause;
      });
    const stopped = () => failed;
    const [identity, settings, relations, groups, blocks] = await Promise.all([
      settle(this.identity(uid)),
      settle(this.settings(uid)),
      settle(exportPages((cursor) => this.listRelations(uid, undefined, cursor), isCurrent, stopped)),
      settle(exportPages((cursor) => this.listGroups(uid, cursor), isCurrent, stopped)),
      settle(exportPages((cursor) => this.listBlocks(uid, cursor), isCurrent, stopped)),
    ]);
    return { identity, settings, relations, groups, blocks };
  }
  async revokeForDeletion(uid: string): Promise<void> {
    friendUid(uid);
    online();
    await ensureAccountActivity(this.db, uid);
    const ref = this.ref('friendSettings', uid);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists() ? parseFriendSettings(snap.data()) : null;
      if (current?.deleted) return;
      tx.set(ref, {
        format: 1,
        enabled: false,
        deleted: true,
        selection: '',
        epoch: (current?.epoch ?? 0) + 1,
        revision: (current?.revision ?? 0) + 1,
        updatedAt: serverTimestamp(),
      });
    });
  }
  async cleanupSharing(uid: string): Promise<number> {
    return this.cleanupGenerations(uid, false);
  }
  async pruneSharing(uid: string): Promise<number> {
    return this.cleanupGenerations(uid, true);
  }
  private async cleanupGenerations(uid: string, preserveHead: boolean): Promise<number> {
    const registryRef = this.ref('friendShareRegistry', uid);
    const registry = await getDocFromServer(registryRef);
    if (!registry.exists()) return 0;
    const ids = parseFriendRegistry(registry.data());
    let deleted = 0;
    for (const id of ids) {
      const ref = doc(this.db, 'friendShares', uid, 'generations', id);
      const removable = await runTransaction(this.db, async (tx) => {
        const [generation, head, settings] = await Promise.all([
          tx.get(ref),
          tx.get(this.ref('friendShareHeads', uid)),
          tx.get(this.ref('friendSettings', uid)),
        ]);
        if (!generation.exists())
          throw new FriendStoreError('invalid', 'Some shared copies could not be checked. Try again later.');
        const gen = parseFriendGeneration(generation.data());
        const control = settings.exists() ? parseFriendSettings(settings.data()) : null;
        const pointer = head.exists() ? parseFriendHead(head.data()) : null;
        if (retainsFriendGeneration(id, pointer, control, preserveHead)) return false;
        if (
          control?.enabled &&
          !control.deleted &&
          gen.epoch === control.epoch &&
          gen.settingsRevision === control.revision &&
          gen.status !== 'deleting' &&
          gen.status !== 'published' &&
          gen.createdAt + 300000 > Date.now()
        )
          return false;
        if (gen.status !== 'deleting') tx.update(ref, { status: 'deleting' });
        return true;
      });
      if (!removable) continue;
      await releaseIndexedPayload(ref, 'chunks', 0, FRIEND_CHUNK_LIMIT);
      await runTransaction(this.db, async (tx) => {
        const current = await tx.get(registryRef);
        if (!current.exists())
          throw new FriendStoreError(
            'invalid',
            'Sharing settings changed during cleanup. Refresh the page, then try again.',
          );
        const currentIds = parseFriendRegistry(current.data());
        if (!currentIds.includes(id)) conflict();
        tx.delete(ref);
        tx.update(registryRef, {
          ids: currentIds.filter((value) => value !== id),
          revision: current.data().revision + 1,
        });
      });
      deleted += 1;
    }
    return deleted;
  }
  private async releaseMissingQuotaIds(uid: string, kind: SlotQuotaKind): Promise<'empty' | 'more' | 'blocked'> {
    const quota = quotaRef(this.db, uid, kind);
    const snapshot = await getDocFromServer(quota);
    if (!snapshot.exists()) return 'empty';
    const ids: unknown = snapshot.data().ids;
    if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) {
      throw new FriendStoreError('invalid', 'Account settings could not be read. Try again later.');
    }
    for (const id of ids.slice(0, 20)) {
      const released = await runTransaction(this.db, async (tx) => {
        const itemRef = doc(this.db, kind === 'groups' ? 'friendGroups' : 'friendBlocks', uid, 'items', id);
        const [slots, item] = await Promise.all([readQuotaSlots(tx, quota, kind), tx.get(itemRef)]);
        if (!slots.ids.includes(id)) return true;
        if (item.exists()) return false;
        releaseQuotaSlot(tx, quota, slots, id);
        return true;
      });
      if (!released) return 'blocked';
    }
    const remaining = await getDocFromServer(quota);
    if (!remaining.exists()) return 'empty';
    if (!Array.isArray(remaining.data().ids))
      throw new FriendStoreError('invalid', 'Account settings could not be read. Try again later.');
    return remaining.data().ids.length ? 'more' : 'empty';
  }
  async cleanupDeleted(uid: string): Promise<FriendCleanupResult> {
    const settings = await this.settings(uid);
    if (!settings?.deleted)
      throw new FriendStoreError('conflict', 'Account deletion is not ready. Refresh the page, then confirm deletion.');
    online();
    let deleted = await this.cleanupSharing(uid);
    const groupQuota = quotaRef(this.db, uid, 'groups');
    const blockQuota = quotaRef(this.db, uid, 'blocks');
    const pairQuota = quotaRef(this.db, uid, 'pairs');
    const [groupsCounted, blocksCounted, pairsCounted] = await Promise.all([
      quotaSupported(groupQuota),
      quotaSupported(blockQuota),
      quotaSupported(pairQuota),
    ]);
    const [relations, groups, blocks, invites] = await Promise.all([
      getDocsFromServer(this.relationsQuery(uid)),
      this.listGroups(uid),
      this.listBlocks(uid),
      getDocsFromServer(
        query(collection(this.db, 'friendInvites'), where('ownerUid', '==', uid), orderBy(documentId()), limit(20)),
      ),
    ]);
    for (const item of relations.docs) {
      const pair = parseFriendPair(item.data());
      await this.releasePair(uid, pair.a === uid ? pair.b : pair.a, pair.epoch);
      deleted += 1;
    }
    for (const group of groups.items) {
      await this.deleteGroup(uid, group.id, group.revision, groupsCounted);
      deleted += 1;
    }
    for (const block of blocks.items) {
      await this.releaseBlock(uid, block.uid, blocksCounted);
      deleted += 1;
    }
    let inviteCount = invites.size;
    if (invites.size) {
      const batch = writeBatch(this.db);
      invites.docs.forEach((invite) => batch.delete(invite.ref));
      try {
        await batch.commit();
        deleted += invites.size;
      } catch (cause) {
        if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied')
          throw cause;
        console.info('Invitation deletion is not available yet; this cleanup uses the previous link-closing path.');
        const legacy = await this.listInvites(uid);
        const close = writeBatch(this.db);
        legacy.items.forEach((invite) =>
          close.set(doc(this.db, 'friendInvites', invite.token), { ownerUid: uid, state: 'closed' }),
        );
        await close.commit();
        inviteCount = legacy.items.length;
        deleted += inviteCount;
      }
    }
    if (inviteCount === 20) return { deleted, done: false };
    for (let start = 0; start < 20; start += 10) {
      const slots = writeBatch(this.db);
      for (let slot = start; slot < start + 10; slot += 1)
        slots.delete(doc(this.db, 'friendInviteSlots', uid, 'slots', String(slot)));
      await slots.commit();
    }
    const batch = writeBatch(this.db);
    batch.delete(this.ref('friendIdentities', uid));
    batch.delete(this.ref('friendShareHeads', uid));
    batch.delete(this.ref('friendShareRegistry', uid));
    await batch.commit();
    if (relations.size < 20 && groups.items.length < 20 && blocks.items.length < 20) {
      try {
        let more = false;
        for (const [kind, counted] of [
          ['groups', groupsCounted],
          ['blocks', blocksCounted],
        ] as const) {
          if (!counted) continue;
          const result = await this.releaseMissingQuotaIds(uid, kind);
          if (result === 'blocked')
            return {
              deleted,
              done: false,
              message: 'Some account settings remain. Choose Delete account to continue.',
            };
          more ||= result === 'more';
        }
        if (more) return { deleted, done: false };
        const quotas = writeBatch(this.db);
        quotas.delete(groupQuota);
        quotas.delete(blockQuota);
        quotas.delete(pairQuota);
        await quotas.commit();
        const remaining = await Promise.all([
          getDocFromServer(groupQuota),
          getDocFromServer(blockQuota),
          getDocFromServer(pairQuota),
        ]);
        if (remaining.some((value) => value.exists()))
          return { deleted, done: false, message: 'Some account settings remain. Choose Delete account to continue.' };
      } catch (cause) {
        if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied')
          throw cause;
        if (groupsCounted || blocksCounted || pairsCounted)
          return { deleted, done: false, message: 'Some account settings remain. Choose Delete account to continue.' };
        console.info('Account count controls are unavailable; this cleanup uses the previous rules path.');
      }
    }
    return {
      deleted,
      done: relations.size < 20 && groups.items.length < 20 && blocks.items.length < 20 && inviteCount < 20,
    };
  }
}

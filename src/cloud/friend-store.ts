import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
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
  quotaRef,
  quotaSupported,
  readQuotaSlots,
  releaseQuotaSlot,
} from './account-quota';
import type { SlotQuotaKind } from './account-quota';
import { activeSettings, conflict, errorValue, online } from './friend-store-core';
import { deleteGroup, getGroup, listGroups, saveGroup } from './friend-groups';
import { acceptInvite, createInvite, listInvites, previewInvite, revokeInvite } from './friend-invites';
import {
  FRIEND_CANCEL_COOLDOWN_MS,
  FRIEND_REQUEST_COOLDOWN_MS,
  block,
  listBlocks,
  listRelations,
  relationsQuery,
  releaseBlock,
  releasePair,
  respond,
  sendRequest,
  touchPairCount,
  unblock,
  watchRelations,
} from './friend-pairs';
import { initialize, publicIdentity, saveIdentity, saveSettings } from './friend-profile';
import { publishRanking, ranking } from './friend-ranking-share';

export { FRIEND_CANCEL_COOLDOWN_MS, FRIEND_REQUEST_COOLDOWN_MS } from './friend-pairs';

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
    return relationsQuery(this, uid, state, cursor);
  }
  listRelations(uid: string, state?: FriendPairState, cursor?: FriendCursor): Promise<FriendPage<FriendPair>> {
    return listRelations(this, uid, state, cursor);
  }
  watchRelations(
    uid: string,
    state: FriendPairState,
    next: (value: FriendPage<FriendPair>) => void,
    error: (cause: Error) => void,
  ): () => void {
    return watchRelations(this, uid, state, next, error);
  }
  private touchPairCount(tx: Transaction, uid: string, id: string, created: boolean) {
    return touchPairCount(this, tx, uid, id, created);
  }
  releasePair(uid: string, otherUid: string, expectedEpoch?: number): Promise<boolean> {
    return releasePair(this, uid, otherUid, expectedEpoch);
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
  sendRequest(uid: string, otherUid: string): Promise<FriendPair> {
    return sendRequest(this, uid, otherUid);
  }
  respond(
    uid: string,
    otherUid: string,
    action: 'accept' | 'decline' | 'cancel' | 'remove',
    expectedEpoch: number,
  ): Promise<FriendPair> {
    return respond(this, uid, otherUid, action, expectedEpoch);
  }
  block(uid: string, otherUid: string): Promise<void> {
    return block(this, uid, otherUid);
  }
  unblock(uid: string, otherUid: string): Promise<void> {
    return unblock(this, uid, otherUid);
  }
  private releaseBlock(uid: string, otherUid: string, quotaAvailable?: boolean): Promise<void> {
    return releaseBlock(this, uid, otherUid, quotaAvailable);
  }
  listBlocks(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendBlock>> {
    return listBlocks(this, uid, cursor);
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

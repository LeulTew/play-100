import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  startAfter,
  where,
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
  FriendCommittedError,
  FriendStoreError,
  friendPairId,
  friendUid,
  parseFriendHead,
  parseFriendIdentity,
  parseFriendPair,
  parseFriendSettings,
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
import { ACCOUNT_LIMITS, AccountQuotaFull } from './account-quota';
import type { SlotQuotaKind } from './account-quota';
import { activeSettings, errorValue, online } from './friend-store-core';
import {
  cleanupDeleted,
  cleanupGenerations,
  exportAll,
  releaseMissingQuotaIds,
  revokeForDeletion,
} from './friend-cleanup';
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

// A method that delegates runs the function of the same name in its concern's friend-* module. That function calls
// other store methods through the store, as the method did, so a patched FriendStore.prototype method still
// intercepts those calls. The helpers and internal steps those functions call are public for that reason, though only
// those modules and the store itself call them.
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
  relationsQuery(uid: string, state?: FriendPairState, cursor?: FriendCursor): Query<DocumentData> {
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
  touchPairCount(tx: Transaction, uid: string, id: string, created: boolean) {
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
  async withPairCapacity<T>(uid: string, operation: () => Promise<T>): Promise<T> {
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
  releaseBlock(uid: string, otherUid: string, quotaAvailable?: boolean): Promise<void> {
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
  exportAll(uid: string, isCurrent: () => boolean): Promise<FriendExport> {
    return exportAll(this, uid, isCurrent);
  }
  revokeForDeletion(uid: string): Promise<void> {
    return revokeForDeletion(this, uid);
  }
  async cleanupSharing(uid: string): Promise<number> {
    return this.cleanupGenerations(uid, false);
  }
  async pruneSharing(uid: string): Promise<number> {
    return this.cleanupGenerations(uid, true);
  }
  private cleanupGenerations(uid: string, preserveHead: boolean): Promise<number> {
    return cleanupGenerations(this, uid, preserveHead);
  }
  releaseMissingQuotaIds(uid: string, kind: SlotQuotaKind): Promise<'empty' | 'more' | 'blocked'> {
    return releaseMissingQuotaIds(this, uid, kind);
  }
  cleanupDeleted(uid: string): Promise<FriendCleanupResult> {
    return cleanupDeleted(this, uid);
  }
}

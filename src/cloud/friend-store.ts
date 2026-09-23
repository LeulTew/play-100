import {
  collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, onSnapshot, orderBy,
  query, runTransaction, serverTimestamp, startAfter, where, writeBatch,
} from 'firebase/firestore';
import type { DocumentData, DocumentReference, DocumentSnapshot, Firestore, Query, QueryDocumentSnapshot } from 'firebase/firestore';
import { parseAvatar } from '../lib/community';
import type { AvatarValue, PublicEntry } from '../lib/community';
import {
  FRIEND_CHUNK_LIMIT, FRIEND_CHUNK_SIZE, FriendCommittedError, FriendStoreError, friendName, friendPairId, friendParticipants, friendSelection,
  friendToken, friendUid, friendUuid, parseFriendBlock, parseFriendChunk, parseFriendGeneration, parseFriendGroup,
  parseFriendHead, parseFriendIdentity, parseFriendInvite, parseFriendPair, parseFriendRegistry, parseFriendSettings,
  parseFriendSlot, parseFriendSource, retainsFriendGeneration, validateFriendEntries,
} from '../lib/friend-types';
import type {
  FriendBlock, FriendCleanupResult, FriendCursor, FriendExportPage, FriendGroup, FriendIdentity, FriendInvitation,
  FriendInvitePreview, FriendMutationReceipt, FriendPage, FriendPair, FriendPairState, FriendRanking, FriendSettings, FriendShareHead, FriendSourceRevision,
} from '../lib/friend-types';
import { ensureAccountActivity } from './account-lifecycle';
import { parseHead } from './cloud-store';
import { SocialStore } from './social-store';
import { releaseIndexedPayload } from './generation-cleanup';
import { occupyQuotaSlot, quotaRef, quotaSupported, readQuotaSlots, releaseQuotaSlot, requireVisibleCapacity } from './account-quota';

export const FRIEND_REQUEST_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const requestUnavailable = "You can't send this person a request right now.";

function conflict(message = 'This changed elsewhere. Reload before trying again.'): never { throw new FriendStoreError('conflict', message); }
function online(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new FriendStoreError('offline', 'Reconnect before changing friendships or sharing.');
}
function activeSettings(value: FriendSettings | null): FriendSettings {
  if (!value) throw new FriendStoreError('unavailable', 'Open Friends to prepare your friend profile first.');
  if (value.deleted) throw new FriendStoreError('deleted', 'This account is being deleted. Friendship changes are disabled.');
  return value;
}
function expectedSettings(current: FriendSettings, expected: FriendSettings): void {
  activeSettings(current);
  if (current.epoch !== expected.epoch || current.revision !== expected.revision) conflict('Sharing settings changed. Reload the selection before publishing.');
}
function page<T>(rows: QueryDocumentSnapshot<DocumentData>[], parse: (row: QueryDocumentSnapshot<DocumentData>) => T): FriendPage<T> {
  return { items: rows.map(parse), cursor: rows.length === 20 ? rows.at(-1) : undefined };
}
function errorValue(cause: unknown): Error { return cause instanceof Error ? cause : new Error('Friend data could not be read. Try again.'); }
function unavailableInvite(cause: unknown): never {
  if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied') {
    throw new FriendStoreError('invite-unavailable', 'This invite is no longer available.');
  }
  throw cause;
}
async function contentDigest(entries: PublicEntry[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class FriendStore {
  constructor(readonly db: Firestore) {}
  private ref(collectionName: string, uid: string): DocumentReference<DocumentData> { return doc(this.db, collectionName, friendUid(uid)); }
  private pairRef(uid: string, otherUid: string): DocumentReference<DocumentData> { return doc(this.db, 'friendPairs', friendPairId(uid, otherUid)); }
  private async read<T>(ref: DocumentReference<DocumentData>, parse: (data: DocumentData) => T): Promise<T | null> {
    const snap = await getDocFromServer(ref);
    return snap.exists() ? parse(snap.data()) : null;
  }
  private async readCommitted<T>(ref: DocumentReference<DocumentData>, parse: (data: DocumentData) => T): Promise<T | null> {
    // Read transaction RPCs bypass stale RemoteStore listener snapshots after the mutation ACK.
    return runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      return snap.exists() ? parse(snap.data()) : null;
    }, { maxAttempts: 3 });
  }
  private async graphReady(uid: string): Promise<void> {
    online();
    // Transaction RPCs bypass disableNetwork(); a server-only read checks the SDK's stream state before any graph write.
    const settings = await this.settings(uid);
    if (settings) activeSettings(settings);
    online();
  }
  private async afterCommit<T>(receipt: FriendMutationReceipt, operation: () => Promise<T>, phase: 'refresh' | 'cleanup' = 'refresh'): Promise<T> {
    try { return await operation(); }
    catch (cause) { throw new FriendCommittedError(receipt, errorValue(cause), phase); }
  }
  private watch<T>(ref: DocumentReference<DocumentData>, parse: (data: DocumentData) => T, next: (value: T | null) => void, error: (cause: Error) => void): () => void {
    return onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
      try { next(snap.exists() ? parse(snap.data()) : null); } catch (cause) { error(errorValue(cause)); }
    }, error);
  }
  async initialize(uid: string): Promise<FriendSettings> {
    friendUid(uid); online();
    await ensureAccountActivity(this.db, uid);
    const ref = this.ref('friendSettings', uid);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) { activeSettings(parseFriendSettings(snap.data())); return; }
      tx.set(ref, { format: 1, enabled: false, deleted: false, selection: '', epoch: 1, revision: 1, updatedAt: serverTimestamp() });
    });
    return this.afterCommit({ operation: 'initialize', uid }, async () => activeSettings(await this.readCommitted(ref, parseFriendSettings)));
  }
  settings(uid: string): Promise<FriendSettings | null> { return this.read(this.ref('friendSettings', uid), parseFriendSettings); }
  watchSettings(uid: string, next: (value: FriendSettings | null) => void, error: (cause: Error) => void): () => void {
    return this.watch(this.ref('friendSettings', uid), parseFriendSettings, next, error);
  }
  async saveSettings(uid: string, input: { enabled: boolean; selectedIds: string[] }, expected: FriendSettings): Promise<FriendSettings> {
    const selectedIds = friendSelection(input.selectedIds);
    if (typeof input.enabled !== 'boolean') throw new FriendStoreError('invalid', 'Choose whether friends-only sharing is enabled.');
    online();
    const ref = this.ref('friendSettings', uid);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      const current = activeSettings(snap.exists() ? parseFriendSettings(snap.data()) : null);
      expectedSettings(current, expected);
      if (current.enabled === input.enabled && current.selectedIds.join('|') === selectedIds.join('|')) return;
      tx.update(ref, { enabled: input.enabled, selection: selectedIds.join('|'), epoch: current.epoch + 1, revision: current.revision + 1, updatedAt: serverTimestamp() });
    });
    return this.afterCommit({ operation: 'save-settings', uid }, async () => activeSettings(await this.readCommitted(ref, parseFriendSettings)));
  }
  identity(uid: string): Promise<FriendIdentity | null> {
    return this.read(this.ref('friendIdentities', uid), (data) => {
      const identity = parseFriendIdentity(data);
      if (identity.uid !== uid) throw new FriendStoreError('invalid', 'This friend identity belongs to a different account.');
      return identity;
    });
  }
  async publicIdentity(uid: string): Promise<FriendIdentity | null> {
    friendUid(uid);
    try {
      const profile = await new SocialStore(this.db).ownProfile(uid);
      return profile?.published && !profile.hidden
        ? { format: 1, uid, displayName: profile.displayName, avatar: profile.avatar, revision: 1, updatedAt: profile.updatedAt }
        : null;
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied') return null;
      throw cause;
    }
  }
  watchIdentity(uid: string, next: (value: FriendIdentity | null) => void, error: (cause: Error) => void): () => void {
    return this.watch(this.ref('friendIdentities', uid), parseFriendIdentity, next, error);
  }
  async saveIdentity(uid: string, input: { displayName: string; avatar: AvatarValue }, expectedRevision: number): Promise<FriendIdentity> {
    const displayName = friendName(input.displayName); const avatar = parseAvatar(input.avatar); online();
    const ref = this.ref('friendIdentities', uid);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists() ? parseFriendIdentity(snap.data()) : null;
      if ((current?.revision ?? 0) !== expectedRevision) conflict('Your friend profile changed. Reload before saving its name or icon.');
      if (current && current.displayName === displayName && JSON.stringify(current.avatar) === JSON.stringify(avatar)) return;
      tx.set(ref, { format: 1, uid, displayName, avatar, revision: expectedRevision + 1, updatedAt: serverTimestamp() });
    });
    return this.afterCommit({ operation: 'save-identity', uid }, async () => {
      const result = await this.readCommitted(ref, parseFriendIdentity);
      if (!result || result.uid !== uid) conflict();
      return result;
    });
  }
  pair(uid: string, otherUid: string): Promise<FriendPair | null> { return this.read(this.pairRef(uid, otherUid), parseFriendPair); }
  watchPair(uid: string, otherUid: string, next: (value: FriendPair | null) => void, error: (cause: Error) => void): () => void {
    return this.watch(this.pairRef(uid, otherUid), parseFriendPair, next, error);
  }
  private relationsQuery(uid: string, state?: FriendPairState, cursor?: FriendCursor): Query<DocumentData> {
    return query(collection(this.db, 'friendPairs'), where('participants', 'array-contains', friendUid(uid)),
      ...(state ? [where('state', '==', state)] : []), orderBy('updatedAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(20));
  }
  async listRelations(uid: string, state?: FriendPairState, cursor?: FriendCursor): Promise<FriendPage<FriendPair>> {
    const result = await getDocsFromServer(this.relationsQuery(uid, state, cursor));
    return page(result.docs, (row) => parseFriendPair(row.data()));
  }
  watchRelations(uid: string, state: FriendPairState, next: (value: FriendPage<FriendPair>) => void, error: (cause: Error) => void): () => void {
    return onSnapshot(this.relationsQuery(uid, state), { includeMetadataChanges: true }, (result) => {
      if (result.metadata.fromCache || result.metadata.hasPendingWrites) return;
      try { next(page(result.docs, (row) => parseFriendPair(row.data()))); } catch (cause) { error(errorValue(cause)); }
    }, error);
  }
  async sendRequest(uid: string, otherUid: string): Promise<FriendPair> {
    const ref = this.pairRef(uid, otherUid); online();
    await this.graphReady(uid);
    const epoch = await runTransaction(this.db, async (tx) => {
      online();
      const snap = await tx.get(ref); const current = snap.exists() ? parseFriendPair(snap.data()) : null;
      if (current?.state === 'accepted') conflict('You are already friends.');
      if (current?.state === 'pending') conflict(current.from === uid ? 'Your request is already waiting for a response.' : 'This person already sent you a request. Accept or decline that request instead.');
      if (current?.state === 'declined' && current.from === uid && Date.now() < current.updatedAt + FRIEND_REQUEST_COOLDOWN_MS) {
        throw new FriendStoreError('request-unavailable', requestUnavailable);
      }
      const [a, b] = [uid, otherUid].sort();
      tx.set(ref, {
        format: 1, a, b, participants: [a, b], from: uid, state: 'pending', epoch: (current?.epoch ?? 0) + 1, inviteSlot: null,
        createdAt: snap.exists() ? snap.data().createdAt : serverTimestamp(), updatedAt: serverTimestamp(),
      });
      return (current?.epoch ?? 0) + 1;
    });
    return this.afterCommit({ operation: 'send-request', uid, otherUid, epoch }, async () => {
      const result = await this.readCommitted(ref, parseFriendPair); if (!result) conflict(); return result;
    });
  }
  async respond(uid: string, otherUid: string, action: 'accept' | 'decline' | 'cancel' | 'remove', expectedEpoch: number): Promise<FriendPair> {
    const ref = this.pairRef(uid, otherUid); online();
    await this.graphReady(uid);
    await runTransaction(this.db, async (tx) => {
      online();
      const snap = await tx.get(ref); const current = snap.exists() ? parseFriendPair(snap.data()) : null;
      if (!current || current.epoch !== expectedEpoch) conflict();
      if (action === 'remove' ? current.state !== 'accepted' : current.state !== 'pending') conflict('That relationship no longer has this action available.');
      if ((action === 'accept' || action === 'decline') && current.from === uid) conflict('Only the recipient can respond to this request.');
      if (action === 'cancel' && current.from !== uid) conflict('Only the sender can cancel this request.');
      const state: FriendPairState = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : action === 'cancel' ? 'cancelled' : 'removed';
      tx.update(ref, { state, epoch: current.epoch + 1, inviteSlot: null, updatedAt: serverTimestamp() });
    });
    return this.afterCommit({ operation: 'respond', uid, otherUid, epoch: expectedEpoch + 1 }, async () => {
      const result = await this.readCommitted(ref, parseFriendPair); if (!result) conflict(); return result;
    });
  }
  async block(uid: string, otherUid: string): Promise<void> {
    const pairRef = this.pairRef(uid, otherUid); online();
    await this.graphReady(uid);
    const ref = doc(this.db, 'friendBlocks', uid, 'items', otherUid);
    const quota = quotaRef(this.db, uid, 'blocks');
    const counted = await quotaSupported(quota);
    if (!(await getDocFromServer(ref)).exists()) await requireVisibleCapacity<FriendCursor>('blocks', cursor => this.listBlocks(uid, cursor));
    await runTransaction(this.db, async (tx) => {
      online();
      const [pair, block, slots] = await Promise.all([tx.get(pairRef), tx.get(ref), counted ? readQuotaSlots(tx, quota, 'blocks') : Promise.resolve(null)]);
      const current = pair.exists() ? parseFriendPair(pair.data()) : null;
      if (!block.exists()) {
        if (slots) occupyQuotaSlot(tx, quota, slots, otherUid, 'blocks');
        tx.set(ref, { createdAt: serverTimestamp() });
      }
      if (current && (current.state === 'pending' || current.state === 'accepted')) tx.update(pairRef, { state: 'removed', epoch: current.epoch + 1, inviteSlot: null, updatedAt: serverTimestamp() });
    });
  }
  async unblock(uid: string, otherUid: string): Promise<void> {
    friendPairId(uid, otherUid); online();
    await this.graphReady(uid);
    await this.releaseBlock(uid, otherUid);
  }
  private async releaseBlock(uid: string, otherUid: string, quotaAvailable?: boolean): Promise<void> {
    const ref = doc(this.db, 'friendBlocks', uid, 'items', otherUid);
    const quota = quotaRef(this.db, uid, 'blocks');
    const counted = quotaAvailable ?? await quotaSupported(quota);
    await runTransaction(this.db, async tx => {
      online();
      const [block, slots] = await Promise.all([tx.get(ref), counted ? readQuotaSlots(tx, quota, 'blocks') : Promise.resolve(null)]);
      if (!block.exists()) return;
      tx.delete(ref);
      if (slots) releaseQuotaSlot(tx, quota, slots, otherUid);
    });
  }
  async listBlocks(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendBlock>> {
    const result = await getDocsFromServer(query(collection(this.db, 'friendBlocks', friendUid(uid), 'items'), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(20)));
    return page(result.docs, (row) => parseFriendBlock(row.id, row.data()));
  }
  async createInvite(uid: string): Promise<FriendInvitation> {
    friendUid(uid); online();
    await this.graphReady(uid);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const ref = doc(this.db, 'friendInvites', token);
    let retiring = false;
    const create = (legacy: boolean) => runTransaction(this.db, async (tx) => {
      online();
      const slotRefs = Array.from({ length: 20 }, (_, slot) => doc(this.db, 'friendInviteSlots', uid, 'slots', String(slot)));
      const [identity, ...slots] = await Promise.all([tx.get(this.ref('friendIdentities', uid)), ...slotRefs.map((slot) => tx.get(slot))]);
      if (!identity.exists()) throw new FriendStoreError('unavailable', 'Save your friend-facing name and icon before creating a link.');
      const chosen = parseFriendIdentity(identity.data());
      const tokens = slots.map((slot) => slot.exists() ? parseFriendSlot(slot.data()) : null);
      let index = tokens.indexOf(null);
      let prior: DocumentSnapshot<DocumentData> | null = null;
      if (index < 0) {
        const occupied = await Promise.all(tokens.map((token) => tx.get(doc(this.db, 'friendInvites', token!))));
        index = occupied.findIndex((invite, slot) => {
          if (!invite.exists()) return true;
          if (invite.data().state === 'closed') return true;
          const value = parseFriendInvite(tokens[slot]!, invite.data());
          return value.state !== 'active' || value.expiresAt <= Date.now();
        });
        prior = occupied[index] ?? null;
      }
      if (index < 0) throw new FriendStoreError('limit', 'You already have 20 active invitation links. Revoke one before creating another.');
      const slotRef = slotRefs[index];
      if (!slotRef) throw new FriendStoreError('invalid', 'The invitation slot is invalid.');
      retiring = Boolean(prior?.exists());
      if (prior?.exists()) {
        if (legacy && prior.data().state !== 'closed') tx.set(prior.ref, { ownerUid: uid, state: 'closed' });
        else if (!legacy) tx.delete(prior.ref);
      }
      tx.set(slotRef, { token });
      tx.set(ref, { format: 1, ownerUid: uid, slot: index, displayName: chosen.displayName, avatar: chosen.avatar, createdAt: serverTimestamp(), state: 'active', acceptedBy: null });
    });
    try { await create(false); }
    catch (cause) {
      if (!retiring || !cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
      console.info('Invitation deletion is not available yet; this replacement uses the previous slot path.');
      try { await create(true); } catch (fallback) {
        if (fallback && typeof fallback === 'object' && 'code' in fallback && fallback.code === 'permission-denied') throw cause;
        throw fallback;
      }
    }
    return this.afterCommit({ operation: 'create-invite', uid }, async () => {
      const result = await this.readCommitted(ref, (data) => parseFriendInvite(token, data));
      if (!result) conflict();
      return result;
    });
  }
  async previewInvite(tokenInput: string): Promise<FriendInvitePreview> {
    const token = friendToken(tokenInput);
    try {
      const snap = await getDocFromServer(doc(this.db, 'friendInvites', token));
      if (!snap.exists() || snap.data().state !== 'active') throw new FriendStoreError('invite-unavailable', 'This invite is no longer available.');
      const invite = parseFriendInvite(token, snap.data());
      if (invite.expiresAt <= Date.now()) throw new FriendStoreError('invite-unavailable', 'This invitation has expired. Ask for a new link.');
      const { ownerUid, displayName, avatar, createdAt, expiresAt, lifetimeDays, singleUse } = invite;
      return { ownerUid, displayName, avatar, createdAt, expiresAt, lifetimeDays, singleUse };
    } catch (cause) { return unavailableInvite(cause); }
  }
  async listInvites(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendInvitation>> {
    const result = await getDocsFromServer(query(collection(this.db, 'friendInvites'), where('ownerUid', '==', friendUid(uid)),
      where('state', 'in', ['active', 'consumed', 'revoked']), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(20)));
    return page(result.docs, (row) => parseFriendInvite(row.id, row.data()));
  }
  async revokeInvite(uid: string, tokenInput: string): Promise<void> {
    friendUid(uid); const token = friendToken(tokenInput); online();
    await this.graphReady(uid);
    const ref = doc(this.db, 'friendInvites', token);
    const revoke = (legacy: boolean) => runTransaction(this.db, async (tx) => {
      online();
      const snap = await tx.get(ref);
      if (!snap.exists() || snap.data().ownerUid !== uid) throw new FriendStoreError('invite-unavailable', 'This invite is no longer available.');
      if (snap.data().state === 'closed') { if (!legacy) tx.delete(ref); return; }
      const invite = parseFriendInvite(token, snap.data());
      const slotRef = doc(this.db, 'friendInviteSlots', uid, 'slots', String(invite.slot));
      const slot = await tx.get(slotRef);
      if (legacy) {
        if (invite.state === 'active') tx.update(ref, { state: 'revoked' });
      } else {
        tx.delete(ref);
        if (slot.exists() && slot.data().token === token) tx.delete(slotRef);
      }
    });
    try { await revoke(false); }
    catch (cause) {
      if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
      console.info('Invitation deletion is not available yet; this change uses the previous revocation path.');
      try { await revoke(true); } catch (fallback) {
        if (fallback && typeof fallback === 'object' && 'code' in fallback && fallback.code === 'permission-denied') throw cause;
        throw fallback;
      }
    }
  }
  async acceptInvite(uid: string, tokenInput: string): Promise<FriendPair> {
    friendUid(uid); const token = friendToken(tokenInput); online();
    await this.graphReady(uid);
    let accepted: { ownerUid: string; epoch: number };
    try {
      accepted = await runTransaction(this.db, async (tx) => {
        online();
        const inviteRef = doc(this.db, 'friendInvites', token);
        const snap = await tx.get(inviteRef);
        if (!snap.exists() || snap.data().state !== 'active') throw new FriendStoreError('invite-unavailable', 'This invite is no longer available.');
        const invite = parseFriendInvite(token, snap.data()); const ownerUid = invite.ownerUid;
        if (uid === ownerUid) throw new FriendStoreError('invalid', 'You cannot accept your own invitation.');
        if (invite.expiresAt <= Date.now()) throw new FriendStoreError('invite-unavailable', 'This invitation has expired. Ask for a new link.');
        const ref = this.pairRef(uid, ownerUid); const pair = await tx.get(ref);
        const current = pair.exists() ? parseFriendPair(pair.data()) : null;
        if (current?.state === 'accepted') conflict('You are already friends.');
        const [a, b] = [uid, ownerUid].sort();
        tx.set(ref, { format: 1, a, b, participants: [a, b], from: ownerUid, state: 'accepted', epoch: (current?.epoch ?? 0) + 1, inviteSlot: invite.slot,
          createdAt: pair.exists() ? pair.data().createdAt : serverTimestamp(), updatedAt: serverTimestamp() });
        tx.update(inviteRef, { state: 'consumed', acceptedBy: uid });
        return { ownerUid, epoch: (current?.epoch ?? 0) + 1 };
      });
    } catch (cause) { return unavailableInvite(cause); }
    return this.afterCommit({ operation: 'accept-invite', uid, otherUid: accepted.ownerUid, epoch: accepted.epoch }, async () => {
      const result = await this.readCommitted(this.pairRef(uid, accepted.ownerUid), parseFriendPair); if (!result) conflict(); return result;
    });
  }
  shareHead(ownerUid: string): Promise<FriendShareHead | null> { return this.read(this.ref('friendShareHeads', ownerUid), parseFriendHead); }
  watchShareHead(uid: string, next: (value: FriendShareHead | null) => void, error: (cause: Error) => void): () => void {
    return this.watch(this.ref('friendShareHeads', uid), parseFriendHead, next, error);
  }
  async ranking(ownerUid: string): Promise<FriendRanking> {
    const head = await this.shareHead(ownerUid);
    if (!head?.current) throw new FriendStoreError('unavailable', 'This person has not shared a ranking.');
    const current = head.current;
    const entries: PublicEntry[] = [];
    if (current.count) {
      const chunks = await getDocsFromServer(query(collection(this.db, 'friendShares', ownerUid, 'generations', current.generation, 'chunks'), orderBy('index'), limit(FRIEND_CHUNK_LIMIT)));
      if (chunks.size !== Math.ceil(current.count / FRIEND_CHUNK_SIZE)) throw new FriendStoreError('unavailable', 'This shared ranking is incomplete. Reload it.');
      chunks.docs.forEach((snap, index) => {
        if (snap.id !== String(index)) throw new FriendStoreError('invalid', 'This shared ranking has inconsistent chunk positions.');
        entries.push(...parseFriendChunk(snap.data(), index, current.count));
      });
    }
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length || await contentDigest(entries) !== current.digest) throw new FriendStoreError('invalid', 'This shared ranking failed its integrity check.');
    const latest = await this.shareHead(ownerUid);
    if (!latest || latest.revision !== head.revision || latest.current?.generation !== current.generation) conflict('This shared ranking changed while loading. Reload it.');
    return { head, entries };
  }
  async publishRanking(uid: string, input: PublicEntry[], expected: FriendSettings, sourceInput: FriendSourceRevision, expectedHeadRevision: number, isCurrent?: () => boolean): Promise<{ changed: boolean; head: FriendShareHead }> {
    activeSettings(expected);
    if (!expected.enabled) throw new FriendStoreError('unavailable', 'Enable friends-only sharing before publishing.');
    const source = parseFriendSource(sourceInput);
    const guard = () => { online(); if (isCurrent && !isCurrent()) conflict('This account scope changed. The sharing update was cancelled.'); };
    const checkSource = (data: DocumentData | undefined) => {
      const sync = data ? parseHead(data) : null;
      if (!sync?.enabled || sync.deleted || sync.epoch !== source.syncEpoch || sync.revision !== source.remoteRevision) conflict('The private online copy changed or paused. Wait for it to save before sharing.');
    };
    const entries = validateFriendEntries(input, expected.selectedIds); const digest = await contentDigest(entries); guard();
    const headRef = this.ref('friendShareHeads', uid); const settingsRef = this.ref('friendSettings', uid);
    const syncRef = this.ref('syncHeads', uid);
    const prior = await runTransaction(this.db, async (tx) => {
      guard();
      const [settings, head, sync] = await Promise.all([tx.get(settingsRef), tx.get(headRef), tx.get(syncRef)]);
      checkSource(sync.data());
      expectedSettings(activeSettings(settings.exists() ? parseFriendSettings(settings.data()) : null), expected);
      const current = head.exists() ? parseFriendHead(head.data()) : null;
      if ((current?.revision ?? 0) !== expectedHeadRevision) conflict('A newer shared ranking is already available. Reload before replacing it.');
      return current;
    });
    if (prior?.epoch === expected.epoch && prior.settingsRevision === expected.revision && prior.current?.digest === digest) return { changed: false, head: prior };
    await this.cleanupSharing(uid);
    const id = crypto.randomUUID(); const generationRef = doc(this.db, 'friendShares', uid, 'generations', id);
    const registryRef = this.ref('friendShareRegistry', uid);
    await runTransaction(this.db, async (tx) => {
      guard();
      const [settings, registry, sync] = await Promise.all([tx.get(settingsRef), tx.get(registryRef), tx.get(syncRef)]);
      checkSource(sync.data());
      expectedSettings(activeSettings(settings.exists() ? parseFriendSettings(settings.data()) : null), expected);
      const ids = registry.exists() ? parseFriendRegistry(registry.data()) : [];
      if (ids.length >= 3) throw new FriendStoreError('limit', 'Another sharing update is in progress. Retry after it finishes or after five minutes.');
      tx.set(registryRef, { ids: [...ids, id], revision: registry.exists() ? registry.data().revision + 1 : 1 });
      guard();
      tx.set(generationRef, { epoch: expected.epoch, settingsRevision: expected.revision, source, count: entries.length, digest, uploaded: 0, ids: [],
        status: entries.length ? 'staging' : 'ready', createdAt: serverTimestamp() });
    });
    for (let index = 0; index < Math.ceil(entries.length / FRIEND_CHUNK_SIZE); index += 1) {
      guard();
      const chunkEntries = entries.slice(index * FRIEND_CHUNK_SIZE, (index + 1) * FRIEND_CHUNK_SIZE);
      const batch = writeBatch(this.db);
      batch.set(doc(generationRef, 'chunks', String(index)), { index, entries: chunkEntries, ids: chunkEntries.map((entry) => entry.id) });
      batch.update(generationRef, { uploaded: index + 1, ids: entries.slice(0, (index + 1) * FRIEND_CHUNK_SIZE).map((entry) => entry.id),
        status: (index + 1) * FRIEND_CHUNK_SIZE >= entries.length ? 'ready' : 'staging' });
      await batch.commit();
    }
    await runTransaction(this.db, async (tx) => {
      guard();
      const [settings, head, gen, sync] = await Promise.all([tx.get(settingsRef), tx.get(headRef), tx.get(generationRef), tx.get(syncRef)]);
      checkSource(sync.data());
      expectedSettings(activeSettings(settings.exists() ? parseFriendSettings(settings.data()) : null), expected);
      const current = head.exists() ? parseFriendHead(head.data()) : null;
      const generation = gen.exists() ? parseFriendGeneration(gen.data()) : null;
      if ((current?.revision ?? 0) !== expectedHeadRevision || !generation || generation.status !== 'ready' || generation.epoch !== expected.epoch || generation.settingsRevision !== expected.revision) conflict();
      guard();
      tx.update(generationRef, { status: 'published' });
      tx.set(headRef, { format: 1, epoch: expected.epoch, settingsRevision: expected.revision, source, revision: expectedHeadRevision + 1,
        current: { generation: id, digest, count: entries.length }, previous: current?.current ?? null, updatedAt: serverTimestamp() });
    });
    const receipt: FriendMutationReceipt = { operation: 'publish-ranking', uid, generation: id, epoch: expected.epoch, revision: expectedHeadRevision + 1 };
    const head = await this.afterCommit(receipt, async () => {
      const current = await this.readCommitted(headRef, parseFriendHead); if (!current || current.current?.generation !== id) conflict(); return current;
    });
    await this.afterCommit(receipt, () => this.cleanupSharing(uid), 'cleanup');
    return { changed: true, head };
  }
  async getGroup(uid: string, id: string): Promise<FriendGroup | null> {
    return this.read(doc(this.db, 'friendGroups', friendUid(uid), 'items', friendUuid(id)), (data) => parseFriendGroup(id, data));
  }
  async listGroups(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendGroup>> {
    const result = await getDocsFromServer(query(collection(this.db, 'friendGroups', friendUid(uid), 'items'), orderBy('updatedAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(20)));
    return page(result.docs, (row) => parseFriendGroup(row.id, row.data()));
  }
  async saveGroup(uid: string, input: { id?: string; name: string; participantUids: string[] }, expectedRevision: number): Promise<FriendGroup> {
    const id = input.id ? friendUuid(input.id) : crypto.randomUUID(); const name = friendName(input.name, 80); const participantUids = friendParticipants(input.participantUids);
    const ref = doc(this.db, 'friendGroups', friendUid(uid), 'items', id); online();
    const quota = quotaRef(this.db, uid, 'groups');
    const counted = await quotaSupported(quota);
    if (!(await getDocFromServer(ref)).exists()) await requireVisibleCapacity<FriendCursor>('groups', cursor => this.listGroups(uid, cursor));
    const existing = await runTransaction(this.db, async (tx) => {
      const [snap, slots] = await Promise.all([tx.get(ref), counted ? readQuotaSlots(tx, quota, 'groups') : Promise.resolve(null)]);
      const current = snap.exists() ? parseFriendGroup(id, snap.data()) : null;
      if (input.id && expectedRevision === 0 && current && current.name === name && current.participantUids.join('|') === participantUids.join('|')) return current;
      if ((current?.revision ?? 0) !== expectedRevision) conflict('This saved group changed. Reload before saving.');
      if (slots && !current) occupyQuotaSlot(tx, quota, slots, id, 'groups');
      tx.set(ref, { format: 1, name, participantUids, revision: expectedRevision + 1, createdAt: snap.exists() ? snap.data().createdAt : serverTimestamp(), updatedAt: serverTimestamp() });
      return null;
    });
    if (existing) return existing;
    return this.afterCommit({ operation: 'save-group', uid, groupId: id, revision: expectedRevision + 1 }, async () => {
      const result = await this.readCommitted(ref, (data) => parseFriendGroup(id, data)); if (!result) conflict(); return result;
    });
  }
  async deleteGroup(uid: string, id: string, expectedRevision: number, quotaAvailable?: boolean): Promise<void> {
    const ref = doc(this.db, 'friendGroups', friendUid(uid), 'items', friendUuid(id)); online();
    const quota = quotaRef(this.db, uid, 'groups');
    const counted = quotaAvailable ?? await quotaSupported(quota);
    await runTransaction(this.db, async (tx) => {
      const [snap, slots] = await Promise.all([tx.get(ref), counted ? readQuotaSlots(tx, quota, 'groups') : Promise.resolve(null)]);
      if (!snap.exists() || parseFriendGroup(id, snap.data()).revision !== expectedRevision) conflict('This saved group changed or was already deleted.');
      tx.delete(ref);
      if (slots) releaseQuotaSlot(tx, quota, slots, id);
    });
  }
  async exportPage(uid: string, cursors: { relations?: FriendCursor; groups?: FriendCursor; blocks?: FriendCursor } = {}): Promise<FriendExportPage> {
    const [identity, settings, relations, groups, blocks] = await Promise.all([this.identity(uid), this.settings(uid), this.listRelations(uid, undefined, cursors.relations), this.listGroups(uid, cursors.groups), this.listBlocks(uid, cursors.blocks)]);
    return { format: 1, identity, settings, relations, groups, blocks };
  }
  async revokeForDeletion(uid: string): Promise<void> {
    friendUid(uid); online();
    await ensureAccountActivity(this.db, uid);
    const ref = this.ref('friendSettings', uid);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref); const current = snap.exists() ? parseFriendSettings(snap.data()) : null;
      if (current?.deleted) return;
      tx.set(ref, { format: 1, enabled: false, deleted: true, selection: '', epoch: (current?.epoch ?? 0) + 1, revision: (current?.revision ?? 0) + 1, updatedAt: serverTimestamp() });
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
    const ids = parseFriendRegistry(registry.data()); let deleted = 0;
    for (const id of ids) {
      const ref = doc(this.db, 'friendShares', uid, 'generations', id);
      const removable = await runTransaction(this.db, async (tx) => {
        const [generation, head, settings] = await Promise.all([tx.get(ref), tx.get(this.ref('friendShareHeads', uid)), tx.get(this.ref('friendSettings', uid))]);
        if (!generation.exists()) throw new FriendStoreError('invalid', 'Sharing cleanup found an inconsistent generation registry.');
        const gen = parseFriendGeneration(generation.data()); const control = settings.exists() ? parseFriendSettings(settings.data()) : null;
        const pointer = head.exists() ? parseFriendHead(head.data()) : null;
        if (retainsFriendGeneration(id, pointer, control, preserveHead)) return false;
        if (control?.enabled && !control.deleted && gen.epoch === control.epoch && gen.settingsRevision === control.revision &&
          gen.status !== 'deleting' && gen.status !== 'published' && gen.createdAt + 300000 > Date.now()) return false;
        if (gen.status !== 'deleting') tx.update(ref, { status: 'deleting' });
        return true;
      });
      if (!removable) continue;
      await releaseIndexedPayload(ref, 'chunks', 0, FRIEND_CHUNK_LIMIT);
      await runTransaction(this.db, async (tx) => {
        const current = await tx.get(registryRef);
        if (!current.exists()) throw new FriendStoreError('invalid', 'Sharing cleanup lost its registry. Retry deletion.');
        const currentIds = parseFriendRegistry(current.data());
        if (!currentIds.includes(id)) conflict();
        tx.delete(ref); tx.update(registryRef, { ids: currentIds.filter((value) => value !== id), revision: current.data().revision + 1 });
      });
      deleted += 1;
    }
    return deleted;
  }
  async cleanupDeleted(uid: string): Promise<FriendCleanupResult> {
    const settings = await this.settings(uid);
    if (!settings?.deleted) throw new FriendStoreError('conflict', 'Reserve full social deletion before cleaning its data.');
    online();
    let deleted = await this.cleanupSharing(uid);
    const groupQuota = quotaRef(this.db, uid, 'groups'); const blockQuota = quotaRef(this.db, uid, 'blocks');
    const [groupsCounted, blocksCounted] = await Promise.all([quotaSupported(groupQuota), quotaSupported(blockQuota)]);
    const [relations, groups, blocks, invites] = await Promise.all([
      getDocsFromServer(this.relationsQuery(uid)), this.listGroups(uid), this.listBlocks(uid),
      getDocsFromServer(query(collection(this.db, 'friendInvites'), where('ownerUid', '==', uid), orderBy(documentId()), limit(20))),
    ]);
    if (relations.size) {
      const batch = writeBatch(this.db); relations.docs.forEach(item => batch.delete(item.ref)); await batch.commit(); deleted += relations.size;
    }
    for (const group of groups.items) { await this.deleteGroup(uid, group.id, group.revision, groupsCounted); deleted += 1; }
    for (const block of blocks.items) { await this.releaseBlock(uid, block.uid, blocksCounted); deleted += 1; }
    let inviteCount = invites.size;
    if (invites.size) {
      const batch = writeBatch(this.db);
      invites.docs.forEach(invite => batch.delete(invite.ref));
      try { await batch.commit(); deleted += invites.size; }
      catch (cause) {
        if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
        console.info('Invitation deletion is not available yet; this cleanup uses the previous link-closing path.');
        const legacy = await this.listInvites(uid);
        const close = writeBatch(this.db);
        legacy.items.forEach(invite => close.set(doc(this.db, 'friendInvites', invite.token), { ownerUid: uid, state: 'closed' }));
        await close.commit();
        inviteCount = legacy.items.length; deleted += inviteCount;
      }
    }
    if (inviteCount === 20) return { deleted, done: false };
    for (let start = 0; start < 20; start += 10) {
      const slots = writeBatch(this.db);
      for (let slot = start; slot < start + 10; slot += 1) slots.delete(doc(this.db, 'friendInviteSlots', uid, 'slots', String(slot)));
      await slots.commit();
    }
    const batch = writeBatch(this.db);
    batch.delete(this.ref('friendIdentities', uid)); batch.delete(this.ref('friendShareHeads', uid)); batch.delete(this.ref('friendShareRegistry', uid));
    await batch.commit();
    if (groups.items.length < 20 && blocks.items.length < 20) {
      try {
        const quotas = writeBatch(this.db); quotas.delete(groupQuota); quotas.delete(blockQuota);
        await quotas.commit();
        const remaining = await Promise.all([getDocFromServer(groupQuota), getDocFromServer(blockQuota)]);
        if (remaining.some(value => value.exists())) return { deleted, done: false, message: 'Some account settings still need removal. Try deleting again later.' };
      } catch (cause) {
        if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
        if (groupsCounted || blocksCounted) return { deleted, done: false, message: 'Some account settings could not be removed. Try deleting again later.' };
        console.info('Account count controls are unavailable; this cleanup uses the previous rules path.');
      }
    }
    return { deleted, done: relations.size < 20 && groups.items.length < 20 && blocks.items.length < 20 && inviteCount < 20 };
  }
}

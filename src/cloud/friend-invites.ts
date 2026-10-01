import {
  collection,
  doc,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
} from 'firebase/firestore';
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import { displayNameProblem } from '../lib/text-controls';
import {
  FriendStoreError,
  friendToken,
  friendUid,
  parseFriendIdentity,
  parseFriendInvite,
  parseFriendPair,
  parseFriendSlot,
} from '../lib/friend-types';
import type { FriendCursor, FriendInvitation, FriendInvitePreview, FriendPage, FriendPair } from '../lib/friend-types';
import { quotaRef, quotaSupported } from './account-quota';
import type { FriendStore } from './friend-store';
import { conflict, online, page } from './friend-store-core';

// Invitation links, which FriendStore's methods of the same names run: creating, previewing, listing, revoking and
// accepting them. A call to another store method goes through the store, as when these were its own methods, so a
// patched FriendStore.prototype method still intercepts it.

function unavailableInvite(cause: unknown): never {
  if (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    (cause.code === 'permission-denied' || cause.code === 'not-found')
  ) {
    throw new FriendStoreError('invite-unavailable', 'This invite is no longer available.');
  }
  throw cause;
}
export async function createInvite(store: FriendStore, uid: string): Promise<FriendInvitation> {
  friendUid(uid);
  online();
  await store.graphReady(uid);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const ref = doc(store.db, 'friendInvites', token);
  let retiring = false;
  const create = (legacy: boolean) =>
    runTransaction(store.db, async (tx) => {
      online();
      const slotRefs = Array.from({ length: 20 }, (_, slot) =>
        doc(store.db, 'friendInviteSlots', uid, 'slots', String(slot)),
      );
      const [identity, ...slots] = await Promise.all([
        tx.get(store.ref('friendIdentities', uid)),
        ...slotRefs.map((slot) => tx.get(slot)),
      ]);
      if (!identity.exists())
        throw new FriendStoreError('unavailable', 'Save your friend-facing name and icon before creating a link.');
      const chosen = parseFriendIdentity(identity.data());
      if (displayNameProblem(chosen.displayName))
        throw new FriendStoreError(
          'invalid',
          'Your friend-facing name has invisible, control or text-direction characters. Change your name before creating a link.',
        );
      const tokens = slots.map((slot) => (slot.exists() ? parseFriendSlot(slot.data()) : null));
      let index = tokens.indexOf(null);
      let prior: DocumentSnapshot<DocumentData> | null = null;
      if (index < 0) {
        const occupied = await Promise.all(tokens.map((token) => tx.get(doc(store.db, 'friendInvites', token!))));
        index = occupied.findIndex((invite, slot) => {
          if (!invite.exists()) return true;
          if (invite.data().state === 'closed') return true;
          const value = parseFriendInvite(tokens[slot]!, invite.data());
          return value.state !== 'active' || value.expiresAt <= Date.now();
        });
        prior = occupied[index] ?? null;
      }
      if (index < 0)
        throw new FriendStoreError(
          'limit',
          'You already have 20 active invitation links. Revoke one before creating another.',
        );
      const slotRef = slotRefs[index];
      if (!slotRef) throw new FriendStoreError('invalid', 'The invitation slot is invalid.');
      retiring = Boolean(prior?.exists());
      if (prior?.exists()) {
        if (legacy && prior.data().state !== 'closed') tx.set(prior.ref, { ownerUid: uid, state: 'closed' });
        else if (!legacy) tx.delete(prior.ref);
      }
      tx.set(slotRef, { token });
      tx.set(ref, {
        format: 1,
        ownerUid: uid,
        slot: index,
        displayName: chosen.displayName,
        avatar: chosen.avatar,
        createdAt: serverTimestamp(),
        state: 'active',
        acceptedBy: null,
      });
    });
  try {
    await create(false);
  } catch (cause) {
    if (!retiring || !cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied')
      throw cause;
    console.info('Invitation deletion is not available yet; this replacement uses the previous slot path.');
    try {
      await create(true);
    } catch (fallback) {
      if (fallback && typeof fallback === 'object' && 'code' in fallback && fallback.code === 'permission-denied')
        throw cause;
      throw fallback;
    }
  }
  return store.afterCommit({ operation: 'create-invite', uid }, async () => {
    const result = await store.readCommitted(ref, (data) => parseFriendInvite(token, data));
    if (!result) conflict();
    return result;
  });
}
export async function previewInvite(store: FriendStore, tokenInput: string): Promise<FriendInvitePreview> {
  const token = friendToken(tokenInput);
  try {
    const snap = await store.readInvite(doc(store.db, 'friendInvites', token));
    if (!snap.exists() || snap.data().state !== 'active')
      throw new FriendStoreError('invite-unavailable', 'This invite is no longer available.');
    const invite = parseFriendInvite(token, snap.data());
    if (invite.expiresAt <= Date.now())
      throw new FriendStoreError('invite-unavailable', 'This invitation has expired. Ask for a new link.');
    const { ownerUid, displayName, avatar, createdAt, expiresAt, lifetimeDays, singleUse } = invite;
    return { ownerUid, displayName, avatar, createdAt, expiresAt, lifetimeDays, singleUse };
  } catch (cause) {
    return unavailableInvite(cause);
  }
}
export async function listInvites(
  store: FriendStore,
  uid: string,
  cursor?: FriendCursor,
): Promise<FriendPage<FriendInvitation>> {
  const result = await getDocsFromServer(
    query(
      collection(store.db, 'friendInvites'),
      where('ownerUid', '==', friendUid(uid)),
      where('state', 'in', ['active', 'consumed', 'revoked']),
      orderBy('createdAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(20),
    ),
  );
  return page(result.docs, (row) => parseFriendInvite(row.id, row.data()));
}
export async function revokeInvite(store: FriendStore, uid: string, tokenInput: string): Promise<void> {
  friendUid(uid);
  const token = friendToken(tokenInput);
  online();
  await store.graphReady(uid);
  const ref = doc(store.db, 'friendInvites', token);
  const revoke = (legacy: boolean) =>
    runTransaction(store.db, async (tx) => {
      online();
      const snap = await tx.get(ref);
      if (!snap.exists() || snap.data().ownerUid !== uid)
        throw new FriendStoreError('invite-unavailable', 'This invite is no longer available.');
      if (snap.data().state === 'closed') {
        if (!legacy) tx.delete(ref);
        return;
      }
      const invite = parseFriendInvite(token, snap.data());
      const slotRef = doc(store.db, 'friendInviteSlots', uid, 'slots', String(invite.slot));
      const slot = await tx.get(slotRef);
      if (legacy) {
        if (invite.state === 'active') tx.update(ref, { state: 'revoked' });
      } else {
        tx.delete(ref);
        if (slot.exists() && slot.data().token === token) tx.delete(slotRef);
      }
    });
  try {
    await revoke(false);
  } catch (cause) {
    if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
    console.info('Invitation deletion is not available yet; this change uses the previous revocation path.');
    try {
      await revoke(true);
    } catch (fallback) {
      if (fallback && typeof fallback === 'object' && 'code' in fallback && fallback.code === 'permission-denied')
        throw cause;
      throw fallback;
    }
  }
}
export async function acceptInvite(store: FriendStore, uid: string, tokenInput: string): Promise<FriendPair> {
  friendUid(uid);
  const token = friendToken(tokenInput);
  online();
  await store.graphReady(uid);
  const counted = await quotaSupported(quotaRef(store.db, uid, 'pairs'));
  const inviteRef = doc(store.db, 'friendInvites', token);
  let commitStarted = false;
  let accepted: { ownerUid: string; epoch: number };
  try {
    const snap = await store.readInvite(inviteRef);
    if (!snap.exists() || snap.data().state !== 'active')
      throw new FriendStoreError('invite-unavailable', 'This invite is no longer available.');
    const invite = parseFriendInvite(token, snap.data());
    const ownerUid = invite.ownerUid;
    if (uid === ownerUid) throw new FriendStoreError('invalid', 'You cannot accept your own invitation.');
    if (invite.expiresAt <= Date.now())
      throw new FriendStoreError('invite-unavailable', 'This invitation has expired. Ask for a new link.');
    commitStarted = true;
    accepted = await store.withPairCapacity(uid, () =>
      runTransaction(store.db, async (tx) => {
        online();
        const ref = store.pairRef(uid, ownerUid);
        const pair = await tx.get(ref);
        const current = pair.exists() ? parseFriendPair(pair.data()) : null;
        if (current?.state === 'accepted') conflict('You are already friends.');
        const [a, b] = [uid, ownerUid].sort();
        if (counted) await store.touchPairCount(tx, uid, ref.id, current === null);
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
          from: ownerUid,
          state: 'accepted',
          epoch: (current?.epoch ?? 0) + 1,
          inviteSlot: invite.slot,
          createdAt: pair.exists() ? (pair.data().createdAt as unknown) : serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.update(inviteRef, { state: 'consumed', acceptedBy: uid });
        return { ownerUid, epoch: (current?.epoch ?? 0) + 1 };
      }),
    );
  } catch (cause) {
    if (
      !commitStarted ||
      !cause ||
      typeof cause !== 'object' ||
      !('code' in cause) ||
      (cause.code !== 'permission-denied' && cause.code !== 'not-found')
    )
      return unavailableInvite(cause);
    let latest: DocumentSnapshot<DocumentData>;
    try {
      latest = await store.readInvite(inviteRef);
    } catch (checkError) {
      if (
        checkError &&
        typeof checkError === 'object' &&
        'code' in checkError &&
        (checkError.code === 'permission-denied' || checkError.code === 'not-found')
      )
        return unavailableInvite(checkError);
      throw new FriendStoreError('unavailable', 'The invitation could not be checked. Try again later.');
    }
    if (
      !latest.exists() ||
      latest.data().state !== 'active' ||
      parseFriendInvite(token, latest.data()).expiresAt <= Date.now()
    ) {
      throw new FriendStoreError('invite-unavailable', 'This invite is no longer available.');
    }
    throw new FriendStoreError(
      'unavailable',
      'The invitation could not be accepted. Refresh the page, then try again.',
    );
  }
  return store.afterCommit(
    { operation: 'accept-invite', uid, otherUid: accepted.ownerUid, epoch: accepted.epoch },
    async () => {
      const result = await store.readCommitted(store.pairRef(uid, accepted.ownerUid), parseFriendPair);
      if (!result) conflict();
      return result;
    },
  );
}

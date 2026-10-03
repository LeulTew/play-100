import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  FRIEND_CHUNK_LIMIT,
  FriendStoreError,
  friendUid,
  parseFriendGeneration,
  parseFriendHead,
  parseFriendPair,
  parseFriendRegistry,
  parseFriendSettings,
  retainsFriendGeneration,
} from '../lib/friend-types';
import type { FriendCleanupResult, FriendCursor, FriendExport, FriendPage } from '../lib/friend-types';
import { isUnknownArray } from '../lib/guards';
import { ensureAccountActivity } from './account-lifecycle';
import { releaseIndexedPayload } from './generation-cleanup';
import { quotaRef, quotaSupported, readQuotaSlots, releaseQuotaSlot } from './account-quota';
import type { SlotQuotaKind } from './account-quota';
import type { FriendStore } from './friend-store';
import { online } from './friend-store-core';

// Exporting a member's friend data and deleting it with the account, which FriendStore's methods of the same names
// run, and the shared-copy cleanup behind cleanupSharing and pruneSharing. A call to another store method goes through
// the store, as when these were its own methods, so a patched FriendStore.prototype method still intercepts it.

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
export async function exportAll(store: FriendStore, uid: string, isCurrent: () => boolean): Promise<FriendExport> {
  let failed = false;
  const settle = <T>(work: Promise<T>) =>
    work.catch((cause: unknown) => {
      failed = true;
      throw cause;
    });
  const stopped = () => failed;
  const [identity, settings, relations, groups, blocks] = await Promise.all([
    settle(store.identity(uid)),
    settle(store.settings(uid)),
    settle(exportPages((cursor) => store.listRelations(uid, undefined, cursor), isCurrent, stopped)),
    settle(exportPages((cursor) => store.listGroups(uid, cursor), isCurrent, stopped)),
    settle(exportPages((cursor) => store.listBlocks(uid, cursor), isCurrent, stopped)),
  ]);
  return { identity, settings, relations, groups, blocks };
}
export async function revokeForDeletion(store: FriendStore, uid: string): Promise<void> {
  friendUid(uid);
  online();
  await ensureAccountActivity(store.db, uid);
  const ref = store.ref('friendSettings', uid);
  await runTransaction(store.db, async (tx) => {
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
export async function cleanupGenerations(store: FriendStore, uid: string, preserveHead: boolean): Promise<number> {
  const registryRef = store.ref('friendShareRegistry', uid);
  const registry = await getDocFromServer(registryRef);
  if (!registry.exists()) return 0;
  const ids = parseFriendRegistry(registry.data());
  let deleted = 0;
  for (const id of ids) {
    const ref = doc(store.db, 'friendShares', uid, 'generations', id);
    const removable = await runTransaction(store.db, async (tx) => {
      const [generation, head, settings] = await Promise.all([
        tx.get(ref),
        tx.get(store.ref('friendShareHeads', uid)),
        tx.get(store.ref('friendSettings', uid)),
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
    await runTransaction(store.db, async (tx) => {
      const current = await tx.get(registryRef);
      if (!current.exists())
        throw new FriendStoreError(
          'invalid',
          'Sharing settings changed during cleanup. Refresh the page, then try again.',
        );
      const currentIds = parseFriendRegistry(current.data());
      // Only this step removes an id, together with its generation: another tab's cleanup, or this transaction's own
      // commit, applied although the client was told it failed, so the SDK ran it again (REL-13). As the shelf does.
      if (!currentIds.includes(id)) return;
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
export async function releaseMissingQuotaIds(
  store: FriendStore,
  uid: string,
  kind: SlotQuotaKind,
): Promise<'empty' | 'more' | 'blocked'> {
  const quota = quotaRef(store.db, uid, kind);
  const snapshot = await getDocFromServer(quota);
  if (!snapshot.exists()) return 'empty';
  const ids: unknown = snapshot.data().ids;
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) {
    throw new FriendStoreError('invalid', 'Account settings could not be read. Try again later.');
  }
  for (const id of ids.slice(0, 20)) {
    const released = await runTransaction(store.db, async (tx) => {
      const itemRef = doc(store.db, kind === 'groups' ? 'friendGroups' : 'friendBlocks', uid, 'items', id);
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
  const left: unknown = remaining.data().ids;
  if (!isUnknownArray(left))
    throw new FriendStoreError('invalid', 'Account settings could not be read. Try again later.');
  return left.length ? 'more' : 'empty';
}
export async function cleanupDeleted(store: FriendStore, uid: string): Promise<FriendCleanupResult> {
  const settings = await store.settings(uid);
  if (!settings?.deleted)
    throw new FriendStoreError('conflict', 'Account deletion is not ready. Refresh the page, then confirm deletion.');
  online();
  let deleted = await store.cleanupSharing(uid);
  const groupQuota = quotaRef(store.db, uid, 'groups');
  const blockQuota = quotaRef(store.db, uid, 'blocks');
  const pairQuota = quotaRef(store.db, uid, 'pairs');
  const [groupsCounted, blocksCounted, pairsCounted] = await Promise.all([
    quotaSupported(groupQuota),
    quotaSupported(blockQuota),
    quotaSupported(pairQuota),
  ]);
  const [relations, groups, blocks, invites] = await Promise.all([
    getDocsFromServer(store.relationsQuery(uid)),
    store.listGroups(uid),
    store.listBlocks(uid),
    getDocsFromServer(
      query(collection(store.db, 'friendInvites'), where('ownerUid', '==', uid), orderBy(documentId()), limit(20)),
    ),
  ]);
  for (const item of relations.docs) {
    const pair = parseFriendPair(item.data());
    await store.releasePair(uid, pair.a === uid ? pair.b : pair.a, pair.epoch);
    deleted += 1;
  }
  for (const group of groups.items) {
    await store.deleteGroup(uid, group.id, group.revision, groupsCounted);
    deleted += 1;
  }
  for (const block of blocks.items) {
    await store.releaseBlock(uid, block.uid, blocksCounted);
    deleted += 1;
  }
  let inviteCount = invites.size;
  if (invites.size) {
    const batch = writeBatch(store.db);
    invites.docs.forEach((invite) => batch.delete(invite.ref));
    try {
      await batch.commit();
      deleted += invites.size;
    } catch (cause) {
      if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
      console.info('Invitation deletion is not available yet; this cleanup uses the previous link-closing path.');
      const legacy = await store.listInvites(uid);
      const close = writeBatch(store.db);
      legacy.items.forEach((invite) =>
        close.set(doc(store.db, 'friendInvites', invite.token), { ownerUid: uid, state: 'closed' }),
      );
      await close.commit();
      inviteCount = legacy.items.length;
      deleted += inviteCount;
    }
  }
  if (inviteCount === 20) return { deleted, done: false };
  for (let start = 0; start < 20; start += 10) {
    const slots = writeBatch(store.db);
    for (let slot = start; slot < start + 10; slot += 1)
      slots.delete(doc(store.db, 'friendInviteSlots', uid, 'slots', String(slot)));
    await slots.commit();
  }
  const batch = writeBatch(store.db);
  batch.delete(store.ref('friendIdentities', uid));
  batch.delete(store.ref('friendShareHeads', uid));
  batch.delete(store.ref('friendShareRegistry', uid));
  await batch.commit();
  if (relations.size < 20 && groups.items.length < 20 && blocks.items.length < 20) {
    try {
      let more = false;
      for (const [kind, counted] of [
        ['groups', groupsCounted],
        ['blocks', blocksCounted],
      ] as const) {
        if (!counted) continue;
        const result = await store.releaseMissingQuotaIds(uid, kind);
        if (result === 'blocked')
          return {
            deleted,
            done: false,
            message: 'Some account settings remain. Choose Delete account to continue.',
          };
        more ||= result === 'more';
      }
      if (more) return { deleted, done: false };
      const quotas = writeBatch(store.db);
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
      if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
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

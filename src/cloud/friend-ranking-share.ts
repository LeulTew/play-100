import {
  collection,
  doc,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import type { PublicEntry } from '../lib/community';
import {
  FRIEND_CHUNK_LIMIT,
  FRIEND_CHUNK_SIZE,
  FriendStoreError,
  parseFriendChunk,
  parseFriendGeneration,
  parseFriendHead,
  parseFriendRegistry,
  parseFriendSettings,
  parseFriendSource,
  validateFriendEntries,
} from '../lib/friend-types';
import type {
  FriendMutationReceipt,
  FriendRanking,
  FriendSettings,
  FriendShareHead,
  FriendSourceRevision,
} from '../lib/friend-types';
import { parseHead } from './cloud-store';
import type { FriendStore } from './friend-store';
import { activeSettings, conflict, expectedSettings, online } from './friend-store-core';

// The friends-only ranking share, which FriendStore's methods of the same names run: reading a shared ranking and
// publishing one. A call to another store method goes through the store, as when these were its own methods, so a
// patched FriendStore.prototype method still intercepts it.

async function contentDigest(entries: PublicEntry[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export async function ranking(store: FriendStore, ownerUid: string): Promise<FriendRanking> {
  const head = await store.shareHead(ownerUid);
  if (!head?.current) throw new FriendStoreError('unavailable', 'This person has not shared a ranking.');
  const current = head.current;
  const entries: PublicEntry[] = [];
  if (current.count) {
    const chunks = await getDocsFromServer(
      query(
        collection(store.db, 'friendShares', ownerUid, 'generations', current.generation, 'chunks'),
        orderBy('index'),
        limit(FRIEND_CHUNK_LIMIT),
      ),
    );
    if (chunks.size !== Math.ceil(current.count / FRIEND_CHUNK_SIZE))
      throw new FriendStoreError('unavailable', 'This shared ranking is incomplete. Reload it.');
    chunks.docs.forEach((snap, index) => {
      if (snap.id !== String(index))
        throw new FriendStoreError('invalid', 'This shared ranking has inconsistent chunk positions.');
      entries.push(...parseFriendChunk(snap.data(), index, current.count));
    });
  }
  if (
    new Set(entries.map((entry) => entry.id)).size !== entries.length ||
    (await contentDigest(entries)) !== current.digest
  )
    throw new FriendStoreError('invalid', 'This shared ranking failed its integrity check.');
  const latest = await store.shareHead(ownerUid);
  if (!latest || latest.revision !== head.revision || latest.current?.generation !== current.generation)
    conflict('This shared ranking changed while loading. Reload it.');
  return { head, entries };
}
export async function publishRanking(
  store: FriendStore,
  uid: string,
  input: PublicEntry[],
  expected: FriendSettings,
  sourceInput: FriendSourceRevision,
  expectedHeadRevision: number,
  isCurrent?: () => boolean,
): Promise<{ changed: boolean; head: FriendShareHead }> {
  activeSettings(expected);
  if (!expected.enabled) throw new FriendStoreError('unavailable', 'Enable friends-only sharing before publishing.');
  const source = parseFriendSource(sourceInput);
  const guard = () => {
    online();
    if (isCurrent && !isCurrent()) conflict('This account scope changed. The sharing update was cancelled.');
  };
  const checkSource = (data: DocumentData | undefined) => {
    const sync = data ? parseHead(data) : null;
    if (!sync?.enabled || sync.deleted || sync.epoch !== source.syncEpoch || sync.revision !== source.remoteRevision)
      conflict('The private online copy changed or paused. Wait for it to save before sharing.');
  };
  const entries = validateFriendEntries(input, expected.selectedIds);
  const digest = await contentDigest(entries);
  guard();
  const headRef = store.ref('friendShareHeads', uid);
  const settingsRef = store.ref('friendSettings', uid);
  const syncRef = store.ref('syncHeads', uid);
  const prior = await runTransaction(store.db, async (tx) => {
    guard();
    const [settings, head, sync] = await Promise.all([tx.get(settingsRef), tx.get(headRef), tx.get(syncRef)]);
    checkSource(sync.data());
    expectedSettings(activeSettings(settings.exists() ? parseFriendSettings(settings.data()) : null), expected);
    const current = head.exists() ? parseFriendHead(head.data()) : null;
    if ((current?.revision ?? 0) !== expectedHeadRevision)
      conflict('A newer shared ranking is already available. Reload before replacing it.');
    return current;
  });
  if (
    prior?.epoch === expected.epoch &&
    prior.settingsRevision === expected.revision &&
    prior.current?.digest === digest
  )
    return { changed: false, head: prior };
  await store.cleanupSharing(uid);
  const id = crypto.randomUUID();
  const generationRef = doc(store.db, 'friendShares', uid, 'generations', id);
  const registryRef = store.ref('friendShareRegistry', uid);
  await runTransaction(store.db, async (tx) => {
    guard();
    const [settings, registry, sync] = await Promise.all([tx.get(settingsRef), tx.get(registryRef), tx.get(syncRef)]);
    checkSource(sync.data());
    expectedSettings(activeSettings(settings.exists() ? parseFriendSettings(settings.data()) : null), expected);
    const ids = registry.exists() ? parseFriendRegistry(registry.data()) : [];
    if (ids.length >= 3)
      throw new FriendStoreError(
        'limit',
        'Another sharing update is in progress. Retry after it finishes or after five minutes.',
      );
    tx.set(registryRef, { ids: [...ids, id], revision: registry.exists() ? registry.data().revision + 1 : 1 });
    guard();
    tx.set(generationRef, {
      epoch: expected.epoch,
      settingsRevision: expected.revision,
      source,
      count: entries.length,
      digest,
      uploaded: 0,
      ids: [],
      status: entries.length ? 'staging' : 'ready',
      createdAt: serverTimestamp(),
    });
  });
  for (let index = 0; index < Math.ceil(entries.length / FRIEND_CHUNK_SIZE); index += 1) {
    guard();
    const chunkEntries = entries.slice(index * FRIEND_CHUNK_SIZE, (index + 1) * FRIEND_CHUNK_SIZE);
    const batch = writeBatch(store.db);
    batch.set(doc(generationRef, 'chunks', String(index)), {
      index,
      entries: chunkEntries,
      ids: chunkEntries.map((entry) => entry.id),
    });
    batch.update(generationRef, {
      uploaded: index + 1,
      ids: entries.slice(0, (index + 1) * FRIEND_CHUNK_SIZE).map((entry) => entry.id),
      status: (index + 1) * FRIEND_CHUNK_SIZE >= entries.length ? 'ready' : 'staging',
    });
    await batch.commit();
  }
  await runTransaction(store.db, async (tx) => {
    guard();
    const [settings, head, gen, sync] = await Promise.all([
      tx.get(settingsRef),
      tx.get(headRef),
      tx.get(generationRef),
      tx.get(syncRef),
    ]);
    checkSource(sync.data());
    expectedSettings(activeSettings(settings.exists() ? parseFriendSettings(settings.data()) : null), expected);
    const current = head.exists() ? parseFriendHead(head.data()) : null;
    const generation = gen.exists() ? parseFriendGeneration(gen.data()) : null;
    if (
      (current?.revision ?? 0) !== expectedHeadRevision ||
      !generation ||
      generation.status !== 'ready' ||
      generation.epoch !== expected.epoch ||
      generation.settingsRevision !== expected.revision
    )
      conflict();
    guard();
    tx.update(generationRef, { status: 'published' });
    tx.set(headRef, {
      format: 1,
      epoch: expected.epoch,
      settingsRevision: expected.revision,
      source,
      revision: expectedHeadRevision + 1,
      current: { generation: id, digest, count: entries.length },
      previous: current?.current ?? null,
      updatedAt: serverTimestamp(),
    });
  });
  const receipt: FriendMutationReceipt = {
    operation: 'publish-ranking',
    uid,
    generation: id,
    epoch: expected.epoch,
    revision: expectedHeadRevision + 1,
  };
  const head = await store.afterCommit(receipt, async () => {
    const current = await store.readCommitted(headRef, parseFriendHead);
    if (!current || current.current?.generation !== id) conflict();
    return current;
  });
  await store.afterCommit(receipt, () => store.cleanupSharing(uid), 'cleanup');
  return { changed: true, head };
}

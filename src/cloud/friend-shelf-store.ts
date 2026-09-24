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
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentData, DocumentReference, Firestore } from 'firebase/firestore';
import {
  FriendStoreError,
  friendUid,
  parseFriendGeneration,
  parseFriendRegistry,
  parseFriendSource,
  retainsFriendGeneration,
} from '../lib/friend-types';
import type { FriendSourceRevision } from '../lib/friend-types';
import {
  FRIEND_SHELF_CHUNK_LIMIT,
  FRIEND_SHELF_CHUNK_SIZE,
  FriendShelfCommittedError,
  FriendShelfConsentError,
  friendShelfDigest,
  parseFriendShelfChunk,
  parseFriendShelfConfig,
  parseFriendShelfHead,
  shelfSelection,
  validateFriendShelfEntries,
} from '../lib/friend-shelf-types';
import type {
  FriendShelf,
  FriendShelfConfig,
  FriendShelfEntry,
  FriendShelfHead,
  FriendShelfReceipt,
} from '../lib/friend-shelf-types';
import { ensureAccountActivity } from './account-lifecycle';
import { parseHead } from './cloud-store';
import { releaseIndexedPayload } from './generation-cleanup';

function conflict(message = 'Shared games changed elsewhere. Refresh before trying again.'): never {
  throw new FriendStoreError('conflict', message);
}
function online(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new FriendStoreError('offline', 'Reconnect before changing shared games.');
}
function active(value: FriendShelfConfig | null): FriendShelfConfig {
  if (!value) throw new FriendStoreError('unavailable', 'Preview shared games before enabling the shelf.');
  if (value.deleted)
    throw new FriendStoreError('deleted', 'This account is being deleted. Shared games cannot be enabled.');
  return value;
}
function expectedConfig(value: FriendShelfConfig | null, expected: FriendShelfConfig): FriendShelfConfig {
  const current = active(value);
  if (current.epoch !== expected.epoch || current.revision !== expected.revision) conflict();
  return current;
}
function errorValue(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('Shared games could not be refreshed.');
}

export class FriendShelfStore {
  constructor(readonly db: Firestore) {}
  private ref(name: string, uid: string): DocumentReference<DocumentData> {
    return doc(this.db, name, friendUid(uid));
  }
  private async read<T>(ref: DocumentReference<DocumentData>, parse: (data: DocumentData) => T): Promise<T | null> {
    const snapshot = await getDocFromServer(ref);
    return snapshot.exists() ? parse(snapshot.data()) : null;
  }
  private async confirmed<T>(
    ref: DocumentReference<DocumentData>,
    parse: (data: DocumentData) => T,
  ): Promise<T | null> {
    return runTransaction(
      this.db,
      async (tx) => {
        const snapshot = await tx.get(ref);
        return snapshot.exists() ? parse(snapshot.data()) : null;
      },
      { maxAttempts: 3 },
    );
  }
  private async afterCommit<T>(
    receipt: FriendShelfReceipt,
    operation: () => Promise<T>,
    phase: 'refresh' | 'cleanup' = 'refresh',
  ): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      throw new FriendShelfCommittedError(receipt, cause, phase);
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
      (snapshot) => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        try {
          next(snapshot.exists() ? parse(snapshot.data()) : null);
        } catch (cause) {
          error(errorValue(cause));
        }
      },
      error,
    );
  }
  config(uid: string): Promise<FriendShelfConfig | null> {
    return this.read(this.ref('friendShelfSettings', uid), parseFriendShelfConfig);
  }
  watchConfig(uid: string, next: (value: FriendShelfConfig | null) => void, error: (cause: Error) => void): () => void {
    return this.watch(this.ref('friendShelfSettings', uid), parseFriendShelfConfig, next, error);
  }
  async initialize(uid: string): Promise<FriendShelfConfig> {
    online();
    await ensureAccountActivity(this.db, friendUid(uid));
    const ref = this.ref('friendShelfSettings', uid);
    await this.config(uid);
    await runTransaction(this.db, async (tx) => {
      online();
      const snapshot = await tx.get(ref);
      if (snapshot.exists()) {
        active(parseFriendShelfConfig(snapshot.data()));
        return;
      }
      tx.set(ref, {
        format: 1,
        enabled: false,
        deleted: false,
        consentSyncEpoch: null,
        selection: '',
        epoch: 1,
        revision: 1,
        updatedAt: serverTimestamp(),
      });
    });
    return this.afterCommit({ operation: 'initialize-shelf', uid }, async () =>
      active(await this.confirmed(ref, parseFriendShelfConfig)),
    );
  }
  async saveConfig(
    uid: string,
    input: { enabled: boolean; selectedIds: string[]; consentSyncEpoch: number | null },
    expected: FriendShelfConfig,
    isCurrent: () => boolean = () => true,
  ): Promise<FriendShelfConfig> {
    const selectedIds = shelfSelection(input.selectedIds);
    if (typeof input.enabled !== 'boolean')
      throw new FriendStoreError('invalid', 'Choose whether to share these games.');
    const guard = () => {
      online();
      if (!isCurrent()) conflict('This shelf action was cancelled because its account or consent changed.');
    };
    guard();
    await this.config(uid);
    const ref = this.ref('friendShelfSettings', uid);
    await runTransaction(this.db, async (tx) => {
      guard();
      const headRef = this.ref('friendShelfHeads', uid);
      const [snapshot, sync, head] = await Promise.all([
        tx.get(ref),
        tx.get(this.ref('syncHeads', uid)),
        tx.get(headRef),
      ]);
      const current = expectedConfig(snapshot.exists() ? parseFriendShelfConfig(snapshot.data()) : null, expected);
      if (input.enabled) {
        const source = sync.exists() ? parseHead(sync.data()) : null;
        if (!source?.enabled || source.deleted || input.consentSyncEpoch !== source.epoch)
          throw new FriendShelfConsentError();
      } else if (input.consentSyncEpoch !== null)
        throw new FriendStoreError('invalid', 'Stopped sharing must clear its saving consent.');
      if (
        current.enabled === input.enabled &&
        current.consentSyncEpoch === input.consentSyncEpoch &&
        current.selectedIds.join('|') === selectedIds.join('|')
      )
        return;
      guard();
      tx.update(ref, {
        enabled: input.enabled,
        consentSyncEpoch: input.consentSyncEpoch,
        selection: selectedIds.join('|'),
        epoch: current.epoch + 1,
        revision: current.revision + 1,
        updatedAt: serverTimestamp(),
      });
      if (head.exists())
        tx.update(headRef, { revision: parseFriendShelfHead(head.data()).revision + 1, updatedAt: serverTimestamp() });
    });
    return this.afterCommit({ operation: 'save-shelf-config', uid }, async () => {
      guard();
      return active(await this.confirmed(ref, parseFriendShelfConfig));
    });
  }
  head(uid: string): Promise<FriendShelfHead | null> {
    return this.read(this.ref('friendShelfHeads', uid), parseFriendShelfHead);
  }
  watchHead(uid: string, next: (value: FriendShelfHead | null) => void, error: (cause: Error) => void): () => void {
    return this.watch(this.ref('friendShelfHeads', uid), parseFriendShelfHead, next, error);
  }
  async shelf(uid: string): Promise<FriendShelf> {
    const head = await this.head(uid);
    if (!head?.current) throw new FriendStoreError('unavailable', 'No shared games are available.');
    const entries: FriendShelfEntry[] = [];
    const manifest = head.current;
    if (manifest.count) {
      const chunks = await getDocsFromServer(
        query(
          collection(this.db, 'friendShelves', uid, 'generations', manifest.generation, 'chunks'),
          orderBy('index'),
          limit(FRIEND_SHELF_CHUNK_LIMIT),
        ),
      );
      if (chunks.size !== Math.ceil(manifest.count / FRIEND_SHELF_CHUNK_SIZE))
        throw new FriendStoreError('unavailable', 'The shared shelf is incomplete. Refresh it.');
      chunks.docs.forEach((chunk, index) => {
        if (chunk.id !== String(index))
          throw new FriendStoreError('invalid', 'Shared games have inconsistent chunk identities.');
        entries.push(...parseFriendShelfChunk(chunk.data(), index, manifest.count));
      });
    }
    if (
      new Set(entries.map((entry) => entry.id)).size !== entries.length ||
      (await friendShelfDigest(entries)) !== manifest.digest
    )
      throw new FriendStoreError('invalid', 'Shared games failed their integrity check.');
    const latest = await this.head(uid);
    if (latest?.revision !== head.revision || latest.current?.generation !== manifest.generation)
      conflict('Shared games changed while loading. Refresh them.');
    return { head, entries };
  }
  async publish(
    uid: string,
    input: FriendShelfEntry[],
    expected: FriendShelfConfig,
    sourceInput: FriendSourceRevision,
    expectedHeadRevision: number,
    isCurrent: () => boolean,
  ): Promise<{ changed: boolean; head: FriendShelfHead }> {
    if (!active(expected).enabled) throw new FriendStoreError('unavailable', 'Preview and enable shared games first.');
    const entries = validateFriendShelfEntries(input, expected.selectedIds);
    const source = parseFriendSource(sourceInput);
    if (expected.consentSyncEpoch !== source.syncEpoch) throw new FriendShelfConsentError();
    const guard = () => {
      online();
      if (!isCurrent()) conflict('This account or selection changed. The shelf update was cancelled.');
    };
    const checkSource = (data: DocumentData | undefined) => {
      const sync = data ? parseHead(data) : null;
      if (!sync?.enabled || sync.deleted || sync.epoch !== source.syncEpoch || sync.revision !== source.remoteRevision)
        conflict('Wait for the current private online copy to finish saving.');
    };
    guard();
    await this.config(uid);
    guard();
    const digest = await friendShelfDigest(entries);
    const configRef = this.ref('friendShelfSettings', uid);
    const headRef = this.ref('friendShelfHeads', uid);
    const syncRef = this.ref('syncHeads', uid);
    const prior = await runTransaction(this.db, async (tx) => {
      guard();
      const [config, head, sync] = await Promise.all([tx.get(configRef), tx.get(headRef), tx.get(syncRef)]);
      expectedConfig(config.exists() ? parseFriendShelfConfig(config.data()) : null, expected);
      checkSource(sync.data());
      const current = head.exists() ? parseFriendShelfHead(head.data()) : null;
      if ((current?.revision ?? 0) !== expectedHeadRevision) conflict();
      return current;
    });
    guard();
    if (
      prior?.epoch === expected.epoch &&
      prior.settingsRevision === expected.revision &&
      prior.current?.digest === digest
    )
      return { changed: false, head: prior };
    await this.prune(uid);
    guard();
    const id = crypto.randomUUID();
    const generationRef = doc(this.db, 'friendShelves', uid, 'generations', id);
    const registryRef = this.ref('friendShelfRegistry', uid);
    await runTransaction(this.db, async (tx) => {
      guard();
      const [config, registry, sync] = await Promise.all([tx.get(configRef), tx.get(registryRef), tx.get(syncRef)]);
      expectedConfig(config.exists() ? parseFriendShelfConfig(config.data()) : null, expected);
      checkSource(sync.data());
      const ids = registry.exists() ? parseFriendRegistry(registry.data()) : [];
      if (ids.length >= 3)
        throw new FriendStoreError(
          'limit',
          'A shelf update is still pending. Shared games will retry after the upload expires.',
        );
      guard();
      tx.set(registryRef, { ids: [...ids, id], revision: registry.exists() ? registry.data().revision + 1 : 1 });
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
    for (let index = 0; index < Math.ceil(entries.length / FRIEND_SHELF_CHUNK_SIZE); index += 1) {
      guard();
      const chunkEntries = entries.slice(index * FRIEND_SHELF_CHUNK_SIZE, (index + 1) * FRIEND_SHELF_CHUNK_SIZE);
      const batch = writeBatch(this.db);
      batch.set(doc(generationRef, 'chunks', String(index)), {
        index,
        entries: chunkEntries,
        ids: chunkEntries.map((entry) => entry.id),
      });
      batch.update(generationRef, {
        uploaded: index + 1,
        ids: entries.slice(0, (index + 1) * FRIEND_SHELF_CHUNK_SIZE).map((entry) => entry.id),
        status: (index + 1) * FRIEND_SHELF_CHUNK_SIZE >= entries.length ? 'ready' : 'staging',
      });
      await batch.commit();
    }
    await runTransaction(this.db, async (tx) => {
      guard();
      const [config, head, generation, sync] = await Promise.all([
        tx.get(configRef),
        tx.get(headRef),
        tx.get(generationRef),
        tx.get(syncRef),
      ]);
      expectedConfig(config.exists() ? parseFriendShelfConfig(config.data()) : null, expected);
      checkSource(sync.data());
      const current = head.exists() ? parseFriendShelfHead(head.data()) : null;
      const gen = generation.exists() ? parseFriendGeneration(generation.data()) : null;
      if ((current?.revision ?? 0) !== expectedHeadRevision || gen?.status !== 'ready') conflict();
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
    const receipt: FriendShelfReceipt = {
      operation: 'publish-shelf',
      uid,
      generation: id,
      epoch: expected.epoch,
      revision: expectedHeadRevision + 1,
    };
    const head = await this.afterCommit(receipt, async () => {
      guard();
      const current = await this.confirmed(headRef, parseFriendShelfHead);
      if (!current || current.current?.generation !== id) conflict();
      return current;
    });
    await this.afterCommit(
      receipt,
      () => {
        guard();
        return this.prune(uid);
      },
      'cleanup',
    );
    return { changed: true, head };
  }
  prune(uid: string): Promise<number> {
    return this.cleanupGenerations(uid, true);
  }
  cleanupSharing(uid: string): Promise<number> {
    return this.cleanupGenerations(uid, false);
  }
  private async cleanupGenerations(uid: string, preserveHead: boolean): Promise<number> {
    online();
    const registryRef = this.ref('friendShelfRegistry', uid);
    const snapshot = await getDocFromServer(registryRef);
    if (!snapshot.exists()) return 0;
    const ids = parseFriendRegistry(snapshot.data());
    let deleted = 0;
    for (const id of ids) {
      const ref = doc(this.db, 'friendShelves', uid, 'generations', id);
      const removable = await runTransaction(this.db, async (tx) => {
        const [generation, head, config, registry] = await Promise.all([
          tx.get(ref),
          tx.get(this.ref('friendShelfHeads', uid)),
          tx.get(this.ref('friendShelfSettings', uid)),
          tx.get(registryRef),
        ]);
        if (!registry.exists() || !parseFriendRegistry(registry.data()).includes(id)) return false;
        if (!generation.exists())
          throw new FriendStoreError('invalid', 'Some shared-game copies could not be checked. Try again later.');
        const gen = parseFriendGeneration(generation.data());
        const control = config.exists() ? parseFriendShelfConfig(config.data()) : null;
        const pointer = head.exists() ? parseFriendShelfHead(head.data()) : null;
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
      await releaseIndexedPayload(ref, 'chunks', 0, FRIEND_SHELF_CHUNK_LIMIT);
      await runTransaction(this.db, async (tx) => {
        const registry = await tx.get(registryRef);
        if (!registry.exists()) return;
        const current = parseFriendRegistry(registry.data());
        if (!current.includes(id)) return;
        tx.delete(ref);
        tx.update(registryRef, {
          ids: current.filter((value) => value !== id),
          revision: registry.data().revision + 1,
        });
      });
      deleted += 1;
    }
    return deleted;
  }
  async revokeForDeletion(uid: string): Promise<void> {
    online();
    await this.config(uid);
    const ref = this.ref('friendShelfSettings', uid);
    await runTransaction(this.db, async (tx) => {
      const headRef = this.ref('friendShelfHeads', uid);
      const [snapshot, head] = await Promise.all([tx.get(ref), tx.get(headRef)]);
      const current = snapshot.exists() ? parseFriendShelfConfig(snapshot.data()) : null;
      if (current?.deleted) return;
      tx.set(ref, {
        format: 1,
        enabled: false,
        deleted: true,
        consentSyncEpoch: null,
        selection: '',
        epoch: (current?.epoch ?? 0) + 1,
        revision: (current?.revision ?? 0) + 1,
        updatedAt: serverTimestamp(),
      });
      if (head.exists())
        tx.update(headRef, { revision: parseFriendShelfHead(head.data()).revision + 1, updatedAt: serverTimestamp() });
    });
  }
  async cleanupDeleted(uid: string): Promise<{ deleted: number; done: boolean }> {
    if (!(await this.config(uid))?.deleted)
      conflict('Shared-game deletion is not ready. Refresh the page, then confirm deletion.');
    const deleted = await this.cleanupSharing(uid);
    const batch = writeBatch(this.db);
    batch.delete(this.ref('friendShelfHeads', uid));
    batch.delete(this.ref('friendShelfRegistry', uid));
    await batch.commit();
    return { deleted, done: true };
  }
  async exportOwn(uid: string): Promise<{ format: 1; config: FriendShelfConfig | null; shelf: FriendShelf | null }> {
    const config = await this.config(uid);
    const head = await this.head(uid);
    const shelf =
      head?.current &&
      config?.enabled &&
      !config.deleted &&
      config.epoch === head.epoch &&
      config.revision === head.settingsRevision
        ? await this.shelf(uid)
        : null;
    return { format: 1, config, shelf };
  }
}

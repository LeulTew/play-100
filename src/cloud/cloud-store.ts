import { collection, doc, getDocFromServer, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import type { DocumentData, Firestore, Transaction } from 'firebase/firestore';
import type { PersonalLibraryState } from '../lib/personal-types';
import { creatorRanks } from '../lib/cloud-types';
import type { CreatorRank, SnapshotChunk, SnapshotManifest, SyncHead } from '../lib/cloud-types';
import { packLibrary, packSnapshot, parseManifest, unpackLibrary, unpackSnapshot } from '../lib/snapshot-transport';
import { ensureAccountActivity } from './account-lifecycle';
import { parseFriendAllHead } from '../lib/friend-all-transport';

export class RemoteConflict extends Error {
  readonly head: SyncHead;
  constructor(head: SyncHead) { super('The online copy changed on another device. Both copies are safe; choose which to keep.'); this.name = 'RemoteConflict'; this.head = head; }
}

export class SyncRevoked extends Error {
  constructor() { super('Online saving was stopped or deleted from another session. Your local copy is safe; reconnect explicitly.'); this.name = 'SyncRevoked'; }
}

export function parseHead(value: DocumentData): SyncHead {
  const fields = ['format', 'epoch', 'revision', 'enabled', 'deleted', 'current', 'previous', 'updatedAt'];
  if (Object.keys(value).sort().join() !== fields.sort().join() || value.format !== 1 ||
    !Number.isSafeInteger(value.epoch) || value.epoch < 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    typeof value.enabled !== 'boolean' || typeof value.deleted !== 'boolean' ||
    !(value.updatedAt instanceof Timestamp)) throw new Error('The online sync head has an unsupported format. Your local data has not been replaced.');
  return {
    format: 1, epoch: value.epoch, revision: value.revision, enabled: value.enabled, deleted: value.deleted,
    current: value.current === null ? null : parseManifest(value.current),
    previous: value.previous === null ? null : parseManifest(value.previous), updatedAt: value.updatedAt.toMillis(),
  };
}

function sameHead(head: SyncHead, expected: Pick<SyncHead, 'epoch' | 'revision'>): void {
  if (!head.enabled || head.deleted || head.epoch !== expected.epoch) throw new SyncRevoked();
  if (head.revision !== expected.revision) throw new RemoteConflict(head);
}

export class CloudStore {
  constructor(readonly db: Firestore, readonly uid: string) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Unsupported online account identity.');
  }
  private headRef() { return doc(this.db, 'syncHeads', this.uid); }
  private registryRef() { return doc(this.db, 'accounts', this.uid, 'metadata', 'registry'); }
  private generationRef(id: string) { return doc(this.db, 'accounts', this.uid, 'generations', id); }
  private chunkRef(kind: 'private' | 'ranking', digest: string) { return doc(this.db, kind === 'private' ? 'accounts' : 'creatorRanks', this.uid, 'chunks', digest); }
  private sharingHeads(tx: Transaction) {
    return Promise.all(['games', 'ranking'].map(kind => tx.get(doc(this.db, 'friendAllHeads', this.uid, 'views', kind))));
  }

  async head(): Promise<SyncHead | null> {
    const result = await getDocFromServer(this.headRef());
    return result.exists() ? parseHead(result.data()) : null;
  }

  watch(onHead: (head: SyncHead | null) => void, onError: (error: Error) => void): () => void {
    return onSnapshot(this.headRef(), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      try { onHead(snapshot.exists() ? parseHead(snapshot.data()) : null); }
      catch (error) { onError(error instanceof Error ? error : new Error('Online state is unreadable.')); }
    }, onError);
  }

  async download(head: SyncHead, previous = false, isCurrent: () => boolean = () => true): Promise<PersonalLibraryState | null> {
    const manifest = previous ? head.previous : head.current;
    if (!manifest) return null;
    return unpackLibrary(manifest, async (digest) => {
      if (!isCurrent()) { const error = new Error('The account session changed before downloading.'); error.name = 'SyncSessionEnded'; throw error; }
      const snapshot = await getDocFromServer(this.chunkRef('private', digest));
      return snapshot.exists() ? snapshot.data() : undefined;
    });
  }

  async ranking(): Promise<CreatorRank[]> {
    const head = await getDocFromServer(doc(this.db, 'creatorRanks', this.uid));
    if (!head.exists() || !head.data().current) return [];
    const data = await unpackSnapshot(head.data().current, async (digest) => {
      const part = await getDocFromServer(this.chunkRef('ranking', digest));
      return part.exists() ? part.data() : undefined;
    });
    if (!Array.isArray(data) || data.length > 10_000) throw new Error('The member ranking summary is invalid.');
    return data.map((entry: unknown, index) => {
      if (!entry || typeof entry !== 'object' || Object.keys(entry).sort().join() !== 'id,position,score,title' ||
        !('position' in entry) || entry.position !== index + 1 || !('id' in entry) || typeof entry.id !== 'string' ||
        !('title' in entry) || typeof entry.title !== 'string' || entry.title.length > 200 ||
        !('score' in entry) || (entry.score !== null && (typeof entry.score !== 'number' || !Number.isFinite(entry.score) || entry.score < 0 || entry.score > 10))) {
        throw new Error('The member ranking contains unsupported fields. It was not displayed.');
      }
      return { id: entry.id, position: index + 1, title: entry.title, score: entry.score };
    });
  }

  async enable(expected: SyncHead | null): Promise<SyncHead> {
    await ensureAccountActivity(this.db, this.uid);
    return runTransaction(this.db, async (tx) => {
      const [snapshot, shared] = await Promise.all([tx.get(this.headRef()), this.sharingHeads(tx)]);
      const current = snapshot.exists() ? parseHead(snapshot.data()) : null;
      if ((current?.revision ?? 0) !== (expected?.revision ?? 0) || (current?.epoch ?? 0) !== (expected?.epoch ?? 0)) {
        if (current) throw new RemoteConflict(current);
        throw new Error('Online saving changed. Refresh before connecting.');
      }
      if (current?.enabled && !current.deleted) return current;
      const next: SyncHead = {
        format: 1, epoch: (current?.epoch ?? 0) + 1, revision: current ? current.revision + 1 : 0,
        enabled: true, deleted: false, current: current?.current ?? null, previous: current?.previous ?? null, updatedAt: Date.now(),
      };
      tx.set(this.headRef(), { ...next, updatedAt: serverTimestamp() });
      for (const view of shared) if (view.exists() && parseFriendAllHead(view.data()).status === 'ready') tx.update(view.ref, { status: 'updating', revision: parseFriendAllHead(view.data()).revision + 1, updatedAt: serverTimestamp() });
      return next;
    });
  }

  private async register(manifest: SnapshotManifest, ranking: SnapshotManifest, expected: SyncHead): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const [head, registry] = await Promise.all([tx.get(this.headRef()), tx.get(this.registryRef())]);
      if (!head.exists()) throw new SyncRevoked();
      sameHead(parseHead(head.data()), expected);
      const ids: string[] = registry.exists() ? registry.data().ids : [];
      if (!Array.isArray(ids) || ids.length >= 128) throw new Error('Too many unfinished online snapshots. Run storage cleanup in Account before retrying. Local edits are safe.');
      tx.set(this.generationRef(manifest.generation), { private: manifest, ranking, epoch: expected.epoch, status: 'staging', createdAt: serverTimestamp() });
      tx.set(this.registryRef(), { ids: [...ids, manifest.generation], revision: registry.exists() ? registry.data().revision + 1 : 1 });
    });
  }

  private async putChunk(kind: 'private' | 'ranking', chunk: SnapshotChunk, generation: string): Promise<void> {
    const ref = this.chunkRef(kind, chunk.digest);
    await runTransaction(this.db, async (tx) => {
      const current = await tx.get(ref);
      if (current.exists()) {
        const saved = current.data();
        if (saved.data !== chunk.data || saved.bytes !== chunk.bytes || saved.digest !== chunk.digest || !Array.isArray(saved.holders)) throw new Error('A previously stored online chunk failed validation. Your local copy is retained.');
        if (!saved.holders.includes(generation)) tx.update(ref, { holders: [...saved.holders, generation], holder: generation });
      } else tx.set(ref, { ...chunk, holders: [generation], holder: generation, createdAt: serverTimestamp() });
    });
  }

  async upload(state: PersonalLibraryState, expected: SyncHead, afterChunk?: () => Promise<void>, isCurrent: () => boolean = () => true): Promise<SyncHead> {
    const guard = () => {
      if (!isCurrent()) { const error = new Error('This online session ended. Its local copy remains pending.'); error.name = 'SyncSessionEnded'; throw error; }
    };
    guard();
    await ensureAccountActivity(this.db, this.uid);
    const [snapshot, summary] = await Promise.all([packLibrary(state), packSnapshot(creatorRanks(state))]);
    guard();
    summary.manifest.generation = snapshot.manifest.generation;
    if (expected.current?.digest === snapshot.manifest.digest) {
      const fresh = await this.head();
      if (!fresh || !fresh.enabled || fresh.deleted || fresh.epoch !== expected.epoch) throw new SyncRevoked();
      if (fresh.current?.digest !== snapshot.manifest.digest) throw new RemoteConflict(fresh);
      return fresh;
    }
    try { await this.register(snapshot.manifest, summary.manifest, expected); }
    catch (error) {
      if (error instanceof RemoteConflict && error.head.enabled && !error.head.deleted && error.head.epoch === expected.epoch && error.head.current?.digest === snapshot.manifest.digest) return error.head;
      throw error;
    }
    for (const [kind, chunks] of [['private', snapshot.chunks], ['ranking', summary.chunks]] as const) {
      for (let index = 0; index < chunks.length; index += 3) {
        guard();
        await Promise.all(chunks.slice(index, index + 3).map((chunk) => this.putChunk(kind, chunk, snapshot.manifest.generation)));
        if (afterChunk) await afterChunk();
      }
    }
    await runTransaction(this.db, async (tx) => {
      const [head, generation] = await Promise.all([tx.get(this.headRef()), tx.get(this.generationRef(snapshot.manifest.generation))]);
      if (!head.exists() || !generation.exists() || generation.data().status !== 'staging') throw new Error('The staged online snapshot is no longer available. Your local copy remains pending.');
      sameHead(parseHead(head.data()), expected);
      guard();
      tx.update(this.generationRef(snapshot.manifest.generation), { status: 'ready' });
    });
    return runTransaction(this.db, async (tx) => {
      const summaryRef = doc(this.db, 'creatorRanks', this.uid);
      const [head, previousSummary, generation, shared] = await Promise.all([tx.get(this.headRef()), tx.get(summaryRef), tx.get(this.generationRef(snapshot.manifest.generation)), this.sharingHeads(tx)]);
      if (!head.exists()) throw new SyncRevoked();
      const current = parseHead(head.data());
      if (current.enabled && current.epoch === expected.epoch && current.current?.digest === snapshot.manifest.digest) return current;
      sameHead(current, expected);
      guard();
      if (!generation.exists() || generation.data().status !== 'ready') throw new Error('The complete snapshot could not be committed. Retry online saving.');
      const next = { ...current, revision: current.revision + 1, current: snapshot.manifest, previous: current.current, updatedAt: Date.now() };
      tx.set(this.headRef(), { ...next, updatedAt: serverTimestamp() });
      for (const view of shared) if (view.exists() && parseFriendAllHead(view.data()).status === 'ready') tx.update(view.ref, { status: 'updating', revision: parseFriendAllHead(view.data()).revision + 1, updatedAt: serverTimestamp() });
      tx.set(summaryRef, { format: 1, epoch: next.epoch, revision: next.revision, current: summary.manifest, previous: previousSummary.exists() ? previousSummary.data().current : null, updatedAt: serverTimestamp() });
      tx.update(doc(this.db, 'members', this.uid), { rankCount: state.ranking.length, gameCount: Object.keys(state.records).length, updatedAt: serverTimestamp() });
      return next;
    });
  }

  async revoke(expected: SyncHead | null, remove = false): Promise<SyncHead> {
    await ensureAccountActivity(this.db, this.uid);
    return runTransaction(this.db, async (tx) => {
      const [current, shared] = await Promise.all([tx.get(this.headRef()), this.sharingHeads(tx)]);
      if (!current.exists()) {
        if (!remove || expected) throw new SyncRevoked();
        const deleted: SyncHead = { format: 1, enabled: false, deleted: true, epoch: 1, revision: 0, current: null, previous: null, updatedAt: Date.now() };
        tx.set(this.headRef(), { ...deleted, updatedAt: serverTimestamp() });
        return deleted;
      }
      const head = parseHead(current.data());
      if (remove && head.deleted) return head;
      if (!expected || head.revision !== expected.revision || head.epoch !== expected.epoch) throw new RemoteConflict(head);
      const next: SyncHead = { ...head, enabled: false, deleted: remove, epoch: head.epoch + 1, revision: head.revision + 1, current: remove ? null : head.current, previous: remove ? null : head.previous, updatedAt: Date.now() };
      tx.set(this.headRef(), { ...next, updatedAt: serverTimestamp() });
      for (const view of shared) if (view.exists() && parseFriendAllHead(view.data()).status === 'ready') tx.update(view.ref, { status: 'updating', revision: parseFriendAllHead(view.data()).revision + 1, updatedAt: serverTimestamp() });
      if (remove) tx.delete(doc(this.db, 'creatorRanks', this.uid));
      return next;
    });
  }

  private async retained(tx: Transaction): Promise<Set<string>> {
    const head = await tx.get(this.headRef());
    if (!head.exists()) return new Set();
    const parsed = parseHead(head.data());
    return new Set([parsed.current?.generation, parsed.previous?.generation].filter((id): id is string => Boolean(id)));
  }

  async cleanup(all = false): Promise<number> {
    const registry = await getDocFromServer(this.registryRef());
    if (!registry.exists()) return 0;
    const ids: unknown = registry.data().ids;
    if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) throw new Error('Online cleanup metadata is invalid. Nothing was deleted.');
    let count = 0;
    const deletedChunks = new Set<string>();
    for (const id of ids) {
      if (!all && count >= 4) break;
      const generation = await runTransaction(this.db, async (tx) => {
        const retained = await this.retained(tx);
        const candidate = await tx.get(this.generationRef(id));
        if (!candidate.exists() || retained.has(id)) return null;
        const data = candidate.data();
        if (!(data.createdAt instanceof Timestamp)) throw new Error('Online cleanup timestamp is invalid.');
        const age = Date.now() - data.createdAt.toMillis();
        if (!all && data.status !== 'deleting' && age < (data.status === 'staging' ? 300000 : 30000)) return null;
        const manifests = { private: parseManifest(data.private), ranking: parseManifest(data.ranking) };
        if (data.status !== 'deleting') tx.update(this.generationRef(id), { status: 'deleting' });
        return manifests;
      });
      if (!generation) continue;
      for (const kind of ['private', 'ranking'] as const) {
        for (const digest of generation[kind].chunks) {
          const ref = this.chunkRef(kind, digest);
          if (all) {
            const key = `${kind}:${digest}`;
            if (!deletedChunks.has(key)) {
              const batch = writeBatch(this.db);
              batch.delete(ref);
              await batch.commit();
              deletedChunks.add(key);
            }
            continue;
          }
          await runTransaction(this.db, async (tx) => {
            const chunk = await tx.get(ref);
            if (!chunk.exists()) return;
            const holders = chunk.data().holders;
            if (!Array.isArray(holders)) throw new Error('Online chunk references are invalid; cleanup was stopped.');
            const kept = holders.filter((holder: unknown) => holder !== id);
            if (kept.length) tx.update(ref, { holders: kept, holder: id });
            else tx.delete(ref);
          });
        }
      }
      await runTransaction(this.db, async (tx) => {
        const retained = await this.retained(tx);
        const current = await tx.get(this.registryRef());
        if (retained.has(id)) throw new Error('A retained snapshot changed during cleanup. Nothing further was deleted.');
        if (current.exists()) tx.update(this.registryRef(), { ids: current.data().ids.filter((value: string) => value !== id), revision: current.data().revision + 1 });
        tx.delete(this.generationRef(id));
      });
      count += 1;
    }
    return count;
  }
}

export async function creatorAccess(db: Firestore): Promise<boolean> {
  try { return (await getDocFromServer(doc(db, 'ownerAccess', 'status'))).exists(); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') return false;
    throw error;
  }
}

export async function listMembers(db: Firestore) {
  return getDocs(query(collection(db, 'members'), orderBy('updatedAt', 'desc'), limit(20)));
}

export async function deleteOwnMember(db: Firestore, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'members', uid));
  await batch.commit();
}

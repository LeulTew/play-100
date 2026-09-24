import {
  collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, onSnapshot, orderBy,
  query, runTransaction, serverTimestamp, startAfter, where, writeBatch,
} from 'firebase/firestore';
import type { DocumentData, DocumentReference, Firestore, QueryDocumentSnapshot } from 'firebase/firestore';
import type { FriendAllEntry, FriendAllKind, FriendAllPolicy } from '../lib/friend-all';
import { FRIEND_ALL_EXACT_LIMIT, FRIEND_ALL_LIMIT, FRIEND_ALL_PAGE_SIZE, friendAllEntrySignature, planFriendAllChanges } from '../lib/friend-all';
import {
  FRIEND_ALL_OWNER_PAGE, FRIEND_ALL_TRACKED_WRITE_GROUP, FRIEND_ALL_WRITE_GROUP, friendAllId, parseFriendAllEntry, parseFriendAllHead,
  parseFriendAllJob, parseFriendAllPolicy, parseFriendAllRow,
} from '../lib/friend-all-transport';
import type { FriendAllHead, FriendAllJob } from '../lib/friend-all-transport';
import {
  FriendStoreError, friendUid, parseFriendSettings, parseFriendSource,
} from '../lib/friend-types';
import type { FriendCursor, FriendSettings, FriendSourceRevision } from '../lib/friend-types';
import { parseFriendShelfConfig, parseFriendShelfHead, sameShelfSource } from '../lib/friend-shelf-types';
import type { FriendShelfConfig } from '../lib/friend-shelf-types';
import { parseHead } from './cloud-store';

export interface FriendAllControls {
  policy: FriendAllPolicy | null;
  ranking: FriendSettings | null;
  shelf: FriendShelfConfig | null;
}
export interface FriendAllPage {
  head: FriendAllHead; entries: FriendAllEntry[]; cursor: FriendCursor | undefined;
}
export interface FriendAllProgress { kind: FriendAllKind; applied: number; total: number; targetCount: number; ready: boolean }
export class FriendAllCommittedError extends FriendStoreError {
  readonly committed = true;
  constructor(readonly uid: string, readonly operation: 'policy' | 'publish', readonly cause: unknown, readonly kind?: FriendAllKind) {
    super('committed-refresh-failed', 'The sharing change was acknowledged. Refresh its status instead of repeating the change.');
    this.name = 'FriendAllCommittedError';
  }
}
function conflict(message = 'The account or sharing controls changed. Refresh before continuing.'): never { throw new FriendStoreError('conflict', message); }
function online() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new FriendStoreError('offline', 'Reconnect before changing automatic friend sharing.');
}
function controlsMatch(a: FriendAllControls, b: FriendAllControls): boolean {
  return a.policy?.revision === b.policy?.revision && a.ranking?.revision === b.ranking?.revision && a.shelf?.revision === b.shelf?.revision;
}
function policyMatches(policy: FriendAllPolicy, controls: FriendAllControls): boolean {
  return controls.policy?.epoch === policy.epoch && controls.policy.revision === policy.revision && controls.policy.enabled && !controls.policy.deleted &&
    controls.ranking?.enabled === true && !controls.ranking.deleted && !controls.ranking.selectedIds.length &&
    controls.ranking.epoch === policy.ranking.epoch && controls.ranking.revision === policy.ranking.revision &&
    controls.shelf?.enabled === true && !controls.shelf.deleted && !controls.shelf.selectedIds.length &&
    controls.shelf.epoch === policy.shelf.epoch && controls.shelf.revision === policy.shelf.revision && controls.shelf.consentSyncEpoch === policy.syncEpoch;
}
function sameJob(a: FriendAllJob | null, b: FriendAllJob | null): boolean {
  return a?.token === b?.token && a?.applied === b?.applied && a?.count === b?.count;
}
async function digest(entries: readonly FriendAllEntry[]): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(entries.map(friendAllEntrySignature)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class FriendAllStore {
  private cache = new Map<string, { epoch: number; digest: string; entries: FriendAllEntry[] }>();
  private preparedEpochs = new Set<string>();
  constructor(readonly db: Firestore) {}
  private policyRef(uid: string) { return doc(this.db, 'friendAllPolicies', friendUid(uid)); }
  private headRef(uid: string, kind: FriendAllKind) { return doc(this.db, 'friendAllHeads', friendUid(uid), 'views', kind); }
  private jobRef(uid: string, kind: FriendAllKind) { return doc(this.db, 'friendAllJobs', friendUid(uid), 'views', kind); }
  private rows(uid: string, kind: FriendAllKind) { return collection(this.db, kind === 'games' ? 'friendAllGames' : 'friendAllRankings', friendUid(uid), 'entries'); }
  private async read<T>(ref: DocumentReference<DocumentData>, parse: (value: unknown) => T): Promise<T | null> {
    const value = await getDocFromServer(ref);
    return value.exists() ? parse(value.data()) : null;
  }
  private async confirmed<T>(ref: DocumentReference<DocumentData>, parse: (value: unknown) => T): Promise<T | null> {
    return runTransaction(this.db, async tx => { const value = await tx.get(ref); return value.exists() ? parse(value.data()) : null; }, { maxAttempts: 3 });
  }
  private watch<T>(ref: DocumentReference<DocumentData>, parse: (value: unknown) => T, next: (value: T | null) => void, error: (cause: Error) => void) {
    return onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      try { next(snapshot.exists() ? parse(snapshot.data()) : null); }
      catch (cause) { error(cause instanceof Error ? cause : new Error('Automatic sharing could not be read.')); }
    }, error);
  }
  policy(uid: string) { return this.read(this.policyRef(uid), value => parseFriendAllPolicy(value, uid)); }
  watchPolicy(uid: string, next: (value: FriendAllPolicy | null) => void, error: (cause: Error) => void) {
    return this.watch(this.policyRef(uid), value => parseFriendAllPolicy(value, uid), next, error);
  }
  head(uid: string, kind: FriendAllKind) { return this.read(this.headRef(uid, kind), parseFriendAllHead); }
  async progress(uid: string, kind: FriendAllKind, epoch?: number): Promise<FriendAllProgress | null> {
    const [job, head] = await Promise.all([this.read(this.jobRef(uid, kind), parseFriendAllJob), this.head(uid, kind)]);
    return job && (epoch === undefined || epoch === job.epoch) ? { kind, applied: job.applied, total: job.total, targetCount: job.targetCount,
      ready: head?.status === 'ready' && head.epoch === job.epoch && head.digest === job.digest && head.source.remoteRevision === job.source.remoteRevision } : null;
  }
  watchHead(uid: string, kind: FriendAllKind, next: (value: FriendAllHead | null) => void, error: (cause: Error) => void) {
    return this.watch(this.headRef(uid, kind), parseFriendAllHead, next, error);
  }
  async controls(uid: string): Promise<FriendAllControls> {
    const [policy, ranking, shelf] = await Promise.all([
      this.policy(uid), this.read(doc(this.db, 'friendSettings', uid), parseFriendSettings),
      this.read(doc(this.db, 'friendShelfSettings', uid), parseFriendShelfConfig),
    ]);
    return { policy, ranking, shelf };
  }
  async setPolicy(uid: string, enabled: boolean, origin: 'default' | 'explicit', expected: FriendAllControls, isCurrent: () => boolean): Promise<FriendAllPolicy | null> {
    if (origin === 'default' && !enabled) throw new FriendStoreError('invalid', 'Default sharing can only initialize an eligible new setup.');
    const guard = () => { online(); if (!isCurrent()) conflict(); };
    guard(); await this.policy(uid); guard();
    const ref = this.policyRef(uid); const rankingRef = doc(this.db, 'friendSettings', uid); const shelfRef = doc(this.db, 'friendShelfSettings', uid);
    const changed = await runTransaction(this.db, async tx => {
      guard();
      const [policySnap, rankingSnap, shelfSnap, syncSnap, shelfHead] = await Promise.all([
        tx.get(ref), tx.get(rankingRef), tx.get(shelfRef), tx.get(doc(this.db, 'syncHeads', uid)), tx.get(doc(this.db, 'friendShelfHeads', uid)),
      ]);
      const old: FriendAllControls = {
        policy: policySnap.exists() ? parseFriendAllPolicy(policySnap.data(), uid) : null,
        ranking: rankingSnap.exists() ? parseFriendSettings(rankingSnap.data()) : null,
        shelf: shelfSnap.exists() ? parseFriendShelfConfig(shelfSnap.data()) : null,
      };
      const sync = syncSnap.exists() ? parseHead(syncSnap.data()) : null;
      if (old.policy?.deleted || old.ranking?.deleted || old.shelf?.deleted || enabled && sync?.deleted) throw new FriendStoreError('deleted', 'This account has been revoked. Automatic sharing cannot be enabled.');
      if (origin === 'default' && (old.policy || old.ranking || old.shelf)) return false;
      if (!controlsMatch(old, expected)) conflict();
      if (enabled && (!sync?.enabled || sync.deleted)) throw new FriendStoreError('unavailable', 'Turn on account saving before sharing its games.');
      const epoch = sync?.epoch ?? old.policy?.syncEpoch;
      if (!epoch) throw new FriendStoreError('unavailable', 'This account does not have a saving consent to share.');
      const ranking = { epoch: (old.ranking?.epoch ?? 0) + 1, revision: (old.ranking?.revision ?? 0) + 1 };
      const shelf = { epoch: (old.shelf?.epoch ?? 0) + 1, revision: (old.shelf?.revision ?? 0) + 1 };
      guard();
      tx.set(rankingRef, { format: 1, enabled, deleted: false, selection: '', ...ranking, updatedAt: serverTimestamp() });
      tx.set(shelfRef, { format: 1, enabled, deleted: false, selection: '', consentSyncEpoch: enabled ? epoch : null, ...shelf, updatedAt: serverTimestamp() });
      if (shelfHead.exists()) tx.update(shelfHead.ref, { revision: parseFriendShelfHead(shelfHead.data()).revision + 1, updatedAt: serverTimestamp() });
      tx.set(ref, { format: 2, uid, enabled, deleted: false, origin, epoch: (old.policy?.epoch ?? 0) + 1,
        revision: (old.policy?.revision ?? 0) + 1, syncEpoch: epoch, ranking, shelf, updatedAt: serverTimestamp() });
      return true;
    });
    if (!changed) return this.policy(uid);
    try { guard(); return await this.confirmed(ref, value => parseFriendAllPolicy(value, uid)); }
    catch (cause) { throw new FriendAllCommittedError(uid, 'policy', cause); }
  }
  async page(uid: string, kind: FriendAllKind, cursor?: FriendCursor, expectedRevision?: number): Promise<FriendAllPage> {
    const head = await this.head(uid, kind);
    if (!head || head.status !== 'ready') throw new FriendStoreError('unavailable', 'This shared account view is still updating or unavailable.');
    if (expectedRevision !== undefined && head.revision !== expectedRevision) conflict('The shared list changed. Refresh its first page.');
    const result = await getDocsFromServer(query(this.rows(uid, kind), ...(head.format === 3 ? [where('format', '==', 3)] : []), where('epoch', '==', head.epoch), where('active', '==', true),
      orderBy(kind === 'games' ? 'entry.title' : 'entry.position'), orderBy(documentId()),
      ...(cursor ? [startAfter(cursor)] : []), limit(FRIEND_ALL_PAGE_SIZE)));
    const entries = result.docs.map(row => {
      const value = parseFriendAllRow(row.data(), row.id, kind);
      if (!value.active || !value.entry || value.epoch !== head.epoch || value.format !== head.format) throw new FriendStoreError('invalid', 'The shared page contains an invalid entry.');
      return value.entry;
    });
    await this.requireSameHead(uid, kind, head);
    return { head, entries, cursor: result.size === FRIEND_ALL_PAGE_SIZE ? result.docs.at(-1) : undefined };
  }
  async exact(uid: string, kind: FriendAllKind, input: readonly string[]): Promise<{ head: FriendAllHead; entries: FriendAllEntry[]; resolvedIds: string[] }> {
    if (!input.length || input.length > FRIEND_ALL_EXACT_LIMIT || new Set(input).size !== input.length) throw new FriendStoreError('invalid', 'Choose one to six distinct game identities.');
    const ids = input.map(friendAllId);
    const head = await this.head(uid, kind);
    if (!head || head.status !== 'ready') throw new FriendStoreError('unavailable', 'This shared account view is still updating or unavailable.');
    const rows = await Promise.all(ids.map(id => getDocFromServer(doc(this.rows(uid, kind), id))));
    const entries = rows.flatMap(row => {
      if (!row.exists()) return [];
      const value = parseFriendAllRow(row.data(), row.id, kind);
      if (!value.active) return [];
      if (!value.entry || value.epoch !== head.epoch || value.format !== head.format || !ids.includes(value.entry.id)) throw new FriendStoreError('invalid', 'The shared lookup contains an invalid entry.');
      return [value.entry];
    });
    await this.requireSameHead(uid, kind, head);
    return { head, entries, resolvedIds: ids };
  }
  private async requireSameHead(uid: string, kind: FriendAllKind, expected: FriendAllHead) {
    const latest = await this.head(uid, kind);
    if (!latest || latest.status !== 'ready' || latest.revision !== expected.revision || latest.epoch !== expected.epoch || latest.digest !== expected.digest) conflict('The shared account view changed while reading. Refresh it.');
  }
  private async inventory(uid: string, kind: FriendAllKind, epoch: number): Promise<{ job: FriendAllJob | null; entries: FriendAllEntry[] }> {
    const before = await this.read(this.jobRef(uid, kind), parseFriendAllJob);
    const entries: FriendAllEntry[] = []; let cursor: FriendCursor | undefined;
    do {
      const page = await getDocsFromServer(query(this.rows(uid, kind), where('epoch', '==', epoch), where('active', '==', true), orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []), limit(FRIEND_ALL_OWNER_PAGE)));
      for (const item of page.docs) {
        const row = parseFriendAllRow(item.data(), item.id, kind);
        if (before?.format === 3 && row.format === 2) continue;
        if (!row.entry || !row.active || row.epoch !== epoch) throw new FriendStoreError('invalid', 'The sharing inventory is inconsistent.');
        entries.push(row.entry);
      }
      if (entries.length > FRIEND_ALL_LIMIT) throw new FriendStoreError('limit', 'The shared account inventory exceeds its supported limit.');
      cursor = page.size === FRIEND_ALL_OWNER_PAGE ? page.docs.at(-1) : undefined;
    } while (cursor);
    const after = await this.read(this.jobRef(uid, kind), parseFriendAllJob);
    if (!sameJob(before, after)) conflict('Another tab is updating this sharing inventory.');
    if (entries.length !== (after?.epoch === epoch ? after.count : 0)) throw new FriendStoreError('invalid', 'The sharing count does not match its stored inventory.');
    return { job: after, entries };
  }
  private async releaseRows(uid: string, kind: FriendAllKind, rows: readonly QueryDocumentSnapshot<DocumentData>[]) {
    const legacy = rows.filter(row => row.data().format === 2);
    for (let index = 0; index < legacy.length; index += 4) {
      const batch = writeBatch(this.db);
      legacy.slice(index, index + 4).forEach(row => batch.delete(row.ref));
      await batch.commit();
    }
    for (const known of rows.filter(row => row.data().format !== 2)) await runTransaction(this.db, async tx => {
      const ref = known.ref;
      const row = await tx.get(ref);
      if (!row.exists()) return;
      const parsed = parseFriendAllRow(row.data(), row.id, kind);
      if (parsed.format === 2) { tx.delete(ref); return; }
      const jobRef = this.jobRef(uid, kind);
      const snapshot = await tx.get(jobRef);
      const job = snapshot.exists() ? parseFriendAllJob(snapshot.data()) : null;
      if (!job || job.format !== 3 || job.count < 1) throw new FriendStoreError('invalid', 'Some shared copies could not be checked. Try again later.');
      tx.delete(ref);
      tx.update(jobRef, { count: job.count - 1, last: [row.id], updatedAt: serverTimestamp() });
    });
  }
  private async prepareEpoch(uid: string, kind: FriendAllKind, epoch: number, guard: () => void) {
    const key = `${uid}:${kind}:${epoch}`;
    if (this.preparedEpochs.has(key)) return;
    for (;;) {
      guard();
      const stale = await getDocsFromServer(query(this.rows(uid, kind), where('epoch', '<', epoch), limit(FRIEND_ALL_OWNER_PAGE)));
      if (stale.empty) break;
      await this.releaseRows(uid, kind, stale.docs);
    }
    this.preparedEpochs.add(key);
  }
  private async pruneInactive(uid: string, kind: FriendAllKind, guard: () => void) {
    for (;;) {
      guard();
      const inactive = await getDocsFromServer(query(this.rows(uid, kind), where('active', '==', false), limit(FRIEND_ALL_OWNER_PAGE)));
      if (inactive.empty) return;
      await this.releaseRows(uid, kind, inactive.docs);
    }
  }
  private async pruneLegacy(uid: string, kind: FriendAllKind, guard: () => void) {
    for (let page = 0; page < 200; page += 1) {
      guard();
      const legacy = await getDocsFromServer(query(this.rows(uid, kind), where('format', '==', 2), limit(FRIEND_ALL_OWNER_PAGE)));
      if (legacy.empty) return;
      await this.releaseRows(uid, kind, legacy.docs);
    }
    throw new FriendStoreError('limit', 'Older shared copies still need cleanup. Refresh sharing status to continue.');
  }
  async publish(uid: string, kind: FriendAllKind, input: readonly FriendAllEntry[], policy: FriendAllPolicy, sourceInput: FriendSourceRevision, isCurrent: () => boolean, progress?: (value: FriendAllProgress) => void): Promise<FriendAllHead> {
    const guard = () => { online(); if (!isCurrent()) conflict(); };
    const source = parseFriendSource(sourceInput);
    if (policy.uid !== uid) throw new FriendStoreError('invalid', 'This sharing policy belongs to another account.');
    const entries = input.map(value => parseFriendAllEntry(value, kind)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (entries.length > FRIEND_ALL_LIMIT || new Set(entries.map(entry => entry.id)).size !== entries.length) throw new FriendStoreError('limit', 'Automatic sharing supports 10,000 distinct account games without truncation.');
    const targetDigest = await digest(entries);
    guard();
    const controls = await this.controls(uid);
    if (!policyMatches(policy, controls) || source.syncEpoch !== policy.syncEpoch) conflict();
    const publicHead = await this.head(uid, kind);
    const cacheKey = `${uid}:${kind}`; const cached = this.cache.get(cacheKey);
    const policyRef = this.policyRef(uid); const headRef = this.headRef(uid, kind); const jobRef = this.jobRef(uid, kind); const syncRef = doc(this.db, 'syncHeads', uid);
    const checkSource = (data: DocumentData | undefined) => {
      const head = data ? parseHead(data) : null;
      if (!head?.enabled || head.deleted || head.epoch !== source.syncEpoch || head.revision !== source.remoteRevision) conflict('Wait for the current account copy to finish saving before sharing.');
    };
    if (publicHead?.format === 3 && publicHead.status === 'ready' && publicHead.epoch === policy.epoch && publicHead.policyRevision === policy.revision &&
      publicHead.digest === targetDigest && sameShelfSource(publicHead.source, source)) {
      return runTransaction(this.db, async tx => {
        guard();
        const [head, sync, control, ranking, shelf] = await Promise.all([tx.get(headRef), tx.get(syncRef), tx.get(policyRef),
          tx.get(doc(this.db, 'friendSettings', uid)), tx.get(doc(this.db, 'friendShelfSettings', uid))]);
        checkSource(sync.data());
        const current = head.exists() ? parseFriendAllHead(head.data()) : null;
        const currentPolicy = control.exists() ? parseFriendAllPolicy(control.data(), uid) : null;
        const confirmedControls = { policy: currentPolicy, ranking: ranking.exists() ? parseFriendSettings(ranking.data()) : null, shelf: shelf.exists() ? parseFriendShelfConfig(shelf.data()) : null };
        if (!policyMatches(policy, confirmedControls) ||
          current?.status !== 'ready' || current.revision !== publicHead.revision) conflict();
        this.cache.set(cacheKey, { epoch: policy.epoch, digest: targetDigest, entries });
        return current;
      });
    }
    await this.prepareEpoch(uid, kind, policy.epoch, guard);
    await this.pruneInactive(uid, kind, guard);
    const observedJob = await this.read(this.jobRef(uid, kind), parseFriendAllJob);
    const initial = cached?.epoch === policy.epoch && observedJob?.epoch === policy.epoch && observedJob.applied === observedJob.total && cached.digest === observedJob.digest
      ? { entries: cached.entries, job: observedJob } : await this.inventory(uid, kind, policy.epoch);
    guard();
    const operationsFor = (format: 2 | 3) => {
      const changes = planFriendAllChanges(format === 3 && initial.job?.format !== 3 ? [] : initial.entries, entries);
      return [...changes.removals.map(id => ({ id, entry: null })), ...changes.upserts.map(entry => ({ id: entry.id, entry }))];
    };
    const begin = (format: 2 | 3) => runTransaction(this.db, async tx => {
      guard();
      const [control, currentHead, currentJob, sync] = await Promise.all([tx.get(policyRef), tx.get(headRef), tx.get(jobRef), tx.get(syncRef)]);
      const latest = control.exists() ? parseFriendAllPolicy(control.data(), uid) : null;
      if (!latest?.enabled || latest.deleted || latest.epoch !== policy.epoch || latest.revision !== policy.revision) conflict();
      checkSource(sync.data());
      const head = currentHead.exists() ? parseFriendAllHead(currentHead.data()) : null;
      const old = currentJob.exists() ? parseFriendAllJob(currentJob.data()) : null;
      if (!sameJob(old, initial.job)) conflict('Another tab advanced the sharing update.');
      const operations = operationsFor(format);
      if (head?.format === format && head.status === 'updating' && old?.format === format && old.epoch === policy.epoch && old.policyRevision === policy.revision && old.digest === targetDigest &&
        sameShelfSource(old.source, source) && old.total - old.applied === operations.length) return old;
      const revision = (head?.revision ?? 0) + 1;
      const next: FriendAllJob = { format, epoch: policy.epoch, policyRevision: policy.revision, source, token: crypto.randomUUID(),
        digest: targetDigest, targetCount: entries.length, count: format === 3 ? old?.format === 3 ? old.count : 0 : initial.entries.length,
        total: operations.length, applied: 0, last: [], headRevision: revision, updatedAt: 0 };
      tx.set(headRef, { format, epoch: policy.epoch, policyRevision: policy.revision, source, revision, status: 'updating', count: 0, digest: targetDigest, updatedAt: serverTimestamp() });
      tx.set(jobRef, { ...next, updatedAt: serverTimestamp() });
      return next;
    });
    let job: FriendAllJob;
    try { job = await begin(3); }
    catch (cause) {
      if (initial.job?.format === 3 || !cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
      console.info('Counted friend sharing is not available yet; trying the legacy begin once.');
      try { job = await begin(2); }
      catch (fallback) {
        if (fallback && typeof fallback === 'object' && 'code' in fallback && fallback.code === 'permission-denied') {
          throw new FriendStoreError('limit', 'Sharing could not start. Refresh the page, then try again.');
        }
        throw fallback;
      }
    }
    if (job.format === 3 && (initial.job?.format !== 3 || publicHead?.status === 'updating' && initial.job.applied === 0)) {
      await this.pruneLegacy(uid, kind, guard);
    }
    const operations = operationsFor(job.format);
    progress?.({ kind, applied: job.applied, total: job.total, targetCount: job.targetCount, ready: false });
    const present = new Set(job.format === 3 && initial.job?.format !== 3 ? [] : initial.entries.map(entry => entry.id));
    const writeGroup = job.format === 3 ? FRIEND_ALL_TRACKED_WRITE_GROUP : FRIEND_ALL_WRITE_GROUP;
    for (let index = 0; index < operations.length; index += writeGroup) {
      guard();
      const group = operations.slice(index, index + writeGroup);
      const batch = writeBatch(this.db);
      let count = job.count;
      for (const [offset, operation] of group.entries()) {
        if (operation.entry && !present.has(operation.id)) { count += 1; present.add(operation.id); }
        if (!operation.entry && present.has(operation.id)) { count -= 1; present.delete(operation.id); }
        const ref = doc(this.rows(uid, kind), operation.id);
        if (job.format === 3 && !operation.entry) batch.delete(ref);
        else batch.set(ref, { format: job.format, epoch: policy.epoch, token: job.token,
          step: job.applied + offset + 1, active: operation.entry !== null, entry: operation.entry });
      }
      const applied = job.applied + group.length; const last = group.map(operation => operation.id);
      batch.update(jobRef, { count, applied, last, updatedAt: serverTimestamp() });
      await batch.commit();
      job = { ...job, count, applied, last };
      if (applied % 50 === 0 || applied === job.total) progress?.({ kind, applied, total: job.total, targetCount: job.targetCount, ready: false });
    }
    guard();
    await runTransaction(this.db, async tx => {
      guard();
      const [control, currentHead, currentJob, sync] = await Promise.all([tx.get(policyRef), tx.get(headRef), tx.get(jobRef), tx.get(syncRef)]);
      const latest = control.exists() ? parseFriendAllPolicy(control.data(), uid) : null;
      const head = currentHead.exists() ? parseFriendAllHead(currentHead.data()) : null;
      const complete = currentJob.exists() ? parseFriendAllJob(currentJob.data()) : null;
      checkSource(sync.data());
      if (!latest?.enabled || latest.deleted || latest.epoch !== policy.epoch || latest.revision !== policy.revision ||
        !complete || complete.token !== job.token || complete.applied !== complete.total || complete.count !== entries.length ||
        !head) conflict();
      if (head.status === 'ready' && head.digest === targetDigest && head.epoch === policy.epoch && sameShelfSource(head.source, source)) return;
      if (head.status !== 'updating' || head.revision !== complete.headRevision) conflict();
      tx.update(headRef, { status: 'ready', count: entries.length, revision: head.revision + 1, updatedAt: serverTimestamp() });
    });
    try {
      guard();
      const committed = await this.confirmed(headRef, parseFriendAllHead);
      if (!committed || committed.status !== 'ready' || committed.digest !== targetDigest || committed.epoch !== policy.epoch) conflict();
      this.cache.set(cacheKey, { epoch: policy.epoch, digest: targetDigest, entries });
      progress?.({ kind, applied: job.total, total: job.total, targetCount: entries.length, ready: true });
      return committed;
    } catch (cause) { throw new FriendAllCommittedError(uid, 'publish', cause, kind); }
  }
  async cleanupPage(uid: string, kind: FriendAllKind): Promise<{ deleted: number; done: boolean }> {
    online(); await this.policy(uid);
    const rows = await getDocsFromServer(query(this.rows(uid, kind), orderBy(documentId()), limit(FRIEND_ALL_OWNER_PAGE)));
    if (!rows.empty) {
      await this.releaseRows(uid, kind, rows.docs);
      return { deleted: rows.size, done: false };
    }
    // The counted-job delete rule reads the stored job, so an unpublished or already removed view must not be deleted again.
    await runTransaction(this.db, async tx => {
      const [job, head] = await Promise.all([tx.get(this.jobRef(uid, kind)), tx.get(this.headRef(uid, kind))]);
      if (job.exists()) tx.delete(job.ref);
      if (head.exists()) tx.delete(head.ref);
    });
    this.cache.delete(`${uid}:${kind}`);
    return { deleted: 0, done: true };
  }
  async exportOwn(uid: string) {
    const controls = await this.controls(uid);
    const views = await Promise.all((['games', 'ranking'] as const).map(async kind => {
      const head = await this.head(uid, kind);
      const progress = await this.progress(uid, kind);
      return { kind, head, progress };
    }));
    return { format: 2 as const, policy: controls.policy, views };
  }
  async revokeForDeletion(uid: string) {
    online(); await this.policy(uid);
    await runTransaction(this.db, async tx => {
      const ref = this.policyRef(uid);
      const [value, ranking, shelf, shelfHead] = await Promise.all([
        tx.get(ref), tx.get(doc(this.db, 'friendSettings', uid)), tx.get(doc(this.db, 'friendShelfSettings', uid)), tx.get(doc(this.db, 'friendShelfHeads', uid)),
      ]);
      if (!value.exists()) return;
      const current = parseFriendAllPolicy(value.data(), uid);
      if (current.deleted) return;
      const rankControl = ranking.exists() ? parseFriendSettings(ranking.data()) : null;
      const shelfControl = shelf.exists() ? parseFriendShelfConfig(shelf.data()) : null;
      if (rankControl && !rankControl.deleted) tx.set(ranking.ref, { format: 1, enabled: false, deleted: true, selection: '', epoch: rankControl.epoch + 1, revision: rankControl.revision + 1, updatedAt: serverTimestamp() });
      if (shelfControl && !shelfControl.deleted) {
        tx.set(shelf.ref, { format: 1, enabled: false, deleted: true, selection: '', consentSyncEpoch: null, epoch: shelfControl.epoch + 1, revision: shelfControl.revision + 1, updatedAt: serverTimestamp() });
        if (shelfHead.exists()) tx.update(shelfHead.ref, { revision: parseFriendShelfHead(shelfHead.data()).revision + 1, updatedAt: serverTimestamp() });
      }
      tx.update(ref, { enabled: false, deleted: true, origin: 'explicit', epoch: current.epoch + 1, revision: current.revision + 1, updatedAt: serverTimestamp() });
    });
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { accountScope } from '../lib/cloud-types';
import type { LibraryScope, ScopedLibrary } from '../lib/cloud-types';
import type { Game } from '../lib/types';
import type { FriendShelfConfig } from '../lib/friend-shelf-types';
import { FriendShelfCommittedError, FriendShelfConsentError, friendShelfFailure, projectFriendShelf, shelfSelection } from '../lib/friend-shelf-types';
import type { FriendShelfJournal } from '../lib/friend-shelf-selection';
import { createFriendWorkGeneration } from '../lib/friend-read-guard';
import { loadScopedLibrary } from '../lib/scoped-library';
import { hasPendingEdits, usePendingEdits } from '../hooks/useExitSave';
import { SyncWorkQueue } from '../lib/sync-retry';
import { FriendShelfStore } from './friend-shelf-store';
import { cloudAuth, cloudDb } from './firebase-client';
import { onlineError } from './errors';

export type FriendShelfStatus = 'off' | 'paused' | 'checking' | 'pending' | 'saving' | 'saved' | 'retrying' | 'quota' | 'error';
interface Recovery {
  key: string; cause: unknown; cleanup: 'prune' | 'stop' | null;
  selection?: { ids: string[]; through: number; expectedRevision: number; expectedEpoch: number; consentSyncEpoch: number };
}
export function useFriendShelf(uid: string | undefined, scope: LibraryScope | null, snapshot: ScopedLibrary | null, verified: boolean, games: Game[], visibleTools: boolean, authGeneration: number, journal: FriendShelfJournal, automaticMode = false) {
  const store = useMemo(() => new FriendShelfStore(cloudDb), []);
  const key = `${scope ?? ''}:${uid ?? ''}:${authGeneration}`;
  const snapshotReady = Boolean(scope && snapshot?.scope === scope);
  const [value, setValue] = useState<{ key: string; config: FriendShelfConfig | null } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [status, setStatus] = useState<FriendShelfStatus>('checking');
  const [reload, setReload] = useState(0);
  const config = value?.key === key ? value.config : null;
  const current = useRef({ key, uid, scope, snapshot, verified, games, config });
  current.current = { key, uid, scope, snapshot, verified, games, config };
  const controlNow = useRef(config); controlNow.current = config;
  const generation = useMemo(createFriendWorkGeneration, []);
  const mutations = useMemo(createFriendWorkGeneration, []);
  const mutationActive = useRef<symbol | null>(null);
  const queue = useRef<SyncWorkQueue | null>(null);
  const recovery = useRef<Recovery | null>(null);
  const pendingEdits = usePendingEdits();
  useEffect(() => {
    mutations.cancel(); mutationActive.current = null;
    return () => { mutations.cancel(); mutationActive.current = null; };
  }, [key, mutations]);
  const owns = useCallback(() => {
    const state = current.current;
    return Boolean(uid && scope && state.key === key && state.verified && cloudAuth.currentUser?.uid === uid &&
      cloudAuth.app === cloudDb.app && scope === accountScope(uid, cloudDb.app.options.projectId) &&
      state.scope === scope && state.snapshot?.scope === scope);
  }, [uid, scope, key]);
  const acceptConfig = useCallback(async (next: FriendShelfConfig | null, explicitThroughRevision?: number) => {
    if (!owns() || !scope || (next && controlNow.current && next.revision < controlNow.current.revision)) return;
    controlNow.current = next;
    setValue({ key, config: next });
    if (next) await journal.update(scope, next.revision, next.selectedIds, explicitThroughRevision, current.current.snapshot?.state.revision ?? 0);
    if (owns() && recovery.current?.key !== key) setFailure(null);
  }, [owns, scope, key, journal]);
  const recover = useCallback(async () => {
    if (!owns() || !uid) return;
    const pending = recovery.current?.key === key ? recovery.current : null;
    const [fresh] = await Promise.all([store.config(uid), store.head(uid)]);
    if (!owns()) return;
    const selected = pending?.selection;
    const confirmedReview = selected && fresh?.enabled && fresh.revision === selected.expectedRevision && fresh.epoch === selected.expectedEpoch && fresh.consentSyncEpoch === selected.consentSyncEpoch &&
      fresh.selectedIds.join('|') === selected.ids.join('|') ? selected.through : undefined;
    await acceptConfig(fresh, confirmedReview);
    if (pending?.cleanup === 'stop' && fresh?.enabled) {
      recovery.current = null;
      throw new Error('Sharing is still on. Choose Stop sharing again to confirm the stop.');
    }
    if (!owns()) return;
    if (pending?.cleanup === 'prune') await store.prune(uid);
    if (pending?.cleanup === 'stop') await store.cleanupSharing(uid);
    if (!owns()) return;
    if (recovery.current === pending) recovery.current = null;
    setFailure(null);
  }, [owns, uid, key, store, acceptConfig]);
  useEffect(() => {
    if (!uid || !verified || !scope || !snapshotReady) return;
    let alive = true; let release: (() => void) | undefined;
    const failed = (cause: unknown) => {
      if (!alive || !owns()) return;
      setFailure({ key, message: onlineError(cause) }); setStatus('error');
      release?.(); release = undefined;
      queue.current?.failed(friendShelfFailure(cause));
    };
    const next = (data: FriendShelfConfig | null) => { if (alive && owns()) void acceptConfig(data).catch(failed); };
    const refresh = () => {
      if (!alive || !owns()) return;
      if (document.hidden || !navigator.onLine) { release?.(); release = undefined; return; }
      if (queue.current?.reason) return;
      if ((visibleTools || controlNow.current?.enabled) && !release) release = store.watchConfig(uid, next, failed);
      else if (!release) void store.config(uid).then(next).catch(failed);
    };
    refresh();
    window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; release?.(); window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [uid, scope, verified, snapshotReady, owns, key, visibleTools, config?.enabled, store, acceptConfig, reload]);
  useEffect(() => {
    if (!uid || !scope || !config || !snapshot) return;
    void journal.update(scope, config.revision, config.selectedIds, undefined, snapshot.state.revision).catch((cause) => {
      if (owns()) { setFailure({ key, message: onlineError(cause) }); setStatus('error'); queue.current?.failed('blocked'); }
    });
  }, [uid, scope, config, snapshot, journal, owns, key]);
  useEffect(() => {
    if (automaticMode || !uid || !scope || !verified || !config?.enabled || config.deleted || !snapshot?.sync.enabled) return;
    const ticket = generation.next(); const syncEpoch = snapshot.sync.epoch; let alive = true;
    let fingerprint: string | null = null;
    const isCurrent = () => alive && !mutationActive.current && generation.current(ticket) && owns() && current.current.snapshot?.sync.enabled === true &&
      current.current.snapshot.sync.epoch === syncEpoch && controlNow.current?.enabled === true && !controlNow.current.deleted;
    const work = new SyncWorkQueue(async () => {
      if (!isCurrent() || document.hidden || !navigator.onLine || hasPendingEdits()) return;
      if (recovery.current?.key === key) { await recover(); if (!isCurrent()) return; }
      const local = await loadScopedLibrary(scope);
      if (!isCurrent() || local.scope !== scope || local.sync.dirty || !local.sync.enabled ||
        local.sync.epoch !== syncEpoch || local.state.revision !== current.current.snapshot?.state.revision) return;
      const removed = await journal.pending(scope, local.state.revision);
      const fresh = await store.config(uid);
      if (!isCurrent()) return;
      await acceptConfig(fresh);
      if (!fresh?.enabled || fresh.deleted || !isCurrent()) return;
      if (fresh.consentSyncEpoch !== local.sync.epoch) throw new FriendShelfConsentError();
      const projected = projectFriendShelf(local.state, fresh.selectedIds, current.current.games, removed);
      let reviewed = fresh;
      if (projected.selectedIds.length !== fresh.selectedIds.length) {
        reviewed = await store.saveConfig(uid, { enabled: true, selectedIds: projected.selectedIds, consentSyncEpoch: fresh.consentSyncEpoch }, fresh, isCurrent);
        if (!isCurrent()) return;
        await acceptConfig(reviewed);
      }
      const signature = `${reviewed.epoch}:${reviewed.revision}:${JSON.stringify(projected.entries)}`;
      if (signature === fingerprint) { work.succeeded(); setStatus('saved'); return; }
      const publicationCurrent = () => isCurrent() && controlNow.current?.epoch === reviewed.epoch && controlNow.current.revision === reviewed.revision &&
        current.current.snapshot?.state.revision === local.state.revision && !current.current.snapshot.sync.dirty &&
        current.current.snapshot.sync.baseRemoteRevision === local.sync.baseRemoteRevision;
      const head = await store.head(uid);
      if (!publicationCurrent()) return;
      setStatus('saving');
      await store.publish(uid, projected.entries, reviewed, { syncEpoch, remoteRevision: local.sync.baseRemoteRevision }, head?.revision ?? 0, publicationCurrent);
      if (!isCurrent()) return;
      fingerprint = signature;
      work.succeeded(); setFailure(null); setStatus('saved');
    }, (cause) => {
      if (!isCurrent()) return;
      const acknowledged = cause instanceof FriendShelfCommittedError && cause.receipt.uid === uid;
      if (acknowledged) recovery.current = { key, cause, cleanup: cause.receipt.operation === 'publish-shelf' ? 'prune' : null };
      const kind = friendShelfFailure(acknowledged ? cause.cause : cause);
      work.failed(kind);
      setStatus(acknowledged ? 'saved' : kind === 'transient' ? 'retrying' : kind === 'quota' ? 'quota' : 'error');
      setFailure({ key, message: acknowledged ? cause.message : onlineError(cause) });
    });
    queue.current = work;
    const wake = () => { const available = isCurrent() && navigator.onLine && !document.hidden; work.setAvailable(available); if (available) work.wake(); };
    wake();
    window.addEventListener('online', wake); window.addEventListener('offline', wake); document.addEventListener('visibilitychange', wake);
    return () => {
      alive = false; work.dispose(); if (queue.current === work) queue.current = null;
      window.removeEventListener('online', wake); window.removeEventListener('offline', wake); document.removeEventListener('visibilitychange', wake);
    };
  }, [uid, scope, verified, key, config?.enabled, config?.deleted, snapshot?.sync.enabled, snapshot?.sync.epoch, owns, generation, journal, store, acceptConfig, recover, reload, automaticMode]);
  useEffect(() => {
    if (config?.enabled && snapshot?.sync.enabled && !snapshot.sync.dirty && !pendingEdits) queue.current?.request(1200, true);
  }, [config?.revision, config?.enabled, snapshot?.sync.enabled, snapshot?.sync.dirty, snapshot?.sync.dataRevision, snapshot?.state.revision, pendingEdits]);
  const stop = () => { generation.cancel(); mutations.cancel(); mutationActive.current = null; queue.current?.dispose(); queue.current = null; setStatus('paused'); };
  const saveSelection = async (ids: string[], expected: FriendShelfConfig, reviewedStateRevision: number) => {
    if (!owns() || !uid || !scope || recovery.current?.key === key || hasPendingEdits()) throw new Error('Refresh shared games before saving this selection.');
    const local = await loadScopedLibrary(scope);
    if (!owns() || local.state.revision !== reviewedStateRevision || !local.sync.enabled || local.sync.dirty) throw new Error('Your library changed or is still saving. Preview the saved games again.');
    const projected = projectFriendShelf(local.state, shelfSelection(ids), current.current.games);
    if (projected.selectedIds.length !== ids.length) throw new Error('A selected game was removed. Preview the selection again.');
    stop();
    const ticket = mutations.next(); const operation = Symbol('shelf-selection'); mutationActive.current = operation;
    const mutationCurrent = () => owns() && mutations.current(ticket);
    try {
      const next = await store.saveConfig(uid, { enabled: true, selectedIds: projected.selectedIds, consentSyncEpoch: local.sync.epoch }, expected, mutationCurrent);
      if (!mutationCurrent()) throw new Error('This selection was superseded. Review the current shelf.');
      await acceptConfig(next, reviewedStateRevision);
      setReload((value) => value + 1);
    } catch (cause) {
      if (mutationCurrent()) {
        const changed = !expected.enabled || expected.consentSyncEpoch !== local.sync.epoch || expected.selectedIds.join('|') !== projected.selectedIds.join('|');
        recovery.current = { key, cause, cleanup: null, selection: { ids: projected.selectedIds, through: reviewedStateRevision, expectedRevision: expected.revision + Number(changed), expectedEpoch: expected.epoch + Number(changed), consentSyncEpoch: local.sync.epoch } };
        setFailure({ key, message: cause instanceof FriendShelfCommittedError ? cause.message : 'The selection could not be confirmed. Refresh before trying again.' });
      }
      throw cause;
    } finally { if (mutationActive.current === operation) mutationActive.current = null; }
  };
  const stopSharing = async () => {
    stop();
    if (!owns() || !uid) throw new Error('Sign in to the shelf owner account before stopping sharing.');
    const ticket = mutations.next(); const operation = Symbol('shelf-stop'); mutationActive.current = operation;
    const mutationCurrent = () => owns() && mutations.current(ticket);
    try {
      const fresh = await store.config(uid);
      if (!mutationCurrent()) throw new Error('The account changed before sharing could stop.');
      if (fresh?.enabled) await acceptConfig(await store.saveConfig(uid, { enabled: false, selectedIds: [], consentSyncEpoch: null }, fresh, mutationCurrent));
      else await acceptConfig(fresh);
      if (mutationCurrent()) await store.cleanupSharing(uid);
    } catch (cause) {
      if (mutationCurrent()) { recovery.current = { key, cause, cleanup: 'stop' }; setFailure({ key, message: 'Sharing stop needs confirmation. Refresh to check its current status.' }); }
      throw cause;
    } finally { if (mutationActive.current === operation) mutationActive.current = null; }
  };
  const retry = async () => {
    if (queue.current?.reason === 'quota') { await queue.current.retry(); return; }
    try {
      await recover();
      if (owns()) {
        if (queue.current) await queue.current.retry();
        else setReload((value) => value + 1);
      }
    }
    catch (cause) { if (owns()) setFailure({ key, message: onlineError(cause) }); throw cause; }
  };
  const ready = value?.key === key;
  const visibleStatus: FriendShelfStatus = !verified ? 'paused' : !ready ? failure?.key === key ? 'error' : 'checking' : !config?.enabled ? 'off' : !snapshot?.sync.enabled ? 'paused' : snapshot.sync.dirty || pendingEdits ? 'pending' : status;
  return { store, config, ready, status: visibleStatus, error: failure?.key === key ? failure.message : '', acceptConfig, saveSelection, stopSharing, stop, retry };
}

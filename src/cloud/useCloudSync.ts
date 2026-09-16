import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryScope, ScopedLibrary, SyncHead, SyncStatus } from '../lib/cloud-types';
import { scopeUid } from '../lib/cloud-types';
import { acknowledgeScopedUpload, adoptScopedRemote, loadScopedLibrary, pauseScopedLibrary, rebaseScopedLibrary } from '../lib/scoped-library';
import { hasPendingEdits, usePendingEdits } from '../hooks/useExitSave';
import { CloudStore, RemoteConflict, SyncRevoked } from './cloud-store';
import { cloudAuth, cloudDb } from './firebase-client';
import { onlineError } from './errors';

export function useCloudSync(scope: LibraryScope | null, snapshot: ScopedLibrary | null, verified: boolean) {
  const store = useMemo(() => scope ? new CloudStore(cloudDb, scopeUid(scope)) : null, [scope]);
  const [status, setStatus] = useState<SyncStatus>('device');
  const [remoteSnapshot, setRemoteSnapshot] = useState<{ scope: LibraryScope | null; value: SyncHead | null }>({ scope: null, value: null });
  const remote = remoteSnapshot.scope === scope ? remoteSnapshot.value : null;
  const setRemote = useCallback((value: SyncHead | null) => setRemoteSnapshot({ scope, value }), [scope]);
  const [error, setError] = useState('');
  const [cleanupWarning, setCleanupWarning] = useState('');
  const [connection, setConnection] = useState(0);
  const pendingEdits = usePendingEdits();
  const uploading = useRef<{ scope: LibraryScope; id: symbol } | null>(null);
  const blocked = useRef(false);
  const sequence = useRef(0);
  const scopeNow = useRef(scope);
  const latestRemote = useRef<SyncHead | null>(null);
  scopeNow.current = scope;
  const enabled = Boolean(snapshot?.sync.enabled && verified);

  const receive = useCallback(async (head: SyncHead | null) => {
    if (!scope || !store) return;
    latestRemote.current = head;
    setRemote(head);
    if (uploading.current?.scope === scope) return;
    const operation = ++sequence.current;
    try {
      const local = await loadScopedLibrary(scope);
      if (scopeNow.current !== scope || operation !== sequence.current) return;
      if (!local.sync.enabled) { setStatus('paused'); return; }
      if (!head || !head.enabled || head.deleted || head.epoch !== local.sync.epoch) {
        await pauseScopedLibrary(scope);
        setStatus('paused');
        setError('Online saving changed or was stopped in another session. This account copy is kept here; reconnect explicitly.');
        blocked.current = true;
        return;
      }
      if (head.revision < local.sync.baseRemoteRevision) return;
      if (head.revision > local.sync.baseRemoteRevision) {
        if (local.sync.dirty || hasPendingEdits()) { blocked.current = true; setStatus('conflict'); setError('Another device saved a different online copy. Your local edits have not been replaced.'); return; }
        const incoming = await store.download(head);
        if (!incoming) throw new Error('The newer online head has no library snapshot. Your local copy is retained.');
        if (scopeNow.current !== scope || operation !== sequence.current) return;
        await adoptScopedRemote(scope, incoming, head, local.state.revision, false, () => !hasPendingEdits());
      }
      if (blocked.current) { setStatus(navigator.onLine ? 'error' : 'offline'); return; }
      setStatus(local.sync.dirty ? (navigator.onLine ? 'saving' : 'offline') : 'saved');
      if (!blocked.current) setError('');
    } catch (cause) {
      if (scopeNow.current !== scope) return;
      blocked.current = true;
      setStatus(hasPendingEdits() || (cause instanceof Error && cause.name === 'PersonalLibraryConflictError') ? 'conflict' : 'error');
      setError(onlineError(cause));
    }
  }, [scope, store, setRemote]);

  const sync = useCallback(async (manual = false) => {
    if (!scope || !store || !verified || uploading.current?.scope === scope || document.hidden) return;
    if (manual) { blocked.current = false; setError(''); }
    if (blocked.current) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    if (hasPendingEdits()) return;
    const lease = { scope, id: Symbol('online-upload') };
    uploading.current = lease;
    const identity = scope;
    try {
      const local = await loadScopedLibrary(scope);
      if (!local.sync.enabled || scopeNow.current !== identity) return;
      const head = await store.head();
      if (!head || !head.enabled || head.deleted || head.epoch !== local.sync.epoch) throw new SyncRevoked();
      setRemote(head); latestRemote.current = head;
      if (head.revision !== local.sync.baseRemoteRevision) {
        if (uploading.current === lease) uploading.current = null;
        await receive(head);
        return;
      }
      if (!local.sync.dirty) { setStatus('saved'); return; }
      setStatus('saving');
      const confirmed = await store.upload(local.state, head);
      const acknowledged = await acknowledgeScopedUpload(scope, local.sync.dataRevision, confirmed);
      if (scopeNow.current !== identity) return;
      if (!latestRemote.current || (latestRemote.current.epoch <= confirmed.epoch && latestRemote.current.revision <= confirmed.revision)) latestRemote.current = confirmed;
      setRemote(confirmed);
      setStatus(acknowledged.sync.dirty ? 'saving' : 'saved');
      try { await store.cleanup(); setCleanupWarning(''); }
      catch (cleanupError) { setCleanupWarning(`The library is saved, but old snapshot cleanup needs retry. ${onlineError(cleanupError)}`); }
    } catch (cause) {
      if (scopeNow.current !== identity) return;
      blocked.current = true;
      if (cause instanceof RemoteConflict) { setRemote(cause.head); latestRemote.current = cause.head; setStatus('conflict'); }
      else if (cause instanceof SyncRevoked) { await pauseScopedLibrary(scope); setStatus('paused'); }
      else setStatus(navigator.onLine ? 'error' : 'offline');
      setError(onlineError(cause));
    } finally {
      if (uploading.current === lease) uploading.current = null;
      if (scopeNow.current === identity && cloudAuth.currentUser?.uid === scopeUid(identity)) {
        try {
          const after = await loadScopedLibrary(scope);
          const observed = latestRemote.current;
          if (observed && (observed.epoch !== after.sync.epoch || observed.revision > after.sync.baseRemoteRevision)) await receive(observed);
          if (!blocked.current && after.sync.dirty) setConnection((value) => value + 1);
        } catch (cause) { blocked.current = true; setStatus('error'); setError(onlineError(cause)); }
      }
    }
  }, [scope, store, verified, receive, setRemote]);

  useEffect(() => {
    blocked.current = false; latestRemote.current = null; setRemote(null); setError(''); setStatus(enabled ? 'loading' : scope ? 'paused' : 'device');
    return () => { sequence.current += 1; };
  }, [scope, enabled, setRemote]);
  useEffect(() => {
    if (!enabled || !store) return;
    let unsubscribe: (() => void) | undefined;
    const observe = () => {
      unsubscribe?.(); unsubscribe = undefined;
      if (document.hidden || !navigator.onLine) { if (!navigator.onLine) setStatus('offline'); return; }
      unsubscribe = store.watch((head) => { void receive(head); }, (cause) => { blocked.current = true; setStatus('error'); setError(onlineError(cause)); });
      if (!blocked.current) setConnection((value) => value + 1);
    };
    observe();
    window.addEventListener('online', observe); window.addEventListener('offline', observe); document.addEventListener('visibilitychange', observe);
    return () => { unsubscribe?.(); window.removeEventListener('online', observe); window.removeEventListener('offline', observe); document.removeEventListener('visibilitychange', observe); };
  }, [enabled, store, receive]);
  useEffect(() => {
    if (!enabled || blocked.current || pendingEdits || !snapshot?.sync.dirty || document.hidden) return;
    const timer = window.setTimeout(() => { void sync(); }, 2500);
    return () => window.clearTimeout(timer);
  }, [enabled, snapshot?.sync.dataRevision, snapshot?.sync.dirty, pendingEdits, connection, sync]);

  const useRemote = async (expected: SyncHead, expectedLocalRevision: number) => {
    if (!store || !scope) throw new Error('Sign in before resolving a cloud conflict.');
    const latest = await store.head();
    if (!latest || latest.revision !== expected.revision || latest.epoch !== expected.epoch) throw new Error('The online copy changed again. Review the fresh versions before choosing.');
    const state = await store.download(latest);
    if (!state) throw new Error('There is no online snapshot to adopt.');
    await adoptScopedRemote(scope, state, latest, expectedLocalRevision, true, () => !hasPendingEdits());
    blocked.current = false; setError(''); setStatus('saved');
  };
  const useLocal = async (expected: SyncHead, expectedLocalRevision: number) => {
    if (!store || !scope) throw new Error('Sign in before resolving a cloud conflict.');
    const latest = await store.head();
    if (!latest || latest.revision !== expected.revision || latest.epoch !== expected.epoch || !latest.enabled || latest.deleted) throw new Error('Online saving changed. Review the current state before replacing anything.');
    await rebaseScopedLibrary(scope, latest, expectedLocalRevision);
    blocked.current = false; setError(''); setConnection((value) => value + 1);
  };
  const visibleStatus: SyncStatus = !verified && scope ? 'paused'
    : blocked.current && (status === 'saved' || status === 'saving') ? (navigator.onLine ? 'error' : 'offline')
      : status === 'saved' && (snapshot?.sync.dirty || pendingEdits) ? (navigator.onLine ? 'saving' : 'offline') : status;
  return { store, status: visibleStatus, remote, error, cleanupWarning, pendingEdits,
    retry: () => sync(true), useRemote, useLocal, syncing: uploading.current?.scope === scope };
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LibraryScope, ScopedLibrary, SyncHead, SyncStatus } from '../lib/cloud-types';
import { scopeUid } from '../lib/cloud-types';
import type { PersonalLibraryState } from '../lib/personal-types';
import {
  acknowledgeScopedUpload,
  adoptScopedRemote,
  isInitialAccountCache,
  loadScopedLibrary,
  pauseScopedLibrary,
  rebaseScopedLibrary,
} from '../lib/scoped-library';
import { packLibrary } from '../lib/snapshot-transport';
import { syncFailure, SyncWorkQueue } from '../lib/sync-retry';
import { hasPendingEdits, usePendingEdits } from '../hooks/useExitSave';
import { CloudStore, RemoteConflict, SyncRevoked } from './cloud-store';
import { cloudAuth, cloudDb } from './firebase-client';
import { onlineError } from './errors';

type Block = 'transient' | 'quota' | 'terminal' | 'conflict' | 'revoked' | null;
interface LifetimeIdentity {
  scope: LibraryScope | null;
  enabled: boolean;
  epoch: number;
  verified: boolean;
  initialProbe: boolean;
  authGeneration: number;
}
// One sync session: the account and consent it serves, and the state its asynchronous work shares. A new one replaces
// it when ownership or consent changes. Its fields change only through these methods, from effects, callbacks and
// handlers; render only reads them.
class SyncLifetime {
  active = false;
  block: Block = null;
  queue: SyncWorkQueue | null = null;
  detach: () => void = () => {};
  restart: () => void = () => {};
  resume: () => void = () => {};
  watchAlive = false;
  initialChecked = false;
  constructor(readonly identity: LifetimeIdentity) {}
  /** Opens this session with its work queue and listener controls. */
  open(queue: SyncWorkQueue, controls: { detach: () => void; restart: () => void; resume: () => void }): void {
    this.active = true;
    this.queue = queue;
    this.detach = controls.detach;
    this.restart = controls.restart;
    this.resume = controls.resume;
  }
  close(): void {
    this.active = false;
  }
  setBlock(block: Block): void {
    this.block = block;
  }
  setWatchAlive(alive: boolean): void {
    this.watchAlive = alive;
  }
  markInitialChecked(): void {
    this.initialChecked = true;
  }
}
const hardBlocked = (block: Block) => block === 'terminal' || block === 'conflict' || block === 'revoked';
// A head read can show the state from before another tab or window of this account created or restarted the online
// copy this device copy is connected to: no head, or an older consent epoch. Firestore serves a new listener the view
// of an already open listen on the same head, which can still predate that commit. No client can delete a head, and
// every stop, deletion or restart moves it to a newer epoch, so such a view is stale, not a revocation: the listener
// delivers the current head next, and a stale read is retried with backoff like any transient failure.
function staleHeadRead() {
  return Object.assign(new Error('The online copy is not visible to this tab yet.'), { code: 'aborted' });
}
// Whether a head publishes exactly this library: the digest covers every field an upload sends. A library that cannot
// be packed, such as one over the snapshot limit, is not held and still needs a choice.
async function holdsLibrary(head: SyncHead, state: PersonalLibraryState): Promise<boolean> {
  if (!head.current) return false;
  try {
    return (await packLibrary(state)).manifest.digest === head.current.digest;
  } catch {
    return false;
  }
}

export function useCloudSync(
  scope: LibraryScope | null,
  snapshot: ScopedLibrary | null,
  verified: boolean,
  restoreInitial?: (store: CloudStore, isCurrent: () => boolean) => Promise<void>,
  authGeneration = 0,
) {
  const store = useMemo(() => (scope ? new CloudStore(cloudDb, scopeUid(scope)) : null), [scope]);
  const enabled = Boolean(snapshot?.sync.enabled && verified);
  const initialProbe = Boolean(verified && isInitialAccountCache(snapshot) && restoreInitial);
  const epoch = snapshot?.sync.epoch ?? 0;
  // A fresh lease invalidates pending work when ownership or consent changes, not on ordinary data edits.
  const lifetime = useMemo(
    () => new SyncLifetime({ scope, enabled, epoch, verified, initialProbe, authGeneration }),
    [scope, enabled, epoch, verified, initialProbe, authGeneration],
  );
  const [initialCheck, setInitialCheck] = useState<{ lifetime: SyncLifetime; pending: boolean } | null>(null);
  const initialWork = useRef(restoreInitial);
  useLayoutEffect(() => {
    initialWork.current = restoreInitial;
  }, [restoreInitial]);
  const [status, setStatus] = useState<SyncStatus>('device');
  const [remoteSnapshot, setRemoteSnapshot] = useState<{ scope: LibraryScope | null; value: SyncHead | null }>({
    scope: null,
    value: null,
  });
  const remote = remoteSnapshot.scope === scope ? remoteSnapshot.value : null;
  const setRemote = useCallback((value: SyncHead | null) => setRemoteSnapshot({ scope, value }), [scope]);
  const [observation, setObservation] = useState({ scope: null as LibraryScope | null, available: false, version: 0 });
  const [error, setError] = useState('');
  const [cleanupWarning, setCleanupWarning] = useState('');
  // Each lifetime starts without a known head, messages or status of its own.
  const [started, setStarted] = useState<SyncLifetime | null>(null);
  if (started !== lifetime) {
    setStarted(lifetime);
    setRemoteSnapshot({ scope, value: null });
    setError('');
    setCleanupWarning('');
    setStatus(enabled ? 'loading' : scope ? 'paused' : 'device');
  }
  const pendingEdits = usePendingEdits();
  const uploading = useRef<{ lifetime: SyncLifetime; id: symbol } | null>(null);
  const sequence = useRef(0);
  // The committed scope, device copy and lifetime. Once a new lifetime commits, the previous one's work stops owning
  // anything, so it cannot report a status over the new one's.
  const scopeNow = useRef(scope);
  const snapshotNow = useRef(snapshot);
  const lifetimeNow = useRef(lifetime);
  useLayoutEffect(() => {
    scopeNow.current = scope;
    snapshotNow.current = snapshot;
    lifetimeNow.current = lifetime;
  }, [scope, snapshot, lifetime]);
  const latestRemote = useRef<SyncHead | null>(null);
  const owns = useCallback(
    () =>
      Boolean(
        lifetime.active &&
        lifetimeNow.current === lifetime &&
        scope &&
        scopeNow.current === lifetime.identity.scope &&
        cloudAuth.currentUser?.uid === scopeUid(scope),
      ),
    [lifetime, scope],
  );

  const failed = useCallback(
    (cause: unknown) => {
      if (!owns() || lifetime.block === 'revoked') return;
      if (initialProbe) setInitialCheck({ lifetime, pending: false });
      if (cause instanceof Error && cause.name === 'SyncSessionEnded') {
        setStatus(navigator.onLine ? 'pending' : 'offline');
        return;
      }
      sequence.current += 1;
      if (
        cause instanceof RemoteConflict ||
        (cause instanceof Error && cause.name === 'PersonalLibraryConflictError')
      ) {
        lifetime.setBlock('conflict');
        lifetime.queue?.failed('blocked');
        setStatus('conflict');
        if (cause instanceof RemoteConflict) {
          setRemote(cause.head);
          latestRemote.current = cause.head;
        }
      } else if (cause instanceof SyncRevoked) {
        lifetime.setBlock('revoked');
        lifetime.queue?.failed('blocked');
        lifetime.detach();
        setStatus('paused');
        if (scope)
          void pauseScopedLibrary(scope, epoch, owns).catch((failure) => {
            if (owns()) setError(onlineError(failure));
          });
      } else {
        const kind = syncFailure(cause);
        if (hardBlocked(lifetime.block)) return;
        const block = kind === 'blocked' || (!enabled && !initialProbe) ? 'terminal' : kind;
        lifetime.setBlock(block);
        lifetime.queue?.failed(block === 'terminal' ? 'blocked' : kind);
        lifetime.detach();
        setStatus(
          !navigator.onLine ? 'offline' : block === 'transient' ? 'retrying' : block === 'quota' ? 'quota' : 'error',
        );
      }
      setError(
        `${onlineError(cause)}${lifetime.block === 'transient' ? ' Retrying automatically while this page is visible and connected.' : lifetime.block === 'quota' ? ' Retrying automatically at longer intervals while this page is visible and connected.' : ''}`,
      );
    },
    [owns, lifetime, scope, epoch, enabled, initialProbe, setRemote],
  );
  const succeeded = useCallback(
    (next: SyncStatus) => {
      if (!owns() || hardBlocked(lifetime.block)) return;
      if (enabled && !lifetime.watchAlive && (lifetime.block === 'transient' || lifetime.block === 'quota')) {
        setStatus(navigator.onLine ? (lifetime.block === 'quota' ? 'quota' : 'retrying') : 'offline');
        return;
      }
      lifetime.setBlock(null);
      lifetime.queue?.succeeded(next === 'saved' && !snapshotNow.current?.sync.dirty && !hasPendingEdits());
      setError('');
      setStatus(next);
    },
    [owns, lifetime, enabled],
  );

  const receive = useCallback(
    async (head: SyncHead | null) => {
      if (!scope || !store || !owns()) return;
      // A stale view (see staleHeadRead) is followed by the current head from the same listener.
      if (!head || head.epoch < lifetime.identity.epoch) return;
      const known = latestRemote.current;
      if (known && (head.epoch < known.epoch || (head.epoch === known.epoch && head.revision < known.revision))) return;
      latestRemote.current = head;
      setRemote(head);
      if (uploading.current?.lifetime === lifetime) return;
      const operation = ++sequence.current;
      try {
        let local = await loadScopedLibrary(scope);
        if (!owns() || operation !== sequence.current) return;
        if (!local.sync.enabled) {
          setStatus('paused');
          return;
        }
        if (head.epoch < local.sync.epoch) return;
        if (!head.enabled || head.deleted || head.epoch !== local.sync.epoch) throw new SyncRevoked();
        if (hardBlocked(lifetime.block) || head.revision < local.sync.baseRemoteRevision) return;
        if (head.revision > local.sync.baseRemoteRevision) {
          if (hasPendingEdits() || (local.sync.dirty && !(await holdsLibrary(head, local.state))))
            throw new RemoteConflict(head);
          if (local.sync.dirty) {
            // Another tab or window of this account saved exactly this library before this tab recorded it: record
            // that head without replacing local data. An edit made meanwhile stays pending.
            if (!owns() || hardBlocked(lifetime.block) || operation !== sequence.current) return;
            local = await acknowledgeScopedUpload(
              scope,
              local.sync.dataRevision,
              head,
              () => owns() && !hardBlocked(lifetime.block),
            );
          } else {
            const incoming = await store.download(head);
            if (!incoming) throw new Error('The newer online copy has no saved library. Your local copy is retained.');
            if (!owns() || hardBlocked(lifetime.block) || operation !== sequence.current) return;
            local = await adoptScopedRemote(
              scope,
              incoming,
              head,
              local.state.revision,
              false,
              () => owns() && !hardBlocked(lifetime.block) && !hasPendingEdits(),
            );
          }
        }
        if (!owns()) return;
        if (!local.sync.dirty && !hasPendingEdits()) succeeded('saved');
        else if (lifetime.block === 'transient' || lifetime.block === 'quota')
          setStatus(navigator.onLine ? (lifetime.block === 'quota' ? 'quota' : 'retrying') : 'offline');
        else {
          setStatus(navigator.onLine ? 'pending' : 'offline');
          lifetime.queue?.request(2500);
        }
      } catch (cause) {
        if (owns() && operation === sequence.current) failed(cause);
      }
    },
    [scope, store, owns, lifetime, setRemote, failed, succeeded],
  );

  const sync = useCallback(async () => {
    if (!scope || !store || !verified || !owns() || uploading.current?.lifetime === lifetime || document.hidden) return;
    if (hardBlocked(lifetime.block)) return;
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    lifetime.restart();
    if (hasPendingEdits()) return;
    const lease = { lifetime, id: Symbol('online-upload') };
    uploading.current = lease;
    try {
      if (initialProbe && !lifetime.initialChecked && initialWork.current) {
        setInitialCheck({ lifetime, pending: true });
        await initialWork.current(store, owns);
        if (!owns()) return;
        lifetime.markInitialChecked();
        setInitialCheck({ lifetime, pending: false });
        succeeded('paused');
        return;
      }
      if (!enabled) return;
      // A retry reattaches failed listeners before checking the latest committed device revision.
      const local = await loadScopedLibrary(scope);
      if (!local.sync.enabled || local.sync.epoch !== epoch || !owns()) return;
      const head = await store.head();
      if (!owns()) return;
      if (!head || head.epoch < local.sync.epoch) throw staleHeadRead();
      if (!head.enabled || head.deleted || head.epoch !== local.sync.epoch) throw new SyncRevoked();
      setRemote(head);
      latestRemote.current = head;
      if (head.revision !== local.sync.baseRemoteRevision) {
        if (uploading.current === lease) uploading.current = null;
        await receive(head);
        return;
      }
      if (!local.sync.dirty) {
        succeeded('saved');
        return;
      }
      setStatus('saving');
      const confirmed = await store.upload(
        local.state,
        head,
        undefined,
        () => owns() && navigator.onLine && !document.hidden && !hardBlocked(lifetime.block),
      );
      if (!owns()) return;
      const acknowledged = await acknowledgeScopedUpload(
        scope,
        local.sync.dataRevision,
        confirmed,
        () => owns() && !hardBlocked(lifetime.block),
      );
      if (!owns() || !acknowledged.sync.enabled || acknowledged.sync.epoch !== epoch) return;
      if (
        !latestRemote.current ||
        (latestRemote.current.epoch <= confirmed.epoch && latestRemote.current.revision <= confirmed.revision)
      )
        latestRemote.current = confirmed;
      setRemote(confirmed);
      succeeded(acknowledged.sync.dirty ? 'pending' : 'saved');
      try {
        await store.cleanup();
        if (owns()) setCleanupWarning('');
      } catch (cleanupError) {
        if (owns())
          setCleanupWarning(
            `The library is saved, but removing older saved copies needs a retry. ${onlineError(cleanupError)}`,
          );
      }
    } catch (cause) {
      failed(cause);
    } finally {
      if (uploading.current === lease) uploading.current = null;
      if (owns()) {
        try {
          const after = await loadScopedLibrary(scope);
          if (owns() && after.sync.enabled) {
            const observed = latestRemote.current;
            if (observed && (observed.epoch !== after.sync.epoch || observed.revision > after.sync.baseRemoteRevision))
              await receive(observed);
            if (!hardBlocked(lifetime.block) && after.sync.dirty) lifetime.queue?.request(2500);
          }
        } catch (cause) {
          failed(cause);
        }
      }
    }
  }, [scope, store, verified, enabled, initialProbe, owns, lifetime, epoch, setRemote, receive, succeeded, failed]);
  const syncNow = useRef(sync);
  useLayoutEffect(() => {
    syncNow.current = sync;
  }, [sync]);

  useEffect(() => {
    const queue = new SyncWorkQueue(() => syncNow.current(), failed);
    latestRemote.current = null;
    let unsubscribe: (() => void) | undefined;
    let watchVersion = 0;
    const detach = () => {
      watchVersion += 1;
      unsubscribe?.();
      unsubscribe = undefined;
      lifetime.setWatchAlive(false);
      if (owns()) setObservation((old) => ({ scope, available: false, version: old.version + 1 }));
    };
    const observe = (recover = false) => {
      if (!owns()) return;
      const available = verified && navigator.onLine && !document.hidden;
      queue.setAvailable(available);
      if (!available) {
        detach();
        if (initialProbe) setInitialCheck({ lifetime, pending: false });
        if (!navigator.onLine && (enabled || initialProbe)) setStatus('offline');
        return;
      }
      if (!recover && (lifetime.block === 'transient' || lifetime.block === 'quota')) {
        queue.wake();
        return;
      }
      if (lifetime.block === 'terminal' || lifetime.block === 'revoked') return;
      if (enabled && store && !unsubscribe) {
        const version = ++watchVersion;
        unsubscribe = store.watch(
          (head) => {
            if (owns() && version === watchVersion) void receive(head);
          },
          (cause) => {
            if (owns() && version === watchVersion) failed(cause);
          },
        );
        lifetime.setWatchAlive(true);
        setObservation((old) => ({ scope, available: true, version: old.version + 1 }));
      } else
        setObservation((old) =>
          old.scope === scope && old.available ? old : { scope, available: true, version: old.version + 1 },
        );
      if (!recover && enabled && snapshotNow.current?.sync.dirty && !hasPendingEdits()) queue.wake();
      if (!recover && initialProbe && !lifetime.initialChecked && !hasPendingEdits()) queue.wake();
    };
    const wake = () => observe();
    lifetime.open(queue, { detach, restart: () => observe(true), resume: wake });
    observe();
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      lifetime.close();
      queue.dispose();
      unsubscribe?.();
      sequence.current += 1;
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [lifetime, failed, enabled, initialProbe, scope, owns, verified, store, receive]);
  useEffect(() => {
    if (enabled && !pendingEdits && snapshot?.sync.dirty) lifetime.queue?.request(2500, true);
    if (initialProbe && !pendingEdits && !lifetime.initialChecked) lifetime.queue?.request();
  }, [enabled, initialProbe, pendingEdits, snapshot?.sync.dataRevision, snapshot?.sync.dirty, lifetime]);

  const useRemote = async (expected: SyncHead, expectedLocalRevision: number) => {
    if (!store || !scope || !owns()) throw new Error('Sign in before resolving a cloud conflict.');
    const latest = await store.head();
    if (
      !latest ||
      latest.revision !== expected.revision ||
      latest.epoch !== expected.epoch ||
      !latest.enabled ||
      latest.deleted
    )
      throw new Error('The online copy changed again. Review the fresh versions before choosing.');
    const state = await store.download(latest);
    if (!state) throw new Error('There is no complete online copy to use.');
    await adoptScopedRemote(
      scope,
      state,
      latest,
      expectedLocalRevision,
      true,
      () => owns() && lifetime.block !== 'revoked' && lifetime.block !== 'terminal' && !hasPendingEdits(),
    );
    if (!owns()) return;
    lifetime.setBlock(null);
    succeeded('saved');
  };
  const useLocal = async (expected: SyncHead, expectedLocalRevision: number) => {
    if (!store || !scope || !owns()) throw new Error('Sign in before resolving a cloud conflict.');
    const latest = await store.head();
    if (
      !latest ||
      latest.revision !== expected.revision ||
      latest.epoch !== expected.epoch ||
      !latest.enabled ||
      latest.deleted
    )
      throw new Error('Online saving changed. Review the current state before replacing anything.');
    await rebaseScopedLibrary(
      scope,
      latest,
      expectedLocalRevision,
      () => owns() && lifetime.block !== 'revoked' && lifetime.block !== 'terminal',
    );
    if (!owns()) return;
    lifetime.setBlock(null);
    succeeded('pending');
    lifetime.queue?.request();
  };
  const retry = () => {
    if (lifetime.block === 'conflict' || lifetime.block === 'revoked')
      return Promise.reject(
        new Error('Review the available copies or reconnect explicitly before resuming online saving.'),
      );
    if (lifetime.block === 'terminal') lifetime.setBlock(null);
    if (!navigator.onLine) setStatus('offline');
    return lifetime.queue?.retry() ?? Promise.resolve();
  };
  // A requested stop is not yet an authoritative revocation. Manual retry rechecks the server before resuming.
  const suspend = () => {
    const suspended = lifetime;
    const prior = { block: lifetime.block, status };
    const release = lifetime.queue?.pause();
    lifetime.setBlock('terminal');
    lifetime.detach();
    setStatus('paused');
    // Restores this lifetime only while it is still owned and blocked by this suspension, never after a revocation or conflict.
    return () => {
      if (!suspended.active || suspended.block !== 'terminal' || !owns()) return;
      suspended.setBlock(prior.block);
      release?.();
      setStatus((value) => (value === 'paused' ? prior.status : value));
      suspended.resume();
    };
  };
  const visibleStatus: SyncStatus =
    !verified && scope
      ? 'paused'
      : lifetime.block === 'conflict'
        ? 'conflict'
        : lifetime.block === 'revoked'
          ? 'paused'
          : enabled && !navigator.onLine
            ? 'offline'
            : lifetime.block === 'terminal'
              ? 'error'
              : status === 'saved' && lifetime.block === 'quota'
                ? 'quota'
                : status === 'saved' && lifetime.block === 'transient'
                  ? 'retrying'
                  : status === 'saved' && (snapshot?.sync.dirty || pendingEdits)
                    ? 'pending'
                    : status;
  return {
    store,
    status: visibleStatus,
    remote,
    error,
    cleanupWarning,
    pendingEdits,
    retry,
    useRemote,
    useLocal,
    suspend,
    profileAvailable: observation.scope === scope && observation.available,
    profileConnection: observation.version,
    reportProfileError: failed,
    restoringInitial:
      initialProbe &&
      navigator.onLine &&
      !document.hidden &&
      (initialCheck?.lifetime !== lifetime || initialCheck.pending),
  };
}

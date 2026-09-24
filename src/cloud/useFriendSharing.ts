import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../lib/types';
import type { LibraryScope, ScopedLibrary } from '../lib/cloud-types';
import type { FriendSettings } from '../lib/friend-types';
import { projectFriendRanking } from '../lib/friend-types';
import { loadScopedLibrary } from '../lib/scoped-library';
import { pendingFriendRemovals, updateFriendSelectionCache } from '../lib/friend-selection-cache';
import { createFriendWorkGeneration } from '../lib/friend-read-guard';
import { hasPendingEdits, usePendingEdits } from '../hooks/useExitSave';
import { SyncWorkQueue, syncFailure } from '../lib/sync-retry';
import { FriendStore } from './friend-store';
import { cloudAuth, cloudDb } from './firebase-client';
import { onlineError } from './errors';
import { committedFriendChange, committedFriendMessage, refreshCommittedFriendChange } from './friend-outcomes';

export type FriendSharingStatus =
  'off' | 'paused' | 'checking' | 'pending' | 'saving' | 'saved' | 'retrying' | 'quota' | 'error';
function sharingFailure(cause: unknown) {
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : '';
  if (code === 'limit') return 'quota';
  return code === 'conflict' || code === 'offline' ? 'transient' : syncFailure(cause);
}
export function useFriendSharing(
  uid: string | undefined,
  scope: LibraryScope | null,
  snapshot: ScopedLibrary | null,
  verified: boolean,
  games: Game[],
  visibleTools: boolean,
  authGeneration = 0,
  automaticMode = false,
) {
  const store = useMemo(() => new FriendStore(cloudDb), []);
  const [value, setValue] = useState<{ uid: string; settings: FriendSettings | null } | null>(null);
  const [failure, setFailure] = useState<{ uid: string; message: string } | null>(null);
  const [status, setStatus] = useState<FriendSharingStatus>('checking');
  const [reload, setReload] = useState(0);
  const current = useRef({ uid, scope, snapshot, verified, games, authGeneration });
  current.current = { uid, scope, snapshot, verified, games, authGeneration };
  const settings = value && value.uid === uid ? value.settings : null;
  const settingsRevision = settings?.revision;
  const selectedIds = settings?.selectedIds;
  const snapshotReady = Boolean(snapshot);
  const ready = Boolean(uid && value?.uid === uid);
  const settingsNow = useRef(settings);
  settingsNow.current = settings;
  const pendingEdits = usePendingEdits();
  const queue = useRef<SyncWorkQueue | null>(null);
  const cancellationGeneration = useMemo(createFriendWorkGeneration, []);
  const reconnectSettings = useRef<() => void>(() => {});
  const acceptSettings = useCallback((next: FriendSettings | null, owner: string, explicitThroughRevision?: number) => {
    if (current.current.uid !== owner || cloudAuth.currentUser?.uid !== owner) return;
    settingsNow.current = next;
    setValue({ uid: owner, settings: next });
    setFailure(null);
    const target = current.current.scope;
    if (next && target && current.current.snapshot)
      void updateFriendSelectionCache(
        target,
        next.revision,
        next.selectedIds,
        explicitThroughRevision,
        current.current.snapshot.state.revision,
      ).catch((cause) => {
        if (current.current.uid === owner) {
          setFailure({ uid: owner, message: onlineError(cause) });
          setStatus('error');
          queue.current?.failed('blocked');
        }
      });
  }, []);
  useEffect(() => {
    // Seed from the current snapshot; later library edits advance their own removal journal.
    const local = current.current.snapshot;
    if (!uid || !scope || settingsRevision === undefined || !selectedIds || !snapshotReady || !local) return;
    void updateFriendSelectionCache(scope, settingsRevision, selectedIds, undefined, local.state.revision).catch(
      (cause) => {
        if (current.current.uid === uid) {
          setFailure({ uid, message: onlineError(cause) });
          setStatus('error');
          queue.current?.failed('blocked');
        }
      },
    );
  }, [uid, scope, settingsRevision, selectedIds, snapshotReady]);
  useEffect(() => {
    if (!uid || !verified) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    const failed = (cause: unknown) => {
      if (alive && cloudAuth.currentUser?.uid === uid) {
        setFailure({ uid, message: onlineError(cause) });
        setStatus('error');
        unsubscribe?.();
        unsubscribe = undefined;
        queue.current?.failed(sharingFailure(cause));
      }
    };
    const next = (data: FriendSettings | null) => {
      if (alive) acceptSettings(data, uid);
    };
    const attach = (force = false) => {
      if (!alive) return;
      if (document.hidden || !navigator.onLine) {
        unsubscribe?.();
        unsubscribe = undefined;
        return;
      }
      if (!force && queue.current?.reason) return;
      if ((visibleTools || settings?.enabled) && !unsubscribe) unsubscribe = store.watchSettings(uid, next, failed);
    };
    const refresh = () => {
      attach();
      if (alive && !document.hidden && navigator.onLine && !unsubscribe && !queue.current?.reason)
        void store.settings(uid).then(next).catch(failed);
    };
    const unavailable = () => attach();
    reconnectSettings.current = () => attach(true);
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', unavailable);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      unsubscribe?.();
      reconnectSettings.current = () => {};
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', unavailable);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [uid, verified, authGeneration, visibleTools, settings?.enabled, reload, store, acceptSettings]);

  useEffect(() => {
    if (
      automaticMode ||
      !uid ||
      !scope ||
      !verified ||
      !settings?.enabled ||
      settings.deleted ||
      !snapshot?.sync.enabled
    )
      return;
    const owner = uid;
    const target = scope;
    const generation = cancellationGeneration.next();
    let alive = true;
    let fingerprint: string | null = null;
    let attemptedSignature: string | null = null;
    let committedRefresh: ReturnType<typeof committedFriendChange> = null;
    const expectedEpoch = snapshot.sync.epoch;
    const isCurrent = () =>
      alive &&
      cancellationGeneration.current(generation) &&
      current.current.uid === owner &&
      cloudAuth.currentUser?.uid === owner &&
      current.current.authGeneration === authGeneration &&
      current.current.verified &&
      current.current.snapshot?.sync.enabled === true &&
      current.current.snapshot.sync.epoch === expectedEpoch;
    const retry = new SyncWorkQueue(
      async () => {
        if (!isCurrent() || document.hidden || !navigator.onLine || hasPendingEdits() || !current.current.games.length)
          return;
        if (committedRefresh) {
          const acknowledged = committedRefresh;
          const recovered = await refreshCommittedFriendChange(store, acknowledged, isCurrent);
          if (!recovered || !isCurrent()) return;
          const { settings: control, head } = recovered;
          acceptSettings(control, owner);
          if (
            acknowledged.receipt.operation === 'publish-ranking' &&
            acknowledged.receipt.generation &&
            head?.current?.generation === acknowledged.receipt.generation
          )
            fingerprint = attemptedSignature;
          committedRefresh = null;
          retry.succeeded();
          if (!control?.enabled || control.deleted) return;
        }
        const local = await loadScopedLibrary(target);
        const removed = await pendingFriendRemovals(target, local.state.revision);
        let control = settingsNow.current;
        if (
          !isCurrent() ||
          !control?.enabled ||
          control.deleted ||
          local.sync.dirty ||
          !local.sync.enabled ||
          local.sync.epoch !== expectedEpoch
        )
          return;
        let projected = projectFriendRanking(
          local.state,
          control.selectedIds.filter((id) => !removed.has(id)),
          current.current.games,
        );
        const signature = `${control.epoch}:${control.revision}:${JSON.stringify(projected.entries)}`;
        if (fingerprint === signature && !retry.reason) {
          setStatus('saved');
          return;
        }
        reconnectSettings.current();
        const fresh = await store.settings(owner);
        if (!isCurrent()) return;
        if (!fresh?.enabled || fresh.deleted) {
          acceptSettings(fresh, owner);
          return;
        }
        control = fresh;
        acceptSettings(control, owner);
        projected = projectFriendRanking(
          local.state,
          control.selectedIds.filter((id) => !removed.has(id)),
          current.current.games,
        );
        if (fingerprint === `${control.epoch}:${control.revision}:${JSON.stringify(projected.entries)}`) {
          retry.succeeded(true);
          setFailure(null);
          setStatus('saved');
          return;
        }
        setStatus('saving');
        let reviewed = control;
        if (projected.selectedIds.length !== control.selectedIds.length) {
          reviewed = await store.saveSettings(owner, { enabled: true, selectedIds: projected.selectedIds }, control);
          if (!isCurrent()) return;
          acceptSettings(reviewed, owner);
        }
        const head = await store.shareHead(owner);
        if (!isCurrent()) return;
        attemptedSignature = `${reviewed.epoch}:${reviewed.revision}:${JSON.stringify(projected.entries)}`;
        await store.publishRanking(
          owner,
          projected.entries,
          reviewed,
          { syncEpoch: local.sync.epoch, remoteRevision: local.sync.baseRemoteRevision },
          head?.revision ?? 0,
          isCurrent,
        );
        if (!isCurrent()) return;
        fingerprint = `${reviewed.epoch}:${reviewed.revision}:${JSON.stringify(projected.entries)}`;
        retry.succeeded();
        setFailure(null);
        setStatus('saved');
      },
      (cause) => {
        if (!isCurrent()) return;
        const committed = committedFriendChange(cause, owner);
        if (committed) {
          committedRefresh = committed;
          retry.failed(syncFailure(committed.cause));
          setStatus(committed.receipt.operation === 'publish-ranking' ? 'saved' : 'pending');
          setFailure({ uid: owner, message: committedFriendMessage(committed) });
          return;
        }
        const kind = sharingFailure(cause);
        retry.failed(kind);
        setStatus(kind === 'transient' ? 'retrying' : kind === 'quota' ? 'quota' : 'error');
        setFailure({
          uid: owner,
          message: `${onlineError(cause)}${kind === 'blocked' ? '' : ' Friends sharing will retry automatically.'}`,
        });
      },
    );
    queue.current = retry;
    const wake = () => {
      const available = isCurrent() && navigator.onLine && !document.hidden;
      retry.setAvailable(available);
      if (available) retry.wake();
    };
    wake();
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      alive = false;
      retry.dispose();
      if (queue.current === retry) queue.current = null;
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [
    uid,
    scope,
    verified,
    authGeneration,
    settings?.enabled,
    settings?.deleted,
    snapshot?.sync.enabled,
    snapshot?.sync.epoch,
    reload,
    store,
    acceptSettings,
    automaticMode,
    cancellationGeneration,
  ]);
  useEffect(() => {
    if (ready && settings?.enabled && snapshot?.sync.enabled && games.length && !pendingEdits && !snapshot.sync.dirty)
      queue.current?.request(1200, true);
  }, [
    ready,
    settings?.enabled,
    settings?.revision,
    snapshot?.sync.enabled,
    snapshot?.sync.dirty,
    snapshot?.sync.dataRevision,
    pendingEdits,
    games.length,
  ]);
  const visibleStatus: FriendSharingStatus = !verified
    ? 'paused'
    : !ready
      ? 'checking'
      : !settings?.enabled
        ? 'off'
        : !snapshot?.sync.enabled
          ? 'paused'
          : !games.length
            ? 'checking'
            : snapshot.sync.dirty || pendingEdits
              ? 'pending'
              : status;
  return {
    store,
    settings,
    ready,
    status: visibleStatus,
    error: failure && failure.uid === uid ? failure.message : '',
    acceptSettings: (next: FriendSettings | null, explicitThroughRevision?: number) => {
      if (uid) acceptSettings(next, uid, explicitThroughRevision);
    },
    retry: () => {
      if (!queue.current) setReload((count) => count + 1);
      return queue.current?.retry() ?? Promise.resolve();
    },
    stop: () => {
      const ticket = cancellationGeneration.next();
      const restart = Boolean(queue.current);
      const owner = uid;
      const prior = status;
      queue.current?.dispose();
      queue.current = null;
      setStatus('paused');
      // Restarts this owner's sharing only if nothing newer replaced the stop and the same auth session is current.
      return () => {
        if (
          !owner ||
          !cancellationGeneration.current(ticket) ||
          current.current.uid !== owner ||
          cloudAuth.currentUser?.uid !== owner ||
          current.current.authGeneration !== authGeneration
        )
          return;
        setStatus((value) => (value === 'paused' ? prior : value));
        if (restart) setReload((count) => count + 1);
      };
    },
  };
}

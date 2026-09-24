import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onSnapshot, doc } from 'firebase/firestore';
import type { LibraryScope, ScopedLibrary } from '../lib/cloud-types';
import { accountScope } from '../lib/cloud-types';
import type { Game } from '../lib/types';
import { FRIEND_ALL_QUOTA_MESSAGE, friendAllEligibility, projectAllFriendGames, projectAllFriendRankings } from '../lib/friend-all';
import type { FriendAllEligibility, FriendAllPolicy } from '../lib/friend-all';
import type { FriendAllHead } from '../lib/friend-all-transport';
import { loadScopedLibrary } from '../lib/scoped-library';
import { hasPendingEdits, usePendingEdits } from '../hooks/useExitSave';
import { SyncWorkQueue, syncFailure } from '../lib/sync-retry';
import { FriendAllCommittedError, FriendAllStore } from './friend-all-store';
import type { FriendAllControls, FriendAllProgress } from './friend-all-store';
import { readFriendAllCooldown, saveFriendAllCooldown } from '../lib/friend-all-work';
import { cloudAuth, cloudDb } from './firebase-client';
import { onlineError } from './errors';

export type FriendAllStatus = 'checking' | 'off' | 'paused' | 'pending' | 'saving' | 'saved' | 'retrying' | 'quota' | 'error';
export function useFriendAll(uid: string | undefined, scope: LibraryScope | null, snapshot: ScopedLibrary | null, verified: boolean, games: Game[], authGeneration: number) {
  const store = useMemo(() => new FriendAllStore(cloudDb), []);
  const key = `${scope}:${uid}:${authGeneration}`;
  const [state, setState] = useState<{ key: string; confirmed: boolean; controls: FriendAllControls; eligibility: FriendAllEligibility; status: FriendAllStatus; error: string; games: FriendAllHead | null; ranking: FriendAllHead | null } | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [resumed, setResumed] = useState(0);
  const [progressState, setProgress] = useState<{ key: string; games: FriendAllProgress | null; ranking: FriendAllProgress | null } | null>(null);
  const current = useRef({ uid, scope, snapshot, verified, games, key });
  current.current = { uid, scope, snapshot, verified, games, key };
  const queue = useRef<SyncWorkQueue | null>(null);
  const generation = useRef(0);
  const changing = useRef(false);
  const pending = usePendingEdits();
  const collectionReady = games.length > 0;
  const owns = useCallback(() => {
    const value = current.current;
    return Boolean(uid && scope && value.key === key && value.verified && cloudAuth.currentUser?.uid === uid &&
      scope === accountScope(uid, cloudDb.app.options.projectId) && value.snapshot?.scope === scope);
  }, [uid, scope, key]);
  const eligibility = useCallback((controls: FriendAllControls) => friendAllEligibility({
    uid: uid ?? null, scope, projectId: cloudDb.app.options.projectId ?? '', verified: current.current.verified,
    cacheReady: current.current.snapshot?.scope === scope, confirmed: true, source: current.current.snapshot
      ? { enabled: current.current.snapshot.sync.enabled, deleted: false, epoch: current.current.snapshot.sync.epoch } : null, ...controls,
  }), [uid, scope]);
  const accept = useCallback((controls: FriendAllControls) => {
    if (!owns()) return;
    setState(old => ({ key, confirmed: true, controls, eligibility: eligibility(controls), status: old?.key === key ? old.status : 'checking', error: '',
      games: old?.key === key ? old.games : null, ranking: old?.key === key ? old.ranking : null }));
  }, [owns, key, eligibility]);
  useEffect(() => {
    if (!uid || !scope || !verified || snapshot?.scope !== scope) return;
    let alive = true; let serial = 0; let scheduled = false;
    const valid = () => alive && owns();
    const refresh = async () => {
      const request = ++serial;
      try {
        const controls = await store.controls(uid);
        if (!valid() || request !== serial) return;
        const choice = eligibility(controls);
        if (choice.kind === 'default' && !changing.current) {
          changing.current = true;
          try { await store.setPolicy(uid, true, 'default', controls, valid); }
          finally {
            changing.current = false;
            queue.current?.setAvailable(valid() && !document.hidden && navigator.onLine !== false);
            queue.current?.wake();
          }
          if (!valid()) return;
          accept(await store.controls(uid));
        } else accept(controls);
      } catch (cause) {
        if (!valid()) return;
        setState(old => ({ key, confirmed: false, controls: old?.key === key ? old.controls : { policy: null, ranking: null, shelf: null },
          eligibility: { kind: 'checking' }, status: 'error', error: onlineError(cause), games: null, ranking: null }));
      }
    };
    const schedule = () => {
      if (scheduled || !valid() || document.hidden || navigator.onLine === false) return;
      scheduled = true; queueMicrotask(() => { scheduled = false; if (valid()) void refresh(); });
    };
    const releases = ['friendAllPolicies', 'friendSettings', 'friendShelfSettings'].map(name =>
      onSnapshot(doc(cloudDb, name, uid), { includeMetadataChanges: true }, value => {
        if (!value.metadata.fromCache && !value.metadata.hasPendingWrites) schedule();
      }, cause => {
        if (valid()) setState(old => ({ key, confirmed: false, controls: old?.key === key ? old.controls : { policy: null, ranking: null, shelf: null },
          eligibility: { kind: 'checking' }, status: 'error', error: onlineError(cause), games: null, ranking: null }));
      }));
    schedule();
    window.addEventListener('online', schedule); document.addEventListener('visibilitychange', schedule);
    return () => { alive = false; serial += 1; releases.forEach(release => release()); window.removeEventListener('online', schedule); document.removeEventListener('visibilitychange', schedule); };
  }, [uid, scope, verified, snapshot?.scope, snapshot?.sync.enabled, snapshot?.sync.epoch, key, owns, store, eligibility, accept, retryVersion]);
  const rawPolicy = state?.key === key ? state.controls.policy : null;
  const policyValue = useRef<FriendAllPolicy | null>(null);
  if (!rawPolicy || policyValue.current?.uid !== rawPolicy.uid || policyValue.current.revision !== rawPolicy.revision) policyValue.current = rawPolicy;
  const policy = policyValue.current;
  const choice = state?.key === key && state.confirmed ? eligibility(state.controls) : { kind: 'checking' as const };
  const choiceKind = choice.kind;
  useEffect(() => {
    if (!uid || !scope || !policy || choiceKind !== 'all') return;
    let alive = true;
    const lease = ++generation.current;
    const valid = () => alive && generation.current === lease && owns() && !changing.current;
    const work = new SyncWorkQueue(async () => {
      if (!valid() || document.hidden || navigator.onLine === false || hasPendingEdits() || !current.current.games.length) return;
      const cooldown = await readFriendAllCooldown(scope);
      if (!valid()) return;
      if (cooldown?.epoch === policy.epoch && cooldown.nextAttemptAt > Date.now()) {
        setState(old => old?.key === key ? { ...old, status: 'quota', error: FRIEND_ALL_QUOTA_MESSAGE } : old);
        work.request(cooldown.nextAttemptAt - Date.now());
        return;
      }
      const local = await loadScopedLibrary(scope);
      if (!valid() || !local.sync.enabled || local.sync.dirty || local.sync.epoch !== policy.syncEpoch) return;
      const controls = await store.controls(uid);
      if (!valid()) return;
      accept(controls);
      if (eligibility(controls).kind !== 'all' || controls.policy?.revision !== policy.revision) return;
      const publicationCurrent = () => valid() && current.current.snapshot?.sync.enabled === true && !current.current.snapshot.sync.dirty &&
        current.current.snapshot.sync.epoch === local.sync.epoch && current.current.snapshot.sync.baseRemoteRevision === local.sync.baseRemoteRevision &&
        current.current.snapshot.state.revision === local.state.revision;
      if (!publicationCurrent()) return;
      setState(old => old?.key === key ? { ...old, status: 'saving', error: '' } : old);
      const source = { syncEpoch: local.sync.epoch, remoteRevision: local.sync.baseRemoteRevision };
      const progress = (value: FriendAllProgress) => {
        if (publicationCurrent()) setProgress(old => ({ key, games: old?.key === key ? old.games : null, ranking: old?.key === key ? old.ranking : null, [value.kind]: value }));
      };
      const saved = await store.publish(uid, 'games', projectAllFriendGames(local.state, current.current.games), policy, source, publicationCurrent, progress);
      const ranking = await store.publish(uid, 'ranking', projectAllFriendRankings(local.state, current.current.games), policy, source, publicationCurrent, progress);
      if (!publicationCurrent()) return;
      await saveFriendAllCooldown(scope, null);
      work.succeeded();
      setState(old => old?.key === key ? { ...old, status: 'saved', error: '', games: saved, ranking } : old);
    }, cause => {
      if (!alive || !owns()) return;
      const failure = cause instanceof FriendAllCommittedError ? syncFailure(cause.cause)
        : cause && typeof cause === 'object' && 'code' in cause && cause.code === 'conflict' ? 'transient' : syncFailure(cause);
      work.failed(failure);
      if (failure === 'quota') void saveFriendAllCooldown(scope, { version: 2, epoch: policy.epoch, nextAttemptAt: work.nextAttemptAt ?? Date.now() + 60_000 }).catch(storageError => {
        work.failed('blocked');
        if (owns()) setState(old => old?.key === key ? { ...old, status: 'error', error: `The retry cooldown could not be saved. ${onlineError(storageError)}` } : old);
      });
      setState(old => old?.key === key ? { ...old, status: failure === 'quota' ? 'quota' : failure === 'transient' ? 'retrying' : 'error',
        error: failure === 'quota' ? FRIEND_ALL_QUOTA_MESSAGE
          : cause instanceof FriendAllCommittedError ? cause.message : onlineError(cause) } : old);
    });
    queue.current = work;
    const wake = () => { work.setAvailable(valid() && !document.hidden && navigator.onLine !== false); work.wake(); };
    wake(); window.addEventListener('online', wake); window.addEventListener('offline', wake); document.addEventListener('visibilitychange', wake);
    return () => { alive = false; work.dispose(); if (queue.current === work) queue.current = null; window.removeEventListener('online', wake); window.removeEventListener('offline', wake); document.removeEventListener('visibilitychange', wake); };
  }, [uid, scope, policy, choiceKind, key, owns, store, accept, eligibility, retryVersion, resumed]);
  useEffect(() => {
    if (choiceKind === 'all' && collectionReady && snapshot?.sync.enabled && !snapshot.sync.dirty && !pending) {
      queue.current?.setAvailable(owns() && !document.hidden && navigator.onLine !== false);
      queue.current?.request(1200, true);
    }
  }, [choiceKind, collectionReady, snapshot?.sync.enabled, snapshot?.sync.dirty, snapshot?.sync.dataRevision, snapshot?.state.revision, pending, owns]);
  useEffect(() => {
    if (!uid || !policy || choiceKind !== 'all') return;
    let alive = true;
    void Promise.all([store.progress(uid, 'games', policy.epoch), store.progress(uid, 'ranking', policy.epoch)]).then(([games, ranking]) => {
      if (alive && owns()) setProgress({ key, games, ranking });
    }).catch(cause => {
      if (alive && owns()) setState(old => old?.key === key ? { ...old, status: 'error', error: onlineError(cause) } : old);
    });
    return () => { alive = false; };
  }, [uid, policy, choiceKind, key, store, owns]);
  const suspend = useCallback(() => {
    const lease = ++generation.current; const restart = Boolean(queue.current);
    queue.current?.dispose(); queue.current = null;
    // Restarts this owner's publication queue only if no newer lease or owner replaced the suspension.
    return () => { if (restart && generation.current === lease && owns()) setResumed(value => value + 1); };
  }, [owns]);
  const change = useCallback(async (enabled: boolean) => {
    if (!uid || !owns() || changing.current) throw new Error('Wait for the current account before changing sharing.');
    changing.current = true; suspend();
    try {
      const controls = await store.controls(uid);
      const changeCurrent = () => owns();
      await store.setPolicy(uid, enabled, 'explicit', controls, changeCurrent);
      if (!owns()) return;
      accept(await store.controls(uid));
      setRetryVersion(value => value + 1);
    } finally {
      changing.current = false;
      queue.current?.setAvailable(owns() && !document.hidden && navigator.onLine !== false);
      queue.current?.wake();
    }
  }, [uid, owns, suspend, store, accept]);
  const enable = useCallback(() => change(true), [change]);
  const stopSharing = useCallback(() => change(false), [change]);
  const refresh = useCallback(async () => {
    if (!uid || !owns()) throw new Error('Wait for the current account before refreshing sharing.');
    const controls = await store.controls(uid);
    if (!owns()) return;
    accept(controls);
    setRetryVersion(value => value + 1);
  }, [uid, owns, store, accept]);
  const error = state?.key === key ? state.error : '';
  const upToDate = state?.key === key && policy && [state.games, state.ranking].every(head => head?.status === 'ready' && head.epoch === policy.epoch &&
    head.policyRevision === policy.revision && head.source.syncEpoch === snapshot?.sync.epoch && head.source.remoteRevision === snapshot?.sync.baseRemoteRevision);
  const status: FriendAllStatus = error ? state?.status ?? 'error' : choiceKind === 'checking' ? 'checking'
    : choiceKind === 'paused' || choiceKind === 'revoked' ? 'paused' : choiceKind !== 'all' ? 'off'
      : snapshot?.sync.dirty || pending ? 'pending' : upToDate ? 'saved' : state?.status === 'saving' ? 'saving' : 'pending';
  return { store, policy, eligibility: choice, status, error, ready: state?.key === key && choiceKind !== 'checking',
    gamesCount: state?.key === key ? state.games?.count ?? null : null, rankingCount: state?.key === key ? state.ranking?.count ?? null : null,
    controlsAll: Boolean(policy?.enabled && state?.key === key && choiceKind !== 'legacy' && choiceKind !== 'revoked'),
    progress: progressState?.key === key ? progressState : null,
    enable, stopSharing, suspend, refresh,
  };
}

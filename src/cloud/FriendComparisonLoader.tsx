import { useEffect, useMemo, useState } from 'react';
import type { ComparisonParticipant } from '../lib/friend-comparison';
import type { FriendIdentity } from '../lib/friend-types';
import { parseFriendAllRankingEntry } from '../lib/friend-all';
import type { FriendStore } from './friend-store';
import { FriendShelfStore } from './friend-shelf-store';
import { useFriendSharedView } from './useFriendSharedView';
import { cloudAuth } from './firebase-client';

export function FriendComparisonLoader({
  store,
  uid,
  peer,
  exactIds,
  onData,
  onRemove,
}: {
  store: FriendStore;
  uid: string;
  peer: string;
  exactIds: readonly string[] | null;
  onData: (peer: string, identity: FriendIdentity | null, participant: ComparisonParticipant) => void;
  onRemove: (peer: string) => void;
}) {
  const shelf = useMemo(() => new FriendShelfStore(store.db), [store]);
  const view = useFriendSharedView(store, shelf, uid, peer, 'ranking', true, exactIds);
  const [person, setPerson] = useState<FriendIdentity | null>(null);
  useEffect(() => {
    let alive = true;
    const current = () => alive && cloudAuth.currentUser?.uid === uid;
    const identity = store.watchIdentity(
      peer,
      (value) => {
        if (current()) setPerson(value);
      },
      () => {
        if (current()) setPerson(null);
      },
    );
    const pair = store.watchPair(
      uid,
      peer,
      (value) => {
        if (current() && value?.state !== 'accepted') onRemove(peer);
      },
      (cause) => {
        if (current() && cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied')
          onRemove(peer);
      },
    );
    return () => {
      alive = false;
      identity();
      pair();
    };
  }, [uid, peer, store, onRemove]);
  useEffect(() => {
    if (cloudAuth.currentUser?.uid !== uid) return;
    const basic = {
      id: peer,
      displayName: person?.displayName ?? 'Unavailable player',
      kind: 'friend' as const,
      freshness: 'fresh' as const,
      updatedAt: view.updatedAt,
    };
    const participant: ComparisonParticipant =
      view.status === 'ready' && person && view.total !== null
        ? {
            ...basic,
            availability: 'ready',
            entries: view.entries.map(parseFriendAllRankingEntry),
            coverage: view.exactIds
              ? { kind: 'exact', total: view.total, ids: view.exactIds }
              : { kind: view.complete ? 'complete' : 'page', total: view.total },
          }
        : { ...basic, availability: view.status === 'loading' ? 'loading' : view.error ? 'error' : 'unavailable' };
    onData(peer, person, participant);
  }, [
    uid,
    peer,
    person,
    view.entries,
    view.status,
    view.updatedAt,
    view.total,
    view.complete,
    view.exactIds,
    view.error,
    onData,
  ]);
  return (
    <li>
      <bdi>{person?.displayName ?? 'Player'}</bdi>:{' '}
      {view.status === 'ready'
        ? view.exactIds
          ? `${view.exactIds.length} chosen ${view.exactIds.length === 1 ? 'game' : 'games'} checked`
          : `${view.entries.length} / ${view.total} rankings loaded`
        : view.status}
      {view.status === 'ready' && !view.complete && (
        <button
          className="text-button"
          disabled={view.loadingMore}
          onClick={() => {
            void view.loadMore();
          }}
        >
          Load next 25 for <bdi>{person?.displayName ?? 'player'}</bdi>
        </button>
      )}
      {view.error && (
        <>
          <span className="inline-error">{view.error}</span>
          <button className="text-button" onClick={view.retry}>
            Refresh <bdi>{person?.displayName ?? 'player'}</bdi>
          </button>
        </>
      )}
    </li>
  );
}

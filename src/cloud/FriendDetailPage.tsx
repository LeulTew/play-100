import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FriendIdentity, FriendPair, FriendSettings } from '../lib/friend-types';
import type { Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import type { FriendStore } from './friend-store';
import { cloudAuth } from './firebase-client';
import { onlineError } from './errors';
import { createFriendReadGuard } from '../lib/friend-read-guard';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';
import { Avatar } from '../components/avatar/Avatar';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { FriendShelfStore } from './friend-shelf-store';
import { useFriendSharedView } from './useFriendSharedView';
import { parseFriendAllRankingEntry, recordFromFriendAll } from '../lib/friend-all';
import { prepareFriendIdentity } from './friend-page-actions';
import type { OwnFriendIdentity } from './friend-page-actions';

export function FriendDetailPage({
  uid,
  peer,
  store,
  identity,
  onSettings,
  onFriends,
  onCompare,
  games,
  onOpen,
  sharedGames,
}: {
  uid: string;
  peer: string;
  store: FriendStore;
  identity: OwnFriendIdentity;
  onSettings: (settings: FriendSettings) => void;
  onFriends: () => void;
  onCompare: (peers: string[]) => void;
  games: Game[];
  onOpen: (record: LibraryRecord) => void;
  sharedGames?: ReactNode;
}) {
  const [person, setPerson] = useState<FriendIdentity | null>(null);
  const [pair, setPair] = useState<FriendPair | null>(null);
  const [limit, setLimit] = useState(25);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRequest, setConfirmRequest] = useState(false);
  const [requestNeedsRefresh, setRequestNeedsRefresh] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden && navigator.onLine);
  const shelfStore = useMemo(() => new FriendShelfStore(store.db), [store]);
  const rankingView = useFriendSharedView(
    store,
    shelfStore,
    uid,
    peer,
    'ranking',
    visible && pair?.state === 'accepted',
  );
  const entries = useMemo(() => rankingView.entries.map(parseFriendAllRankingEntry), [rankingView.entries]);
  const version = useRef(0);
  const access = useMemo(createFriendReadGuard, [uid, peer]);
  const requestInFlight = useRef(false);
  useEffect(() => {
    const update = () => setVisible(!document.hidden && navigator.onLine);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    const generation = ++version.current;
    setPerson(null);
    setPair(null);
    setBusy(true);
    setError('');
    setRequestNeedsRefresh(false);
    if (!visible) {
      setBusy(false);
      setNotice('Connect to view this player.');
      return;
    }
    void (async () => {
      const connection = await store.pair(uid, peer);
      const privateIdentity =
        connection?.state === 'accepted' || (connection?.state === 'pending' && connection.from === peer);
      const profile = privateIdentity ? await store.identity(peer) : await store.publicIdentity(peer);
      if (alive && generation === version.current) {
        setPerson(profile);
        setPair((old) => (old && (!connection || old.epoch > connection.epoch) ? old : connection));
      }
    })()
      .catch((cause) => {
        if (alive) setError(onlineError(cause));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    const release = store.watchPair(
      uid,
      peer,
      (value) => {
        if (!alive) return;
        setPair(value);
        setRequestNeedsRefresh(false);
        if (value?.state === 'accepted') access.accept(value.epoch);
        else {
          access.revoke();
          if (value?.state !== 'pending' || value.from !== peer) {
            const request = ++version.current;
            setPerson(null);
            void store
              .publicIdentity(peer)
              .then((profile) => {
                if (alive && request === version.current) setPerson(profile);
              })
              .catch((cause) => {
                if (alive && request === version.current) setError(onlineError(cause));
              });
          }
        }
      },
      (cause) => {
        if (alive) {
          version.current += 1;
          access.revoke();
          setPair(null);
          setPerson(null);
          setError(onlineError(cause));
        }
      },
    );
    return () => {
      alive = false;
      version.current += 1;
      access.revoke();
      release();
    };
  }, [uid, peer, store, visible, access]);
  const requestFriend = async () => {
    if (requestInFlight.current || busy || !person) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      onSettings(await prepareFriendIdentity(store, identity));
      if (cloudAuth.currentUser?.uid !== uid) throw new Error('The account changed. Review before sending.');
      setPair(await store.sendRequest(uid, peer));
      setConfirmRequest(false);
      setNotice('Request sent.');
    } catch (cause) {
      const committed = committedFriendChange(cause, uid);
      if (committed) {
        setConfirmRequest(false);
        setNotice(committedFriendMessage(committed));
        setRequestNeedsRefresh(true);
      } else setError(friendMutationError(cause));
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="app-page friend-detail-page">
      <button className="text-button" onClick={onFriends}>
        <Icon name="back" />
        Friends
      </button>
      <h1 data-page-heading tabIndex={-1}>
        <bdi>{person?.displayName ?? 'Player'}</bdi>
      </h1>
      {person && <Avatar descriptor={person.avatar} size={80} />}
      {busy && <p role="status">Loading…</p>}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {pair?.state === 'accepted' ? (
        <button className="button button-outline" onClick={() => onCompare([peer])}>
          Compare rankings
        </button>
      ) : pair?.state === 'pending' ? (
        <p>{pair.from === uid ? 'Your request is pending.' : 'An incoming request is waiting in Friends.'}</p>
      ) : (
        person &&
        uid !== peer && (
          <button
            className="button button-dark"
            disabled={busy || !identity.verified || requestNeedsRefresh}
            onClick={() => setConfirmRequest(true)}
          >
            Send friend request
          </button>
        )
      )}
      {requestNeedsRefresh && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void store
              .pair(uid, peer)
              .then((value) => {
                setPair(value);
                setRequestNeedsRefresh(false);
              })
              .catch((cause) => setError(onlineError(cause)))
              .finally(() => setBusy(false));
          }}
        >
          Refresh connection
        </button>
      )}
      {sharedGames}
      {pair?.state === 'accepted' && <h2>Shared ranking</h2>}
      {pair?.state === 'accepted' && (
        <p className="section-help" role="status">
          {rankingView.status === 'ready'
            ? `${entries.length} loaded / ${rankingView.total} shared rankings`
            : rankingView.status === 'loading'
              ? 'Loading shared rankings…'
              : 'Shared ranking unavailable.'}
        </p>
      )}
      {rankingView.error && (
        <p className="inline-error" role="alert">
          {rankingView.error}
          <button className="text-button" onClick={rankingView.retry}>
            Refresh ranking
          </button>
        </p>
      )}
      <ol className="friend-ranking-list">
        {entries.slice(0, limit).map((entry) => (
          <li key={entry.id}>
            <span>{entry.position}</span>
            <button
              className="text-button"
              onClick={() => {
                try {
                  onOpen(recordFromFriendAll(entry, games));
                } catch (cause) {
                  setError(onlineError(cause));
                }
              }}
            >
              {entry.title}
            </button>
            <strong>{entry.score === null ? 'Unrated' : entry.score}</strong>
          </li>
        ))}
      </ol>
      {limit < entries.length && (
        <button className="text-button" onClick={() => setLimit((value) => value + 25)}>
          Next 25 games
        </button>
      )}
      {!rankingView.complete && rankingView.status === 'ready' && limit >= entries.length && (
        <button
          className="text-button"
          disabled={rankingView.loadingMore}
          onClick={() => {
            void rankingView.loadMore().then(() => setLimit((value) => value + 25));
          }}
        >
          Load next 25 rankings
        </button>
      )}
      {confirmRequest && person && (
        <Dialog
          open
          titleId="friend-request-title"
          className="info-dialog"
          onClose={() => {
            if (!busy) setConfirmRequest(false);
          }}
        >
          <h2 id="friend-request-title">
            Connect with <bdi>{person.displayName}</bdi>?
          </h2>
          <div className="friend-identity">
            <Avatar descriptor={identity.avatar} size={48} />
            <span>They'll see {identity.displayName}.</span>
          </div>
          <p>
            Accepted friends see the games and rankings allowed by your sharing mode. Notes, email, queue and play
            history stay private.
          </p>
          <div className="button-row">
            <button
              data-autofocus
              className="button button-outline"
              disabled={busy}
              onClick={() => setConfirmRequest(false)}
            >
              Cancel
            </button>
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => {
                void requestFriend();
              }}
            >
              Send request
            </button>
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </section>
  );
}

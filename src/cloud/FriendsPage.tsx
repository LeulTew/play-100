import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FriendInvitation, FriendSettings } from '../lib/friend-types';
import { invitationStatus, visibleFriendPairs } from '../lib/friend-manager';
import { comparisonScope, initialComparison } from '../lib/friend-comparison-intent';
import { createInviteUrl } from '../lib/invite-continuation';
import type { FriendStore } from './friend-store';
import { cloudAuth, firebaseApp } from './firebase-client';
import { prepareFriendIdentity } from './friend-page-actions';
import type { OwnFriendIdentity } from './friend-page-actions';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';
import { onlineError } from './errors';
import { FriendChangeDialog, InviteLinkDialog } from './FriendsPageDialogs';
import type { FriendChange } from './FriendsPageDialogs';
import { FriendRelationList } from './FriendRelationList';
import { FriendBlockList, FriendInviteList } from './FriendInvitesAndBlocks';
import { FriendListStatus, FriendSelectionBar, FriendsEmptyState, FriendViewControls } from './FriendsPageControls';
import { subscribeUrl, useFriendsView } from './friends-page-view';
import { useComparisonSelection } from './friends-page-selection';
import { useAuxiliaryPages, useFriendManagerFeed, useInvitationClock, useLiveFeed } from './friends-page-data';
import { Icon } from '../components/Icon';

export function FriendsPage({
  store,
  identity,
  onSettings,
  onCommunity,
  onCompare,
  onSharedGames,
  sharingSummary,
}: {
  store: FriendStore;
  identity: OwnFriendIdentity;
  onSettings: (settings: FriendSettings) => void;
  onCommunity: () => void;
  onCompare: (peers?: string[]) => void;
  onSharedGames?: () => void;
  sharingSummary?: ReactNode;
}) {
  const uid = identity.uid;
  const scope = comparisonScope(firebaseApp.options.projectId ?? '', uid);
  const { view, relationView, updateView } = useFriendsView();
  const { feed, list } = useFriendManagerFeed(store, uid, view.view);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<FriendChange | null>(null);
  const [link, setLink] = useState<FriendInvitation | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const inviteVisible = useRef(false);
  const [copyState, setCopyState] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const alive = useRef(true);
  const currentView = useRef(view.view);
  useLayoutEffect(() => {
    currentView.current = view.view;
  });
  const auxVersion = useRef(0);
  const running = useRef(false);
  const navigationVersion = useRef(0);
  const comparisonOperation = useRef<symbol | null>(null);
  const current = useCallback(() => alive.current && cloudAuth.currentUser?.uid === uid, [uid]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      auxVersion.current += 1;
    };
  }, [uid]);
  useEffect(
    () =>
      subscribeUrl(() => {
        navigationVersion.current += 1;
        if (inviteVisible.current) {
          inviteVisible.current = false;
          setInviteOpen(false);
          setLink(null);
        }
        if (comparisonOperation.current) {
          comparisonOperation.current = null;
          running.current = false;
          if (current()) setWorking(false);
        }
      }),
    [current],
  );
  const { selected, selectedRef, choose, selectionReady, selectionError, retrySelection } = useComparisonSelection(
    store,
    uid,
    scope,
    current,
    setMessage,
  );
  useLiveFeed(feed, relationView);
  const { aux, loadAux } = useAuxiliaryPages(
    store,
    uid,
    view,
    relationView,
    current,
    auxVersion,
    setRefreshRequired,
    setError,
  );
  const currentInvites = aux.view === 'invites' ? aux.invites : [];
  const now = useInvitationClock(aux.invites, link);
  const refresh = async () => {
    const refreshed = relationView ? await feed.refresh() : await loadAux();
    if (current() && refreshed) {
      setRefreshRequired(false);
      setError('');
    }
    return refreshed;
  };
  const run = async (operation: () => Promise<void>, success: string) => {
    if (running.current || refreshRequired || !current()) return;
    running.current = true;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const settings = await prepareFriendIdentity(store, identity);
      if (!current() || currentView.current !== view.view) return;
      onSettings(settings);
      await operation();
      if (!current() || currentView.current !== view.view) return;
      setMessage(success);
      setConfirmation(null);
      await refresh();
    } catch (cause) {
      if (!current()) return;
      const committed = committedFriendChange(cause, uid);
      if (committed) {
        setConfirmation(null);
        setMessage(committedFriendMessage(committed));
        setRefreshRequired(true);
        setError(onlineError(committed.cause));
        if (committed.receipt.operation === 'create-invite') updateView({ view: 'invites' });
      } else setError(friendMutationError(cause));
    } finally {
      running.current = false;
      if (current()) setWorking(false);
    }
  };
  const createInvitation = async () => {
    if (running.current || refreshRequired || !current()) return;
    const navigation = navigationVersion.current;
    running.current = true;
    inviteVisible.current = true;
    setInviteOpen(true);
    setCreatingInvite(true);
    setLink(null);
    setCopyState('');
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const settings = await prepareFriendIdentity(store, identity);
      if (!current() || navigationVersion.current !== navigation || !inviteVisible.current) return;
      onSettings(settings);
      const invite = await store.createInvite(uid);
      if (!current() || navigationVersion.current !== navigation) return;
      if (inviteVisible.current) setLink(invite);
      else setMessage('Invitation created. Find it in Invite links.');
      if (currentView.current === 'invites') void loadAux();
    } catch (cause) {
      if (!current() || navigationVersion.current !== navigation) return;
      const committed = committedFriendChange(cause, uid);
      setError(committed ? committedFriendMessage(committed) : friendMutationError(cause));
      setRefreshRequired(true);
    } finally {
      running.current = false;
      if (current()) {
        setWorking(false);
        setCreatingInvite(false);
      }
    }
  };
  const closeInvite = () => {
    inviteVisible.current = false;
    setInviteOpen(false);
    setLink(null);
    setCopyState('');
    if (creatingInvite) setMessage('Creation may still finish. Check Invite links before making another.');
  };
  const compare = async (peers: string[]) => {
    if (running.current || !current()) return;
    const operation = Symbol('manager-comparison');
    const navigation = navigationVersion.current;
    comparisonOperation.current = operation;
    const owns = () =>
      current() && comparisonOperation.current === operation && navigationVersion.current === navigation;
    running.current = true;
    setWorking(true);
    setError('');
    try {
      initialComparison(scope, uid, peers);
      const pairs = await Promise.all(peers.map((peer) => store.pair(uid, peer)));
      if (!owns()) return;
      if (pairs.some((pair) => pair?.state !== 'accepted')) {
        choose(
          peers.filter((_, index) => pairs[index]?.state === 'accepted'),
          true,
        );
        throw new Error('A connection changed. Review the selected friends before comparing.');
      }
      choose(peers);
      onCompare(peers);
    } catch (cause) {
      if (owns()) setError(onlineError(cause));
    } finally {
      if (comparisonOperation.current === operation) {
        comparisonOperation.current = null;
        running.current = false;
        if (current()) setWorking(false);
      }
    }
  };
  const shareLink = async (invite: FriendInvitation, native: boolean) => {
    if (!current()) return;
    if (invitationStatus(invite, Date.now()) !== 'Active') {
      setError('This invitation is no longer active. Refresh the links.');
      return;
    }
    const url = createInviteUrl(invite.token);
    try {
      if (native && navigator.share) await navigator.share({ title: 'Play 100 invitation', url });
      else {
        await navigator.clipboard.writeText(url);
        if (current()) setCopyState('Link copied.');
      }
    } catch (cause) {
      if (!current() || (cause instanceof Error && cause.name === 'AbortError')) return;
      setLink(invite);
      setInviteOpen(true);
      inviteVisible.current = true;
      setCopyState('Copy the invitation from the field below.');
    }
  };
  const confirmChange = (confirmation: FriendChange) => {
    void run(
      async () => {
        if (confirmation.action === 'revoke') {
          await store.revokeInvite(uid, confirmation.invite.token);
          if (current() && link?.token === confirmation.invite.token) setLink(null);
        } else {
          if (confirmation.action === 'block') await store.block(uid, confirmation.peer);
          else await store.respond(uid, confirmation.peer, 'remove', confirmation.epoch);
          if (current())
            choose(
              selectedRef.current.filter((peer) => peer !== confirmation.peer),
              true,
            );
        }
      },
      confirmation.action === 'revoke'
        ? 'Invitation revoked.'
        : confirmation.action === 'block'
          ? 'Player blocked.'
          : 'Friend removed.',
    );
  };
  const loading = relationView ? list.loading : aux.loading || aux.view !== view.view;
  const busy = working || loading || refreshRequired || (relationView && !list.active);
  const readError = relationView ? list.error : aux.error;
  const problem = error || (readError ? onlineError(readError) : '');
  const rows = useMemo(
    () => visibleFriendPairs(list.pairs, list.identities, uid, view),
    [list.pairs, list.identities, uid, view],
  );
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }), []);
  const cursor = relationView ? list.cursor : aux.cursor;
  const ready = relationView ? list.ready : aux.ready && aux.view === view.view;
  const loaded = relationView ? list.pairs.length : view.view === 'invites' ? currentInvites.length : aux.blocks.length;
  const empty = relationView ? !rows.length : !loaded;
  return (
    <section className="app-page friends-page">
      <div className="page-heading">
        <h1 data-page-heading tabIndex={-1}>
          Friends
        </h1>
        <button
          className="button button-dark"
          disabled={busy || !identity.verified}
          onClick={() => {
            void createInvitation();
          }}
        >
          {creatingInvite ? 'Creating invite…' : 'Invite someone'}
          <Icon name="share" />
        </button>
      </div>
      {sharingSummary}
      <FriendViewControls view={view} relationView={relationView} working={working} onUpdateView={updateView} />
      <FriendListStatus
        loading={loading}
        ready={ready}
        relationView={relationView}
        shown={rows.length}
        loaded={loaded}
        cursor={cursor}
        working={working}
        active={list.active}
        changed={list.changed}
        problem={problem}
        message={message}
        onRefresh={() => {
          void refresh();
        }}
      />
      <FriendSelectionBar
        selected={selected}
        busy={busy}
        working={working}
        selectionReady={selectionReady}
        selectionError={selectionError}
        friendsView={view.view === 'friends'}
        onCompareSelected={() => {
          void compare(selected);
        }}
        onClear={() => choose([])}
        onRetry={retrySelection}
        onOpenComparisons={() => onCompare()}
      />
      {view.view === 'friends' && onSharedGames && (
        <button className="text-button" onClick={onSharedGames}>
          Sharing details
        </button>
      )}
      {relationView && (
        <FriendRelationList
          rows={rows}
          uid={uid}
          identities={list.identities}
          selected={selected}
          busy={busy}
          onSelect={choose}
          onRetryProfile={(peer) => {
            void feed.retryProfile(peer);
          }}
          onCompare={(peers) => {
            void compare(peers);
          }}
          onRespond={(peer, action, epoch, success) => {
            void run(() => store.respond(uid, peer, action, epoch).then(() => {}), success);
          }}
          onConfirm={setConfirmation}
        />
      )}
      {view.view === 'invites' && (
        <FriendInviteList
          invites={currentInvites}
          now={now}
          dateFormat={dateFormat}
          busy={busy}
          onShare={(invite, native) => {
            setCopyState('');
            void shareLink(invite, native);
          }}
          onConfirm={setConfirmation}
        />
      )}
      {copyState && !link && <p role="status">{copyState}</p>}
      {view.view === 'blocked' && (
        <FriendBlockList
          blocks={aux.blocks}
          busy={busy}
          onUnblock={(peer) => {
            void run(() => store.unblock(uid, peer), 'Unblocked. Friendship was not restored.');
          }}
        />
      )}
      {ready && !loading && !problem && empty && (
        <FriendsEmptyState
          view={view}
          relationView={relationView}
          cursor={cursor}
          changed={list.changed}
          onCommunity={onCommunity}
          onClearFilter={() => updateView({ name: '' }, true)}
        />
      )}
      {cursor && (
        <button
          className="button button-outline"
          disabled={busy || (relationView && list.changed)}
          onClick={() => {
            if (relationView) void feed.loadMore();
            else void loadAux(true);
          }}
        >
          Load next 20{view.view === 'incoming' || view.view === 'sent' ? ' requests' : ''}
        </button>
      )}
      {confirmation && (
        <FriendChangeDialog
          confirmation={confirmation}
          working={working}
          busy={busy}
          error={error}
          dateFormat={dateFormat}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmChange}
        />
      )}
      {inviteOpen && (
        <InviteLinkDialog
          creating={creatingInvite}
          link={link}
          now={now}
          copyState={copyState}
          error={error}
          dateFormat={dateFormat}
          onClose={closeInvite}
          onShare={(invite, native) => {
            void shareLink(invite, native);
          }}
          onOpenLinks={() => {
            closeInvite();
            if (view.view === 'invites') void refresh();
            else updateView({ view: 'invites' });
          }}
        />
      )}
    </section>
  );
}

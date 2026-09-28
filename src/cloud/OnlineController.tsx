import { lazy, Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import type { AppPage, Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import type { CatalogArtwork } from '../lib/discovery-catalog';
import type { PreviewAuthority } from '../lib/preview-authority';
import type { LibraryController } from '../lib/library-controller';
import { EMULATOR_MODE } from '../lib/online-availability';
import { authPanelPurposes } from '../lib/sign-in-purpose';
import type { SignInPurpose } from '../lib/sign-in-purpose';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { Avatar } from '../components/avatar/Avatar';
import { Dialog } from '../components/Dialog';
import { ChunkBoundary } from '../components/ChunkBoundary';
import { ChunkRecovery } from '../components/ChunkRecovery';
import { FriendSharingSummary } from '../components/FriendSharingSummary';
import { createMemoizedModule } from '../lib/memoized-module';
import { OnlinePageBoundary } from './OnlinePageBoundary';
import { navigateFriend } from './friend-page-actions';
import { currentDeletionApproval } from './account-deletion';
import type { OnlineBridge } from './ui-types';
import { withdrawDeviceLeftovers } from './device-leftovers';
import { useGoogleReturn, useOnlineSession } from './useOnlineSession';
import { useOnlineAccount } from './useOnlineAccount';
import { useOnlinePublication } from './useOnlinePublication';
import { useOnlineSharing } from './useOnlineSharing';
import { useOnlineFriends } from './useOnlineFriends';
import { useAccountActions } from './useAccountActions';
import { onlineBridge } from './online-bridge';
import './cloud-ui.css';
import './friends-ui.css';
import './friend-shelf.css';

const AuthPanel = lazy(
  createMemoizedModule(() => import('./AuthPanel').then((module) => ({ default: module.AuthPanel }))).load,
);
const AvatarPicker = lazy(
  createMemoizedModule(() =>
    import('../components/avatar/AvatarPicker').then((module) => ({ default: module.AvatarPicker })),
  ).load,
);
const AccountPage = lazy(
  createMemoizedModule(() => import('./AccountPage').then((module) => ({ default: module.AccountPage }))).load,
);
const CommunityPage = lazy(
  createMemoizedModule(() => import('./CommunityPage').then((module) => ({ default: module.CommunityPage }))).load,
);
const PublicProfilePage = lazy(
  createMemoizedModule(() => import('./PublicProfilePage').then((module) => ({ default: module.PublicProfilePage })))
    .load,
);
const PublishPage = lazy(
  createMemoizedModule(() => import('./PublishPage').then((module) => ({ default: module.PublishPage }))).load,
);
const CreatorPage = lazy(
  createMemoizedModule(() => import('./CreatorPage').then((module) => ({ default: module.CreatorPage }))).load,
);
const FriendsPage = lazy(
  createMemoizedModule(() => import('./FriendsPage').then((module) => ({ default: module.FriendsPage }))).load,
);
const FriendDetailPage = lazy(
  createMemoizedModule(() => import('./FriendDetailPage').then((module) => ({ default: module.FriendDetailPage })))
    .load,
);
const InvitationPage = lazy(
  createMemoizedModule(() => import('./InvitationPage').then((module) => ({ default: module.InvitationPage }))).load,
);
const FriendComparisonPage = lazy(
  createMemoizedModule(() =>
    import('./FriendComparisonPage').then((module) => ({ default: module.FriendComparisonPage })),
  ).load,
);
const FriendSharingPage = lazy(
  createMemoizedModule(() => import('./FriendSharingPage').then((module) => ({ default: module.FriendSharingPage })))
    .load,
);
const FriendShelfPage = lazy(
  createMemoizedModule(() => import('./FriendShelfPage').then((module) => ({ default: module.FriendShelfPage }))).load,
);
const FriendSharedGames = lazy(
  createMemoizedModule(() => import('./FriendSharedGames').then((module) => ({ default: module.FriendSharedGames })))
    .load,
);

// The online bridge: it composes the identity/session, account, publication, sharing and friends controllers, reports
// the online state to App, and renders the online page App routed to with the sign-in and creature dialogs.
export default function OnlineController({
  page,
  publicHandle,
  invitation,
  showSheet,
  signInPurpose,
  signInGames,
  onCompareSignIn,
  guest,
  games,
  onBridge,
  onCloseSheet,
  getSignInReturnFocus,
  onNavigate,
  onProfile,
  onOpenRecord,
  onShare,
  onPinRecord,
  artwork,
}: {
  page: AppPage;
  publicHandle: string;
  invitation: { capability: string | null; error: string };
  showSheet: boolean;
  guest: LibraryController;
  games: Game[];
  signInPurpose?: SignInPurpose;
  /** How many games the Compare tray holds, which its sign-in sheet names. */
  signInGames?: number;
  /**
   * Continues a sign-in the Compare tray started, with the device's pins, once that account has opened. `signedIn` is
   * whether that sign-in's session is still the current one.
   */
  onCompareSignIn?: (uid: string, pins: LibraryRecord[], signedIn: () => boolean) => void;
  onBridge: (bridge: OnlineBridge) => void;
  onCloseSheet: () => void;
  onNavigate: (page: AppPage) => void;
  getSignInReturnFocus?: (authenticated?: boolean) => HTMLElement | null;
  onProfile: (handle: string) => void;
  onOpenRecord: (record: LibraryRecord, authority?: PreviewAuthority) => void;
  onShare: (title: string, url: string) => void;
  onPinRecord?: (record: LibraryRecord) => boolean;
  artwork?: ReadonlyMap<string, CatalogArtwork>;
}) {
  const cloudPage = [
    'account',
    'publish',
    'community',
    'profile',
    'creator',
    'friends',
    'friend',
    'invite',
    'compare',
    'friend-sharing',
    'friend-shelf',
  ].includes(page);
  const session = useOnlineSession({
    page,
    invitation,
    showSheet,
    cloudPage,
    onCompareSignIn,
    onCloseSheet,
    onNavigate,
  });
  const { identity, identityRef, authSessionEpoch, busy, signInOpen, openInvitation, googleReturn } = session;
  const { returnSheet, setReturnSheet, setError, setMessage } = session;
  const online = useOnlineAccount({
    page,
    identity,
    identityRef,
    authGeneration: authSessionEpoch.current,
    guest,
    busy,
    setError,
    setMessage,
  });
  const { uid, scope, account, sync, member } = online;
  useGoogleReturn({ page, session, snapshot: account.snapshot, cacheError: account.error, deletion: online.deletion });
  const publication = useOnlinePublication({
    identity,
    identityRef,
    authSessionEpoch,
    currentEpoch: online.currentEpoch,
    member,
    cachedProfile: account.snapshot?.profile,
    social: online.social,
    setMember: online.setMember,
    setProfile: online.setProfile,
    refresh: online.refresh,
    verifiedIdentity: online.verifiedIdentity,
    run: session.run,
    setMessage,
    onProfile,
  });
  const { avatar, headerIdentity } = publication;
  const sharing = useOnlineSharing({
    page,
    uid,
    scope,
    snapshot: account.snapshot,
    verified: Boolean(identity?.verified),
    games,
    authGeneration: authSessionEpoch.current,
    signedIn: Boolean(identity),
    connected: Boolean(identity?.verified && account.snapshot?.sync.enabled),
  });
  const friendControls = useOnlineFriends({
    page,
    identity,
    name: headerIdentity?.name ?? null,
    avatar,
    member,
    friends: sharing.friends,
    shelf: sharing.shelf,
    authSessionEpoch,
    setError,
    onNavigate,
  });
  const actions = useAccountActions({
    session,
    online,
    sharing,
    guest,
    defaultAvatar: publication.defaultAvatar,
    onCloseSheet,
    onNavigate,
  });
  const { restoring, protectedController, active, cacheUnavailable, isCreator } = online;
  const { social, profile, head, headSnapshot, activeController } = online;
  const { setAvatarOpen, saveName, published } = publication;
  const { automatic, friends, shelf, sharingView } = sharing;
  const { friendIdentity, openComparison, compareKey, keepCompareGroup, prepareShelf } = friendControls;
  const { resendIn } = session;
  const syncEnabled = account.snapshot?.sync.enabled;
  const automaticSummary = sharing.automaticSummary;
  const bridge = useMemo(
    () =>
      onlineBridge({
        restoring,
        identity,
        signInOpen,
        controller: protectedController,
        scope,
        active,
        cacheUnavailable,
        syncEnabled,
        status: sync.status,
        pendingEdits: sync.pendingEdits,
        creator: isCreator,
        headerIdentity,
        friendSharing: automaticSummary,
      }),
    [
      restoring,
      identity,
      signInOpen,
      protectedController,
      scope,
      active,
      cacheUnavailable,
      syncEnabled,
      sync.status,
      sync.pendingEdits,
      isCreator,
      headerIdentity,
      automaticSummary,
    ],
  );
  useLayoutEffect(() => {
    onBridge(bridge);
  }, [bridge, onBridge]);
  // A sign-in withdraws any offer to finish removing an earlier account's device data: that account's next copy is not
  // what the removal left behind.
  useEffect(() => {
    if (identity) withdrawDeviceLeftovers();
  }, [identity]);

  const identityKey = `${identity?.uid ?? 'guest'}:${authSessionEpoch.current}:${account.snapshot?.sync.epoch ?? 0}:${Boolean(account.snapshot?.sync.enabled)}`;
  const pageScope = `${scope ?? 'guest'}:${authSessionEpoch.current}`;
  const pageRouteKey =
    page === 'profile'
      ? publicHandle
      : page === 'friend'
        ? location.pathname
        : page === 'compare'
          ? friendControls.compareKey
          : page === 'invite'
            ? (openInvitation.capability ?? '')
            : '';
  const visibleError = session.error || googleReturn?.error || '';
  const visibleMessage = session.message || googleReturn?.message || '';
  const visibleDeletionApproval = currentDeletionApproval(
    online.deletion.approval,
    identity?.uid,
    authSessionEpoch.current,
    online.accountEpoch,
  );
  const closeSignin = () => {
    setReturnSheet(false);
    onCloseSheet();
  };
  // The sheet the Compare tray opened, and the sheet its Google return reopens, name the pins and continue to Compare.
  const compareSheet = signInPurpose === 'compare' || (session.googleCompare && returnSheet);
  const purposes = authPanelPurposes(page, compareSheet ? 'compare' : signInPurpose);
  const renderAuthPanel = (purpose: SignInPurpose | undefined, sheet = false) => {
    const compare = sheet && compareSheet;
    return (
      <AuthPanel
        purpose={purpose}
        games={compare ? signInGames : undefined}
        busy={busy}
        error={visibleError}
        message={visibleMessage}
        onGoogle={() => session.google(compare)}
        onEmail={(address, password, create) => session.email(address, password, create, compare)}
        onReset={session.resetEmail}
        onDevice={() => {
          closeSignin();
          if (
            [
              'account',
              'publish',
              'creator',
              'friends',
              'friend',
              'invite',
              'compare',
              'friend-sharing',
              'friend-shelf',
            ].includes(page)
          )
            onNavigate('collection');
        }}
      />
    );
  };
  const authPanel = renderAuthPanel(purposes.page);
  if (session.startupError) throw new Error(session.startupError);
  return (
    <>
      {page === 'invite' && openInvitation.error && (
        <p className="inline-error" role="alert">
          {openInvitation.error}
        </p>
      )}
      {cloudPage && EMULATOR_MODE && (
        <p className="emulator-note emulator-page-note">
          Local emulator preview — no production account or cloud data connection.
        </p>
      )}
      {cloudPage && identity && session.sessionUnconfirmed && (
        <p className="account-notice" role="status">
          Signed in. Persistence across refresh has not yet been confirmed.
        </p>
      )}
      {cloudPage && (
        <OnlinePageBoundary scope={pageScope} page={page} routeKey={pageRouteKey}>
          {restoring ? (
            <div className="page-loading" role="status">
              <h1>Restoring account…</h1>
            </div>
          ) : page === 'community' ? (
            <CommunityPage social={social} onOpen={onProfile} onPublish={() => onNavigate('publish')} />
          ) : page === 'profile' ? (
            <PublicProfilePage
              social={social}
              handle={publicHandle}
              games={games}
              library={activeController}
              identity={identity ?? null}
              onOpenRecord={onOpenRecord}
              onShare={onShare}
              onAccount={() => onNavigate('account')}
              onFriend={navigateFriend}
            />
          ) : page === 'invite' ? (
            <InvitationPage
              store={friends.store}
              invitation={openInvitation}
              identity={friendIdentity}
              authPanel={authPanel}
              onAccount={() => onNavigate('account')}
              onFriends={() => onNavigate('friends')}
              onSettings={friends.acceptSettings}
            />
          ) : !identity ? (
            <section className="app-page auth-page">
              <h1 data-page-heading tabIndex={-1}>
                Sign in
              </h1>
              {authPanel}
            </section>
          ) : page === 'friends' && friendIdentity ? (
            <FriendsPage
              key={uid}
              store={friends.store}
              identity={friendIdentity}
              onSettings={friends.acceptSettings}
              onCommunity={() => onNavigate('community')}
              onCompare={openComparison}
              onSharedGames={() => onNavigate('friend-shelf')}
              sharingSummary={automaticSummary}
            />
          ) : page === 'friend' && friendIdentity ? (
            <FriendDetailPage
              key={`${uid}:${location.pathname}`}
              store={friends.store}
              uid={identity.uid}
              peer={location.pathname.split('/')[2] ?? ''}
              identity={friendIdentity}
              onSettings={friends.acceptSettings}
              onFriends={() => onNavigate('friends')}
              onCompare={openComparison}
              games={games}
              onOpen={onOpenRecord}
              sharedGames={
                <FriendSharedGames
                  key={`${uid}:${location.pathname}:${authSessionEpoch.current}`}
                  uid={identity.uid}
                  peer={location.pathname.split('/')[2] ?? ''}
                  authGeneration={authSessionEpoch.current}
                  verified={identity.verified}
                  store={shelf.store}
                  friends={friends.store}
                  games={games}
                  library={activeController}
                  onOpen={onOpenRecord}
                  onPin={onPinRecord}
                  artwork={artwork}
                />
              }
            />
          ) : (page === 'compare' || page === 'friend-sharing' || page === 'friend-shelf') && !games.length ? (
            <div className="page-loading" role="status">
              <h1>Loading games…</h1>
              <p>Retry the collection download if this does not finish.</p>
              <button className="text-button" onClick={() => onNavigate('collection')}>
                Open collection
              </button>
            </div>
          ) : page === 'compare' && friendIdentity ? (
            <FriendComparisonPage
              key={`${uid}:${compareKey}`}
              store={friends.store}
              uid={identity.uid}
              identity={friendIdentity}
              ownState={activeController.state}
              games={games}
              onOpen={onOpenRecord}
              onFriends={() => onNavigate('friends')}
              onGroupRoute={keepCompareGroup}
            />
          ) : (page === 'friend-sharing' || page === 'friend-shelf') && sharingView === 'automatic' ? (
            <section className="app-page">
              <h1 data-page-heading tabIndex={-1}>
                Shared with friends
              </h1>
              {automaticSummary}
              <button className="text-button" onClick={() => onNavigate('friends')}>
                Friends
              </button>
            </section>
          ) : (page === 'friend-sharing' || page === 'friend-shelf') && sharingView === 'checking' ? (
            <section className="app-page" aria-busy="true">
              <h1 data-page-heading tabIndex={-1}>
                {page === 'friend-shelf' ? 'Shared games' : 'Friends sharing'}
              </h1>
              <FriendSharingSummary
                mode="checking"
                status={automatic.status}
                canEnable={false}
                enabled={false}
                error={automatic.error}
                onEnable={automatic.enable}
                onStop={automatic.stopSharing}
                onRefresh={automatic.refresh}
              />
            </section>
          ) : page === 'friend-sharing' && friendIdentity ? (
            <FriendSharingPage
              key={uid}
              store={friends.store}
              identity={friendIdentity}
              settings={friends.settings}
              ownState={account.snapshot?.state ?? emptyPersonalLibrary()}
              connected={Boolean(account.snapshot?.sync.enabled)}
              games={games}
              onSettings={friends.acceptSettings}
              onAccount={() => onNavigate('account')}
              status={friends.status}
              error={friends.error}
            />
          ) : page === 'friend-shelf' && friendIdentity ? (
            <FriendShelfPage
              onAccount={() => onNavigate('account')}
              artwork={artwork}
              editor={{
                state: account.snapshot?.state ?? emptyPersonalLibrary(),
                games,
                config: shelf.config,
                identity: friendIdentity,
                connected: Boolean(identity.verified && account.snapshot?.sync.enabled),
                status: shelf.status,
                error: shelf.error,
                onPrepare: () => prepareShelf(friendIdentity),
                onSave: shelf.saveSelection,
                onStop: shelf.stopSharing,
                onRetry: shelf.retry,
              }}
            />
          ) : page === 'creator' ? (
            <CreatorPage
              key={identity.uid}
              social={social}
              allowed={isCreator}
              verified={identity.verified}
              onAccount={() => onNavigate('account')}
            />
          ) : page === 'publish' ? (
            <PublishPage
              key={identity.uid}
              social={social}
              identity={identity}
              member={member}
              avatar={avatar}
              state={activeController.state}
              games={games}
              existing={profile}
              isCreator={isCreator}
              onAccount={() => onNavigate('account')}
              onPublished={published}
            />
          ) : (
            <AccountPage
              key={`${identity.uid}:${Boolean(account.snapshot?.sync.enabled)}`}
              identity={identity}
              cancelledRegistration={online.cancelledRegistration}
              deletionState={online.deletionState}
              member={member}
              cache={account.snapshot}
              guest={guest.state}
              head={head}
              remoteReady={headSnapshot?.uid === identity.uid}
              status={active ? sync.status : 'device'}
              error={visibleError || account.error || sync.error}
              message={visibleMessage}
              cleanupWarning={sync.cleanupWarning}
              busy={busy || account.controller.busy}
              resendIn={resendIn}
              isCreator={isCreator}
              avatar={<Avatar descriptor={avatar} size={80} label="Your creature" />}
              onAvatar={() => setAvatarOpen(true)}
              onName={saveName}
              onConnect={actions.connect}
              onVerify={session.sendVerification}
              onRefreshIdentity={session.refreshIdentity}
              onSignOut={actions.signOut}
              onSignOutAndRemove={() => actions.signOut(true)}
              onLinkGoogle={actions.linkGoogle}
              onRetry={actions.retry}
              onCleanup={actions.cleanup}
              onPause={actions.pause}
              onDownload={actions.downloadData}
              onUseRemote={actions.chooseRemote}
              onUseLocal={actions.chooseLocal}
              googleDeletion={visibleDeletionApproval}
              onDismissDeletion={() => online.deletion.setApproval(null)}
              onFriends={() => onNavigate('friends')}
              onCompare={() => onNavigate('compare')}
              sharedGames={automaticSummary}
              friendsSharing={
                !automatic.controlsAll && (
                  <>
                    <button className="text-button" onClick={() => onNavigate('friend-sharing')}>
                      Selected ranking: {friends.status}
                    </button>
                    <button className="text-button" onClick={() => onNavigate('friend-shelf')}>
                      Selected saved games: {shelf.status}
                    </button>
                    {(friends.error || shelf.error) && (
                      <p className="inline-error" role="alert">
                        {friends.error || shelf.error}
                        <button
                          className="text-button"
                          onClick={() => {
                            void actions.retrySelectedSharing();
                          }}
                        >
                          Refresh selected sharing
                        </button>
                      </p>
                    )}
                  </>
                )
              }
              deletion={actions.deletionContext}
              onPublish={() => onNavigate('publish')}
              onCommunity={() => onNavigate('community')}
              onCreator={() => onNavigate('creator')}
            />
          )}
        </OnlinePageBoundary>
      )}
      {signInOpen && (
        <Dialog
          open
          titleId="account-signin-title"
          className="info-dialog signin-dialog"
          onClose={closeSignin}
          getReturnFocus={() => getSignInReturnFocus?.(Boolean(identityRef.current)) ?? null}
          motion={{ preset: 'dialog', enterMs: 160 }}
        >
          <h2 id="account-signin-title" data-autofocus tabIndex={-1}>
            Sign in
          </h2>
          <ChunkBoundary key={`${pageScope}:sign-in`} fallback={<ChunkRecovery message="Sign-in tools didn't load." />}>
            <Suspense fallback={<p role="status">Loading sign-in…</p>}>
              {renderAuthPanel(purposes.sheet, true)}
            </Suspense>
          </ChunkBoundary>
        </Dialog>
      )}
      {publication.avatarOpen && identity && (
        <Dialog
          open
          titleId="account-avatar-title"
          className="info-dialog"
          onClose={() => {
            if (!busy) publication.setAvatarOpen(false);
          }}
        >
          <ChunkBoundary
            key={`${pageScope}:${identityKey}`}
            fallback={
              <>
                <h2 id="account-avatar-title">Your creature</h2>
                <ChunkRecovery message="The creature picker didn't load." />
              </>
            }
          >
            <Suspense
              fallback={
                <>
                  <h2 id="account-avatar-title">Your creature</h2>
                  <p role="status">Loading creature picker…</p>
                </>
              }
            >
              <AvatarPicker
                value={avatar}
                identityKey={identityKey}
                titleId="account-avatar-title"
                onCancel={() => publication.setAvatarOpen(false)}
                onSave={(next) => publication.saveAvatar(identity, next)}
              />
            </Suspense>
          </ChunkBoundary>
        </Dialog>
      )}
    </>
  );
}

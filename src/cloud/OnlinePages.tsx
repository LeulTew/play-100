import { lazy } from 'react';
import type { ReactNode } from 'react';
import type { AppPage, Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import type { CatalogArtwork } from '../lib/discovery-catalog';
import type { PreviewAuthority } from '../lib/preview-authority';
import type { LibraryController } from '../lib/library-controller';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { createMemoizedModule } from '../lib/memoized-module';
import { Avatar } from '../components/avatar/Avatar';
import { FriendSharingSummary } from '../components/FriendSharingSummary';
import { OnlinePageBoundary } from './OnlinePageBoundary';
import { navigateFriend } from './friend-page-actions';
import type { GoogleDeletionApproval } from './account-deletion';
import type { OnlineSession } from './useOnlineSession';
import type { OnlineAccount } from './useOnlineAccount';
import type { OnlinePublication } from './useOnlinePublication';
import type { OnlineSharing } from './useOnlineSharing';
import type { OnlineFriends } from './useOnlineFriends';
import type { AccountActions } from './useAccountActions';

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

/** The online page App routed to, each loaded with its own module, inside the boundary that recovers a failed one. */
export function OnlinePages({
  page,
  publicHandle,
  games,
  artwork,
  guest,
  session,
  online,
  publication,
  sharing,
  friendControls,
  actions,
  authPanel,
  pageScope,
  routeKey,
  error,
  message,
  googleDeletion,
  onNavigate,
  onProfile,
  onOpenRecord,
  onShare,
  onPinRecord,
}: {
  page: AppPage;
  publicHandle: string;
  games: Game[];
  artwork?: ReadonlyMap<string, CatalogArtwork>;
  guest: LibraryController;
  session: OnlineSession;
  online: OnlineAccount;
  publication: OnlinePublication;
  sharing: OnlineSharing;
  friendControls: OnlineFriends;
  actions: AccountActions;
  /** The sign-in panel a page that needs an account shows in its place. */
  authPanel: ReactNode;
  pageScope: string;
  routeKey: string;
  error: string;
  message: string;
  googleDeletion: GoogleDeletionApproval | null;
  onNavigate: (page: AppPage) => void;
  onProfile: (handle: string) => void;
  onOpenRecord: (record: LibraryRecord, authority?: PreviewAuthority) => void;
  onShare: (title: string, url: string) => void;
  onPinRecord?: (record: LibraryRecord) => boolean;
}) {
  const { identity, authSessionEpoch, busy, openInvitation, resendIn } = session;
  const { uid, account, sync, social, member, profile, head, headSnapshot, isCreator } = online;
  const { restoring, active, activeController } = online;
  const { avatar, setAvatarOpen, saveName, published } = publication;
  const { automatic, friends, shelf, sharingView, automaticSummary } = sharing;
  const { friendIdentity, openComparison, compareKey, keepCompareGroup, prepareShelf } = friendControls;
  return (
    <OnlinePageBoundary scope={pageScope} page={page} routeKey={routeKey}>
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
          error={error || account.error || sync.error}
          message={message}
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
          googleDeletion={googleDeletion}
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
  );
}

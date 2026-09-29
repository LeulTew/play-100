import { lazy, Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import type { AppPage, Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import type { CatalogArtwork } from '../lib/discovery-catalog';
import type { PreviewAuthority } from '../lib/preview-authority';
import type { LibraryController } from '../lib/library-controller';
import { EMULATOR_MODE } from '../lib/online-availability';
import { authPanelPurposes } from '../lib/sign-in-purpose';
import type { AuthPurpose, SignInPurpose } from '../lib/sign-in-purpose';
import { Dialog } from '../components/Dialog';
import { ChunkBoundary } from '../components/ChunkBoundary';
import { ChunkRecovery } from '../components/ChunkRecovery';
import { createMemoizedModule } from '../lib/memoized-module';
// The idle preload (app-tool-preload.ts) imports these dynamically, and the offline core precaches each as its own
// entry chunk (scripts/pwa-build.ts). Rolldown keeps those chunks only while this module imports them too: imported
// only from useOnlineSession, each became an unnamed shared chunk and the build failed (online-bridge-closure.test.ts).
import '../lib/comparison-game-filter';
import '../lib/friend-comparison-intent';
import '../lib/google-intent';
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
import { useOnlineLocation } from './online-location';
import { OnlinePages } from './OnlinePages';
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
  const url = useOnlineLocation();
  const session = useOnlineSession({
    page,
    invitation,
    showSheet,
    cloudPage,
    onCompareSignIn,
    onCloseSheet,
    onNavigate,
  });
  const { identity, identityRef, authSessionEpochRef, authGeneration, busy, signInOpen, openInvitation, googleReturn } =
    session;
  const { returnSheet, setReturnSheet, setError, setMessage } = session;
  const online = useOnlineAccount({
    page,
    identity,
    identityRef,
    authGeneration,
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
    authSessionEpochRef,
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
    authGeneration,
    signedIn: Boolean(identity),
    connected: Boolean(identity?.verified && account.snapshot?.sync.enabled),
  });
  const friendControls = useOnlineFriends({
    identity,
    name: headerIdentity?.name ?? null,
    avatar,
    member,
    friends: sharing.friends,
    shelf: sharing.shelf,
    authSessionEpochRef,
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

  const identityKey = `${identity?.uid ?? 'guest'}:${authGeneration}:${account.snapshot?.sync.epoch ?? 0}:${Boolean(account.snapshot?.sync.enabled)}`;
  const pageScope = `${scope ?? 'guest'}:${authGeneration}`;
  const pageRouteKey =
    page === 'profile'
      ? publicHandle
      : page === 'friend'
        ? url.pathname
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
    authGeneration,
    online.accountEpoch,
  );
  const closeSignin = () => {
    setReturnSheet(false);
    onCloseSheet();
  };
  // The sheet the Compare tray opened, and the sheet its Google return reopens, name the pins and continue to Compare.
  const compareSheet = signInPurpose === 'compare' || (session.googleCompare && returnSheet);
  const purposes = authPanelPurposes(page, compareSheet ? 'compare' : signInPurpose);
  const renderAuthPanel = (purpose: AuthPurpose | undefined, sheet = false) => {
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
  const authPanel = () => renderAuthPanel(purposes.page);
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
        <OnlinePages
          page={page}
          url={url}
          publicHandle={publicHandle}
          games={games}
          artwork={artwork}
          guest={guest}
          session={session}
          online={online}
          publication={publication}
          sharing={sharing}
          friendControls={friendControls}
          actions={actions}
          renderAuthPanel={authPanel}
          pageScope={pageScope}
          routeKey={pageRouteKey}
          error={visibleError}
          message={visibleMessage}
          googleDeletion={visibleDeletionApproval}
          onNavigate={onNavigate}
          onProfile={onProfile}
          onOpenRecord={onOpenRecord}
          onShare={onShare}
          onPinRecord={onPinRecord}
        />
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

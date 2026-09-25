import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getIdTokenResult,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import type { AppPage, Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import type { CatalogArtwork } from '../lib/discovery-catalog';
import type { PreviewAuthority } from '../lib/preview-authority';
import type { LibraryController } from '../lib/library-controller';
import type { Member, PublicProfile } from '../lib/community';
import type { SyncHead } from '../lib/cloud-types';
import { accountScope, SYNC_LABELS } from '../lib/cloud-types';
import {
  cacheScopedProfile,
  connectScopedLibrary,
  deleteScopedLibrary,
  isInitialAccountCache,
  loadScopedLibrary,
  pauseScopedLibrary,
  restoreConsentedAccount,
} from '../lib/scoped-library';
import { createLibraryBackup, emptyPersonalLibrary } from '../lib/personal-library';
import { createAvatarDescriptor, generateAvatarDataUri } from '../lib/avatar';
import type { AvatarDescriptor } from '../lib/avatar';
import { EMULATOR_MODE, rememberOnlineRequest } from '../lib/online-availability';
import { authPanelPurposes } from '../lib/sign-in-purpose';
import type { SignInPurpose } from '../lib/sign-in-purpose';
import { useAccountLibrary } from '../hooks/useAccountLibrary';
import { flushPendingEdits, hasPendingEdits } from '../hooks/useExitSave';
import { Avatar } from '../components/avatar/Avatar';
import { Dialog } from '../components/Dialog';
import { ChunkBoundary } from '../components/ChunkBoundary';
import { ChunkRecovery } from '../components/ChunkRecovery';
import { createRetryableModule } from '../lib/retryable-module';
import { OnlinePageBoundary } from './OnlinePageBoundary';
import { cloudAuth, cloudDb, firebaseApp, initialAuthUser } from './firebase-client';
import { creatorAccess, deleteOwnMember } from './cloud-store';
import type { CloudStore, DeletionCopyState } from './cloud-store';
import { SocialStore } from './social-store';
import { useCloudSync } from './useCloudSync';
import { onlineError, popupCancelled } from './errors';
import { syncFailure } from '../lib/sync-retry';
import { finishGoogleRedirect, startGoogleRedirect } from './google-auth';
import type { GoogleReturn } from './google-auth';
import { readGoogleIntent } from '../lib/google-intent';
import {
  clearComparisonView,
  comparisonScope,
  initialComparison,
  rememberComparisonView,
} from '../lib/friend-comparison-intent';
import { clearComparisonGameFilter } from '../lib/comparison-game-filter';
import {
  cancelUnusedRegistration,
  ensureAccountActivity,
  readAccountLifecycle,
  removeCancelledRegistration,
} from './account-lifecycle';
import type { ConnectionChoice } from './AccountPage';
import type { AccountIdentity, OnlineBridge } from './ui-types';
import { hasProvider } from './account-providers';
import { useFriendSharing } from './useFriendSharing';
import { useFriendAll } from './useFriendAll';
import { friendSharingView } from '../lib/friend-all';
import { FriendSharingSummary } from '../components/FriendSharingSummary';
import { navigateFriend, prepareFriendIdentity } from './friend-page-actions';
import { useFriendShelf } from './useFriendShelf';
import { friendShelfJournal } from '../lib/friend-shelf-selection-cache';
import { committedFriendChange, committedFriendMessage } from './friend-outcomes';
import { signOutTransition } from './sign-out-transition';
import { libraryBackupText } from './backup-download';
import './cloud-ui.css';
import './friends-ui.css';
import './friend-shelf.css';

const AuthPanel = lazy(
  createRetryableModule(() => import('./AuthPanel').then((module) => ({ default: module.AuthPanel }))).load,
);
const AccountPage = lazy(
  createRetryableModule(() => import('./AccountPage').then((module) => ({ default: module.AccountPage }))).load,
);
const CommunityPage = lazy(
  createRetryableModule(() => import('./CommunityPage').then((module) => ({ default: module.CommunityPage }))).load,
);
const PublicProfilePage = lazy(
  createRetryableModule(() => import('./PublicProfilePage').then((module) => ({ default: module.PublicProfilePage })))
    .load,
);
const PublishPage = lazy(
  createRetryableModule(() => import('./PublishPage').then((module) => ({ default: module.PublishPage }))).load,
);
const CreatorPage = lazy(
  createRetryableModule(() => import('./CreatorPage').then((module) => ({ default: module.CreatorPage }))).load,
);
const FriendsPage = lazy(
  createRetryableModule(() => import('./FriendsPage').then((module) => ({ default: module.FriendsPage }))).load,
);
const FriendDetailPage = lazy(
  createRetryableModule(() => import('./FriendDetailPage').then((module) => ({ default: module.FriendDetailPage })))
    .load,
);
const InvitationPage = lazy(
  createRetryableModule(() => import('./InvitationPage').then((module) => ({ default: module.InvitationPage }))).load,
);
const FriendComparisonPage = lazy(
  createRetryableModule(() =>
    import('./FriendComparisonPage').then((module) => ({ default: module.FriendComparisonPage })),
  ).load,
);
const FriendSharingPage = lazy(
  createRetryableModule(() => import('./FriendSharingPage').then((module) => ({ default: module.FriendSharingPage })))
    .load,
);
const FriendShelfPage = lazy(
  createRetryableModule(() => import('./FriendShelfPage').then((module) => ({ default: module.FriendShelfPage }))).load,
);
const FriendSharedGames = lazy(
  createRetryableModule(() => import('./FriendSharedGames').then((module) => ({ default: module.FriendSharedGames })))
    .load,
);
const AvatarPicker = lazy(
  createRetryableModule(() =>
    import('../components/avatar/AvatarPicker').then((module) => ({ default: module.AvatarPicker })),
  ).load,
);

interface GoogleDeletionApproval {
  requestId: string;
  uid: string;
  target: 'copy' | 'account';
  epoch: number;
  sessionEpoch: number;
  startedAt: number;
  expiresAt: number;
}
const loadingAvatar: AvatarDescriptor = { version: 1, seed: '00000000000000000000000000000000', palette: 'moss' };

function identityOf(
  user: User,
  verified: boolean,
  verificationPending = !verified && user.emailVerified,
): AccountIdentity {
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    verified,
    verificationPending,
    providers: user.providerData.map((provider) => provider.providerId),
  };
}
// Every download is compact JSON; library backups also carry the Backup import's byte budget (libraryBackupText).
function download(text: string, name: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function OnlineController({
  page,
  publicHandle,
  invitation,
  showSheet,
  signInPurpose,
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
  const [identity, setIdentity] = useState<AccountIdentity | null | undefined>();
  const [memberSnapshot, setMember] = useState<Member | null>(null);
  const memberReadVersion = useRef(0);
  const [profileSnapshot, setProfile] = useState<PublicProfile | null>(null);
  const [headSnapshot, setHeadSnapshot] = useState<{ uid: string; value: SyncHead | null } | null>(null);
  const [creatorUid, setCreatorUid] = useState<string | null>(null);
  const [cancelledUid, setCancelledUid] = useState<string | null>(null);
  const member = memberSnapshot?.uid === identity?.uid ? memberSnapshot : null;
  const profile = profileSnapshot?.uid === identity?.uid ? profileSnapshot : null;
  const head = headSnapshot?.uid === identity?.uid ? (headSnapshot?.value ?? null) : null;
  const isCreator = Boolean(identity?.verified && creatorUid === identity.uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sessionUnconfirmed, setSessionUnconfirmed] = useState(false);
  const [googleReturn, setGoogleReturn] = useState<GoogleReturn | null>(null);
  const [returnSheet, setReturnSheet] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [deletionApproval, setDeletionApproval] = useState<GoogleDeletionApproval | null>(null);
  const [deletionNotice, setDeletionNotice] = useState<{ key: string; state: DeletionCopyState } | null>(null);
  const deletionProbe = useRef<{ key: string; result: Promise<DeletionCopyState> } | null>(null);
  const handledGoogleReturn = useRef<string | null>(null);
  const navigation = useRef({ page, onCloseSheet, onNavigate });
  navigation.current = { page, onCloseSheet, onNavigate };
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [defaultAvatar, setDefaultAvatar] = useState(() => createAvatarDescriptor());
  const defaultAvatarUid = useRef<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [now, setNow] = useState(Date.now());
  const running = useRef(false);
  const identityRead = useRef<{ uid: string; promise: Promise<AccountIdentity> } | null>(null);
  const refreshedMismatch = useRef(new Set<string>());
  const authSessionEpoch = useRef(0);
  const authSessionUid = useRef<string | null>(null);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const uid = identity?.uid;
  useEffect(() => {
    let current = true;
    setCancelledUid(null);
    if (uid)
      void readAccountLifecycle(cloudDb, uid)
        .then((state) => {
          if (current && cloudAuth.currentUser?.uid === uid) setCancelledUid(state === 'cancelled' ? uid : null);
        })
        .catch((cause) => {
          if (current && cloudAuth.currentUser?.uid === uid) setError(onlineError(cause));
        });
    return () => {
      current = false;
    };
  }, [uid]);
  const scope = useMemo(() => (uid ? accountScope(uid, firebaseApp.options.projectId) : null), [uid]);
  const identityIsCurrent = useCallback(() => cloudAuth.currentUser?.uid === uid, [uid]);
  const account = useAccountLibrary(scope, guest.state.motion, identityIsCurrent);
  const refreshAccount = account.refresh;
  const social = useMemo(() => new SocialStore(cloudDb), []);
  const friendToolsVisible = [
    'account',
    'friends',
    'friend',
    'invite',
    'compare',
    'friend-sharing',
    'friend-shelf',
  ].includes(page);
  const automatic = useFriendAll(
    uid,
    scope,
    account.snapshot,
    Boolean(identity?.verified),
    games,
    authSessionEpoch.current,
  );
  const friends = useFriendSharing(
    uid,
    scope,
    account.snapshot,
    Boolean(identity?.verified),
    games,
    friendToolsVisible,
    authSessionEpoch.current,
    !automatic.ready || automatic.controlsAll,
  );
  const shelf = useFriendShelf(
    uid,
    scope,
    account.snapshot,
    Boolean(identity?.verified),
    games,
    friendToolsVisible,
    authSessionEpoch.current,
    friendShelfJournal,
    !automatic.ready || automatic.controlsAll,
  );
  const restoreInitial = useCallback(
    async (store: CloudStore, isCurrent: () => boolean) => {
      if (!scope || !uid || !isCurrent()) return;
      const local = await loadScopedLibrary(scope);
      if (!isCurrent() || !isInitialAccountCache(local)) return;
      const [savedMember, savedHead] = await Promise.all([social.member(uid), store.head()]);
      if (!isCurrent()) return;
      setMember(savedMember);
      setHeadSnapshot({ uid, value: savedHead });
      if (
        !savedMember ||
        savedMember.consentVersion !== 1 ||
        !savedHead?.enabled ||
        savedHead.deleted ||
        !savedHead.current
      )
        return;
      const incoming = await store.download(savedHead, false, isCurrent);
      if (!incoming) throw new Error('The online copy is incomplete. Choose a copy or try again.');
      const fresh = await store.head();
      if (!isCurrent()) return;
      if (
        !fresh?.enabled ||
        fresh.deleted ||
        fresh.epoch !== savedHead.epoch ||
        fresh.revision !== savedHead.revision ||
        fresh.current?.digest !== savedHead.current.digest
      ) {
        setHeadSnapshot({ uid, value: fresh });
        if (!fresh?.enabled || fresh.deleted) return;
        throw Object.assign(new Error('The online copy changed during restoration. Checking again automatically.'), {
          code: 'aborted',
        });
      }
      await restoreConsentedAccount(scope, incoming, fresh, savedMember, () => isCurrent() && !hasPendingEdits());
      if (isCurrent()) {
        setMessage('Online library restored.');
        await refreshAccount();
      }
    },
    [scope, uid, social, refreshAccount],
  );
  const sync = useCloudSync(
    scope,
    account.snapshot,
    Boolean(identity?.verified),
    restoreInitial,
    authSessionEpoch.current,
  );
  const reportProfileError = sync.reportProfileError;
  const active = Boolean(scope && account.snapshot && account.snapshot.sync.epoch > 0);
  const restoring =
    identity === undefined || Boolean(identity && !account.snapshot && !account.error) || sync.restoringInitial;
  const cacheUnavailable = Boolean(identity && account.error && !account.snapshot);
  const canCacheProfile = Boolean(account.snapshot && !account.error);
  const cacheNow = useRef(account.snapshot);
  cacheNow.current = account.snapshot;
  const cacheReady = useRef(canCacheProfile);
  cacheReady.current = canCacheProfile;
  const protectedController = useMemo(
    () => (cacheUnavailable ? { ...account.controller, busy: true } : active ? account.controller : null),
    [cacheUnavailable, active, account.controller],
  );
  const activeController = protectedController ?? guest;
  const currentEpoch = useRef(account.snapshot?.sync.epoch ?? 0);
  currentEpoch.current = account.snapshot?.sync.epoch ?? 0;

  const reconcileIdentity = useCallback((user: User, force = false): Promise<AccountIdentity> => {
    if (identityRead.current?.uid === user.uid) return identityRead.current.promise;
    const task = (async () => {
      let token = await getIdTokenResult(user, force);
      if (user.emailVerified && token.claims.email_verified !== true && !refreshedMismatch.current.has(user.uid)) {
        refreshedMismatch.current.add(user.uid);
        token = await getIdTokenResult(user, true);
      }
      const next = identityOf(user, token.claims.email_verified === true);
      if (cloudAuth.currentUser?.uid === user.uid) {
        setIdentity(next);
        void rememberOnlineRequest(true);
      }
      return next;
    })();
    const entry = { uid: user.uid, promise: task };
    identityRead.current = entry;
    void task.then(
      () => {
        if (identityRead.current === entry) identityRead.current = null;
      },
      () => {
        if (identityRead.current === entry) identityRead.current = null;
      },
    );
    return task;
  }, []);
  useEffect(() => {
    let alive = true;
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      if (alive)
        setStartupError('Account restoration timed out. Reload when connected, or keep using the device library.');
    }, 45000);
    const settled = () => window.clearTimeout(timeout);
    void Promise.all([finishGoogleRedirect(cloudAuth), initialAuthUser])
      .then(([outcome, restoredUid]) => {
        if (!alive) return;
        setSessionUnconfirmed(!restoredUid || outcome.completed);
        if (outcome.attempted) {
          setGoogleReturn(outcome);
          setReturnSheet(!outcome.completed);
        }
        unsubscribe = onIdTokenChanged(
          cloudAuth,
          (user) => {
            if ((user?.uid ?? null) !== authSessionUid.current) {
              if (authSessionUid.current) {
                clearComparisonView(comparisonScope(firebaseApp.options.projectId ?? '', authSessionUid.current));
                clearComparisonGameFilter(accountScope(authSessionUid.current, firebaseApp.options.projectId));
              }
              authSessionUid.current = user?.uid ?? null;
              authSessionEpoch.current += 1;
              if (user) setIdentity(undefined);
            }
            if (!user) {
              identityRead.current = null;
              refreshedMismatch.current.clear();
              setIdentity(null);
              settled();
              return;
            }
            void reconcileIdentity(user)
              .catch((cause) => {
                if (alive && cloudAuth.currentUser?.uid === user.uid) {
                  setIdentity(identityOf(user, false, true));
                  setError(onlineError(cause));
                }
              })
              .finally(settled);
          },
          (cause) => {
            setIdentity(null);
            setError(onlineError(cause));
            settled();
          },
        );
      })
      .catch((cause) => {
        if (alive) {
          setStartupError(onlineError(cause));
          settled();
        }
      });
    const restorePage = (event: PageTransitionEvent) => {
      if (event.persisted && readGoogleIntent().raw !== null) location.reload();
    };
    window.addEventListener('pageshow', restorePage);
    return () => {
      alive = false;
      settled();
      unsubscribe();
      window.removeEventListener('pageshow', restorePage);
    };
  }, [reconcileIdentity]);
  useEffect(() => {
    setMember(null);
    setProfile(null);
    setHeadSnapshot(null);
    setCreatorUid(null);
    setError('');
    setMessage('');
    setAvatarOpen(false);
    setDeletionApproval(null);
  }, [identity?.uid]);
  useLayoutEffect(() => {
    defaultAvatarUid.current = uid ?? null;
    setDefaultAvatar(createAvatarDescriptor());
  }, [uid]);
  useEffect(() => {
    const returned = googleReturn;
    if (
      !returned?.completed ||
      !returned.intent ||
      !identity ||
      identity.uid !== returned.uid ||
      cloudAuth.currentUser?.uid !== returned.uid
    )
      return;
    const intent = returned.intent;
    if (handledGoogleReturn.current === intent.requestId) return;
    if (intent.kind === 'reauthenticate' && !account.snapshot && !account.error) return;
    handledGoogleReturn.current = intent.requestId;
    setReturnSheet(false);
    if (intent.kind === 'sign-in') {
      rememberOnlineRequest(true);
      navigation.current.onCloseSheet();
      if (
        !['publish', 'creator', 'friends', 'friend', 'invite', 'compare', 'friend-sharing', 'friend-shelf'].includes(
          navigation.current.page,
        )
      )
        navigation.current.onNavigate('account');
    } else if (intent.kind === 'link') setMessage('Google is linked to this existing account.');
    else if (intent.epoch !== (account.snapshot?.sync.epoch ?? 0)) {
      setError(
        'This account changed while Google was open. Nothing was deleted. Review the account before confirming again.',
      );
    } else {
      setDeletionApproval({
        requestId: intent.requestId,
        uid: identity.uid,
        target: intent.target,
        epoch: intent.epoch,
        sessionEpoch: authSessionEpoch.current,
        startedAt: intent.createdAt,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      setMessage('Google confirmed this account. Nothing has been deleted; review and confirm the deletion below.');
    }
  }, [googleReturn, identity, account.snapshot, account.error]);
  useEffect(() => {
    if (page !== 'account') setDeletionApproval(null);
  }, [page]);
  useEffect(() => {
    if (!deletionApproval) return;
    const requestId = deletionApproval.requestId;
    const timeout = window.setTimeout(
      () => {
        setDeletionApproval((current) => (current?.requestId === requestId ? null : current));
      },
      Math.max(0, deletionApproval.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [deletionApproval]);
  useEffect(() => {
    if (cooldown <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown, now]);
  const refresh = useCallback(
    async (includeMember = true) => {
      const user = identityRef.current;
      if (!user?.verified || !sync.store) return;
      const version = memberReadVersion.current;
      const [nextMember, nextProfile, nextHead, allowed] = await Promise.all([
        includeMember ? social.member(user.uid) : Promise.resolve(undefined),
        social.ownProfile(user.uid),
        cacheNow.current?.sync.enabled || isInitialAccountCache(cacheNow.current)
          ? Promise.resolve(undefined)
          : sync.store.head(),
        creatorAccess(cloudDb),
      ]);
      if (identityRef.current?.uid !== user.uid) return;
      if (nextMember !== undefined && version === memberReadVersion.current) setMember(nextMember);
      setProfile(nextProfile);
      if (nextHead !== undefined) setHeadSnapshot({ uid: user.uid, value: nextHead });
      setCreatorUid(allowed ? user.uid : null);
      if (nextMember && scope && cacheReady.current && version === memberReadVersion.current) {
        try {
          await cacheScopedProfile(
            scope,
            nextMember,
            () => cloudAuth.currentUser?.uid === user.uid && version === memberReadVersion.current,
          );
        } catch (cause) {
          if (identityRef.current?.uid === user.uid)
            setError(`Online profile loaded, but its copy on this device could not update. ${onlineError(cause)}`);
        }
      }
    },
    [social, sync.store, scope],
  );
  const accountReady = Boolean(account.snapshot || account.error);
  useEffect(() => {
    if (!identity?.verified || !accountReady || !sync.profileAvailable) return;
    let alive = true;
    const uid = identity.uid;
    void refresh(false).catch((cause) => {
      if (!alive || cloudAuth.currentUser?.uid !== uid) return;
      if (syncFailure(cause) !== 'blocked') reportProfileError(cause);
      else setError(onlineError(cause));
    });
    return () => {
      alive = false;
    };
  }, [
    identity?.uid,
    identity?.verified,
    accountReady,
    refresh,
    sync.profileAvailable,
    sync.profileConnection,
    reportProfileError,
  ]);
  useEffect(() => {
    if (sync.remote && uid) setHeadSnapshot({ uid, value: sync.remote });
  }, [sync.remote, uid]);
  const deletionKey =
    page === 'account' && identity?.verified && head?.deleted
      ? `${identity.uid}:${authSessionEpoch.current}:${head.epoch}:${head.revision}`
      : null;
  const deletionState =
    head?.deleted && head.cleanupEpoch === head.epoch
      ? 'complete'
      : deletionNotice && deletionNotice.key === deletionKey
        ? deletionNotice.state
        : 'checking';
  useEffect(() => {
    if (!deletionKey) {
      deletionProbe.current = null;
      setDeletionNotice(null);
      return;
    }
    if (busy || !sync.store || (head?.deleted && head.cleanupEpoch === head.epoch)) return;
    let alive = true;
    const cached = deletionProbe.current;
    const probe = cached?.key === deletionKey ? cached : { key: deletionKey, result: sync.store.probeDeletedCopy() };
    deletionProbe.current = probe;
    void probe.result.then((state) => {
      if (alive && deletionProbe.current === probe) setDeletionNotice({ key: deletionKey, state });
    });
    return () => {
      alive = false;
    };
  }, [deletionKey, busy, sync.store, head?.cleanupEpoch, head?.epoch, head?.deleted]);
  useEffect(() => {
    if (!uid || !scope || !identity?.verified || !sync.profileAvailable) return;
    let alive = true;
    let caching = '';
    const unsubscribe = social.watchMember(
      uid,
      (next) => {
        if (!alive || cloudAuth.currentUser?.uid !== uid) return;
        memberReadVersion.current += 1;
        setMember((previous) =>
          previous?.uid === uid && next && previous.updatedAt > next.updatedAt ? previous : next,
        );
        if (!next || !cacheReady.current) return;
        const cached = cacheNow.current?.profile;
        const fingerprint = `${next.displayName}:${next.avatar.version}:${next.avatar.seed}:${next.avatar.palette}`;
        if (
          caching === fingerprint ||
          (cached?.displayName === next.displayName &&
            cached.avatar.version === next.avatar.version &&
            cached.avatar.seed === next.avatar.seed &&
            cached.avatar.palette === next.avatar.palette)
        )
          return;
        caching = fingerprint;
        void cacheScopedProfile(scope, next, () => alive && cloudAuth.currentUser?.uid === uid).catch((cause) => {
          if (alive && cloudAuth.currentUser?.uid === uid) {
            caching = '';
            setError(`Your online profile loaded, but its copy on this device could not update. ${onlineError(cause)}`);
          }
        });
      },
      (cause) => {
        if (alive && cloudAuth.currentUser?.uid === uid) reportProfileError(cause);
      },
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [uid, scope, identity?.verified, sync.profileAvailable, sync.profileConnection, reportProfileError, social]);

  const avatar =
    member?.avatar ??
    account.snapshot?.profile?.avatar ??
    (defaultAvatarUid.current === uid ? defaultAvatar : loadingAvatar);
  const headerIdentity = useMemo(
    () =>
      identity
        ? {
            uid: identity.uid,
            name: member?.displayName || account.snapshot?.profile?.displayName || identity.displayName || 'Player',
            avatarSrc: generateAvatarDataUri(avatar),
          }
        : null,
    [identity, member?.displayName, account.snapshot?.profile?.displayName, avatar],
  );
  const friendIdentity =
    identity && headerIdentity
      ? { uid: identity.uid, verified: identity.verified, displayName: headerIdentity.name, avatar }
      : null;
  const committedFriendIdentity = useRef(friendIdentity);
  committedFriendIdentity.current = friendIdentity;
  const friendIdentityReady = Boolean(friends.settings && !friends.settings.deleted);
  const memberName = member?.displayName;
  const memberAvatar = member?.avatar;
  useEffect(() => {
    if (!uid || !identity?.verified || !friendIdentityReady || memberName === undefined || !memberAvatar) return;
    let alive = true;
    const source = `${memberName}:${JSON.stringify(memberAvatar)}`;
    void (async () => {
      const old = await friends.store.identity(uid);
      if (!alive || !old || cloudAuth.currentUser?.uid !== uid) return;
      if (old.displayName === memberName && JSON.stringify(old.avatar) === JSON.stringify(memberAvatar)) return;
      const current = committedFriendIdentity.current;
      if (!current || `${current.displayName}:${JSON.stringify(current.avatar)}` !== source) return;
      await friends.store.saveIdentity(uid, { displayName: memberName, avatar: memberAvatar }, old.revision);
    })().catch((cause) => {
      if (alive && cloudAuth.currentUser?.uid === uid) setError(`Friend profile update pending. ${onlineError(cause)}`);
    });
    return () => {
      alive = false;
    };
  }, [uid, identity?.verified, friendIdentityReady, friends.store, memberName, memberAvatar]);
  const canEnableAll = 'canEnable' in automatic.eligibility && automatic.eligibility.canEnable;
  const sharingView = friendSharingView({
    controlsAll: automatic.controlsAll,
    connected: Boolean(identity?.verified && account.snapshot?.sync.enabled),
    ready: automatic.ready,
    eligibility: automatic.eligibility,
  });
  const hasIdentity = Boolean(identity);
  const automaticSummary = useMemo(
    () =>
      hasIdentity ? (
        <FriendSharingSummary
          mode={automatic.eligibility.kind}
          status={automatic.status}
          canEnable={canEnableAll}
          enabled={Boolean(automatic.policy?.enabled)}
          error={automatic.error}
          onEnable={automatic.enable}
          onStop={automatic.stopSharing}
          onRefresh={automatic.refresh}
          progress={
            automatic.progress && automatic.status !== 'saved' ? (
              <p className="section-help" role="status">
                {(['games', 'ranking'] as const).map((kind) => {
                  const progress = automatic.progress?.[kind];
                  return progress ? (
                    <span key={kind}>
                      {kind === 'games' ? 'Saved games' : 'Rankings'}:{' '}
                      {progress.ready
                        ? `${progress.targetCount} ready`
                        : `${progress.applied} / ${progress.total} changes confirmed`}
                      .{' '}
                    </span>
                  ) : null;
                })}
              </p>
            ) : null
          }
        />
      ) : null,
    [
      hasIdentity,
      automatic.eligibility.kind,
      automatic.status,
      canEnableAll,
      automatic.policy?.enabled,
      automatic.error,
      automatic.enable,
      automatic.stopSharing,
      automatic.refresh,
      automatic.progress,
    ],
  );
  const bridge = useMemo<OnlineBridge>(
    () => ({
      loading: restoring,
      identity: identity ?? null,
      controller: protectedController,
      scope: (active || cacheUnavailable) && scope ? scope : 'guest',
      enabled: active && Boolean(account.snapshot?.sync.enabled && identity?.verified),
      status: cacheUnavailable ? 'error' : active ? sync.status : 'device',
      label: cacheUnavailable
        ? 'Device copy unavailable'
        : active
          ? sync.pendingEdits
            ? 'Finishing local edits…'
            : SYNC_LABELS[sync.status]
          : 'Device only',
      creator: isCreator,
      headerIdentity,
      friendSharing: automaticSummary,
    }),
    [
      identity,
      restoring,
      active,
      protectedController,
      cacheUnavailable,
      account.snapshot?.sync.enabled,
      scope,
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

  const run = async (operation: () => Promise<void>, identityChange = false): Promise<boolean> => {
    if (running.current) return false;
    const startedUid = identityRef.current?.uid;
    running.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setGoogleReturn(null);
    try {
      await operation();
      return true;
    } catch (cause) {
      if (identityChange || identityRef.current?.uid === startedUid) {
        const committed = startedUid ? committedFriendChange(cause, startedUid) : null;
        if (committed) {
          setMessage(committedFriendMessage(committed));
          setError('The remaining steps have not finished. Refresh before continuing this action.');
        } else if (!popupCancelled(cause)) setError(onlineError(cause));
      }
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const afterSignIn = async (user: User) => {
    await reconcileIdentity(user);
    if (cloudAuth.currentUser?.uid !== user.uid) return;
    rememberOnlineRequest(true);
    onCloseSheet();
    if (
      !['publish', 'creator', 'friends', 'friend', 'invite', 'compare', 'friend-sharing', 'friend-shelf'].includes(page)
    )
      onNavigate('account');
  };
  const google = () =>
    run(async () => {
      const session = authSessionEpoch.current;
      if (!(await flushPendingEdits())) throw new Error('Finish or correct the open rating/note before signing in.');
      if (authSessionEpoch.current !== session || cloudAuth.currentUser)
        throw new Error('The signed-in account changed. Review Account before continuing.');
      await startGoogleRedirect(cloudAuth, { kind: 'sign-in', uid: null });
    }, true);
  const linkGoogle = () =>
    run(async () => {
      const { user } = verifiedIdentity();
      const session = authSessionEpoch.current;
      if (!(await flushPendingEdits())) throw new Error('Finish or correct the open edit before linking Google.');
      await account.waitForWrites();
      if (cloudAuth.currentUser?.uid !== user.uid || authSessionEpoch.current !== session)
        throw new Error('The account changed. No other account was linked.');
      await startGoogleRedirect(cloudAuth, { kind: 'link', uid: user.uid });
    });
  const email = (address: string, password: string, create: boolean) =>
    run(async () => {
      if (!(await flushPendingEdits())) throw new Error('Finish or correct the open edit before signing in.');
      const result = create
        ? await createUserWithEmailAndPassword(cloudAuth, address, password)
        : await signInWithEmailAndPassword(cloudAuth, address, password);
      await afterSignIn(result.user);
    }, true);
  const sendVerification = () =>
    run(async () => {
      const user = cloudAuth.currentUser;
      if (!user) throw new Error('Sign in before requesting verification.');
      if (user.emailVerified) {
        const next = await reconcileIdentity(user, true);
        setMessage(
          next.verified
            ? 'Your email is verified. You can continue with this account.'
            : 'The signed-in session could not yet confirm verification. Use I verified my email to retry.',
        );
        return;
      }
      if (Date.now() < cooldown) throw new Error('Wait for the resend countdown before requesting another email.');
      await sendEmailVerification(user, { url: `${location.origin}/account` });
      setCooldown(Date.now() + 60000);
      setNow(Date.now());
      setMessage('Verification email requested. Check your inbox and spam folder, then return here.');
    });
  const resetEmail = (address: string) =>
    run(async () => {
      if (!address) throw new Error('Enter your email before requesting a reset.');
      if (Date.now() < cooldown) throw new Error('Wait a minute before requesting another email.');
      await sendPasswordResetEmail(cloudAuth, address, { url: `${location.origin}/account` });
      setCooldown(Date.now() + 60000);
      setNow(Date.now());
      setMessage(
        'If this account can receive password reset emails, one has been requested. Check your inbox and spam folder.',
      );
    }, true);
  const verifiedIdentity = () => {
    const user = cloudAuth.currentUser;
    if (
      !user ||
      !identityRef.current?.verified ||
      !scope ||
      !sync.store ||
      !account.snapshot ||
      user.uid !== identityRef.current?.uid
    )
      throw new Error('Verify this account and wait for its local cache before continuing.');
    return { user, scope, store: sync.store, local: account.snapshot };
  };
  const connect = (choice: ConnectionChoice, name: string) =>
    run(async () => {
      if (!(await flushPendingEdits())) throw new Error('Finish or correct the open edit before connecting.');
      const { user, scope: target, store, local } = verifiedIdentity();
      const expected = { localRevision: local.state.revision, epoch: local.sync.epoch, enabled: local.sync.enabled };
      const before = await store.head();
      if (
        headSnapshot?.uid !== user.uid ||
        (before?.revision ?? 0) !== (head?.revision ?? 0) ||
        (before?.epoch ?? 0) !== (head?.epoch ?? 0)
      ) {
        setHeadSnapshot({ uid: user.uid, value: before });
        throw new Error(
          'The online library changed since this preview. Review the available copies before connecting.',
        );
      }
      if (choice === 'empty' && before?.current)
        throw new Error(
          'An online library already exists. Choose it or explicitly choose a replacement; an empty start is not available.',
        );
      if (choice === 'guest' && Object.keys(guest.state.records).length === 0)
        throw new Error('The guest copy changed and is now empty. Review the available starting copies.');
      if (choice === 'cached' && local.sync.epoch === 0 && Object.keys(local.state.records).length === 0)
        throw new Error('This account has no previous device copy to use.');
      if (before?.deleted) {
        const token = await getIdTokenResult(user, true);
        if (typeof token.claims.auth_time !== 'number' || token.claims.auth_time * 1000 <= before.updatedAt)
          throw new Error(
            'This online copy was deleted. Sign out and sign in again before creating a new online copy.',
          );
      }
      const remoteCopy = before?.current ? await store.download(before) : null;
      const chosen =
        choice === 'online'
          ? remoteCopy
          : choice === 'guest'
            ? guest.state
            : choice === 'cached'
              ? local.state
              : emptyPersonalLibrary();
      if (!chosen) throw new Error('There is no complete online copy to adopt. Choose another starting library.');
      if (identityRef.current?.uid !== user.uid)
        throw new Error('The signed-in account changed. No device copy was imported.');
      const enabledHead = before?.deleted ? await store.enable(before) : before;
      await social.saveMemberName(user.uid, name, member?.avatar ?? defaultAvatar);
      const connectedHead = before?.deleted && enabledHead ? enabledHead : await store.enable(before);
      await connectScopedLibrary(target, chosen, connectedHead, name.trim(), choice !== 'online', expected);
      await social.restorePublicationPermission(user.uid);
      await account.refresh();
      await refresh();
      setMessage('Online saving enabled.');
    });
  const signOutAccount = (removeDeviceCopy = false) =>
    run(async () => {
      const user = cloudAuth.currentUser;
      const target = scope;
      const session = authSessionEpoch.current;
      if (!(await flushPendingEdits())) throw new Error('Correct the pending edit before signing out.');
      const current = () =>
        Boolean(user && cloudAuth.currentUser?.uid === user.uid && authSessionEpoch.current === session);
      if (!user || !target || !current())
        throw new Error('The signed-in account changed. Review Account before signing out.');
      await signOutTransition(removeDeviceCopy, {
        current,
        waitForWrites: account.waitForWrites,
        readDeviceCopy: () => loadScopedLibrary(target),
        suspend: () => [sync.suspend(), friends.stop(), shelf.stop(), automatic.suspend()],
        signOut: () => signOut(cloudAuth),
        removeDeviceCopy: (revision) => deleteScopedLibrary(target, revision),
      });
      await rememberOnlineRequest(false);
      setIdentity(null);
      onCloseSheet();
      onNavigate('collection');
    }, true);
  const openComparison = (peers?: string[]) => {
    if (!identity || cloudAuth.currentUser?.uid !== identity.uid) return;
    const selected = peers
      ? initialComparison(comparisonScope(firebaseApp.options.projectId ?? '', identity.uid), identity.uid, peers)
      : null;
    if (selected) rememberComparisonView(selected, false);
    onNavigate('compare');
    if (selected) rememberComparisonView(selected, true);
  };
  const pause = () =>
    run(async () => {
      const { scope: target, store } = verifiedIdentity();
      if (!navigator.onLine)
        throw new Error('Connect before stopping online saving on all devices. Offline edits are retained here.');
      sync.suspend();
      friends.stop();
      shelf.stop();
      automatic.suspend();
      const current = await store.head();
      if (current) await store.revoke(current);
      await pauseScopedLibrary(target);
      await account.refresh();
      await refresh();
      setMessage(
        "Online saving is stopped. The online copy and this account's copy on this device are kept; your guest library is separate.",
      );
    });
  const downloadData = (source: 'local' | 'online' | 'guest' | 'all') =>
    run(async () => {
      if (!(await flushPendingEdits())) throw new Error('Correct the pending edit before exporting.');
      if (source === 'guest') {
        download(libraryBackupText(guest.state), 'Play-100-guest-backup.json');
        return;
      }
      if (!scope || !sync.store || !identity) throw new Error('Sign in before exporting account data.');
      let local = account.snapshot;
      let cacheError: string | null = null;
      try {
        local = await loadScopedLibrary(scope);
      } catch (cause) {
        if (source === 'local') throw cause;
        cacheError = onlineError(cause);
      }
      if (source === 'local') {
        if (!local) throw new Error('The account device copy is unavailable. Export the online copy instead.');
        download(libraryBackupText(local.state), 'Play-100-account-device-backup.json');
        return;
      }
      const remoteHead = await sync.store.head();
      const remoteLibrary = remoteHead?.current ? await sync.store.download(remoteHead) : null;
      if (source === 'online') {
        if (!remoteLibrary) throw new Error('There is no complete online copy to export yet.');
        download(
          libraryBackupText({ ...remoteLibrary, motion: local?.state.motion ?? guest.state.motion }),
          'Play-100-online-backup.json',
        );
        return;
      }
      const publicCopy = await social.ownProfile(identity.uid);
      const entries = publicCopy ? await social.entries(publicCopy) : [];
      const ownSocial = await friends.store.exportAll(identity.uid, () => cloudAuth.currentUser?.uid === identity.uid);
      const sharedGames = await shelf.store.exportOwn(identity.uid);
      const automaticSharing = await automatic.store.exportOwn(identity.uid);
      if (cloudAuth.currentUser?.uid !== identity.uid) throw new Error('The account changed before export completed.');
      download(
        JSON.stringify({
          app: 'Play 100',
          formatVersion: 1,
          exportedAt: new Date().toISOString(),
          identity,
          member,
          deviceLibrary: local ? createLibraryBackup(local.state) : null,
          deviceCacheError: cacheError,
          onlineLibrary: remoteLibrary
            ? createLibraryBackup({ ...remoteLibrary, motion: local?.state.motion ?? guest.state.motion })
            : null,
          recovery: local?.recovery ?? null,
          publication: publicCopy,
          publishedEntries: entries,
          friends: {
            identity: ownSocial.identity,
            settings: ownSocial.settings,
            relationships: ownSocial.relations,
            groups: ownSocial.groups,
            blocks: ownSocial.blocks,
            sharedGames,
            automaticSharing,
          },
        }),
        'Play-100-account-export.json',
      );
      if (cacheError)
        setMessage(
          'Online account data was exported. The unreadable copy on this device is marked unavailable in the export; it was not replaced or deleted.',
        );
    });
  const deleteOnline = (removeAccount: boolean, password: string) => {
    if (hasPendingEdits()) {
      setError('Finish the open edit before deleting online data.');
      return Promise.resolve(false);
    }
    let deletionStarted: string | null = null;
    let deletionMarked = false;
    return run(async () => {
      const signedIn = cloudAuth.currentUser;
      if (!signedIn || signedIn.uid !== identityRef.current?.uid || !scope)
        throw new Error('Sign in to the account you want to delete.');
      deletionProbe.current = null;
      setDeletionNotice(null);
      const session = authSessionEpoch.current;
      const targetKind = removeAccount ? 'account' : 'copy';
      if (!navigator.onLine) throw new Error('Connect to the internet before deleting online data.');
      if (hasProvider(identity, EmailAuthProvider.PROVIDER_ID)) {
        if (!password) throw new Error('Confirm your password before deleting.');
        await reauthenticateWithCredential(signedIn, EmailAuthProvider.credential(signedIn.email ?? '', password));
      } else {
        const approval = deletionApproval;
        if (
          !approval ||
          approval.uid !== signedIn.uid ||
          approval.target !== targetKind ||
          approval.sessionEpoch !== session ||
          approval.epoch !== currentEpoch.current ||
          approval.expiresAt <= Date.now()
        ) {
          setDeletionApproval(null);
          await startGoogleRedirect(cloudAuth, {
            kind: 'reauthenticate',
            uid: signedIn.uid,
            target: targetKind,
            epoch: currentEpoch.current,
          });
          return;
        }
        setDeletionApproval(null);
        const token = await getIdTokenResult(signedIn);
        if (typeof token.claims.auth_time !== 'number' || token.claims.auth_time * 1000 < approval.startedAt - 5000)
          throw new Error('Google confirmation is no longer current. Review the account and confirm again.');
      }
      if (
        cloudAuth.currentUser?.uid !== signedIn.uid ||
        identityRef.current?.uid !== signedIn.uid ||
        authSessionEpoch.current !== session
      )
        throw new Error('The signed-in account changed. Return to the same account before continuing.');
      sync.suspend();
      if (removeAccount) {
        friends.stop();
        shelf.stop();
        automatic.suspend();
        await account.waitForWrites();
        const current = () =>
          cloudAuth.currentUser?.uid === signedIn.uid &&
          identityRef.current?.uid === signedIn.uid &&
          authSessionEpoch.current === session;
        if (await removeCancelledRegistration(cloudDb, signedIn, scope, current)) {
          await rememberOnlineRequest(false);
          setIdentity(null);
          onCloseSheet();
          onNavigate('collection');
          return;
        }
      }
      if (removeAccount && !identityRef.current.verified) {
        const token = await getIdTokenResult(signedIn, true);
        if (token.claims.email_verified === true) {
          await reconcileIdentity(signedIn, true);
          throw new Error('This account is now verified. Review its online data before using full account deletion.');
        }
        await cancelUnusedRegistration(cloudDb, signedIn.uid);
        await deleteUser(signedIn);
        await deleteScopedLibrary(scope);
        await rememberOnlineRequest(false);
        setIdentity(null);
        onNavigate('collection');
        return;
      }
      if (!identityRef.current?.verified || !sync.store)
        throw new Error('Verify this account before deleting existing online data.');
      const user = signedIn;
      const target = scope;
      const store = sync.store;
      friends.stop();
      shelf.stop();
      automatic.suspend();
      if (removeAccount) {
        await automatic.store.revokeForDeletion(user.uid);
        await friends.store.revokeForDeletion(user.uid);
        await shelf.store.revokeForDeletion(user.uid);
      } else {
        const allControls = await automatic.store.controls(user.uid);
        if (allControls.policy && !allControls.policy.deleted) {
          await automatic.store.setPolicy(
            user.uid,
            false,
            'explicit',
            allControls,
            () => cloudAuth.currentUser?.uid === user.uid && authSessionEpoch.current === session,
          );
        } else {
          const settings = allControls.ranking;
          if (settings && !settings.deleted) {
            const stopped = await friends.store.saveSettings(user.uid, { enabled: false, selectedIds: [] }, settings);
            friends.acceptSettings(stopped);
          }
          const config = allControls.shelf;
          if (config && !config.deleted) {
            const stopped = await shelf.store.saveConfig(
              user.uid,
              { enabled: false, selectedIds: [], consentSyncEpoch: null },
              config,
              () => cloudAuth.currentUser?.uid === user.uid && authSessionEpoch.current === session,
            );
            await shelf.acceptConfig(stopped);
          }
        }
      }
      await account.waitForWrites();
      if (
        cloudAuth.currentUser?.uid !== user.uid ||
        identityRef.current?.uid !== user.uid ||
        authSessionEpoch.current !== session
      )
        throw new Error('The signed-in account changed. Return to the same account before continuing.');
      if (account.snapshot) await pauseScopedLibrary(target);
      await ensureAccountActivity(cloudDb, user.uid);
      await social.unpublish(user.uid, await social.control(user.uid), true);
      const deleting = await store.revoke(await store.head(), true);
      deletionStarted = `${user.uid}:${session}:${deleting.epoch}:${deleting.revision}`;
      setHeadSnapshot({ uid: user.uid, value: deleting });
      const ownsDeletion = () =>
        cloudAuth.currentUser?.uid === user.uid &&
        identityRef.current?.uid === user.uid &&
        authSessionEpoch.current === session;
      setMessage('Deleting your online library…');
      await store.cleanup(true, {
        expectedDeletionEpoch: deleting.epoch,
        isCurrent: ownsDeletion,
        onProgress: ({ kind }) => {
          if (!ownsDeletion())
            throw new Error('The signed-in account changed. Return to the same account before continuing.');
          setMessage(kind === 'private' ? 'Deleting your online library…' : 'Deleting your ranking summary…');
        },
      });
      setMessage('Deleting shared and public copies…');
      if (!removeAccount) {
        await friends.store.cleanupSharing(user.uid);
        await shelf.store.cleanupSharing(user.uid);
      }
      await social.deleteProfile(user.uid);
      await deleteOwnMember(cloudDb, user.uid);
      if (await automatic.store.policy(user.uid))
        for (const kind of ['games', 'ranking'] as const) {
          for (let index = 0; index < 250; index += 1) {
            if (cloudAuth.currentUser?.uid !== user.uid || authSessionEpoch.current !== session)
              throw new Error('The signed-in account changed. Return to the same account before continuing.');
            const result = await automatic.store.cleanupPage(user.uid, kind);
            if (result.done) break;
            setMessage('Deleting shared and public copies…');
            if (index === 249)
              throw new Error('Some shared copies are still stored. Choose Finish deleting to continue.');
          }
        }
      if (removeAccount) {
        const shelfCleanup = await shelf.store.cleanupDeleted(user.uid);
        if (!shelfCleanup.done)
          throw new Error('Some shared games are still stored. Choose Delete account to continue.');
        for (let index = 0; index < 100; index += 1) {
          const cleaned = await friends.store.cleanupDeleted(user.uid);
          if (cleaned.message) throw new Error(cleaned.message);
          if (cleaned.done) break;
          if (index === 99) throw new Error('Some connections are still stored. Choose Delete account to continue.');
        }
        const marked = await store.markCleanupComplete(deleting.epoch, ownsDeletion);
        deletionMarked = true;
        setHeadSnapshot({ uid: user.uid, value: marked });
        const finalHead = await store.head();
        if (
          !ownsDeletion() ||
          !finalHead?.deleted ||
          finalHead.epoch !== deleting.epoch ||
          finalHead.cleanupEpoch !== deleting.epoch
        )
          throw new Error(
            'The account or online saving state changed. Refresh the page before continuing; your sign-in remains.',
          );
        try {
          await deleteUser(user);
        } catch (cause) {
          if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'auth/requires-recent-login') {
            setDeletionApproval(null);
            throw new Error(
              hasProvider(identityRef.current, EmailAuthProvider.PROVIDER_ID)
                ? 'Your online data is deleted. To delete your sign-in, confirm your password again.'
                : 'Your online data is deleted. Confirm with Google again to delete your sign-in.',
              { cause },
            );
          }
          throw cause;
        }
        await deleteScopedLibrary(target);
        await rememberOnlineRequest(false);
        setIdentity(null);
        onNavigate('collection');
      } else {
        const marked = await store.markCleanupComplete(deleting.epoch, ownsDeletion);
        deletionMarked = true;
        setHeadSnapshot({ uid: user.uid, value: marked });
        await account.refresh();
        await refresh();
        const key = `${user.uid}:${session}:${deleting.epoch}:${deleting.revision}`;
        deletionProbe.current = { key, result: Promise.resolve('complete') };
        setDeletionNotice({ key, state: 'complete' });
        setMessage('Your online copy was deleted. The copy on this device is still here.');
      }
    }, removeAccount).then((success) => {
      if (!success && deletionStarted && !deletionMarked) {
        const key = deletionStarted;
        deletionProbe.current = { key, result: Promise.resolve('incomplete') };
        setDeletionNotice({ key, state: 'incomplete' });
      }
      return success;
    });
  };

  const identityKey = `${identity?.uid ?? 'guest'}:${authSessionEpoch.current}:${account.snapshot?.sync.epoch ?? 0}:${Boolean(account.snapshot?.sync.enabled)}`;
  const pageScope = `${scope ?? 'guest'}:${authSessionEpoch.current}`;
  const pageRouteKey =
    page === 'profile'
      ? publicHandle
      : page === 'friend'
        ? location.pathname
        : page === 'compare'
          ? (new URLSearchParams(location.search).get('group') ?? '')
          : page === 'invite'
            ? (invitation.capability ?? '')
            : '';
  const visibleError = error || googleReturn?.error || '';
  const visibleMessage = message || googleReturn?.message || '';
  const currentDeletionApproval =
    deletionApproval?.uid === identity?.uid &&
    deletionApproval?.sessionEpoch === authSessionEpoch.current &&
    deletionApproval.epoch === currentEpoch.current
      ? deletionApproval
      : null;
  const closeSignin = () => {
    setReturnSheet(false);
    onCloseSheet();
  };
  const purposes = authPanelPurposes(page, signInPurpose);
  const renderAuthPanel = (purpose: SignInPurpose | undefined) => (
    <AuthPanel
      purpose={purpose}
      busy={busy}
      error={visibleError}
      message={visibleMessage}
      onGoogle={google}
      onEmail={email}
      onReset={resetEmail}
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
  const authPanel = renderAuthPanel(purposes.page);
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
  if (startupError) throw new Error(startupError);
  return (
    <>
      {page === 'invite' && invitation.error && (
        <p className="inline-error" role="alert">
          {invitation.error}
        </p>
      )}
      {cloudPage && EMULATOR_MODE && (
        <p className="emulator-note emulator-page-note">
          Local emulator preview — no production account or cloud data connection.
        </p>
      )}
      {cloudPage && identity && sessionUnconfirmed && (
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
              identity={identity}
              onOpenRecord={onOpenRecord}
              onShare={onShare}
              onAccount={() => onNavigate('account')}
              onFriend={navigateFriend}
            />
          ) : page === 'invite' ? (
            <InvitationPage
              store={friends.store}
              invitation={invitation}
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
              key={`${uid}:${new URLSearchParams(location.search).get('group') ?? ''}`}
              store={friends.store}
              uid={identity.uid}
              identity={friendIdentity}
              ownState={activeController.state}
              games={games}
              onOpen={onOpenRecord}
              onFriends={() => onNavigate('friends')}
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
                onPrepare: async () => {
                  const session = authSessionEpoch.current;
                  const settings = await prepareFriendIdentity(friends.store, friendIdentity);
                  if (cloudAuth.currentUser?.uid !== friendIdentity.uid || authSessionEpoch.current !== session)
                    throw new Error('The account changed. Preview these games again.');
                  friends.acceptSettings(settings);
                  const config = await shelf.store.initialize(friendIdentity.uid);
                  if (cloudAuth.currentUser?.uid !== friendIdentity.uid || authSessionEpoch.current !== session)
                    throw new Error('The account changed. Preview these games again.');
                  return config;
                },
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
              onPublished={(next) => {
                if (cloudAuth.currentUser?.uid === next.uid) {
                  setProfile(next);
                  onProfile(next.handle);
                }
              }}
            />
          ) : (
            <AccountPage
              key={`${identity.uid}:${Boolean(account.snapshot?.sync.enabled)}`}
              identity={identity}
              cancelledRegistration={cancelledUid === identity.uid}
              deletionState={deletionState}
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
              resendIn={Math.max(0, Math.ceil((cooldown - now) / 1000))}
              isCreator={isCreator}
              avatar={<Avatar descriptor={avatar} size={80} label="Your creature" />}
              onAvatar={() => setAvatarOpen(true)}
              onName={(name) =>
                run(async () => {
                  const { user } = verifiedIdentity();
                  await social.saveMemberName(user.uid, name, avatar);
                  if (cloudAuth.currentUser?.uid !== user.uid) return;
                  setMember((current) => (current?.uid === user.uid ? { ...current, displayName: name } : current));
                  setMessage('Name saved.');
                  try {
                    await refresh();
                  } catch (cause) {
                    if (cloudAuth.currentUser?.uid === user.uid)
                      setMessage(`Name saved. Reconnect to refresh the profile. ${onlineError(cause)}`);
                  }
                })
              }
              onConnect={connect}
              onVerify={sendVerification}
              onRefreshIdentity={() =>
                run(async () => {
                  const user = cloudAuth.currentUser;
                  if (!user) return;
                  await reload(user);
                  refreshedMismatch.current.delete(user.uid);
                  const next = await reconcileIdentity(user, true);
                  setMessage(
                    next.verified
                      ? 'Email verified. You can choose online saving or publishing.'
                      : 'Verification is not confirmed yet. Open the latest email link, then try again.',
                  );
                })
              }
              onSignOut={signOutAccount}
              onSignOutAndRemove={() => signOutAccount(true)}
              onLinkGoogle={linkGoogle}
              onRetry={() =>
                run(async () => {
                  await sync.retry();
                  await automatic.refresh();
                  await friends.retry();
                  await shelf.retry();
                })
              }
              onCleanup={() =>
                run(async () => {
                  const { store, user } = verifiedIdentity();
                  await store.cleanup();
                  await social.cleanup(user.uid);
                  await shelf.store.prune(user.uid);
                  setMessage('Eligible old snapshots were cleaned. Current and previous private copies remain intact.');
                })
              }
              onPause={pause}
              onDownload={downloadData}
              onUseRemote={(reviewed, revision) =>
                run(async () => {
                  await sync.useRemote(reviewed, revision);
                  await account.refresh();
                })
              }
              onUseLocal={(reviewed, revision) =>
                run(async () => {
                  await sync.useLocal(reviewed, revision);
                })
              }
              googleDeletion={currentDeletionApproval}
              onDismissDeletion={() => setDeletionApproval(null)}
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
                            void run(async () => {
                              await friends.retry();
                              await shelf.retry();
                            });
                          }}
                        >
                          Refresh selected sharing
                        </button>
                      </p>
                    )}
                  </>
                )
              }
              onDelete={deleteOnline}
              onPublish={() => onNavigate('publish')}
              onCommunity={() => onNavigate('community')}
              onCreator={() => onNavigate('creator')}
            />
          )}
        </OnlinePageBoundary>
      )}
      {(showSheet || (returnSheet && !cloudPage)) && !identity && (
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
            <Suspense fallback={<p role="status">Loading sign-in…</p>}>{renderAuthPanel(purposes.sheet)}</Suspense>
          </ChunkBoundary>
        </Dialog>
      )}
      {avatarOpen && identity && (
        <Dialog
          open
          titleId="account-avatar-title"
          className="info-dialog"
          onClose={() => {
            if (!busy) setAvatarOpen(false);
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
                onCancel={() => setAvatarOpen(false)}
                onSave={async (next) => {
                  const uid = identity.uid;
                  const epoch = currentEpoch.current;
                  const sessionEpoch = authSessionEpoch.current;
                  const saved = await run(async () => {
                    if (
                      cloudAuth.currentUser?.uid !== uid ||
                      !identityRef.current?.verified ||
                      currentEpoch.current !== epoch ||
                      authSessionEpoch.current !== sessionEpoch
                    )
                      throw new Error('The account changed. Your new account was not modified.');
                    await social.saveMemberAvatar(uid, next, member?.displayName || identity.displayName || 'Player');
                    if (
                      identityRef.current?.uid === uid &&
                      currentEpoch.current === epoch &&
                      authSessionEpoch.current === sessionEpoch
                    ) {
                      setDefaultAvatar(next);
                      setMember((current) => (current?.uid === uid ? { ...current, avatar: next } : current));
                      try {
                        await refresh();
                      } catch (cause) {
                        if (cloudAuth.currentUser?.uid === uid)
                          setMessage(`Icon saved. Reconnect to refresh the profile. ${onlineError(cause)}`);
                      }
                    }
                  });
                  if (!saved) throw new Error('The creature could not be saved. Your previous choice is unchanged.');
                  if (
                    identityRef.current?.uid === uid &&
                    currentEpoch.current === epoch &&
                    authSessionEpoch.current === sessionEpoch
                  )
                    setAvatarOpen(false);
                }}
              />
            </Suspense>
          </ChunkBoundary>
        </Dialog>
      )}
    </>
  );
}

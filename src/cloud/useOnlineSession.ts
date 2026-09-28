import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import type { AppPage } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import type { ScopedLibrary } from '../lib/cloud-types';
import { accountScope } from '../lib/cloud-types';
import { rememberOnlineRequest } from '../lib/online-availability';
import { clearComparisonView, comparisonScope } from '../lib/friend-comparison-intent';
import { clearComparisonGameFilter } from '../lib/comparison-game-filter';
import { clearInviteContinuation, liveInvitation } from '../lib/invite-continuation';
import { readGoogleIntent } from '../lib/google-intent';
import { flushPendingEdits } from '../hooks/useExitSave';
import { cloudAuth, firebaseApp } from './firebase-client';
import { onlineError, popupCancelled } from './errors';
import { startGoogleRedirect } from './google-auth';
import {
  applyGoogleReturn,
  observeAccountSession,
  signInNeedsAccountPage,
  useAccountSessionState,
} from './account-session';
import { useAccountIdentity } from './account-identity';
import { useDeletionApprovalExpiry } from './account-deletion';
import type { useAccountDeletionState } from './account-deletion';
import { deviceComparePins, forgetCompareSignIn, rememberCompareSignIn, takeCompareSignIn } from './compare-sign-in';
import { committedFriendChange, committedFriendMessage } from './friend-outcomes';

/** The invitation App opened: its capability, or why it cannot be opened. */
type Invitation = { capability: string | null; error: string };

/**
 * The identity/session controller: who is signed in and how they sign in, the Google redirect this page load returns
 * from, the invitation this tab has open, and the runner through which every online action reports its progress.
 */
export function useOnlineSession({
  page,
  invitation,
  showSheet,
  cloudPage,
  onCompareSignIn,
  onCloseSheet,
  onNavigate,
}: {
  page: AppPage;
  invitation: Invitation;
  showSheet: boolean;
  cloudPage: boolean;
  onCompareSignIn?: (uid: string, pins: LibraryRecord[], signedIn: () => boolean) => void;
  onCloseSheet: () => void;
  onNavigate: (page: AppPage) => void;
}) {
  // The committed invitation: signing out or changing accounts retires the one this tab had open.
  const invitationNow = useRef(invitation);
  useLayoutEffect(() => {
    invitationNow.current = invitation;
  }, [invitation]);
  const [retiredInvitation, setRetiredInvitation] = useState<Invitation | null>(null);
  const {
    identity,
    setIdentity,
    identityRef,
    authSessionEpoch,
    reconcileIdentity,
    observeUser,
    controllerLive,
    clearVerificationMismatch,
  } = useAccountIdentity((previousUid) => {
    clearComparisonView(comparisonScope(firebaseApp.options.projectId ?? '', previousUid));
    clearComparisonGameFilter(accountScope(previousUid, firebaseApp.options.projectId));
    // An invitation opened in this tab belongs to the account that opened it; the next person cannot open it.
    clearInviteContinuation();
    setRetiredInvitation(invitationNow.current);
  });
  const openInvitation = liveInvitation(invitation, retiredInvitation);
  const uid = identity?.uid;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Each account starts without the previous one's messages.
  const [messagesUid, setMessagesUid] = useState(uid);
  if (messagesUid !== uid) {
    setMessagesUid(uid);
    setError('');
    setMessage('');
  }
  const {
    sessionUnconfirmed,
    setSessionUnconfirmed,
    googleReturn,
    setGoogleReturn,
    returnSheet,
    setReturnSheet,
    startupError,
    setStartupError,
    handledGoogleReturn,
  } = useAccountSessionState();
  const signInOpen = !identity && (showSheet || (returnSheet && !cloudPage));
  // Whether this page load returned from a Google redirect that the Compare tray's sign-in started. The return's own
  // transition reads the ref, which a sign-in that completes here clears at once.
  const [googleCompare, setGoogleCompare] = useState(false);
  const googleCompareNow = useRef(false);
  // A sign-in the Compare tray started continues to Compare with the device's pins once its account has opened. App
  // then runs the tray's own checks, so an account that cannot compare yet opens Account. Without pins it opens Account.
  // Only this signed-in session continues it: a sign-out or another sign-in, in this tab or another, replaces the user.
  const continueToCompare = (uid: string) => {
    const pins = deviceComparePins();
    const user = cloudAuth.currentUser;
    if (!pins.length || !onCompareSignIn || user?.uid !== uid) return false;
    onCompareSignIn(uid, pins, () => cloudAuth.currentUser === user);
    return true;
  };
  const signInNavigation = {
    page,
    onCloseSheet,
    onNavigate,
    continueSignIn: (uid: string) => googleCompareNow.current && continueToCompare(uid),
  };
  // The committed page and handlers, which a Google return's transition (an effect) navigates with.
  const navigation = useRef(signInNavigation);
  useLayoutEffect(() => {
    navigation.current = signInNavigation;
  });
  const [cooldown, setCooldown] = useState(0);
  // Only compared with a cooldown, which starts at 0, so its first value is never shown.
  const [now, setNow] = useState(0);
  const running = useRef(false);

  useEffect(
    () =>
      observeAccountSession({
        state: {
          setSessionUnconfirmed,
          // A return from a redirect the Compare tray's sign-in started continues to Compare. Its flag is taken as the
          // return arrives, so the return's own transition and the sheet it reopens both see it.
          setGoogleReturn: (outcome) => {
            if (takeCompareSignIn()) {
              googleCompareNow.current = true;
              setGoogleCompare(true);
            }
            setGoogleReturn(outcome);
          },
          setReturnSheet,
          setStartupError,
        },
        onUser: (user, isCurrent, settled) => {
          observeUser(user, isCurrent, settled, (cause) => setError(onlineError(cause)));
        },
        onError: (cause) => {
          setIdentity(null);
          setError(onlineError(cause));
        },
        hasGoogleIntent: () => readGoogleIntent().raw !== null,
      }),
    [observeUser, setIdentity, setSessionUnconfirmed, setGoogleReturn, setReturnSheet, setStartupError],
  );
  useEffect(() => {
    if (cooldown <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown, now]);

  // Runs one online action at a time and reports its outcome; an outcome for an account that has since changed is
  // dropped, unless the action itself changes the account.
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
  const afterSignIn = async (user: User, compare: boolean) => {
    await reconcileIdentity(user);
    // A sign-in that finishes after this controller unmounted remembers nothing: the user may have chosen this device.
    if (cloudAuth.currentUser?.uid !== user.uid || !controllerLive()) return;
    rememberOnlineRequest(true);
    // A sign-in uses the sheet a cancelled Google return reopened: neither it nor its Compare purpose reopens after a
    // later sign-out.
    setReturnSheet(false);
    setGoogleCompare(false);
    googleCompareNow.current = false;
    onCloseSheet();
    if (compare && continueToCompare(user.uid)) return;
    if (signInNeedsAccountPage(page)) onNavigate('account');
  };
  const google = (compare = false) =>
    run(async () => {
      const session = authSessionEpoch.current;
      if (!(await flushPendingEdits())) throw new Error('Finish or correct the open rating/note before signing in.');
      if (authSessionEpoch.current !== session || cloudAuth.currentUser)
        throw new Error('The signed-in account changed. Review Account before continuing.');
      // Only a redirect the Compare tray's sign-in starts has its return continue to Compare.
      if (compare) rememberCompareSignIn();
      else forgetCompareSignIn();
      try {
        await startGoogleRedirect(cloudAuth, { kind: 'sign-in', uid: null });
      } catch (cause) {
        forgetCompareSignIn();
        throw cause;
      }
    }, true);
  const email = (address: string, password: string, create: boolean, compare = false) =>
    run(async () => {
      if (!(await flushPendingEdits())) throw new Error('Finish or correct the open edit before signing in.');
      const result = create
        ? await createUserWithEmailAndPassword(cloudAuth, address, password)
        : await signInWithEmailAndPassword(cloudAuth, address, password);
      await afterSignIn(result.user, compare);
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
  const refreshIdentity = () =>
    run(async () => {
      const user = cloudAuth.currentUser;
      if (!user) return;
      await reload(user);
      clearVerificationMismatch(user.uid);
      const next = await reconcileIdentity(user, true);
      setMessage(
        next.verified
          ? 'Email verified. You can choose online saving or publishing.'
          : 'Verification is not confirmed yet. Open the latest email link, then try again.',
      );
    });
  // Signing out retires the invitation this tab has open, with its continuation.
  const retireInvitation = () => {
    clearInviteContinuation();
    setRetiredInvitation(invitationNow.current);
  };

  return {
    identity,
    setIdentity,
    identityRef,
    authSessionEpoch,
    reconcileIdentity,
    openInvitation,
    retireInvitation,
    busy,
    error,
    message,
    setError,
    setMessage,
    run,
    sessionUnconfirmed,
    googleReturn,
    returnSheet,
    setReturnSheet,
    startupError,
    handledGoogleReturn,
    navigation,
    signInOpen,
    googleCompare,
    resendIn: Math.max(0, Math.ceil((cooldown - now) / 1000)),
    google,
    email,
    sendVerification,
    resetEmail,
    refreshIdentity,
  };
}
export type OnlineSession = ReturnType<typeof useOnlineSession>;

/**
 * Applies this page load's Google return once its account and device copy are ready: it opens that account's page,
 * reports a linked provider or a changed account, or grants a deletion approval, which then lasts only while Account
 * stays open and it has not expired.
 */
export function useGoogleReturn({
  page,
  session,
  snapshot,
  cacheError,
  deletion,
}: {
  page: AppPage;
  session: OnlineSession;
  snapshot: ScopedLibrary | null;
  cacheError: string | null;
  deletion: ReturnType<typeof useAccountDeletionState>;
}) {
  const { googleReturn, handledGoogleReturn, setReturnSheet, identity, authSessionEpoch, navigation } = session;
  const { setError, setMessage } = session;
  const { approval, setApproval } = deletion;
  useEffect(() => {
    applyGoogleReturn({
      state: { googleReturn, handledGoogleReturn, setReturnSheet },
      identity,
      cacheReady: Boolean(snapshot),
      cacheError,
      epoch: snapshot?.sync.epoch ?? 0,
      sessionEpoch: authSessionEpoch.current,
      navigation,
      setDeletionApproval: setApproval,
      setError,
      setMessage,
    });
  }, [
    googleReturn,
    identity,
    snapshot,
    cacheError,
    setApproval,
    handledGoogleReturn,
    setReturnSheet,
    authSessionEpoch,
    navigation,
    setError,
    setMessage,
  ]);
  useDeletionApprovalExpiry(page, approval, setApproval);
}

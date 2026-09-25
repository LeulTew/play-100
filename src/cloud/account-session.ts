import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import type { AppPage } from '../lib/types';
import { rememberOnlineRequest } from '../lib/online-availability';
import { cloudAuth, initialAuthUser } from './firebase-client';
import { finishGoogleRedirect } from './google-auth';
import type { GoogleReturn } from './google-auth';
import type { GoogleDeletionApproval } from './account-deletion';
import type { AccountIdentity } from './ui-types';
import { onlineError } from './errors';

export function signInNeedsAccountPage(page: AppPage): boolean {
  return !['publish', 'creator', 'friends', 'friend', 'invite', 'compare', 'friend-sharing', 'friend-shelf'].includes(
    page,
  );
}
export function sessionNeedsConfirmation(restoredUid: string | null, outcome: GoogleReturn): boolean {
  return !restoredUid || outcome.completed;
}
export type GoogleReturnTransition =
  | { kind: 'sign-in' | 'link' | 'changed'; requestId: string }
  | { kind: 'approved'; requestId: string; approval: GoogleDeletionApproval };
export function googleReturnTransition({
  returned,
  identity,
  authUid,
  handled,
  cacheReady,
  cacheError,
  epoch,
  sessionEpoch,
  now,
}: {
  returned: GoogleReturn | null;
  identity: AccountIdentity | null | undefined;
  authUid: string | undefined;
  handled: string | null;
  cacheReady: boolean;
  cacheError: string | null;
  epoch: number;
  sessionEpoch: number;
  now: number;
}): GoogleReturnTransition | null {
  if (
    !returned?.completed ||
    !returned.intent ||
    !identity ||
    identity.uid !== returned.uid ||
    authUid !== returned.uid
  )
    return null;
  const intent = returned.intent;
  if (handled === intent.requestId) return null;
  if (intent.kind === 'reauthenticate' && !cacheReady && !cacheError) return null;
  if (intent.kind === 'sign-in' || intent.kind === 'link') return { kind: intent.kind, requestId: intent.requestId };
  if (intent.epoch !== epoch) return { kind: 'changed', requestId: intent.requestId };
  return {
    kind: 'approved',
    requestId: intent.requestId,
    approval: {
      requestId: intent.requestId,
      uid: identity.uid,
      target: intent.target,
      epoch: intent.epoch,
      sessionEpoch,
      startedAt: intent.createdAt,
      expiresAt: now + 5 * 60 * 1000,
    },
  };
}
export function useAccountSessionState() {
  const [sessionUnconfirmed, setSessionUnconfirmed] = useState(false);
  const [googleReturn, setGoogleReturn] = useState<GoogleReturn | null>(null);
  const [returnSheet, setReturnSheet] = useState(false);
  const [startupError, setStartupError] = useState('');
  const handledGoogleReturn = useRef<string | null>(null);
  return {
    sessionUnconfirmed,
    setSessionUnconfirmed,
    googleReturn,
    setGoogleReturn,
    returnSheet,
    setReturnSheet,
    startupError,
    setStartupError,
    handledGoogleReturn,
  };
}
type SessionState = ReturnType<typeof useAccountSessionState>;
export function observeAccountSession({
  state,
  onUser,
  onError,
  hasGoogleIntent,
}: {
  state: Pick<SessionState, 'setSessionUnconfirmed' | 'setGoogleReturn' | 'setReturnSheet' | 'setStartupError'>;
  onUser: (user: User | null, isCurrent: () => boolean, settled: () => void) => void;
  onError: (cause: Error) => void;
  /** Whether a Google redirect is still pending, which makes a restored back/forward page reload. */
  hasGoogleIntent: () => boolean;
}): () => void {
  let alive = true;
  let unsubscribe = () => {};
  const timeout = window.setTimeout(() => {
    if (alive)
      state.setStartupError('Account restoration timed out. Reload when connected, or keep using the device library.');
  }, 45000);
  const settled = () => window.clearTimeout(timeout);
  void Promise.all([finishGoogleRedirect(cloudAuth), initialAuthUser])
    .then(([outcome, restoredUid]) => {
      if (!alive) return;
      state.setSessionUnconfirmed(sessionNeedsConfirmation(restoredUid, outcome));
      if (outcome.attempted) {
        state.setGoogleReturn(outcome);
        state.setReturnSheet(!outcome.completed);
      }
      unsubscribe = onIdTokenChanged(
        cloudAuth,
        (user) => onUser(user, () => alive, settled),
        (cause) => {
          onError(cause);
          settled();
        },
      );
    })
    .catch((cause) => {
      if (alive) {
        state.setStartupError(onlineError(cause));
        settled();
      }
    });
  const restorePage = (event: PageTransitionEvent) => {
    if (event.persisted && hasGoogleIntent()) location.reload();
  };
  window.addEventListener('pageshow', restorePage);
  return () => {
    alive = false;
    settled();
    unsubscribe();
    window.removeEventListener('pageshow', restorePage);
  };
}
export function applyGoogleReturn({
  state,
  identity,
  cacheReady,
  cacheError,
  epoch,
  sessionEpoch,
  navigation,
  setDeletionApproval,
  setError,
  setMessage,
}: {
  state: Pick<SessionState, 'googleReturn' | 'handledGoogleReturn' | 'setReturnSheet'>;
  identity: AccountIdentity | null | undefined;
  cacheReady: boolean;
  cacheError: string | null;
  epoch: number;
  sessionEpoch: number;
  navigation: RefObject<{ page: AppPage; onCloseSheet: () => void; onNavigate: (page: AppPage) => void }>;
  setDeletionApproval: (approval: GoogleDeletionApproval) => void;
  setError: (message: string) => void;
  setMessage: (message: string) => void;
}): void {
  const transition = googleReturnTransition({
    returned: state.googleReturn,
    identity,
    authUid: cloudAuth.currentUser?.uid,
    handled: state.handledGoogleReturn.current,
    cacheReady,
    cacheError,
    epoch,
    sessionEpoch,
    now: Date.now(),
  });
  if (!transition) return;
  state.handledGoogleReturn.current = transition.requestId;
  state.setReturnSheet(false);
  if (transition.kind === 'sign-in') {
    rememberOnlineRequest(true);
    navigation.current.onCloseSheet();
    if (signInNeedsAccountPage(navigation.current.page)) navigation.current.onNavigate('account');
  } else if (transition.kind === 'link') setMessage('Google is linked to this existing account.');
  else if (transition.kind === 'changed') {
    setError(
      'This account changed while Google was open. Nothing was deleted. Review the account before confirming again.',
    );
  } else if (transition.kind === 'approved') {
    setDeletionApproval(transition.approval);
    setMessage('Google confirmed this account. Nothing has been deleted; review and confirm the deletion below.');
  }
}

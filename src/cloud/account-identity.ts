import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getIdTokenResult } from 'firebase/auth';
import type { IdTokenResult, User } from 'firebase/auth';
import { rememberOnlineRequest } from '../lib/online-availability';
import { cloudAuth } from './firebase-client';
import type { AccountIdentity } from './ui-types';

export type IdentityUser = Pick<User, 'uid' | 'email' | 'displayName' | 'emailVerified' | 'providerData'>;
export function identityOf(
  user: IdentityUser,
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
export function authSessionTransition(previousUid: string | null, epoch: number, uid: string | null) {
  const changed = previousUid !== uid;
  return { uid, epoch: changed ? epoch + 1 : epoch, changed, clearUid: changed ? previousUid : null };
}
interface IdentityPorts<T extends IdentityUser> {
  currentUid: () => string | undefined;
  readToken: (user: T, force: boolean) => Promise<Pick<IdTokenResult, 'claims'>>;
  publish: (identity: AccountIdentity | null | undefined) => void;
  /** Receives each new auth-session epoch, in the same call that publishes that session's first identity. */
  publishEpoch: (epoch: number) => void;
  remember: () => unknown;
  clearPrevious: (uid: string) => void;
}
export function createAccountIdentity<T extends IdentityUser>(ports: IdentityPorts<T>) {
  let identityRead: { uid: string; promise: Promise<AccountIdentity> } | null = null;
  const refreshedMismatch = new Set<string>();
  let authSessionUid: string | null = null;
  // The live epoch, which handlers and work that settles later compare against. Renders read the published one.
  const authSessionEpochRef = { current: 0 };
  // Whether the controller that owns this lifetime is still mounted (attach, from its effect). A read can outlive it:
  // restoration gives up and the controller unmounts while the same account stays signed in, even before its session
  // observer first hears from Firebase, and the user may then choose this device.
  let attached = false;
  const controllerLive = () => attached;
  const reconcileIdentity = (user: T, force = false): Promise<AccountIdentity> => {
    if (identityRead?.uid === user.uid) return identityRead.promise;
    const task = (async () => {
      let token = await ports.readToken(user, force);
      if (user.emailVerified && token.claims.email_verified !== true && !refreshedMismatch.has(user.uid)) {
        refreshedMismatch.add(user.uid);
        token = await ports.readToken(user, true);
      }
      const next = identityOf(user, token.claims.email_verified === true);
      // A read that outlives its controller still settles for its callers, but publishes nothing and leaves the
      // remembered online choice as it is.
      if (controllerLive() && ports.currentUid() === user.uid) {
        ports.publish(next);
        void ports.remember();
      }
      return next;
    })();
    const entry = { uid: user.uid, promise: task };
    identityRead = entry;
    void task.then(
      () => {
        if (identityRead === entry) identityRead = null;
      },
      () => {
        if (identityRead === entry) identityRead = null;
      },
    );
    return task;
  };
  const observeUser = (
    user: T | null,
    isCurrent: () => boolean,
    settled: () => void,
    onError: (cause: unknown) => void,
  ) => {
    const transition = authSessionTransition(authSessionUid, authSessionEpochRef.current, user?.uid ?? null);
    if (transition.changed) {
      if (transition.clearUid) ports.clearPrevious(transition.clearUid);
      authSessionUid = transition.uid;
      authSessionEpochRef.current = transition.epoch;
      ports.publishEpoch(transition.epoch);
      if (user) ports.publish(undefined);
    }
    if (!user) {
      identityRead = null;
      refreshedMismatch.clear();
      ports.publish(null);
      settled();
      return;
    }
    void reconcileIdentity(user)
      .catch((cause) => {
        if (isCurrent() && ports.currentUid() === user.uid) {
          ports.publish(identityOf(user, false, true));
          onError(cause);
        }
      })
      .finally(settled);
  };
  return {
    authSessionEpochRef,
    reconcileIdentity,
    observeUser,
    controllerLive,
    /** Marks the owning controller mounted; the returned function marks it unmounted. */
    attach: () => {
      attached = true;
      return () => {
        attached = false;
      };
    },
    clearVerificationMismatch: (uid: string) => {
      refreshedMismatch.delete(uid);
    },
  };
}
/**
 * The account identity lifetime. clearPrevious clears the previous account's device-held views. The online session
 * (useOnlineSession) supplies it and imports those comparison modules itself, which keeps them in the separate chunks
 * the offline core lists.
 */
export function useAccountIdentity(clearPrevious: (uid: string) => void) {
  const [identity, setIdentity] = useState<AccountIdentity | null | undefined>();
  // The auth-session epoch that renders use. It is state, set together with the identity it belongs to, so a render
  // never reads the live epoch (authSessionEpochRef), which may be newer than the identity it renders.
  const [authGeneration, setAuthGeneration] = useState(0);
  // The committed identity, for handlers and work that settles later.
  const identityRef = useRef(identity);
  useLayoutEffect(() => {
    identityRef.current = identity;
  }, [identity]);
  // State, not a memo: React may discard a memo (as Fast Refresh does), and this lifetime must survive re-renders.
  const [lifetime] = useState(() =>
    createAccountIdentity<User>({
      currentUid: () => cloudAuth.currentUser?.uid,
      readToken: getIdTokenResult,
      publish: setIdentity,
      publishEpoch: setAuthGeneration,
      remember: () => rememberOnlineRequest(true),
      clearPrevious,
    }),
  );
  // Attached before the controller's session observer starts, and detached as it closes. Both are the controller's
  // passive effects, declared in this order, so they open and close together.
  useEffect(() => lifetime.attach(), [lifetime]);
  return { identity, identityRef, setIdentity, authGeneration, ...lifetime };
}

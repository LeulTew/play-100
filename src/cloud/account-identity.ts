import { useEffect, useRef, useState } from 'react';
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
  /**
   * Whether the controller that owns this lifetime is still mounted. A read can outlive it: restoration gives up and
   * the controller unmounts while the same account stays signed in, even before its session observer first hears from
   * Firebase, and the user may then choose this device.
   */
  controllerLive: () => boolean;
  readToken: (user: T, force: boolean) => Promise<Pick<IdTokenResult, 'claims'>>;
  publish: (identity: AccountIdentity | null | undefined) => void;
  remember: () => unknown;
  clearPrevious: (uid: string) => void;
}
export function createAccountIdentity<T extends IdentityUser>(ports: IdentityPorts<T>) {
  let identityRead: { uid: string; promise: Promise<AccountIdentity> } | null = null;
  const refreshedMismatch = new Set<string>();
  let authSessionUid: string | null = null;
  const authSessionEpoch = { current: 0 };
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
      if (ports.controllerLive() && ports.currentUid() === user.uid) {
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
    const transition = authSessionTransition(authSessionUid, authSessionEpoch.current, user?.uid ?? null);
    if (transition.changed) {
      if (transition.clearUid) ports.clearPrevious(transition.clearUid);
      authSessionUid = transition.uid;
      authSessionEpoch.current = transition.epoch;
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
    authSessionEpoch,
    reconcileIdentity,
    observeUser,
    controllerLive: () => ports.controllerLive(),
    clearVerificationMismatch: (uid: string) => {
      refreshedMismatch.delete(uid);
    },
  };
}
/**
 * The account identity lifetime. clearPrevious clears the previous account's device-held views. OnlineController
 * supplies it and imports those comparison modules itself, which keeps them in the separate chunks the offline core lists.
 */
export function useAccountIdentity(clearPrevious: (uid: string) => void) {
  const [identity, setIdentity] = useState<AccountIdentity | null | undefined>();
  const identityRef = useRef(identity);
  identityRef.current = identity;
  // Set before the controller's session observer starts, and cleared as it closes. Both are the controller's passive
  // effects, declared in this order, so they open and close together.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // State, not a memo: React may discard a memo (as Fast Refresh does), and this lifetime must survive re-renders.
  const [lifetime] = useState(() =>
    createAccountIdentity<User>({
      currentUid: () => cloudAuth.currentUser?.uid,
      controllerLive: () => mounted.current,
      readToken: getIdTokenResult,
      publish: setIdentity,
      remember: () => rememberOnlineRequest(true),
      clearPrevious,
    }),
  );
  return { identity, identityRef, setIdentity, ...lifetime };
}

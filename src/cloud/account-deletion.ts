import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { deleteUser, EmailAuthProvider, getIdTokenResult, reauthenticateWithCredential } from 'firebase/auth';
import type { User } from 'firebase/auth';
import type { AppPage } from '../lib/types';
import type { LibraryScope, ScopedLibrary, SyncHead } from '../lib/cloud-types';
import type { FriendSettings } from '../lib/friend-types';
import type { FriendShelfConfig } from '../lib/friend-shelf-types';
import { deleteScopedLibrary, pauseScopedLibrary } from '../lib/scoped-library';
import { rememberOnlineRequest } from '../lib/online-availability';
import { hasPendingEdits } from '../hooks/useExitSave';
import { cloudAuth, cloudDb } from './firebase-client';
import { deleteOwnMember } from './cloud-store';
import type { CloudStore, DeletionCopyState } from './cloud-store';
import type { SocialStore } from './social-store';
import type { FriendStore } from './friend-store';
import type { FriendShelfStore } from './friend-shelf-store';
import type { FriendAllStore } from './friend-all-store';
import type { AccountIdentity } from './ui-types';
import { hasProvider } from './account-providers';
import { startGoogleRedirect } from './google-auth';
import { cancelUnusedRegistration, ensureAccountActivity, removeCancelledRegistration } from './account-lifecycle';

export interface GoogleDeletionApproval {
  requestId: string;
  uid: string;
  target: 'copy' | 'account';
  epoch: number;
  sessionEpoch: number;
  startedAt: number;
  expiresAt: number;
}
export interface DeletionNotice {
  key: string;
  state: DeletionCopyState;
}
export interface DeletionProbe {
  key: string;
  result: Promise<DeletionCopyState>;
}
export function currentDeletionApproval(
  approval: GoogleDeletionApproval | null,
  uid: string | undefined,
  sessionEpoch: number,
  epoch: number,
): GoogleDeletionApproval | null {
  return approval?.uid === uid && approval?.sessionEpoch === sessionEpoch && approval.epoch === epoch
    ? approval
    : null;
}
export function deletionApprovalMatches(
  approval: GoogleDeletionApproval | null,
  uid: string,
  target: 'copy' | 'account',
  sessionEpoch: number,
  epoch: number,
  now: number,
): approval is GoogleDeletionApproval {
  return Boolean(
    currentDeletionApproval(approval, uid, sessionEpoch, epoch) &&
    approval?.target === target &&
    approval.expiresAt > now,
  );
}
export function expireDeletionApproval(approval: GoogleDeletionApproval | null, requestId: string) {
  return approval?.requestId === requestId ? null : approval;
}
export function deletionOwnerMatches(
  uid: string,
  authUid: string | undefined,
  identityUid: string | undefined,
  sessionEpoch: number,
  currentSessionEpoch: number,
): boolean {
  return authUid === uid && identityUid === uid && currentSessionEpoch === sessionEpoch;
}
export function deletionProbeKey(uid: string, sessionEpoch: number, head: Pick<SyncHead, 'epoch' | 'revision'>) {
  return `${uid}:${sessionEpoch}:${head.epoch}:${head.revision}`;
}
export function deletionCopyState(
  head: SyncHead | null,
  notice: DeletionNotice | null,
  key: string | null,
): DeletionCopyState | 'checking' {
  return head?.deleted && head.cleanupEpoch === head.epoch
    ? 'complete'
    : notice && notice.key === key
      ? notice.state
      : 'checking';
}
export function deletionProbeFor(
  cached: DeletionProbe | null,
  key: string,
  read: () => Promise<DeletionCopyState>,
): DeletionProbe {
  return cached?.key === key ? cached : { key, result: read() };
}
export function useAccountDeletionState() {
  const [approval, setApproval] = useState<GoogleDeletionApproval | null>(null);
  const [notice, setNotice] = useState<DeletionNotice | null>(null);
  const probe = useRef<DeletionProbe | null>(null);
  return { approval, setApproval, notice, setNotice, probe };
}
export function useDeletionApprovalExpiry(
  page: AppPage,
  approval: GoogleDeletionApproval | null,
  setApproval: Dispatch<SetStateAction<GoogleDeletionApproval | null>>,
) {
  useEffect(() => {
    if (page !== 'account') setApproval(null);
  }, [page, setApproval]);
  useEffect(() => {
    if (!approval) return;
    const requestId = approval.requestId;
    const timeout = window.setTimeout(
      () => setApproval((current) => expireDeletionApproval(current, requestId)),
      Math.max(0, approval.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [approval, setApproval]);
}
export function useDeletionProbe({
  page,
  identity,
  sessionEpoch,
  head,
  busy,
  store,
  state: { probe: deletionProbe, notice, setNotice },
}: {
  page: AppPage;
  identity: AccountIdentity | null | undefined;
  sessionEpoch: number;
  head: SyncHead | null;
  busy: boolean;
  store: Pick<CloudStore, 'probeDeletedCopy'> | null;
  state: ReturnType<typeof useAccountDeletionState>;
}) {
  const key =
    page === 'account' && identity?.verified && head?.deleted
      ? deletionProbeKey(identity.uid, sessionEpoch, head)
      : null;
  useEffect(() => {
    if (!key) {
      deletionProbe.current = null;
      setNotice(null);
      return;
    }
    if (busy || !store || (head?.deleted && head.cleanupEpoch === head.epoch)) return;
    let alive = true;
    const probe = deletionProbeFor(deletionProbe.current, key, () => store.probeDeletedCopy());
    deletionProbe.current = probe;
    void probe.result.then((state) => {
      if (alive && deletionProbe.current === probe) setNotice({ key, state });
    });
    return () => {
      alive = false;
    };
  }, [key, busy, store, head?.cleanupEpoch, head?.epoch, head?.deleted, deletionProbe, setNotice]);
  return deletionCopyState(head, notice, key);
}

export interface AccountDeletionContext {
  identity: AccountIdentity | null | undefined;
  identityRef: RefObject<AccountIdentity | null | undefined>;
  scope: LibraryScope | null;
  currentEpoch: RefObject<number>;
  authSessionEpoch: RefObject<number>;
  state: ReturnType<typeof useAccountDeletionState>;
  account: { snapshot: ScopedLibrary | null; waitForWrites: () => Promise<unknown>; refresh: () => Promise<void> };
  sync: { store: Pick<CloudStore, 'head' | 'revoke' | 'cleanup' | 'markCleanupComplete'> | null; suspend: () => unknown };
  friends: {
    store: Pick<FriendStore, 'revokeForDeletion' | 'saveSettings' | 'cleanupSharing' | 'cleanupDeleted'>;
    stop: () => unknown;
    acceptSettings: (settings: FriendSettings) => void;
  };
  shelf: {
    store: Pick<FriendShelfStore, 'revokeForDeletion' | 'saveConfig' | 'cleanupSharing' | 'cleanupDeleted'>;
    stop: () => unknown;
    acceptConfig: (config: FriendShelfConfig) => Promise<void>;
  };
  automatic: {
    store: Pick<FriendAllStore, 'revokeForDeletion' | 'controls' | 'setPolicy' | 'policy' | 'cleanupPage'>;
    suspend: () => unknown;
  };
  social: Pick<SocialStore, 'unpublish' | 'control' | 'deleteProfile'>;
  run: (operation: () => Promise<void>, identityChange?: boolean) => Promise<boolean>;
  reconcileIdentity: (user: User, force?: boolean) => Promise<AccountIdentity>;
  setIdentity: (identity: AccountIdentity | null) => void;
  setHeadSnapshot: (head: { uid: string; value: SyncHead }) => void;
  setError: (message: string) => void;
  setMessage: (message: string) => void;
  refresh: () => Promise<void>;
  onCloseSheet: () => void;
  onNavigate: (page: AppPage) => void;
}

export function createAccountDeletion({
  identity,
  identityRef,
  scope,
  currentEpoch,
  authSessionEpoch,
  state: { approval: deletionApproval, setApproval: setDeletionApproval, probe: deletionProbe, setNotice },
  account,
  sync,
  friends,
  shelf,
  automatic,
  social,
  run,
  reconcileIdentity,
  setIdentity,
  setHeadSnapshot,
  setError,
  setMessage,
  refresh,
  onCloseSheet,
  onNavigate,
}: AccountDeletionContext) {
  return (removeAccount: boolean, password: string) => {
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
      setNotice(null);
      const session = authSessionEpoch.current;
      const targetKind = removeAccount ? 'account' : 'copy';
      if (!navigator.onLine) throw new Error('Connect to the internet before deleting online data.');
      if (hasProvider(identity, EmailAuthProvider.PROVIDER_ID)) {
        if (!password) throw new Error('Confirm your password before deleting.');
        await reauthenticateWithCredential(signedIn, EmailAuthProvider.credential(signedIn.email ?? '', password));
      } else {
        const approval = deletionApproval;
        if (!deletionApprovalMatches(approval, signedIn.uid, targetKind, session, currentEpoch.current, Date.now())) {
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
          deletionOwnerMatches(
            signedIn.uid,
            cloudAuth.currentUser?.uid,
            identityRef.current?.uid,
            session,
            authSessionEpoch.current,
          );
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
        !deletionOwnerMatches(
          user.uid,
          cloudAuth.currentUser?.uid,
          identityRef.current?.uid,
          session,
          authSessionEpoch.current,
        )
      )
        throw new Error('The signed-in account changed. Return to the same account before continuing.');
      if (account.snapshot) await pauseScopedLibrary(target);
      await ensureAccountActivity(cloudDb, user.uid);
      await social.unpublish(user.uid, await social.control(user.uid), true);
      const deleting = await store.revoke(await store.head(), true);
      deletionStarted = deletionProbeKey(user.uid, session, deleting);
      setHeadSnapshot({ uid: user.uid, value: deleting });
      const ownsDeletion = () =>
        deletionOwnerMatches(
          user.uid,
          cloudAuth.currentUser?.uid,
          identityRef.current?.uid,
          session,
          authSessionEpoch.current,
        );
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
        const key = deletionProbeKey(user.uid, session, deleting);
        deletionProbe.current = { key, result: Promise.resolve('complete') };
        setNotice({ key, state: 'complete' });
        setMessage('Your online copy was deleted. The copy on this device is still here.');
      }
    }, removeAccount).then((success) => {
      if (!success && deletionStarted && !deletionMarked) {
        const key = deletionStarted;
        deletionProbe.current = { key, result: Promise.resolve('incomplete') };
        setNotice({ key, state: 'incomplete' });
      }
      return success;
    });
  };
}

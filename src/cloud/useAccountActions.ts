import { getIdTokenResult, signOut } from 'firebase/auth';
import type { AppPage } from '../lib/types';
import type { LibraryController } from '../lib/library-controller';
import type { SyncHead } from '../lib/cloud-types';
import type { AvatarDescriptor } from '../lib/avatar';
import {
  connectScopedLibrary,
  deleteScopedLibrary,
  loadScopedLibrary,
  pauseScopedLibrary,
} from '../lib/scoped-library';
import { createLibraryBackup, emptyPersonalLibrary } from '../lib/personal-library';
import { rememberOnlineRequest } from '../lib/online-availability';
import { flushPendingEdits } from '../hooks/useExitSave';
import { cloudAuth } from './firebase-client';
import { onlineError } from './errors';
import { startGoogleRedirect } from './google-auth';
import type { AccountDeletionContext } from './account-deletion-action';
import type { ConnectionChoice } from './AccountPage';
import type { OnlineSession } from './useOnlineSession';
import type { OnlineAccount } from './useOnlineAccount';
import type { OnlineSharing } from './useOnlineSharing';
import { signOutTransition } from './sign-out-transition';
import { reportDeviceLeftovers } from './device-leftovers';
import { libraryBackupText } from './backup-download';

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

/**
 * The account's online saving and data actions, which Account runs: connecting, pausing, linking Google, signing out,
 * exporting, cleaning up and choosing between copies, and the context its deletion runs in.
 */
export function useAccountActions({
  session,
  online,
  sharing,
  guest,
  defaultAvatar,
  onCloseSheet,
  onNavigate,
}: {
  session: OnlineSession;
  online: OnlineAccount;
  sharing: Pick<OnlineSharing, 'friends' | 'shelf' | 'automatic'>;
  guest: LibraryController;
  /** The creature a newly connected account's member starts with. */
  defaultAvatar: AvatarDescriptor;
  onCloseSheet: () => void;
  onNavigate: (page: AppPage) => void;
}) {
  const { identity, identityRef, authSessionEpoch, reconcileIdentity, run } = session;
  const { setIdentity, setError, setMessage, retireInvitation } = session;
  const { scope, account, sync, social, member, head, headSnapshot, setHeadSnapshot, refresh } = online;
  const { verifiedIdentity } = online;
  const { friends, shelf, automatic } = sharing;
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
      const removal = await signOutTransition(removeDeviceCopy, {
        current,
        waitForWrites: account.waitForWrites,
        readDeviceCopy: () => loadScopedLibrary(target),
        suspend: () => [sync.suspend(), friends.stop(), shelf.stop(), automatic.suspend()],
        signOut: () => signOut(cloudAuth),
        removeDeviceCopy: (revision) => deleteScopedLibrary(target, revision),
      });
      retireInvitation();
      await rememberOnlineRequest(false);
      setIdentity(null);
      onCloseSheet();
      // Only a complete removal leaves Account, which otherwise, now signed out, says what stayed and retries it.
      if (removal.complete) onNavigate('collection');
      else reportDeviceLeftovers('sign-out', removal.retry);
    }, true);
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
  const cleanup = () =>
    run(async () => {
      const { store, user } = verifiedIdentity();
      await store.cleanup();
      await social.cleanup(user.uid);
      await shelf.store.prune(user.uid);
      setMessage('Eligible old snapshots were cleaned. Current and previous private copies remain intact.');
    });
  const retry = () =>
    run(async () => {
      await sync.retry();
      await automatic.refresh();
      await friends.retry();
      await shelf.retry();
    });
  const retrySelectedSharing = () =>
    run(async () => {
      await friends.retry();
      await shelf.retry();
    });
  const chooseRemote = (reviewed: SyncHead, revision: number) =>
    run(async () => {
      await sync.useRemote(reviewed, revision);
      await account.refresh();
    });
  const chooseLocal = (reviewed: SyncHead, revision: number) =>
    run(async () => {
      await sync.useLocal(reviewed, revision);
    });
  // Account runs the deletion itself (account-deletion-action.ts), so its code loads with that page only.
  const deletionContext: AccountDeletionContext = {
    identity,
    identityRef,
    scope,
    currentEpoch: online.currentEpoch,
    authSessionEpoch,
    state: online.deletion,
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
  };

  return {
    connect,
    linkGoogle,
    signOut: signOutAccount,
    pause,
    downloadData,
    cleanup,
    retry,
    retrySelectedSharing,
    chooseRemote,
    chooseLocal,
    deletionContext,
  };
}
export type AccountActions = ReturnType<typeof useAccountActions>;

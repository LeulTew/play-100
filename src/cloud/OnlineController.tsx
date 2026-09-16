import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, getIdTokenResult, GoogleAuthProvider, linkWithPopup,
  onIdTokenChanged, reauthenticateWithCredential, reauthenticateWithPopup, reload, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import type { AppPage, Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import type { LibraryController } from '../lib/library-controller';
import type { Member, PublicProfile } from '../lib/community';
import type { SyncHead } from '../lib/cloud-types';
import { accountScope, SYNC_LABELS } from '../lib/cloud-types';
import { cacheScopedProfile, connectScopedLibrary, deleteScopedLibrary, loadScopedLibrary, pauseScopedLibrary } from '../lib/scoped-library';
import { createLibraryBackup, emptyPersonalLibrary } from '../lib/personal-library';
import { createAvatarDescriptor } from '../lib/avatar';
import { EMULATOR_MODE, rememberOnlineRequest } from '../lib/online-availability';
import { useAccountLibrary } from '../hooks/useAccountLibrary';
import { flushPendingEdits, hasPendingEdits } from '../hooks/useExitSave';
import { Avatar } from '../components/avatar/Avatar';
import { AvatarPicker } from '../components/avatar/AvatarPicker';
import { Dialog } from '../components/Dialog';
import { cloudAuth, cloudDb, firebaseApp } from './firebase-client';
import { creatorAccess, deleteOwnMember } from './cloud-store';
import { SocialStore } from './social-store';
import { useCloudSync } from './useCloudSync';
import { onlineError, popupCancelled } from './errors';
import { cancelUnusedRegistration, ensureAccountActivity } from './account-lifecycle';
import { AuthPanel } from './AuthPanel';
import { AccountPage } from './AccountPage';
import type { ConnectionChoice } from './AccountPage';
import type { AccountIdentity, OnlineBridge } from './ui-types';
import { CommunityPage, PublicProfilePage } from './CommunityPages';
import { PublishPage } from './PublishPage';
import { CreatorPage } from './CreatorPage';
import './cloud-ui.css';

function identityOf(user: User, verified: boolean): AccountIdentity {
  return { uid: user.uid, email: user.email ?? '', displayName: user.displayName ?? '', verified, providers: user.providerData.map((provider) => provider.providerId) };
}
function download(value: unknown, name: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function OnlineController({ page, publicHandle, showSheet, guest, games, onBridge, onCloseSheet, onNavigate, onProfile, onOpenRecord, onShare }: {
  page: AppPage; publicHandle: string; showSheet: boolean; guest: LibraryController; games: Game[];
  onBridge: (bridge: OnlineBridge) => void; onCloseSheet: () => void; onNavigate: (page: AppPage) => void;
  onProfile: (handle: string) => void; onOpenRecord: (record: LibraryRecord) => void; onShare: (title: string, url: string) => void;
}) {
  const [identity, setIdentity] = useState<AccountIdentity | null | undefined>();
  const [memberSnapshot, setMember] = useState<Member | null>(null);
  const [profileSnapshot, setProfile] = useState<PublicProfile | null>(null);
  const [headSnapshot, setHeadSnapshot] = useState<{ uid: string; value: SyncHead | null } | null>(null);
  const [creatorUid, setCreatorUid] = useState<string | null>(null);
  const member = memberSnapshot?.uid === identity?.uid ? memberSnapshot : null;
  const profile = profileSnapshot?.uid === identity?.uid ? profileSnapshot : null;
  const head = headSnapshot?.uid === identity?.uid ? headSnapshot?.value ?? null : null;
  const isCreator = Boolean(identity?.verified && creatorUid === identity.uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [defaultAvatar, setDefaultAvatar] = useState(() => createAvatarDescriptor());
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
  const scope = useMemo(() => uid ? accountScope(uid, firebaseApp.options.projectId) : null, [uid]);
  const identityIsCurrent = useCallback(() => cloudAuth.currentUser?.uid === uid, [uid]);
  const account = useAccountLibrary(scope, guest.state.motion, identityIsCurrent);
  const sync = useCloudSync(scope, account.snapshot, Boolean(identity?.verified));
  const social = useMemo(() => new SocialStore(cloudDb), []);
  const active = Boolean(scope && account.snapshot && account.snapshot.sync.epoch > 0);
  const restoring = identity === undefined || Boolean(identity && !account.snapshot && !account.error);
  const cacheUnavailable = Boolean(identity && account.error && !account.snapshot);
  const canCacheProfile = Boolean(account.snapshot && !account.error);
  const protectedController = useMemo(() => cacheUnavailable ? { ...account.controller, busy: true } : active ? account.controller : null, [cacheUnavailable, active, account.controller]);
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
      if (cloudAuth.currentUser?.uid === user.uid) setIdentity(next);
      return next;
    })();
    const entry = { uid: user.uid, promise: task };
    identityRead.current = entry;
    void task.then(() => { if (identityRead.current === entry) identityRead.current = null; }, () => { if (identityRead.current === entry) identityRead.current = null; });
    return task;
  }, []);
  useEffect(() => onIdTokenChanged(cloudAuth, (user) => {
    if ((user?.uid ?? null) !== authSessionUid.current) { authSessionUid.current = user?.uid ?? null; authSessionEpoch.current += 1; }
    if (!user) { identityRead.current = null; refreshedMismatch.current.clear(); setIdentity(null); return; }
    void reconcileIdentity(user).catch((cause) => {
      if (cloudAuth.currentUser?.uid === user.uid) { setIdentity(identityOf(user, false)); setError(onlineError(cause)); }
    });
  }, (cause) => { setIdentity(null); setError(onlineError(cause)); }), [reconcileIdentity]);
  useEffect(() => {
    setMember(null); setProfile(null); setHeadSnapshot(null); setCreatorUid(null); setError(''); setMessage(''); setAvatarOpen(false); setDefaultAvatar(createAvatarDescriptor());
  }, [identity?.uid]);
  useEffect(() => {
    if (cooldown <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown, now]);
  const refresh = useCallback(async () => {
    const user = identityRef.current;
    if (!user?.verified || !sync.store) return;
    const [nextMember, nextProfile, nextHead, allowed] = await Promise.all([social.member(user.uid), social.ownProfile(user.uid), sync.store.head(), creatorAccess(cloudDb)]);
    if (identityRef.current?.uid !== user.uid) return;
    setMember(nextMember); setProfile(nextProfile); setHeadSnapshot({ uid: user.uid, value: nextHead }); setCreatorUid(allowed ? user.uid : null);
    if (nextMember && scope && canCacheProfile) {
      try { await cacheScopedProfile(scope, nextMember); }
      catch (cause) { if (identityRef.current?.uid === user.uid) setError(`Online profile loaded, but its device cache could not update. ${onlineError(cause)}`); }
    }
  }, [social, sync.store, scope, canCacheProfile]);
  useEffect(() => {
    if (!identity?.verified) return;
    void refresh().catch((cause) => { setError(onlineError(cause)); });
  }, [identity?.uid, identity?.verified, refresh]);
  useEffect(() => { if (sync.remote && uid) setHeadSnapshot({ uid, value: sync.remote }); }, [sync.remote, uid]);

  const bridge = useMemo<OnlineBridge>(() => ({
    loading: restoring, identity: identity ?? null,
    controller: protectedController, scope: (active || cacheUnavailable) && scope ? scope : 'guest',
    enabled: active && Boolean(account.snapshot?.sync.enabled && identity?.verified),
    status: cacheUnavailable ? 'error' : active ? sync.status : 'device', label: cacheUnavailable ? 'Account cache unavailable' : active ? (sync.pendingEdits ? 'Finishing local edits...' : SYNC_LABELS[sync.status]) : 'Device only',
    creator: isCreator,
  }), [identity, restoring, active, protectedController, cacheUnavailable, account.snapshot?.sync.enabled, scope, sync.status, sync.pendingEdits, isCreator]);
  useLayoutEffect(() => { onBridge(bridge); }, [bridge, onBridge]);

  const run = async (operation: () => Promise<void>, identityChange = false): Promise<boolean> => {
    if (running.current) return false;
    const startedUid = identityRef.current?.uid;
    running.current = true; setBusy(true); setError(''); setMessage('');
    try { await operation(); return true; }
    catch (cause) {
      if (identityChange || identityRef.current?.uid === startedUid) {
        if (!popupCancelled(cause)) setError(onlineError(cause));
      }
      return false;
    } finally { running.current = false; setBusy(false); }
  };
  const afterSignIn = async (user: User) => {
    await reconcileIdentity(user);
    if (cloudAuth.currentUser?.uid !== user.uid) return;
    rememberOnlineRequest(true); onCloseSheet();
    if (page !== 'publish' && page !== 'creator') onNavigate('account');
  };
  const google = () => {
    if (hasPendingEdits()) { setError('Finish or correct the open rating/note before changing accounts.'); return Promise.resolve(false); }
    return run(async () => { const result = await signInWithPopup(cloudAuth, new GoogleAuthProvider()); await afterSignIn(result.user); }, true);
  };
  const email = (address: string, password: string, create: boolean) => run(async () => {
    if (!await flushPendingEdits()) throw new Error('Finish or correct the open edit before signing in.');
    const result = create ? await createUserWithEmailAndPassword(cloudAuth, address, password) : await signInWithEmailAndPassword(cloudAuth, address, password);
    await afterSignIn(result.user);
  }, true);
  const sendVerification = () => run(async () => {
    const user = cloudAuth.currentUser;
    if (!user) throw new Error('Sign in before requesting verification.');
    if (user.emailVerified) {
      const next = await reconcileIdentity(user, true);
      setMessage(next.verified ? 'Your email is verified and the sign-in token was refreshed.' : 'The signed-in session could not yet confirm verification. Use I verified my email to retry.');
      return;
    }
    if (Date.now() < cooldown) throw new Error('Wait for the resend countdown before requesting another email.');
    await sendEmailVerification(user, { url: `${location.origin}/account` });
    setCooldown(Date.now() + 60000); setNow(Date.now()); setMessage('Verification email requested. Check your inbox and spam folder, then return here.');
  });
  const resetEmail = (address: string) => run(async () => {
    if (!address) throw new Error('Enter your email before requesting a reset.');
    if (Date.now() < cooldown) throw new Error('Wait a minute before requesting another email.');
    await sendPasswordResetEmail(cloudAuth, address, { url: `${location.origin}/account` });
    setCooldown(Date.now() + 60000); setNow(Date.now()); setMessage('If this account can receive password reset emails, one has been requested. Check your inbox and spam folder.');
  }, true);
  const verifiedIdentity = () => {
    const user = cloudAuth.currentUser;
    if (!user || !identityRef.current?.verified || !scope || !sync.store || !account.snapshot || user.uid !== identityRef.current?.uid) throw new Error('Verify this account and wait for its local cache before continuing.');
    return { user, scope, store: sync.store, local: account.snapshot };
  };
  const connect = (choice: ConnectionChoice, name: string) => run(async () => {
    if (!await flushPendingEdits()) throw new Error('Finish or correct the open edit before connecting.');
    const { user, scope: target, store, local } = verifiedIdentity();
    const expected = { localRevision: local.state.revision, epoch: local.sync.epoch, enabled: local.sync.enabled };
    const before = await store.head();
    if (headSnapshot?.uid !== user.uid || (before?.revision ?? 0) !== (head?.revision ?? 0) || (before?.epoch ?? 0) !== (head?.epoch ?? 0)) {
      setHeadSnapshot({ uid: user.uid, value: before });
      throw new Error('The online library changed since this preview. Review the available copies before connecting.');
    }
    if (choice === 'empty' && before?.current) throw new Error('An online library already exists. Choose it or explicitly choose a replacement; an empty start is not available.');
    if (choice === 'guest' && Object.keys(guest.state.records).length === 0) throw new Error('The guest copy changed and is now empty. Review the available starting copies.');
    if (choice === 'cached' && local.sync.epoch === 0 && Object.keys(local.state.records).length === 0) throw new Error('This account has no previous device copy to use.');
    if (before?.deleted) {
      const token = await getIdTokenResult(user, true);
      if (typeof token.claims.auth_time !== 'number' || token.claims.auth_time * 1000 <= before.updatedAt) throw new Error('This online copy was deleted. Sign out and sign in again before creating a new online copy.');
    }
    const remoteCopy = before?.current ? await store.download(before) : null;
    const chosen = choice === 'online' ? remoteCopy : choice === 'guest' ? guest.state : choice === 'cached' ? local.state : emptyPersonalLibrary();
    if (!chosen) throw new Error('There is no complete online copy to adopt. Choose another starting library.');
    if (identityRef.current?.uid !== user.uid) throw new Error('The signed-in account changed. No device copy was imported.');
    const enabledHead = before?.deleted ? await store.enable(before) : before;
    await social.saveMemberName(user.uid, name, member?.avatar ?? defaultAvatar);
    const connectedHead = before?.deleted && enabledHead ? enabledHead : await store.enable(before);
    await connectScopedLibrary(target, chosen, connectedHead, name.trim(), choice !== 'online', expected);
    await social.restorePublicationPermission(user.uid);
    await account.refresh(); await refresh();
    setMessage('Online saving is enabled for this account. The original guest library is still intact.');
  });
  const signOutAccount = () => run(async () => {
    if (!await flushPendingEdits()) throw new Error('Correct the pending edit before signing out.');
    await account.waitForWrites();
    await signOut(cloudAuth); rememberOnlineRequest(false); setIdentity(null); onCloseSheet(); onNavigate('collection');
  }, true);
  const pause = () => run(async () => {
    const { scope: target, store } = verifiedIdentity();
    if (!navigator.onLine) throw new Error('Connect before stopping online saving on all devices. Offline edits are retained here.');
    const current = await store.head();
    if (current) await store.revoke(current);
    await pauseScopedLibrary(target); await account.refresh(); await refresh();
    setMessage('Online saving is stopped. The online copy and this account cache are retained; your guest library is separate.');
  });
  const downloadData = (source: 'local' | 'online' | 'guest' | 'all') => run(async () => {
    if (!await flushPendingEdits()) throw new Error('Correct the pending edit before exporting.');
    if (source === 'guest') { download(createLibraryBackup(guest.state), 'Play-100-guest-backup.json'); return; }
    if (!scope || !sync.store || !identity) throw new Error('Sign in before exporting account data.');
    let local = account.snapshot;
    let cacheError: string | null = null;
    try { local = await loadScopedLibrary(scope); }
    catch (cause) {
      if (source === 'local') throw cause;
      cacheError = onlineError(cause);
    }
    if (source === 'local') {
      if (!local) throw new Error('The account device copy is unavailable. Export the online copy instead.');
      download(createLibraryBackup(local.state), 'Play-100-account-device-backup.json'); return;
    }
    const remoteHead = await sync.store.head();
    const remoteLibrary = remoteHead?.current ? await sync.store.download(remoteHead) : null;
    if (source === 'online') {
      if (!remoteLibrary) throw new Error('There is no complete online copy to export yet.');
      download(createLibraryBackup({ ...remoteLibrary, motion: local?.state.motion ?? guest.state.motion }), 'Play-100-online-backup.json'); return;
    }
    const publicCopy = await social.ownProfile(identity.uid);
    const entries = publicCopy ? await social.entries(publicCopy) : [];
    download({ app: 'Play 100', formatVersion: 1, exportedAt: new Date().toISOString(), identity, member,
      deviceLibrary: local ? createLibraryBackup(local.state) : null, deviceCacheError: cacheError,
      onlineLibrary: remoteLibrary ? createLibraryBackup({ ...remoteLibrary, motion: local?.state.motion ?? guest.state.motion }) : null,
      recovery: local?.recovery ?? null, publication: publicCopy, publishedEntries: entries }, 'Play-100-account-export.json');
    if (cacheError) setMessage('Online account data was exported. The unreadable device cache is explicitly marked unavailable in the export; it was not replaced or deleted.');
  });
  const deleteOnline = (removeAccount: boolean, password: string) => {
    if (hasPendingEdits()) { setError('Finish the open edit before deleting online data.'); return Promise.resolve(false); }
    return run(async () => {
      const signedIn = cloudAuth.currentUser;
      if (!signedIn || signedIn.uid !== identityRef.current?.uid || !scope) throw new Error('Sign in to the account you want to delete.');
      if (removeAccount && !identityRef.current.verified) {
        if (!navigator.onLine) throw new Error('Connect before cancelling this registration.');
        if (identity?.providers.includes('password')) {
          if (!password) throw new Error('Confirm the registration password before deleting it.');
          await reauthenticateWithCredential(signedIn, EmailAuthProvider.credential(signedIn.email ?? '', password));
        } else await reauthenticateWithPopup(signedIn, new GoogleAuthProvider());
        const token = await getIdTokenResult(signedIn, true);
        if (token.claims.email_verified === true) {
          await reconcileIdentity(signedIn, true);
          throw new Error('This account is now verified. Review its online data before using full account deletion.');
        }
        await cancelUnusedRegistration(cloudDb, signedIn.uid);
        await deleteUser(signedIn); await deleteScopedLibrary(scope);
        rememberOnlineRequest(false); setIdentity(null); onNavigate('collection');
        return;
      }
      if (!identityRef.current?.verified || !sync.store) throw new Error('Verify this account before deleting existing online data.');
      const user = signedIn; const target = scope; const store = sync.store;
      if (!navigator.onLine) throw new Error('Connect before deleting cloud data. No success is reported until deletion finishes.');
      if (identity?.providers.includes('password')) {
        if (!password) throw new Error('Confirm your password before deleting.');
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', password));
      } else await reauthenticateWithPopup(user, new GoogleAuthProvider());
      await account.waitForWrites();
      if (account.snapshot) await pauseScopedLibrary(target);
      await ensureAccountActivity(cloudDb, user.uid);
      await social.unpublish(user.uid, await social.control(user.uid), true);
      await store.revoke(await store.head(), true);
      await store.cleanup(true); await social.deleteProfile(user.uid); await deleteOwnMember(cloudDb, user.uid);
      if (removeAccount) {
        await deleteUser(user); await deleteScopedLibrary(target);
        rememberOnlineRequest(false); setIdentity(null); onNavigate('collection');
      } else {
        await account.refresh(); await refresh();
        setMessage('Online content was deleted. This account device copy is retained. A minimal content-free revocation marker prevents stale tabs from recreating deleted data.');
      }
    }, removeAccount);
  };

  const avatar = member?.avatar ?? account.snapshot?.profile?.avatar ?? defaultAvatar;
  const identityKey = `${identity?.uid ?? 'guest'}:${authSessionEpoch.current}:${account.snapshot?.sync.epoch ?? 0}:${Boolean(account.snapshot?.sync.enabled)}`;
  const authPanel = <AuthPanel busy={busy} error={error} message={message} onGoogle={google} onEmail={email} onReset={resetEmail} onDevice={() => { onCloseSheet(); if (page === 'account' || page === 'publish' || page === 'creator') onNavigate('collection'); }} />;
  const cloudPage = ['account', 'publish', 'community', 'profile', 'creator'].includes(page);
  return (
    <>
      {cloudPage && EMULATOR_MODE && <p className="emulator-note emulator-page-note">Local emulator preview — no production account or cloud data connection.</p>}
      {cloudPage && (restoring ? <div className="page-loading" role="status"><h1>Opening your account...</h1><p>The device library is not being uploaded.</p></div> :
        page === 'community' ? <CommunityPage social={social} onOpen={onProfile} onPublish={() => onNavigate('publish')} /> :
        page === 'profile' ? <PublicProfilePage social={social} handle={publicHandle} games={games} library={activeController} identity={identity} onOpenRecord={onOpenRecord} onShare={onShare} onAccount={() => onNavigate('account')} /> :
        !identity ? <section className="app-page auth-page"><h1 data-page-heading tabIndex={-1}>Your list.<br />Wherever you play.</h1>{authPanel}</section> :
        page === 'creator' ? <CreatorPage key={identity.uid} social={social} allowed={isCreator} verified={identity.verified} onAccount={() => onNavigate('account')} /> :
        page === 'publish' ? <PublishPage key={identity.uid} social={social} identity={identity} member={member} avatar={avatar} state={activeController.state} games={games} existing={profile} isCreator={isCreator} onAccount={() => onNavigate('account')} onPublished={(next) => { if (cloudAuth.currentUser?.uid === next.uid) { setProfile(next); onProfile(next.handle); } }} /> :
        <AccountPage key={`${identity.uid}:${Boolean(account.snapshot?.sync.enabled)}`} identity={identity} member={member} cache={account.snapshot} guest={guest.state} head={head} remoteReady={headSnapshot?.uid === identity.uid} status={active ? sync.status : 'device'} error={error || account.error || sync.error} message={message} cleanupWarning={sync.cleanupWarning} busy={busy || account.controller.busy} resendIn={Math.max(0, Math.ceil((cooldown - now) / 1000))} isCreator={isCreator} avatar={<Avatar descriptor={avatar} size={80} label="Your creature" />}
          onAvatar={() => setAvatarOpen(true)} onName={(name) => run(async () => { const { user } = verifiedIdentity(); await social.saveMemberName(user.uid, name, avatar); await refresh(); setMessage('Account name saved. Published snapshots change only when explicitly updated.'); })}
          onConnect={connect} onVerify={sendVerification} onRefreshIdentity={() => run(async () => { const user = cloudAuth.currentUser; if (!user) return; await reload(user); refreshedMismatch.current.delete(user.uid); const next = await reconcileIdentity(user, true); setMessage(next.verified ? 'Email verified. You can choose online saving or publishing.' : 'Verification is not confirmed yet. Open the latest email link, then try again.'); })}
          onSignOut={signOutAccount} onLinkGoogle={() => run(async () => { const { user } = verifiedIdentity(); await linkWithPopup(user, new GoogleAuthProvider()); await reconcileIdentity(user, true); setMessage('Google is linked to this existing account.'); })}
          onRetry={() => run(async () => { await sync.retry(); await refresh(); })} onCleanup={() => run(async () => { const { store, user } = verifiedIdentity(); await store.cleanup(); await social.cleanup(user.uid); setMessage('Eligible old snapshots were cleaned. Current and previous private copies remain intact.'); })}
          onPause={pause} onDownload={downloadData}
          onUseRemote={(reviewed, revision) => run(async () => { await sync.useRemote(reviewed, revision); await account.refresh(); })}
          onUseLocal={(reviewed, revision) => run(async () => { await sync.useLocal(reviewed, revision); })}
          onDelete={deleteOnline} onPublish={() => onNavigate('publish')} onCommunity={() => onNavigate('community')} onCreator={() => onNavigate('creator')} />)}
      {showSheet && !identity && <Dialog open titleId="account-signin-title" className="info-dialog signin-dialog" onClose={onCloseSheet}><h2 id="account-signin-title" data-autofocus tabIndex={-1}>Your list.<br />Wherever you play.</h2>{authPanel}</Dialog>}
      {avatarOpen && identity && <Dialog open titleId="account-avatar-title" className="info-dialog" onClose={() => { if (!busy) setAvatarOpen(false); }}><p className="section-help">Saving updates your account creature, visible to the creator. A published profile keeps its existing snapshot until you update it.</p><AvatarPicker value={avatar} identityKey={identityKey} titleId="account-avatar-title" onCancel={() => setAvatarOpen(false)} onSave={async (next) => {
        const uid = identity.uid; const epoch = currentEpoch.current; const sessionEpoch = authSessionEpoch.current;
        const saved = await run(async () => {
          if (cloudAuth.currentUser?.uid !== uid || !identityRef.current?.verified || currentEpoch.current !== epoch || authSessionEpoch.current !== sessionEpoch) throw new Error('The account changed. Your new account was not modified.');
          await social.saveMemberAvatar(uid, next, member?.displayName || identity.displayName || 'Player');
          if (identityRef.current?.uid === uid && currentEpoch.current === epoch && authSessionEpoch.current === sessionEpoch) { setDefaultAvatar(next); await refresh(); }
        });
        if (!saved) throw new Error('The creature could not be saved. Your previous choice is unchanged.');
        if (identityRef.current?.uid === uid && currentEpoch.current === epoch && authSessionEpoch.current === sessionEpoch) setAvatarOpen(false);
      }} /></Dialog>}
    </>
  );
}

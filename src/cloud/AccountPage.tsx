import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import type { AccountIdentity } from './ui-types';
import { hasProvider } from './account-providers';
import type { ScopedLibrary, SyncHead, SyncStatus } from '../lib/cloud-types';
import { SYNC_LABELS } from '../lib/cloud-types';
import type { Member } from '../lib/community';
import type { PersonalLibraryState } from '../lib/personal-types';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { DataUseLink } from '../components/DataUseLink';
import { CANCELLED_REGISTRATION_MESSAGE } from './account-lifecycle';
import type { DeletionCopyState } from './cloud-store';

export type ConnectionChoice = 'guest' | 'online' | 'empty' | 'cached';
export interface AccountPageProps {
  cancelledRegistration?: boolean;
  deletionState?: DeletionCopyState | 'checking';
  identity: AccountIdentity; member: Member | null; cache: ScopedLibrary | null; guest: PersonalLibraryState;
  head: SyncHead | null; remoteReady: boolean; status: SyncStatus; error: string; message: string; cleanupWarning: string;
  busy: boolean; resendIn: number; isCreator: boolean; avatar: ReactNode;
  onAvatar: () => void; onName: (name: string) => Promise<boolean>; onConnect: (choice: ConnectionChoice, name: string) => Promise<boolean>;
  onVerify: () => Promise<boolean>; onRefreshIdentity: () => Promise<boolean>; onSignOut: () => Promise<boolean>; onLinkGoogle: () => Promise<boolean>;
  onSignOutAndRemove?: () => Promise<boolean>;
  onRetry: () => Promise<boolean>; onCleanup: () => Promise<boolean>; onPause: () => Promise<boolean>;
  onDownload: (source: 'local' | 'online' | 'guest' | 'all') => Promise<boolean>;
  onUseRemote: (head: SyncHead, localRevision: number) => Promise<boolean>; onUseLocal: (head: SyncHead, localRevision: number) => Promise<boolean>;
  onDelete: (account: boolean, password: string) => Promise<boolean>;
  googleDeletion: { requestId: string; target: 'copy' | 'account' } | null; onDismissDeletion: () => void;
  onPublish: () => void; onCommunity: () => void; onCreator: () => void;
  onFriends?: () => void; onCompare?: () => void; friendsSharing?: ReactNode; sharedGames?: ReactNode;
}

export function AccountPage(props: AccountPageProps) {
  const { identity, member, cache, guest, head, remoteReady, status, error, message, cleanupWarning, busy, resendIn,
    isCreator, avatar, googleDeletion, onDismissDeletion, onAvatar, onName, onConnect, onVerify, onRefreshIdentity,
    onSignOut, onLinkGoogle, onRetry, onCleanup, onPause, onDownload, onUseRemote, onUseLocal, onDelete,
    onPublish, onCommunity, onCreator, onFriends, onCompare, friendsSharing, sharedGames, cancelledRegistration = false, onSignOutAndRemove, deletionState = 'checking' } = props;
  const currentName = member?.displayName || cache?.profile?.displayName || identity.displayName || 'Player';
  const [name, setName] = useState(currentName);
  const [nameEdited, setNameEdited] = useState(false);
  const [nameError, setNameError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const [choice, setChoice] = useState<ConnectionChoice | null>(null);
  const [confirmation, setConfirmation] = useState<'pause' | 'remote' | 'local' | 'delete-copy' | 'delete-account' | 'signout-device' | null>(null);
  const [password, setPassword] = useState('');
  const [conflictVersion, setConflictVersion] = useState<{ head: SyncHead; localRevision: number } | null>(null);
  const resumedDeletion = useRef<string | null>(null);
  const active = Boolean(cache?.sync.enabled);
  const localGames = Object.keys(cache?.state.records ?? {}).length;
  const guestGames = Object.keys(guest.records).length;
  const choices: Array<{ value: ConnectionChoice; label: string; detail: string }> = [];
  if (head?.current) choices.push({ value: 'online', label: 'Online library', detail: member ? `${member.gameCount} ${member.gameCount === 1 ? 'game' : 'games'}, ${member.rankCount} ranked` : 'Existing saved copy' });
  if (guestGames) choices.push({ value: 'guest', label: 'Device-only library', detail: `${guestGames} ${guestGames === 1 ? 'game' : 'games'}, ${guest.ranking.length} ranked` });
  if (localGames || (cache?.sync.epoch ?? 0) > 0) choices.push({ value: 'cached', label: 'Account copy on this device', detail: `${localGames} ${localGames === 1 ? 'game' : 'games'}, ${cache?.state.ranking.length ?? 0} ranked` });
  if (remoteReady && !head?.current) choices.push({ value: 'empty', label: 'Empty library', detail: 'No device games uploaded' });
  const selected = choice ?? choices[0]?.value ?? 'empty';
  const validChoice = choices.some((item) => item.value === selected);
  const replacing = Boolean(head?.current && selected !== 'online');
  useEffect(() => { if (!nameEdited) setName(currentName); }, [currentName, nameEdited]);
  useEffect(() => {
    if (googleDeletion && resumedDeletion.current !== googleDeletion.requestId) {
      resumedDeletion.current = googleDeletion.requestId;
      setConfirmation(googleDeletion.target === 'account' ? 'delete-account' : 'delete-copy');
    }
  }, [googleDeletion]);
  const validName = () => {
    if (name.trim().length >= 1 && name.trim().length <= 60) { setNameError(''); return true; }
    setNameError('Enter a name from 1 to 60 characters.'); nameInput.current?.focus(); return false;
  };
  const closeConfirmation = () => { setConfirmation(null); setPassword(''); onDismissDeletion(); };
  const googleConfirmation = confirmation?.startsWith('delete') && !hasProvider(identity, EmailAuthProvider.PROVIDER_ID);
  const googleConfirmed = googleDeletion?.target === (confirmation === 'delete-account' ? 'account' : 'copy');
  const confirm = async () => {
    const result = confirmation === 'signout-device' ? await onSignOutAndRemove?.() : confirmation === 'pause' ? await onPause() : confirmation === 'remote' ? conflictVersion && await onUseRemote(conflictVersion.head, conflictVersion.localRevision)
      : confirmation === 'local' ? conflictVersion && await onUseLocal(conflictVersion.head, conflictVersion.localRevision) : await onDelete(confirmation === 'delete-account', password);
    if (result) closeConfirmation();
  };

  return <section className="app-page account-page" aria-labelledby="account-title">
    <div className="account-heading">
      <div className="account-avatar"><button className="account-icon-change" aria-label="Change icon" disabled={busy || !identity.verified} onClick={onAvatar}>{avatar}<span>Change icon</span></button></div>
      <div><h1 id="account-title" data-page-heading tabIndex={-1}>Account</h1><p>{identity.email}<span>Signed in{identity.verificationPending ? ' · checking access' : identity.verified ? '' : ' · verify your email'}</span></p></div>
      <button className="text-button" disabled={busy} onClick={() => { void onSignOut(); }}>Sign out<Icon name="arrow" width="17" height="17" /></button>
    </div>
    {onSignOutAndRemove && <div className="account-section">
      <button className="text-button" disabled={busy || !cache || cache.sync.dirty} onClick={() => setConfirmation('signout-device')}>Sign out and remove this device's copy</button>
      {cache?.sync.dirty && <p>Unsynced changes are on this device. Save or export them first; ordinary Sign out keeps the copy.</p>}
    </div>}
    {cancelledRegistration && <section className="account-notice" role="alert">
      <p>{CANCELLED_REGISTRATION_MESSAGE}</p>
      <button className="button button-outline" disabled={busy} onClick={() => setConfirmation('delete-account')}>Remove cancelled sign-in</button>
    </section>}
    {head?.deleted && <section className="account-notice" aria-labelledby="deletion-notice-title">
      <h2 id="deletion-notice-title">{deletionState === 'complete' ? 'Online copy deleted' : deletionState === 'incomplete' ? "Deletion isn't finished" : 'Deletion was requested'}</h2>
      <p role="status">{deletionState === 'complete' ? 'Online saving and sharing are off. The copy on this device is still here.' : deletionState === 'incomplete' ? 'Some online data is still stored.' : deletionState === 'checking' ? "Checking what's still stored online…" : "Removal of all online data could not be confirmed."}</p>
      <div className="button-row">
        {deletionState !== 'complete' && <button className="button button-dark" disabled={busy} onClick={() => setConfirmation('delete-copy')}>Finish deleting</button>}
        {(deletionState === 'complete' || deletionState === 'incomplete') && <button className="text-button" disabled={busy} onClick={() => setConfirmation('delete-account')}>Delete account</button>}
      </div>
      <p>To use online saving again, turn it on below; this starts a new online copy.</p>
    </section>}
    <div className="account-columns"><div className="account-primary">
      <section className="sync-panel" aria-labelledby="sync-title">
        <div className="section-title-line"><h2 id="sync-title">Online saving</h2><span className={`sync-state sync-${status}`} role="status">{identity.verified ? SYNC_LABELS[status] : identity.verificationPending ? 'Sign-in needs attention' : 'Verify your email'}</span></div>
        {identity.verificationPending ? <button className="button button-outline" disabled={busy} onClick={() => { void onRefreshIdentity(); }}>Retry sign-in check</button> : !identity.verified ? <div className="button-row">
          <button className="button button-dark" disabled={busy || resendIn > 0} onClick={() => { void onVerify(); }}>{resendIn ? `Resend in ${resendIn}s` : 'Send verification email'}</button>
          <button className="button button-outline" disabled={busy} onClick={() => { void onRefreshIdentity(); }}>I verified my email</button>
        </div> : !active ? <form onSubmit={(event) => { event.preventDefault(); if (validName() && validChoice && remoteReady && cache && !busy) void onConnect(selected, name.trim()); }}>
          {head && (!head.enabled || head.deleted) && <p className="account-notice">{head.deleted
            ? <>Online saving is off because you deleted your online copy. Turning it on starts a new online copy.{deletionState !== 'complete' && " It doesn't finish the earlier deletion."}</>
            : 'Online saving is stopped. Turn it on below when you want to save online again.'}</p>}
          {!remoteReady ? <p role="status">Checking saved copies…</p> : choices.length === 1 ? <p className="connection-source"><strong>{choices[0]?.label}</strong><span>{choices[0]?.detail}</span></p> :
            <fieldset className="connect-choices" disabled={busy}><legend>Start with</legend>{choices.map((item) => <label key={item.value}>
              <input type="radio" name="connection-copy" value={item.value} checked={selected === item.value} onChange={() => setChoice(item.value)} />
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </label>)}</fieldset>}
          {!validChoice && remoteReady && <p className="inline-error" role="alert">That source changed. Choose a copy again.</p>}
          {replacing && <p className="section-help">This replaces your online library. The device original stays here.</p>}
          <p className="consent-summary">The creator can see your profile and ranking summary. <DataUseLink /></p>
          <p className="section-help">New setups share saved games and rankings with accepted friends. Existing sharing choices stay unchanged; notes, queue and history stay private.</p>
          <button className="button button-dark" disabled={busy || cancelledRegistration || !cache || !remoteReady || !validChoice} type="submit">{busy ? 'Connecting…' : replacing ? 'Agree & replace online' : 'Agree & enable'}<Icon name="arrow" width="18" height="18" /></button>
        </form> : <>
          <p className="account-counts">{localGames} {localGames === 1 ? 'game' : 'games'} · {cache?.state.queueOrder.length ?? 0} queued · {cache?.state.ranking.length ?? 0} ranked</p>
          {cache?.sync.lastSyncedAt && <p className="account-smallprint">Last saved: {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(cache.sync.lastSyncedAt)}</p>}
          <div className="button-row"><button className="button button-outline" disabled={busy} onClick={() => { void onRetry(); }}>Sync now<Icon name="arrow" width="17" height="17" /></button><button className="text-button" disabled={busy} onClick={() => setConfirmation('pause')}>Stop online saving</button></div>
        </>}
        {error && <p className="inline-error" role="alert">{error}</p>}{message && <p className="account-notice" role="status">{message}</p>}
        {error && !active && identity.verified && <button className="text-button" disabled={busy} onClick={() => { void onRetry(); }}>Retry account check</button>}
        {status === 'conflict' && <div className="conflict-choices"><h3>Choose a copy</h3><p>Both copies are kept until you choose. Download them before replacing either.</p>
          <div className="button-row"><button className="button button-outline" disabled={busy} onClick={() => { void onDownload('local'); }}>Download device copy</button><button className="button button-outline" disabled={busy} onClick={() => { void onDownload('online'); }}>Download online copy</button></div>
          <div className="button-row"><button className="text-button" disabled={busy || !head || !cache} onClick={() => { if (head && cache) { setConflictVersion({ head, localRevision: cache.state.revision }); setConfirmation('remote'); } }}>Use online copy</button><button className="text-button" disabled={busy || !head || !cache} onClick={() => { if (head && cache) { setConflictVersion({ head, localRevision: cache.state.revision }); setConfirmation('local'); } }}>Use device copy online</button></div>
        </div>}
        {cleanupWarning && <div className="cleanup-note"><p role="status">{cleanupWarning}</p><button className="text-button" disabled={busy} onClick={() => { void onCleanup(); }}>Retry cleanup</button></div>}
      </section>
      <details className="account-section account-backups" open={Boolean(error || status === 'conflict')}><summary>Backups</summary><div className="button-row">
        <button className="button button-outline" disabled={busy} onClick={() => { void onDownload('all'); }}><Icon name="download" width="18" height="18" />Export account data</button>
        <button className="text-button" disabled={busy} onClick={() => { void onDownload('guest'); }}>Export device-only library</button>
      </div></details>
    </div><aside className="account-secondary">
      <section className="account-section"><h2>Profile</h2>
        <form className="account-name-form" onSubmit={(event) => { event.preventDefault(); if (validName()) void onName(name.trim()).then((saved) => { if (saved) setNameEdited(false); }); }}>
          <label htmlFor="account-name">Name</label><input ref={nameInput} id="account-name" name="nickname" autoComplete="nickname" maxLength={60} required value={name} disabled={busy || !identity.verified} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'account-name-error' : undefined} onChange={(event) => { setNameEdited(true); setName(event.target.value); setNameError(''); }} />
          {nameError && <p id="account-name-error" className="inline-error" role="alert">{nameError}</p>}
          <button className="text-button" disabled={busy || !identity.verified || !cache}>Save name</button>
        </form>
        {!hasProvider(identity, GoogleAuthProvider.PROVIDER_ID) && <button className="text-button" disabled={busy || !identity.verified} onClick={() => { void onLinkGoogle(); }}>Link Google</button>}
      </section>
      <section className="account-section"><h2>Sharing</h2>
        {sharedGames}
        {friendsSharing}
        {onFriends && <button className="text-button" onClick={onFriends}>Friends<Icon name="arrow" width="17" height="17" /></button>}
        {onCompare && <button className="text-button" onClick={onCompare}>Compare rankings<Icon name="arrow" width="17" height="17" /></button>}
        <button className="text-button" onClick={onPublish}>Public ranking<Icon name="share" width="17" height="17" /></button>
        <button className="text-button" onClick={onCommunity}>Community<Icon name="arrow" width="17" height="17" /></button>
        {isCreator && <button className="text-button" onClick={onCreator}>Creator desk<Icon name="arrow" width="17" height="17" /></button>}
      </section>
      {!head?.deleted && <details className="account-danger"><summary>{identity.verified ? 'Delete data or account' : 'Cancel registration'}</summary>
        {identity.verified && <button className="text-button danger-text" disabled={busy} onClick={() => setConfirmation('delete-copy')}>Delete online copy</button>}
        <button className="text-button danger-text" disabled={busy} onClick={() => setConfirmation('delete-account')}>{identity.verified ? 'Delete account' : 'Delete unused registration'}</button>
      </details>}
    </aside></div>
    {confirmation && <Dialog open titleId="account-confirm-title" onClose={() => { if (!busy) closeConfirmation(); }} className="info-dialog">
      <h2 id="account-confirm-title">{confirmation === 'signout-device' ? "Remove this device's account copy?" : confirmation === 'pause' ? 'Stop online saving?' : confirmation === 'remote' ? 'Use the online copy?' : confirmation === 'local' ? 'Replace the online copy?' : confirmation === 'delete-copy' ? 'Delete your online copy?' : cancelledRegistration ? 'Remove cancelled sign-in?' : identity.verified ? 'Delete your account?' : 'Cancel this registration?'}</h2>
      {cancelledRegistration && confirmation === 'delete-account' && <p>This removes the cancelled sign-in and its account copy on this device. You can then register again with the same email. Your guest library stays here.</p>}
      {identity.verified && !cancelledRegistration && confirmation.startsWith('delete') && <p>If deletion is interrupted, your account stays and you can finish from this page later.</p>}
      <p>{confirmation === 'signout-device' ? 'Sign out and remove only this account copy, its recovery data and sharing caches from this device. Your guest library and online copy are not deleted. Unsynced or newly changed data prevents removal.' : confirmation === 'pause' ? 'Uploads stop on all devices. Your saved copies remain available.' : confirmation === 'remote' ? "Replace this account's device library with the online copy. A recovery copy stays here." : confirmation === 'local' ? 'Replace the online library with this device copy. A newer update will require another choice.' : !identity.verified ? 'Cancel only if this registration has no prior online activity. Your device-only library stays here.' : 'Remove online profile and library data, unpublish its ranking and stop older sessions from restoring it. Export a backup first. Your guest library stays here.'}</p>
      {(confirmation === 'delete-copy' || confirmation === 'delete-account') && hasProvider(identity, EmailAuthProvider.PROVIDER_ID) && <><label htmlFor="confirm-account-password">Confirm your password</label><input id="confirm-account-password" name="current-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></>}
      {googleConfirmation && <p className="section-help">{googleConfirmed ? 'Google confirmed this account. Confirm below to delete.' : 'Confirm with Google in this tab, then return here. Returning does not delete anything.'}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="button-row"><button data-autofocus className="button button-outline" disabled={busy} onClick={closeConfirmation}>Keep my data</button><button className={`button ${confirmation.startsWith('delete') || confirmation === 'signout-device' ? 'button-danger' : 'button-dark'}`} disabled={busy} onClick={() => { void confirm(); }}>{busy ? 'Working…' : confirmation === 'signout-device' ? 'Sign out and remove copy' : googleConfirmation && !googleConfirmed ? 'Continue in this tab' : confirmation.startsWith('delete') ? 'Confirm deletion' : 'Confirm this choice'}</button></div>
    </Dialog>}
  </section>;
}

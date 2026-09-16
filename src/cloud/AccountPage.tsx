import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AccountIdentity } from './ui-types';
import type { ScopedLibrary, SyncHead, SyncStatus } from '../lib/cloud-types';
import { SYNC_LABELS } from '../lib/cloud-types';
import type { Member } from '../lib/community';
import type { PersonalLibraryState } from '../lib/personal-types';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';

export type ConnectionChoice = 'guest' | 'online' | 'empty' | 'cached';
export function AccountPage({ identity, member, cache, guest, head, remoteReady, status, error, message, cleanupWarning, busy, resendIn, isCreator, avatar, googleDeletion, onDismissDeletion, onAvatar, onName, onConnect, onVerify, onRefreshIdentity, onSignOut, onLinkGoogle, onRetry, onCleanup, onPause, onDownload, onUseRemote, onUseLocal, onDelete, onPublish, onCommunity, onCreator }: {
  identity: AccountIdentity; member: Member | null; cache: ScopedLibrary | null; guest: PersonalLibraryState;
  head: SyncHead | null; remoteReady: boolean; status: SyncStatus; error: string; message: string; cleanupWarning: string; busy: boolean; resendIn: number; isCreator: boolean; avatar: ReactNode;
  onAvatar: () => void; onName: (name: string) => Promise<boolean>; onConnect: (choice: ConnectionChoice, name: string) => Promise<boolean>;
  onVerify: () => Promise<boolean>; onRefreshIdentity: () => Promise<boolean>; onSignOut: () => Promise<boolean>; onLinkGoogle: () => Promise<boolean>;
  onRetry: () => Promise<boolean>; onCleanup: () => Promise<boolean>; onPause: () => Promise<boolean>;
  onDownload: (source: 'local' | 'online' | 'guest' | 'all') => Promise<boolean>;
  onUseRemote: (head: SyncHead, localRevision: number) => Promise<boolean>; onUseLocal: (head: SyncHead, localRevision: number) => Promise<boolean>;
  onDelete: (account: boolean, password: string) => Promise<boolean>;
  googleDeletion: { requestId: string; target: 'copy' | 'account' } | null; onDismissDeletion: () => void;
  onPublish: () => void; onCommunity: () => void; onCreator: () => void;
}) {
  const [choice, setChoice] = useState<ConnectionChoice>(head?.current ? 'online' : Object.keys(guest.records).length ? 'guest' : 'empty');
  const [choiceTouched, setChoiceTouched] = useState(false);
  const currentName = member?.displayName || cache?.profile?.displayName || identity.displayName || 'Player';
  const [name, setName] = useState(currentName);
  const [nameEdited, setNameEdited] = useState(false);
  const [consent, setConsent] = useState(false);
  const [confirmation, setConfirmation] = useState<'pause' | 'remote' | 'local' | 'delete-copy' | 'delete-account' | null>(null);
  const [password, setPassword] = useState('');
  const [conflictVersion, setConflictVersion] = useState<{ head: SyncHead; localRevision: number } | null>(null);
  const active = Boolean(cache?.sync.enabled);
  const localGames = Object.keys(cache?.state.records ?? {}).length;
  const guestGames = Object.keys(guest.records).length;
  const hasOnlineCopy = Boolean(head?.current);
  const previewSignature = `${guest.revision}:${cache?.state.revision ?? 0}:${head?.epoch ?? 0}:${head?.revision ?? 0}`;
  const lastPreview = useRef(previewSignature);
  const [previewChanged, setPreviewChanged] = useState(false);
  const resumedDeletion = useRef<string | null>(null);
  useEffect(() => {
    if (googleDeletion && resumedDeletion.current !== googleDeletion.requestId) {
      resumedDeletion.current = googleDeletion.requestId;
      setConfirmation(googleDeletion.target === 'account' ? 'delete-account' : 'delete-copy');
    }
  }, [googleDeletion]);
  useEffect(() => {
    if (remoteReady && !choiceTouched) setChoice(hasOnlineCopy ? 'online' : guestGames ? 'guest' : 'empty');
  }, [remoteReady, hasOnlineCopy, guestGames, choiceTouched]);
  useEffect(() => {
    if (lastPreview.current !== previewSignature && consent) { setConsent(false); setPreviewChanged(true); }
    lastPreview.current = previewSignature;
  }, [previewSignature, consent]);
  useEffect(() => {
    if (!nameEdited) setName(currentName);
  }, [currentName, nameEdited]);
  const choose = (value: ConnectionChoice) => { setChoiceTouched(true); setChoice(value); };
  const closeConfirmation = () => { setConfirmation(null); setPassword(''); onDismissDeletion(); };
  const googleConfirmation = confirmation?.startsWith('delete') && !identity.providers.includes('password');
  const googleConfirmed = googleDeletion?.target === (confirmation === 'delete-account' ? 'account' : 'copy');
  const confirm = async () => {
    const result = confirmation === 'pause' ? await onPause() : confirmation === 'remote' ? conflictVersion && await onUseRemote(conflictVersion.head, conflictVersion.localRevision) : confirmation === 'local' ? conflictVersion && await onUseLocal(conflictVersion.head, conflictVersion.localRevision) : await onDelete(confirmation === 'delete-account', password);
    if (result) closeConfirmation();
  };
  return (
    <section className="app-page account-page" aria-labelledby="account-title">
      <div className="account-heading"><div className="account-avatar">{avatar}</div><div><h1 id="account-title" data-page-heading tabIndex={-1}>Your list. Anywhere.</h1><p>{currentName}<span>{identity.email}</span></p></div><button className="text-button" disabled={busy} onClick={() => { void onSignOut(); }}>Sign out<Icon name="arrow" width="17" height="17" /></button></div>
      <div className="account-columns"><div className="account-primary">
        <section className="sync-panel" aria-labelledby="sync-title"><div className="section-title-line"><h2 id="sync-title">Online saving</h2><span className={`sync-state sync-${status}`} role="status">{identity.verified ? SYNC_LABELS[status] : 'Verify your email'}</span></div>
          {!identity.verified ? <><p>Verify this email before uploading or publishing anything. Your device library remains available and unchanged.</p><div className="button-row"><button className="button button-dark" disabled={busy || resendIn > 0} onClick={() => { void onVerify(); }}>{resendIn ? `Resend in ${resendIn}s` : 'Send verification email'}</button><button className="button button-outline" disabled={busy} onClick={() => { void onRefreshIdentity(); }}>I verified my email</button></div></> : !active ? <>
            <p>Keep device-only browsing, or choose the library that should travel with this account. Your guest copy is never overwritten.</p>
            <form onSubmit={(event) => { event.preventDefault(); if (consent) void onConnect(choice, name); }}>
              <label htmlFor="online-display-name">Account name <span>A nickname is welcome; the creator can see it.</span></label><input id="online-display-name" name="displayName" autoComplete="nickname" maxLength={60} required value={name} onChange={(event) => { setNameEdited(true); setName(event.target.value); }} disabled={busy} />
              {!remoteReady && <p className="account-smallprint" role="status">Checking for an existing online library before offering a starting copy...</p>}
              <fieldset className="connect-choices" disabled={!remoteReady || busy}><legend>Choose a starting library</legend>
                {head?.current && <label><input type="radio" name="connection-copy" value="online" checked={choice === 'online'} onChange={() => choose('online')} /><span><strong>Use the online copy</strong><small>{member ? `${member.gameCount} ${member.gameCount === 1 ? 'game' : 'games'} and ${member.rankCount} ${member.rankCount === 1 ? 'rank' : 'ranks'} online. ` : 'An online copy exists. '}Keep this device's guest library separate.</small></span></label>}
                {guestGames > 0 && <label><input type="radio" name="connection-copy" value="guest" checked={choice === 'guest'} onChange={() => choose('guest')} /><span><strong>Copy this device's guest library</strong><small>{guestGames} {guestGames === 1 ? 'game' : 'games'}, {guest.queueOrder.length} queued, {guest.ranking.length} ranked.{head?.current ? ' Replaces the online library after your explicit choice.' : ''} The guest original stays here.</small></span></label>}
                {(localGames > 0 || (cache?.sync.epoch ?? 0) > 0) && <label><input type="radio" name="connection-copy" value="cached" checked={choice === 'cached'} onChange={() => choose('cached')} /><span><strong>Keep this account's saved device copy</strong><small>{localGames} {localGames === 1 ? 'game' : 'games'} saved in this account namespace, including any pending edits.</small></span></label>}
                {remoteReady && !head?.current && <label><input type="radio" name="connection-copy" value="empty" checked={choice === 'empty'} onChange={() => choose('empty')} /><span><strong>Start an empty online library</strong><small>Do not upload any guest games.</small></span></label>}
              </fieldset>
              <label className="check-control sync-consent"><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setPreviewChanged(false); }} required /><span>I agree to online saving. The creator can view my account profile and ranking summary. My library is not public; publishing is a separate choice.</span></label>
              {previewChanged && <p className="section-help" role="status">A library copy changed. Review the updated choice and confirm again before enabling.</p>}
              <p className="account-smallprint">Notes are excluded from the creator's ranking view and all public profiles. The project operator can technically access data stored in the database. Free quota limits can pause online saving; local edits and backups remain available.</p>
              <button className="button button-dark" disabled={busy || !consent || !cache || !remoteReady} type="submit">{busy ? 'Connecting...' : 'Enable online saving'}<Icon name="arrow" width="18" height="18" /></button>
            </form>
          </> : <>
            <p>Your edits commit to this account's device cache first. Online saving follows when connected. The guest library remains separate.</p>
            <p className="account-counts">{localGames} {localGames === 1 ? 'game' : 'games'} · {cache?.state.queueOrder.length ?? 0} queued · {cache?.state.ranking.length ?? 0} ranked</p>
            {cache?.sync.lastSyncedAt && <p className="account-smallprint">Last confirmed online save: {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(cache.sync.lastSyncedAt)}</p>}
            <div className="button-row"><button className="button button-dark" disabled={busy} onClick={() => { void onRetry(); }}>Check and sync now<Icon name="arrow" width="17" height="17" /></button><button className="text-button" disabled={busy} onClick={() => setConfirmation('pause')}>Stop online saving</button></div>
          </>}
          {error && <p className="inline-error" role="alert">{error}</p>}{message && <p className="account-notice" role="status">{message}</p>}
          {status === 'conflict' && <div className="conflict-choices"><h3>Keep both until you choose.</h3><p>Newer online data and this device's edits are separate. Download both, or choose a copy deliberately. Replacing the device copy also keeps a local recovery snapshot.</p><div className="button-row"><button className="button button-outline" disabled={busy} onClick={() => { void onDownload('local'); }}>Download device copy</button><button className="button button-outline" disabled={busy} onClick={() => { void onDownload('online'); }}>Download online copy</button></div><div className="button-row"><button className="text-button" disabled={busy || !head || !cache} onClick={() => { if (head && cache) { setConflictVersion({ head, localRevision: cache.state.revision }); setConfirmation('remote'); } }}>Use the online copy</button><button className="text-button" disabled={busy || !head || !cache} onClick={() => { if (head && cache) { setConflictVersion({ head, localRevision: cache.state.revision }); setConfirmation('local'); } }}>Keep this device copy online</button></div></div>}
          {cleanupWarning && <div className="cleanup-note"><p role="status">{cleanupWarning}</p><button className="text-button" disabled={busy} onClick={() => { void onCleanup(); }}>Retry snapshot cleanup</button></div>}
        </section>
        <section className="account-section"><h2>Backups &amp; recovery</h2><p>A downloaded backup stays yours, even if a browser is cleared or the free online quota is reached.</p><div className="button-row"><button className="button button-outline" disabled={busy} onClick={() => { void onDownload('all'); }}><Icon name="download" width="18" height="18" />Export account data</button><button className="text-button" disabled={busy} onClick={() => { void onDownload('guest'); }}>Download untouched guest library</button></div></section>
      </div><aside className="account-secondary">
        <section className="account-section"><h2>Your identity</h2><p>A chosen name and a locally generated creature. No uploaded image or Google profile photo is loaded.</p><button className="button button-outline" disabled={busy || !identity.verified} onClick={onAvatar}>Choose your creature</button>{member && <form className="account-name-form" onSubmit={(event) => { event.preventDefault(); void onName(name); }}><label htmlFor="saved-display-name">Account name</label><input id="saved-display-name" name="nickname" autoComplete="nickname" maxLength={60} required value={name} onChange={(event) => setName(event.target.value)} /><button className="text-button" disabled={busy}>Save account name</button></form>}{!identity.providers.includes('google.com') && <button className="text-button" disabled={busy || !identity.verified} onClick={() => { void onLinkGoogle(); }}>Link Google for faster sign-in</button>}</section>
        <section className="account-section"><h2>Share your taste.</h2><p>Your ranking stays private until you preview and publish a selected snapshot. Directory listing is optional, too.</p><button className="button button-dark" onClick={onPublish}>Publish a ranking<Icon name="share" width="18" height="18" /></button><button className="text-button" onClick={onCommunity}>Explore Community<Icon name="arrow" width="17" height="17" /></button>{isCreator && <button className="text-button" onClick={onCreator}>Open creator desk<Icon name="arrow" width="17" height="17" /></button>}</section>
        <details className="account-danger"><summary>{identity.verified ? 'Delete online data' : 'Cancel this registration'}</summary><p>{identity.verified ? 'Sign-out, stopping sync and deletion are different. Download a backup before deleting.' : 'Used the wrong email? An unused, unverified registration can be cancelled without uploading anything. Accounts with prior online activity require verification for safe full deletion.'} Your guest library is never deleted here.</p>{identity.verified && <button className="text-button danger-text" disabled={busy} onClick={() => setConfirmation('delete-copy')}>Delete online copy</button>}<button className="text-button danger-text" disabled={busy} onClick={() => setConfirmation('delete-account')}>{identity.verified ? 'Delete account' : 'Delete unused registration'}</button></details>
      </aside></div>
      {confirmation && <Dialog open titleId="account-confirm-title" onClose={() => { if (!busy) closeConfirmation(); }} className="info-dialog">
        <h2 id="account-confirm-title">{confirmation === 'pause' ? 'Stop online saving?' : confirmation === 'remote' ? 'Use the online copy?' : confirmation === 'local' ? 'Replace the online copy?' : confirmation === 'delete-copy' ? 'Delete your online copy?' : identity.verified ? 'Delete your account?' : 'Cancel this unused registration?'}</h2>
        <p>{confirmation === 'pause' ? 'Uploads stop for this account, including stale tabs. The existing online copy is retained. This device copy stays available.' : confirmation === 'remote' ? 'This account device library will be replaced. A local recovery copy is retained; download a backup too if you need it.' : confirmation === 'local' ? 'Your current device copy will replace the latest reviewed online library. If another device saves again, you will be asked to review the conflict again.' : !identity.verified ? 'The server must confirm that this account has no prior online activity before cancellation. A content-free marker prevents a racing session from uploading to the cancelled identity. Your guest library stays untouched.' : 'Your public ranking will be unpublished, stale writers revoked, and online profile/library data removed. Download a backup first. The guest library is untouched.'}</p>
        {(confirmation === 'remote' || confirmation === 'local') && conflictVersion && <p className="section-help">Reviewed online revision {conflictVersion.head.revision}; this device revision {conflictVersion.localRevision}. A newer version will require another choice.</p>}
        {(confirmation === 'delete-copy' || confirmation === 'delete-account') && identity.providers.includes('password') && <><label htmlFor="confirm-account-password">Confirm your password</label><input id="confirm-account-password" name="current-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></>}
        {googleConfirmation && <p className="section-help">{googleConfirmed ? 'Google confirmed this account. Nothing has been deleted. Confirm below only if you still want to remove this data.' : "Continue to Google in this tab to confirm your account. You'll return to this confirmation; coming back never deletes data automatically."}</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="button-row"><button data-autofocus className="button button-outline" disabled={busy} onClick={closeConfirmation}>Keep my data</button><button className={`button ${confirmation.startsWith('delete') ? 'button-danger' : 'button-dark'}`} disabled={busy} onClick={() => { void confirm(); }}>{busy ? 'Working...' : googleConfirmation && !googleConfirmed ? 'Continue in this tab' : confirmation.startsWith('delete') ? 'Confirm deletion' : 'Confirm this choice'}</button></div>
      </Dialog>}
    </section>
  );
}

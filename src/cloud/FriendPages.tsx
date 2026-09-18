import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FriendIdentity, FriendInvitePreview, FriendPair, FriendSettings } from '../lib/friend-types';
import type { Game } from '../lib/types';
import type { PersonalLibraryState, LibraryRecord } from '../lib/personal-types';
import { projectFriendRanking } from '../lib/friend-types';
import { clearInviteContinuation, saveInviteContinuation } from '../lib/invite-continuation';
import { projectOwnRanking, recordFromPublic } from '../lib/community';
import type { PublicEntry } from '../lib/community';
import type { FriendStore } from './friend-store';
import { SocialStore } from './social-store';
import { cloudAuth, cloudDb } from './firebase-client';
import { onlineError } from './errors';
import { syncFailure } from '../lib/sync-retry';
import { createFriendReadGuard } from '../lib/friend-read-guard';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';
import { Avatar } from '../components/avatar/Avatar';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { DataUseLink } from '../components/DataUseLink';

export function navigateFriend(uid: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('This player link is invalid.');
  history.pushState(null, '', `/friends/${uid}`); window.dispatchEvent(new PopStateEvent('popstate')); window.scrollTo({ top: 0 });
}
export type OwnFriendIdentity = { uid: string; verified: boolean; displayName: string; avatar: FriendIdentity['avatar'] };
export async function prepareFriendIdentity(store: FriendStore, identity: OwnFriendIdentity): Promise<FriendSettings> {
  if (!identity.verified || cloudAuth.currentUser?.uid !== identity.uid) throw new Error('Verify your signed-in account before continuing.');
  const settings = await store.initialize(identity.uid);
  if (settings.deleted) throw new Error('This account is being deleted.');
  const previous = await store.identity(identity.uid);
  if (cloudAuth.currentUser?.uid !== identity.uid) throw new Error('The account changed. Review before continuing.');
  if (!previous || previous.displayName !== identity.displayName || JSON.stringify(previous.avatar) !== JSON.stringify(identity.avatar)) {
    await store.saveIdentity(identity.uid, { displayName: identity.displayName, avatar: identity.avatar }, previous?.revision ?? 0);
  }
  return settings;
}

export function InvitationPage({ store, invitation, identity, authPanel, onAccount, onFriends, onSettings }: {
  store: FriendStore; invitation: { capability: string | null; error: string }; identity: OwnFriendIdentity | null;
  authPanel: ReactNode; onAccount: () => void; onFriends: () => void; onSettings: (settings: FriendSettings) => void;
}) {
  const [preview, setPreview] = useState<FriendInvitePreview | null>(null);
  const [error, setError] = useState(invitation.error);
  const [busy, setBusy] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);
  const [retry, setRetry] = useState(0);
  const activeUid = useRef(identity?.uid); activeUid.current = identity?.uid;
  const activeCapability = useRef(invitation.capability); activeCapability.current = invitation.capability;
  const acceptanceLease = useRef<symbol | null>(null);
  useEffect(() => {
    acceptanceLease.current = null; activeUid.current = identity?.uid; activeCapability.current = invitation.capability;
    setAccepting(false); setDone(false);
    return () => { acceptanceLease.current = null; activeUid.current = undefined; activeCapability.current = null; };
  }, [identity?.uid, invitation.capability]);
  useEffect(() => {
    let alive = true; setPreview(null); setBusy(true); setDone(false); setError(invitation.error);
    if (!invitation.capability) { setBusy(false); return; }
    void store.previewInvite(invitation.capability).then((value) => { if (alive) setPreview(value); })
      .catch((cause) => {
        if (!alive) return;
        setError(onlineError(cause));
        const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : '';
        if (syncFailure(cause) === 'blocked' && code !== 'offline') clearInviteContinuation(invitation.capability ?? undefined);
      }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [store, invitation.capability, invitation.error, identity?.uid, retry]);
  const accept = async () => {
    if (!identity || !preview || !invitation.capability || accepting || acceptanceLease.current) return;
    const uid = identity.uid;
    const capability = invitation.capability;
    const lease = Symbol('invite-acceptance');
    acceptanceLease.current = lease;
    setAccepting(true); setError('');
    try {
      const settings = await prepareFriendIdentity(store, identity);
      if (activeUid.current !== uid || cloudAuth.currentUser?.uid !== uid || activeCapability.current !== capability || acceptanceLease.current !== lease) throw new Error('The account or invitation changed. Review it again.');
      onSettings(settings);
      await store.acceptInvite(uid, capability);
      if (activeUid.current === uid && activeCapability.current === capability && acceptanceLease.current === lease) { clearInviteContinuation(capability); setDone(true); setPreview(null); }
    } catch (cause) {
      if (activeUid.current !== uid || activeCapability.current !== capability || acceptanceLease.current !== lease) return;
      const committed = committedFriendChange(cause, uid);
      if (committed?.receipt.operation === 'accept-invite') { clearInviteContinuation(capability); setDone(true); setPreview(null); }
      else setError(committed ? committedFriendMessage(committed) : friendMutationError(cause));
    }
    finally { if (acceptanceLease.current === lease) { acceptanceLease.current = null; setAccepting(false); } }
  };
  return <section className="app-page invitation-page">
    <h1 data-page-heading tabIndex={-1}>Invitation</h1>
    {busy ? <p role="status">Opening invitation...</p> : done ? <><h2>You're connected</h2><button className="button button-dark" onClick={onFriends}>Open Friends</button></> : preview ? <>
      <div className="friend-identity"><Avatar descriptor={preview.avatar} size={80} /><div><h2>{preview.displayName}</h2><p>Invites you to connect.</p></div></div>
      <p className="section-help">One use. Expires {new Date(preview.expiresAt).toLocaleString()}. Rankings stay private unless separately shared.</p>
      {identity ? <div className="invite-acceptance"><div className="friend-identity"><Avatar descriptor={identity.avatar} size={48} /><span>Accept as {identity.displayName}</span></div>
        {identity.uid === preview.ownerUid ? <p>This is your own invitation.</p> : identity.verified ? <button className="button button-dark" disabled={accepting} onClick={() => { void accept(); }}>{accepting ? 'Accepting...' : 'Accept invitation'}</button> : <button className="button button-dark" onClick={onAccount}>Verify your account</button>}
      </div> : <><p>Sign in, then choose whether to accept.</p>{invitation.capability && invitation.error && <button className="text-button" onClick={() => { try { saveInviteContinuation(invitation.capability!); setError(''); } catch (cause) { setError(onlineError(cause)); } }}>Retry invitation storage</button>}{authPanel}</>}
    </> : <><h2>Invitation unavailable</h2><p>It may have expired, been used or been revoked. Ask for a new link.</p><button className="text-button" onClick={() => setRetry((value) => value + 1)}>Try again</button></>}
    {error && <p className="inline-error" role="alert">{error}</p>}<DataUseLink />
  </section>;
}

export function FriendDetailPage({ uid, peer, store, identity, onSettings, onFriends, onCompare, games, onOpen, sharedGames }: {
  uid: string; peer: string; store: FriendStore; identity: OwnFriendIdentity; onSettings: (settings: FriendSettings) => void;
  onFriends: () => void; onCompare: (peers: string[]) => void; games: Game[]; onOpen: (record: LibraryRecord) => void; sharedGames?: ReactNode;
}) {
  const [person, setPerson] = useState<FriendIdentity | null>(null);
  const [pair, setPair] = useState<FriendPair | null>(null);
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [limit, setLimit] = useState(25);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRequest, setConfirmRequest] = useState(false);
  const [requestNeedsRefresh, setRequestNeedsRefresh] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden && navigator.onLine);
  const version = useRef(0);
  const access = useMemo(createFriendReadGuard, [uid, peer]);
  const requestInFlight = useRef(false);
  useEffect(() => {
    const update = () => setVisible(!document.hidden && navigator.onLine);
    document.addEventListener('visibilitychange', update); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { document.removeEventListener('visibilitychange', update); window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    let alive = true; const generation = ++version.current;
    setPerson(null); setPair(null); setEntries([]); setBusy(true); setError('');
    setRequestNeedsRefresh(false);
    if (!visible) { setBusy(false); setNotice('Connect to view this player.'); return; }
    void (async () => {
      const connection = await store.pair(uid, peer);
      let profile: FriendIdentity | null = null;
      try { profile = await store.identity(peer); } catch (cause) {
        if (connection?.state === 'accepted' || connection?.state === 'pending') throw cause;
      }
      if (!profile) {
        const published = await new SocialStore(cloudDb).ownProfile(peer);
        if (published?.published && !published.hidden) profile = { format: 1, uid: peer, displayName: published.displayName, avatar: published.avatar, revision: 1, updatedAt: published.updatedAt };
      }
      if (alive && generation === version.current) { setPerson(profile); setPair((old) => old && (!connection || old.epoch > connection.epoch) ? old : connection); }
    })().catch((cause) => { if (alive) setError(onlineError(cause)); }).finally(() => { if (alive) setBusy(false); });
    const release = store.watchPair(uid, peer, (value) => {
      if (!alive) return; setPair(value); setRequestNeedsRefresh(false);
      if (value?.state === 'accepted') access.accept(value.epoch);
      else { access.revoke(); setEntries([]); }
    }, (cause) => {
      if (alive) { version.current += 1; access.revoke(); setPair(null); setPerson(null); setEntries([]); setError(onlineError(cause)); }
    });
    return () => { alive = false; version.current += 1; access.revoke(); release(); };
  }, [uid, peer, store, visible, access]);
  useEffect(() => {
    if (!visible || pair?.state !== 'accepted') return;
    let alive = true; let request = 0;
    const release = store.watchShareHead(peer, (head) => {
      const current = ++request; const authorized = access.begin(); setEntries([]);
      if (!head?.current) { setNotice('No ranking is shared with friends.'); return; }
      void store.ranking(peer).then((ranking) => { if (alive && current === request && access.permits(authorized)) { setEntries(ranking.entries); setNotice(`Shared ${new Date(ranking.head.updatedAt).toLocaleString()}`); } })
        .catch((cause) => { if (alive && current === request && access.permits(authorized)) { setEntries([]); setNotice('Shared ranking unavailable.'); setError(onlineError(cause)); } });
    }, () => { if (alive) { request += 1; setEntries([]); setNotice('Shared ranking unavailable.'); } });
    return () => { alive = false; request += 1; release(); };
  }, [pair?.state, pair?.epoch, peer, store, visible, access]);
  const requestFriend = async () => {
    if (requestInFlight.current || busy || !person) return; requestInFlight.current = true; setBusy(true); setError('');
    try {
      onSettings(await prepareFriendIdentity(store, identity));
      if (cloudAuth.currentUser?.uid !== uid) throw new Error('The account changed. Review before sending.');
      setPair(await store.sendRequest(uid, peer)); setConfirmRequest(false); setNotice('Request sent.');
    } catch (cause) {
      const committed = committedFriendChange(cause, uid);
      if (committed) { setConfirmRequest(false); setNotice(committedFriendMessage(committed)); setRequestNeedsRefresh(true); }
      else setError(friendMutationError(cause));
    } finally { requestInFlight.current = false; setBusy(false); }
  };
  return <section className="app-page friend-detail-page"><button className="text-button" onClick={onFriends}><Icon name="back" />Friends</button>
    <h1 data-page-heading tabIndex={-1}>{person?.displayName ?? 'Player'}</h1>{person && <Avatar descriptor={person.avatar} size={80} />}
    {busy && <p role="status">Loading...</p>}{error && <p className="inline-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pair?.state === 'accepted' ? <button className="button button-outline" onClick={() => onCompare([peer])}>Compare rankings</button> : pair?.state === 'pending' ? <p>{pair.from === uid ? 'Your request is pending.' : 'An incoming request is waiting in Friends.'}</p> : person && uid !== peer && <button className="button button-dark" disabled={busy || !identity.verified || requestNeedsRefresh} onClick={() => setConfirmRequest(true)}>Send friend request</button>}
    {requestNeedsRefresh && <button className="text-button" disabled={busy} onClick={() => {
      setBusy(true); void store.pair(uid, peer).then((value) => { setPair(value); setRequestNeedsRefresh(false); }).catch((cause) => setError(onlineError(cause))).finally(() => setBusy(false));
    }}>Refresh connection</button>}
    {sharedGames}
    {pair?.state === 'accepted' && <h2>Shared ranking</h2>}
    <ol className="friend-ranking-list">{entries.slice(0, limit).map((entry) => <li key={entry.id}><span>{entry.position}</span><button className="text-button" onClick={() => { try { onOpen(recordFromPublic(entry, games)); } catch (cause) { setError(onlineError(cause)); } }}>{entry.title}</button><strong>{entry.score === null ? 'Unrated' : entry.score}</strong></li>)}</ol>
    {limit < entries.length && <button className="text-button" onClick={() => setLimit((value) => value + 25)}>Next 25 games</button>}
    {confirmRequest && person && <Dialog open titleId="friend-request-title" className="info-dialog" onClose={() => { if (!busy) setConfirmRequest(false); }}><h2 id="friend-request-title">Connect with {person.displayName}?</h2><div className="friend-identity"><Avatar descriptor={identity.avatar} size={48} /><span>They'll see {identity.displayName}.</span></div><p>Rankings stay private until you enable friends sharing.</p><div className="button-row"><button data-autofocus className="button button-outline" disabled={busy} onClick={() => setConfirmRequest(false)}>Cancel</button><button className="button button-dark" disabled={busy} onClick={() => { void requestFriend(); }}>Send request</button></div>{error && <p className="inline-error" role="alert">{error}</p>}</Dialog>}
  </section>;
}

export function FriendSharingPage({ store, identity, settings, ownState, connected, games, onSettings, onAccount, status, error: operationError }: {
  store: FriendStore; identity: OwnFriendIdentity; settings: FriendSettings | null; ownState: PersonalLibraryState; connected: boolean;
  games: Game[]; onSettings: (settings: FriendSettings, explicitThroughRevision?: number) => void; onAccount: () => void; status: string; error: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(settings?.selectedIds ?? []));
  const [edited, setEdited] = useState(false);
  const [limit, setLimit] = useState(50);
  const [preview, setPreview] = useState<{ settings: FriendSettings; entries: PublicEntry[]; sourceRevision: number; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const rows = projectOwnRanking(ownState, games);
  useEffect(() => { if (!edited) setSelected(new Set(settings?.selectedIds ?? [])); }, [settings?.revision, edited]);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const confirmedSelection = useRef<{ revision: number; epoch: number; ids: string[]; sourceRevision: number } | null>(null);
  const saving = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (saving.current) return; saving.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) {
      const committed = committedFriendChange(cause, identity.uid);
      if (committed) { setNotice(committedFriendMessage(committed)); setPreview(null); setRefreshRequired(true); }
      else setError(friendMutationError(cause));
    } finally { saving.current = false; setBusy(false); }
  };
  return <section className="app-page friends-sharing-page"><div className="page-heading"><h1 data-page-heading tabIndex={-1}>Friends sharing</h1><button className="text-button" onClick={onAccount}>Account<Icon name="back" /></button></div>
    <p className="section-help">Only accepted friends see these selected games, order and scores. Edits update them automatically. <DataUseLink /></p>
    <p role="status">{settings?.enabled ? `Sharing ${status}` : 'Off'}</p>
    {!connected ? <><p>Enable account saving before sharing an account ranking. Existing shared rankings stay visible until you turn sharing off.</p><button className="button button-outline" onClick={onAccount}>Account saving</button></> : <>
      <h2>{selected.size} / 200 selected</h2>
      <div className="button-row"><button className="text-button" disabled={rows.length > 200 || busy} onClick={() => { setSelected(new Set(rows.map((row) => row.id))); setEdited(true); }}>Select all</button><button className="text-button" disabled={busy} onClick={() => { setSelected(new Set()); setEdited(true); }}>Clear</button></div>
      <ol className="publish-selection-list">{rows.slice(0, limit).map((row) => <li key={row.id}><label className="check-control"><input type="checkbox" checked={selected.has(row.id)} disabled={busy || (!selected.has(row.id) && selected.size >= 200)} onChange={(event) => { setEdited(true); setPreview(null); setSelected((old) => { const next = new Set(old); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; }); }} /><span>{row.title}</span></label><strong>{row.score ?? 'Unrated'}</strong></li>)}</ol>
      {limit < rows.length && <button className="text-button" onClick={() => setLimit((value) => value + 50)}>Next 50 games</button>}
      <button className="button button-dark" disabled={busy || !identity.verified || refreshRequired} onClick={() => { void run(async () => {
        const control = await prepareFriendIdentity(store, identity); onSettings(control);
        const projected = projectFriendRanking(ownState, [...selected], games);
        if (projected.selectedIds.length !== selected.size) throw new Error('Your ranking changed. Review your selected games.');
        setPreview({ settings: control, entries: projected.entries, ids: projected.selectedIds, sourceRevision: ownState.revision });
      }); }}>Preview friends sharing</button>
    </>}
    {settings?.enabled && <button className="text-button danger-text" disabled={busy || refreshRequired} onClick={() => { void run(async () => { const next = await store.saveSettings(identity.uid, { enabled: false, selectedIds: settings.selectedIds }, settings); onSettings(next); setNotice('Friends sharing stopped.'); }); }}>Stop friends sharing</button>}
    {refreshRequired && <button className="button button-outline" disabled={busy} onClick={() => { void run(async () => {
      const saved = await store.settings(identity.uid);
      const selection = confirmedSelection.current;
      if (saved) onSettings(saved, saved.enabled && selection && saved.revision === selection.revision && saved.epoch === selection.epoch && saved.selectedIds.join('|') === selection.ids.join('|') ? selection.sourceRevision : undefined);
      confirmedSelection.current = null;
      setRefreshRequired(false); setNotice('Sharing status refreshed.');
    }); }}>Refresh sharing status</button>}
    {(error || operationError) && <p className="inline-error" role="alert">{error || operationError}</p>}{notice && <p role="status">{notice}</p>}
    {preview && <Dialog open titleId="friend-sharing-title" className="info-dialog" onClose={() => { if (!busy) setPreview(null); }}><h2 id="friend-sharing-title">Share with friends?</h2><p>Accepted friends can view and copy these games and scores. Notes, email, queue and play history are excluded. Later edits update only these selected games.</p>
      <ol className="publication-preview-list">{preview.entries.map((entry) => <li key={entry.id}><span>{entry.position}. {entry.title}</span><strong>{entry.score ?? 'Unrated'}</strong></li>)}</ol>{!preview.entries.length && <p>This shares an empty ranking.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="button-row"><button data-autofocus className="button button-outline" disabled={busy} onClick={() => setPreview(null)}>Keep editing</button><button className="button button-dark" disabled={busy} onClick={() => { void run(async () => {
        if (ownState.revision !== preview.sourceRevision || cloudAuth.currentUser?.uid !== identity.uid || !connected) throw new Error('Your account or ranking changed. Review the preview again.');
        confirmedSelection.current = { revision: preview.settings.revision + 1, epoch: preview.settings.epoch + 1, ids: preview.ids, sourceRevision: preview.sourceRevision };
        const next = await store.saveSettings(identity.uid, { enabled: true, selectedIds: preview.ids }, preview.settings);
        onSettings(next, preview.sourceRevision); confirmedSelection.current = null; setEdited(false); setPreview(null); setNotice('Friends sharing enabled.');
      }); }}>Agree & share with friends</button></div>
    </Dialog>}
  </section>;
}

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { FriendBlock, FriendCursor, FriendInvitation, FriendSettings } from '../lib/friend-types';
import type { FriendsView, FriendsViewState } from '../lib/friend-manager';
import { friendPeer, friendsViewUrl, invitationStatus, nextInvitationExpiry, parseFriendsView, visibleFriendPairs } from '../lib/friend-manager';
import { FriendManagerFeed } from '../lib/friend-manager-feed';
import { comparisonScope, initialComparison, readComparisonView, rememberComparisonView } from '../lib/friend-comparison-intent';
import { createInviteUrl } from '../lib/invite-continuation';
import type { FriendStore } from './friend-store';
import { cloudAuth, firebaseApp } from './firebase-client';
import { navigateFriend, prepareFriendIdentity } from './friend-page-actions';
import type { OwnFriendIdentity } from './friend-page-actions';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';
import { onlineError } from './errors';
import { Avatar } from '../components/avatar/Avatar';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';

function subscribeUrl(listener: () => void) {
  window.addEventListener('popstate', listener); window.addEventListener('play100:navigate', listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener('play100:navigate', listener); };
}
const readUrl = () => location.search;
const viewLabels: Record<FriendsView, string> = { friends: 'Friends', incoming: 'Incoming', sent: 'Sent', invites: 'Invite links', blocked: 'Blocked' };
type Confirmation = { action: 'remove' | 'block'; peer: string; name: string; epoch: number } | { action: 'revoke'; invite: FriendInvitation };
interface AuxiliaryPage { view: FriendsView; invites: FriendInvitation[]; blocks: FriendBlock[]; cursor: FriendCursor | undefined; pages: number; loading: boolean; ready: boolean; error: unknown | null }
type SelectionCheck = { status: 'checking' | 'ready' } | { status: 'error'; cause: unknown };

function MoreActions({ name, accepted, disabled, onChoose }: { name: string; accepted: boolean; disabled: boolean; onChoose: (action: 'remove' | 'block') => void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => { menu.current?.hidePopover(); trigger.current?.focus({ preventScroll: true }); };
  const place = useCallback(() => {
    const button = trigger.current; const popup = menu.current;
    if (!button || !popup?.matches(':popover-open')) return;
    const rect = button.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) { popup.hidePopover(); return; }
    popup.style.left = `${Math.max(8, Math.min(rect.right - popup.offsetWidth, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - popup.offsetHeight - 8))}px`;
  }, []);
  const show = (last = false) => {
    const button = trigger.current; const popup = menu.current;
    if (!button || !popup) return;
    if (popup.matches(':popover-open')) { close(); return; }
    popup.showPopover();
    place();
    const items = popup.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items[last ? items.length - 1 : 0]?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place); window.addEventListener('scroll', place);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place); };
  }, [open, place]);
  return <>
    <button ref={trigger} className="text-button" disabled={disabled} aria-label={`More actions for ${name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onClick={() => show()} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(event.key === 'ArrowUp'); } }}>More</button>
    <div ref={menu} id={id} popover="auto" role="menu" aria-label={`Actions for ${name}`} className="friend-more-menu" onToggle={(event) => setOpen(event.newState === 'open')}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); close(); return; }
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
        const index = items.findIndex((item) => item === document.activeElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); items[next]?.focus(); }
      }}>
      {accepted && <button role="menuitem" className="text-button" onClick={() => { close(); onChoose('remove'); }}>Remove friend</button>}
      <button role="menuitem" className="text-button danger-text" onClick={() => { close(); onChoose('block'); }}>Block player</button>
    </div>
  </>;
}

export function FriendsPage({ store, identity, onSettings, onCommunity, onCompare, onSharedGames, sharingSummary }: {
  store: FriendStore; identity: OwnFriendIdentity; onSettings: (settings: FriendSettings) => void;
  onCommunity: () => void; onCompare: (peers?: string[]) => void;
  onSharedGames?: () => void;
  sharingSummary?: ReactNode;
}) {
  const uid = identity.uid;
  const scope = comparisonScope(firebaseApp.options.projectId ?? '', uid);
  const search = useSyncExternalStore(subscribeUrl, readUrl, () => '');
  const view = useMemo(() => parseFriendsView(search), [search]);
  const relationView = view.view === 'friends' || view.view === 'incoming' || view.view === 'sent';
  const kind = view.view === 'friends' ? 'accepted' : 'pending';
  const feed = useMemo(() => new FriendManagerFeed(store, uid, kind, () => cloudAuth.currentUser?.uid === uid), [store, uid, kind]);
  const list = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  const [aux, setAux] = useState<AuxiliaryPage>({ view: view.view, invites: [], blocks: [], cursor: undefined, pages: 0, loading: false, ready: false, error: null });
  const auxRef = useRef(aux); auxRef.current = aux;
  const [selected, setSelected] = useState<string[]>(() => {
    const prior = readComparisonView(scope);
    return prior?.selected.includes(uid) ? prior.selected.filter((peer) => peer !== uid) : [];
  });
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const [selectionChecks, setSelectionChecks] = useState<Record<string, SelectionCheck>>({});
  const [selectionRetry, setSelectionRetry] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [link, setLink] = useState<FriendInvitation | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const inviteVisible = useRef(false);
  const [copyState, setCopyState] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [now, setNow] = useState(Date.now);
  const alive = useRef(true);
  const currentView = useRef(view.view); currentView.current = view.view;
  const auxVersion = useRef(0);
  const running = useRef(false);
  const navigationVersion = useRef(0);
  const comparisonOperation = useRef<symbol | null>(null);
  const current = useCallback(() => alive.current && cloudAuth.currentUser?.uid === uid, [uid]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; auxVersion.current += 1; }; }, [uid]);
  useEffect(() => subscribeUrl(() => {
    navigationVersion.current += 1;
    if (inviteVisible.current) { inviteVisible.current = false; setInviteOpen(false); setLink(null); }
    if (comparisonOperation.current) {
      comparisonOperation.current = null; running.current = false;
      if (current()) setWorking(false);
    }
  }), [current]);
  const choose = useCallback((peers: string[], preserveView = false) => {
    if (!current()) return;
    const initial = initialComparison(scope, uid, peers);
    const prior = preserveView ? readComparisonView(scope) : null;
    const intent = prior ? { ...prior, selected: initial.selected } : initial;
    selectedRef.current = peers; setSelected(peers); rememberComparisonView(intent, false);
  }, [current, scope, uid]);
  useEffect(() => {
    let active = true; let generation = 0;
    const releases: Array<() => void> = [];
    const bind = () => {
      const version = ++generation;
      releases.splice(0).forEach((release) => release());
      setSelectionChecks(Object.fromEntries(selected.map((peer) => [peer, { status: 'checking' as const }])));
      if (document.hidden || navigator.onLine === false) return;
      const valid = () => active && current() && version === generation;
      for (const peer of selected) releases.push(store.watchPair(uid, peer, (pair) => {
        if (!valid()) return;
        if (pair?.state !== 'accepted') {
          choose(selectedRef.current.filter((value) => value !== peer), true);
          setMessage('A connection changed. Your comparison selection was updated.');
        } else setSelectionChecks((old) => ({ ...old, [peer]: { status: 'ready' } }));
      }, (cause) => {
        if (!valid()) return;
        if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied') {
          choose(selectedRef.current.filter((value) => value !== peer), true);
          setMessage('A selected connection is no longer available.');
        } else setSelectionChecks((old) => ({ ...old, [peer]: { status: 'error', cause } }));
      }));
    };
    bind(); window.addEventListener('online', bind); window.addEventListener('offline', bind); document.addEventListener('visibilitychange', bind);
    return () => {
      active = false; generation += 1; releases.forEach((release) => release());
      window.removeEventListener('online', bind); window.removeEventListener('offline', bind); document.removeEventListener('visibilitychange', bind);
    };
  }, [store, uid, selected, current, choose, selectionRetry]);
  useEffect(() => {
    if (!relationView) return;
    const bind = () => { if (document.hidden || navigator.onLine === false) feed.stop(); else feed.start(); };
    bind(); document.addEventListener('visibilitychange', bind); window.addEventListener('online', bind); window.addEventListener('offline', bind);
    return () => { feed.stop(); document.removeEventListener('visibilitychange', bind); window.removeEventListener('online', bind); window.removeEventListener('offline', bind); };
  }, [feed, relationView]);
  const loadAux = useCallback(async (append = false): Promise<boolean> => {
    const target = view.view;
    if (target !== 'invites' && target !== 'blocked') return false;
    const operation = ++auxVersion.current;
    const old = auxRef.current;
    setAux((state) => ({ ...state, view: target, loading: true, error: null }));
    const count = append ? 1 : Math.max(1, old.view === target ? old.pages : 1);
    let cursor = append ? old.cursor : undefined;
    let pages = 0;
    let invites = append ? old.invites : [];
    let blocks = append ? old.blocks : [];
    try {
      for (; pages < count; pages += 1) {
        if (target === 'invites') {
          const result = await store.listInvites(uid, cursor);
          invites = [...new Map([...invites, ...result.items].map((item) => [item.token, item])).values()]; cursor = result.cursor;
        } else {
          const result = await store.listBlocks(uid, cursor);
          blocks = [...new Map([...blocks, ...result.items].map((item) => [item.uid, item])).values()]; cursor = result.cursor;
        }
        if (!current() || operation !== auxVersion.current) return false;
        if (!cursor) { pages += 1; break; }
      }
      setAux({ view: target, invites, blocks, cursor, pages: (append ? old.pages : 0) + pages, ready: true, loading: false, error: null });
      setRefreshRequired(false);
      setError('');
      return true;
    } catch (cause) {
      if (current() && operation === auxVersion.current) setAux((state) => ({ ...state, loading: false, error: cause }));
      return false;
    }
  }, [view.view, store, uid, current]);
  useEffect(() => {
    if (!relationView) {
      setAux({ view: view.view, invites: [], blocks: [], cursor: undefined, pages: 0, loading: true, ready: false, error: null });
      void loadAux();
    }
    return () => { auxVersion.current += 1; };
  }, [relationView, view.view, loadAux]);
  const currentInvites = aux.view === 'invites' ? aux.invites : [];
  const timerInvites = useMemo(() => [...aux.invites, ...(link ? [link] : [])], [aux.invites, link]);
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      const time = Date.now(); setNow(time);
      const expiry = nextInvitationExpiry(timerInvites, time);
      if (expiry !== null) timer = window.setTimeout(update, Math.max(1, expiry - time));
    };
    update(); document.addEventListener('visibilitychange', update); window.addEventListener('focus', update);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update); };
  }, [timerInvites]);
  const updateView = (patch: Partial<FriendsViewState>, replace = false) => {
    history[replace ? 'replaceState' : 'pushState'](null, '', friendsViewUrl({ ...view, ...patch }));
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const refresh = async () => {
    const refreshed = relationView ? await feed.refresh() : await loadAux();
    if (current() && refreshed) { setRefreshRequired(false); setError(''); }
    return refreshed;
  };
  const run = async (operation: () => Promise<void>, success: string) => {
    if (running.current || refreshRequired || !current()) return;
    running.current = true; setWorking(true); setError(''); setMessage('');
    try {
      const settings = await prepareFriendIdentity(store, identity);
      if (!current() || currentView.current !== view.view) return;
      onSettings(settings);
      await operation();
      if (!current() || currentView.current !== view.view) return;
      setMessage(success); setConfirmation(null);
      await refresh();
    } catch (cause) {
      if (!current()) return;
      const committed = committedFriendChange(cause, uid);
      if (committed) {
        setConfirmation(null); setMessage(committedFriendMessage(committed)); setRefreshRequired(true); setError(onlineError(committed.cause));
        if (committed.receipt.operation === 'create-invite') updateView({ view: 'invites' });
      } else setError(friendMutationError(cause));
    } finally { running.current = false; if (current()) setWorking(false); }
  };
  const createInvitation = async () => {
    if (running.current || refreshRequired || !current()) return;
    const navigation = navigationVersion.current;
    running.current = true; inviteVisible.current = true;
    setInviteOpen(true); setCreatingInvite(true); setLink(null); setCopyState('');
    setWorking(true); setError(''); setMessage('');
    try {
      const settings = await prepareFriendIdentity(store, identity);
      if (!current() || navigationVersion.current !== navigation || !inviteVisible.current) return;
      onSettings(settings);
      const invite = await store.createInvite(uid);
      if (!current() || navigationVersion.current !== navigation) return;
      if (inviteVisible.current) setLink(invite);
      else setMessage('Invitation created. Find it in Invite links.');
      if (currentView.current === 'invites') void loadAux();
    } catch (cause) {
      if (!current() || navigationVersion.current !== navigation) return;
      const committed = committedFriendChange(cause, uid);
      setError(committed ? committedFriendMessage(committed) : friendMutationError(cause));
      setRefreshRequired(true);
    } finally {
      running.current = false;
      if (current()) { setWorking(false); setCreatingInvite(false); }
    }
  };
  const closeInvite = () => {
    inviteVisible.current = false; setInviteOpen(false); setLink(null); setCopyState('');
    if (creatingInvite) setMessage('Creation may still finish. Check Invite links before making another.');
  };
  const compare = async (peers: string[]) => {
    if (running.current || !current()) return;
    const operation = Symbol('manager-comparison');
    const navigation = navigationVersion.current;
    comparisonOperation.current = operation;
    const owns = () => current() && comparisonOperation.current === operation && navigationVersion.current === navigation;
    running.current = true; setWorking(true); setError('');
    try {
      initialComparison(scope, uid, peers);
      const pairs = await Promise.all(peers.map((peer) => store.pair(uid, peer)));
      if (!owns()) return;
      if (pairs.some((pair) => pair?.state !== 'accepted')) {
        choose(peers.filter((_, index) => pairs[index]?.state === 'accepted'), true);
        throw new Error('A connection changed. Review the selected friends before comparing.');
      }
      choose(peers); onCompare(peers);
    } catch (cause) { if (owns()) setError(onlineError(cause)); }
    finally {
      if (comparisonOperation.current === operation) {
        comparisonOperation.current = null; running.current = false;
        if (current()) setWorking(false);
      }
    }
  };
  const shareLink = async (invite: FriendInvitation, native: boolean) => {
    if (!current()) return;
    if (invitationStatus(invite, Date.now()) !== 'Active') { setError('This invitation is no longer active. Refresh the links.'); return; }
    const url = createInviteUrl(invite.token);
    try {
      if (native && navigator.share) await navigator.share({ title: 'Play 100 invitation', url });
      else { await navigator.clipboard.writeText(url); if (current()) setCopyState('Link copied.'); }
    } catch (cause) {
      if (!current() || cause instanceof Error && cause.name === 'AbortError') return;
      setLink(invite); setInviteOpen(true); inviteVisible.current = true; setCopyState('Copy the invitation from the field below.');
    }
  };
  const loading = relationView ? list.loading : aux.loading || aux.view !== view.view;
  const busy = working || loading || refreshRequired || relationView && !list.active;
  const readError = relationView ? list.error : aux.error;
  const problem = error || (readError ? onlineError(readError) : '');
  const rows = useMemo(() => visibleFriendPairs(list.pairs, list.identities, uid, view), [list.pairs, list.identities, uid, view]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }), []);
  const cursor = relationView ? list.cursor : aux.cursor;
  const ready = relationView ? list.ready : aux.ready && aux.view === view.view;
  const loaded = relationView ? list.pairs.length : view.view === 'invites' ? currentInvites.length : aux.blocks.length;
  const empty = relationView ? !rows.length : !loaded;
  const selectionReady = selected.every((peer) => selectionChecks[peer]?.status === 'ready');
  const selectionError = Object.values(selectionChecks).find((check) => check.status === 'error');
  return <section className="app-page friends-page">
    <div className="page-heading"><h1 data-page-heading tabIndex={-1}>Friends</h1><button className="button button-dark" disabled={busy || !identity.verified} onClick={() => { void createInvitation(); }}>{creatingInvite ? 'Creating invite…' : 'Invite someone'}<Icon name="share" /></button></div>
    {sharingSummary}
    <nav className="personal-tabs friend-view-tabs" aria-label="Friends view">{(Object.keys(viewLabels) as FriendsView[]).map((value) =>
      <button key={value} disabled={working} aria-current={view.view === value ? 'page' : undefined} aria-pressed={view.view === value} onClick={() => updateView({ view: value })}>{viewLabels[value]}</button>)}</nav>
    {relationView && <div className="friend-manager-toolbar">
      <label>Filter loaded {view.view === 'friends' ? 'friends' : 'requests'}<input type="search" maxLength={60} value={view.name} onChange={(event) => updateView({ name: event.target.value }, true)} /></label>
      <label>Order<select aria-label="Order" value={view.order} onChange={(event) => updateView({ order: event.target.value === 'name' ? 'name' : 'recent' })}><option value="recent">Recent first</option><option value="name">Name A-Z</option></select></label>
    </div>}
    <div className="friend-list-summary"><p role="status">{loading ? ready ? 'Updating loaded entries…' : 'Loading…' : ready ? `${relationView ? `${rows.length} shown / ` : ''}${loaded} loaded${cursor ? ' · more available' : ''}` : 'List unavailable'}</p>
      <button className="text-button" disabled={working || loading || relationView && !list.active} onClick={() => { void refresh(); }}>Refresh loaded</button></div>
    {relationView && list.changed && <p className="friend-update-notice" role="status">The list changed. Refresh loaded entries before loading more.</p>}
    {relationView && !list.active && <p role="status">Reconnect or return to this tab to manage friends.</p>}
    {problem && <p className="inline-error" role="alert">{problem}</p>}{message && <p role="status">{message}</p>}
    {selected.length > 0 && <div className="friend-selection-bar"><span>{selected.length} / 5 friends selected</span><div className="button-row">
      <button className="button button-dark" disabled={busy || !selectionReady} onClick={() => { void compare(selected); }}>Compare selected</button><button className="text-button" disabled={working} onClick={() => choose([])}>Clear</button>
    </div>{!selectionReady && <p className="section-help" role="status">{selectionError?.status === 'error' ? `A selected connection could not be confirmed. ${onlineError(selectionError.cause)}` : 'Checking selected connections…'}{selectionError && <button className="text-button" disabled={working} onClick={() => setSelectionRetry((value) => value + 1)}>Retry selected connections</button>}</p>}</div>}
    {view.view === 'friends' && !selected.length && <p className="section-help">Choose up to five friends to compare with you. <button className="text-button" onClick={() => onCompare()}>Open comparisons & groups</button></p>}
    {view.view === 'friends' && onSharedGames && <button className="text-button" onClick={onSharedGames}>Sharing details</button>}
    {relationView && <ul className="friend-list">{rows.map((pair) => {
      const peer = friendPeer(pair, uid); const profile = list.identities[peer];
      const person = profile?.status === 'ready' ? profile.value : null;
      const name = person?.displayName ?? `Player ...${peer.slice(-6)}`;
      return <li key={peer} className="friend-manager-row">
        <div className="friend-row-person">
          {pair.state === 'accepted' && <label className="check-control friend-select"><input type="checkbox" aria-label={`Select ${name} for comparison`} checked={selected.includes(peer)} disabled={busy || !selected.includes(peer) && selected.length >= 5} onChange={(event) => choose(event.target.checked ? [...selected, peer] : selected.filter((value) => value !== peer))} /></label>}
          <div className="friend-identity">{person ? <Avatar descriptor={person.avatar} size={48} /> : <span className="friend-avatar-placeholder" aria-hidden="true"><Icon name="user" /></span>}<div>
            <strong>{name}</strong>
            {pair.state === 'pending' && pair.from === uid && person && <small>Published profile</small>}
            {(!profile || profile.status === 'loading') && <small role="status">Loading profile…</small>}
            {profile?.status === 'unavailable' && <small>Profile unavailable</small>}
            {profile?.status === 'error' && <small>Profile could not be loaded. {onlineError(profile.cause)}</small>}
            {(profile?.status === 'error' || profile?.status === 'unavailable') && <button className="text-button" disabled={busy} onClick={() => { void feed.retryProfile(peer); }}>Retry profile</button>}
          </div></div>
        </div>
        <div className="button-row friend-row-actions">
          <button className="text-button" aria-label={`View ${name}`} onClick={() => navigateFriend(peer)}>View</button>
          {pair.state === 'accepted' ? <button className="text-button" disabled={busy} aria-label={`Compare with ${name}`} onClick={() => { void compare([peer]); }}>Compare</button> : pair.from === uid ?
            <button className="text-button" disabled={busy} onClick={() => { void run(() => store.respond(uid, peer, 'cancel', pair.epoch).then(() => {}), 'Request cancelled.'); }}>Cancel request</button> :
            <><button className="button button-outline" disabled={busy} onClick={() => { void run(() => store.respond(uid, peer, 'accept', pair.epoch).then(() => {}), 'Friend added.'); }}>Accept</button><button className="text-button" disabled={busy} onClick={() => { void run(() => store.respond(uid, peer, 'decline', pair.epoch).then(() => {}), 'Request declined.'); }}>Decline</button></>}
          <MoreActions name={name} accepted={pair.state === 'accepted'} disabled={busy} onChoose={(action) => setConfirmation({ action, peer, name, epoch: pair.epoch })} />
        </div>
      </li>;
    })}</ul>}
    {view.view === 'invites' && <ul className="friend-list">{currentInvites.map((invite) => {
      const status = invitationStatus(invite, now);
      return <li key={invite.token}><div><strong className="friend-invite-status">{status}</strong><p className="friend-invite-dates">Created <time dateTime={new Date(invite.createdAt).toISOString()}>{dateFormat.format(invite.createdAt)}</time><br />{status === 'Expired' ? 'Expired' : 'Expiry'} <time dateTime={new Date(invite.expiresAt).toISOString()}>{dateFormat.format(invite.expiresAt)}</time></p></div>
        {status === 'Active' && <div className="button-row"><button className="text-button" disabled={busy} onClick={() => { setCopyState(''); void shareLink(invite, false); }}>Copy link</button><button className="text-button" disabled={busy} onClick={() => { setCopyState(''); void shareLink(invite, true); }}>Share</button><button className="text-button danger-text" disabled={busy} onClick={() => setConfirmation({ action: 'revoke', invite })}>Revoke</button></div>}
      </li>;
    })}</ul>}
    {copyState && !link && <p role="status">{copyState}</p>}
    {view.view === 'blocked' && <ul className="friend-list">{aux.blocks.map((block) => <li key={block.uid}><div><strong>Blocked account …{block.uid.slice(-6)}</strong><p className="section-help">Unblocking will not restore friendship.</p></div><button className="text-button" disabled={busy} onClick={() => { void run(() => store.unblock(uid, block.uid), 'Unblocked. Friendship was not restored.'); }}>Unblock</button></li>)}</ul>}
    {ready && !loading && !problem && empty && <div className="empty-state">
      <h2>{view.name && relationView ? 'No loaded names match' : view.view === 'friends' ? 'No friends loaded' : view.view === 'incoming' ? 'No incoming requests loaded' : view.view === 'sent' ? 'No sent requests loaded' : view.view === 'invites' ? 'No invite links' : 'No blocked accounts'}</h2>
      {cursor ? <p>{view.view === 'incoming' || view.view === 'sent' ? 'Incoming and sent requests share these pages. Load more to check further.' : 'More entries are available below.'}</p> : view.view === 'friends' && !view.name && !list.changed ? <button className="text-button" onClick={onCommunity}>Find players in Community</button> : null}
      {view.name && relationView && <button className="text-button" onClick={() => updateView({ name: '' }, true)}>Clear filter</button>}
    </div>}
    {cursor && <button className="button button-outline" disabled={busy || relationView && list.changed} onClick={() => { if (relationView) void feed.loadMore(); else void loadAux(true); }}>Load next 20{view.view === 'incoming' || view.view === 'sent' ? ' requests' : ''}</button>}
    {confirmation && <Dialog open titleId="friend-change-title" className="info-dialog" onClose={() => { if (!working) setConfirmation(null); }}>
      <h2 id="friend-change-title">{confirmation.action === 'revoke' ? 'Revoke this invitation?' : `${confirmation.action === 'block' ? 'Block' : 'Remove'} ${confirmation.name}?`}</h2>
      {confirmation.action === 'revoke' ? <p>The link created {dateFormat.format(confirmation.invite.createdAt)} will stop working. Existing friendships stay connected.</p> :
        <p>Friends-only rankings become unavailable in both directions. {confirmation.action === 'block' ? 'New requests and invitations will be blocked. Unblocking does not restore friendship.' : 'A new request is needed to reconnect.'}</p>}
      <div className="button-row"><button data-autofocus className="button button-outline" disabled={working} onClick={() => setConfirmation(null)}>Cancel</button><button className="button button-danger" disabled={busy} onClick={() => { void run(async () => {
        if (confirmation.action === 'revoke') {
          await store.revokeInvite(uid, confirmation.invite.token);
          if (current() && link?.token === confirmation.invite.token) setLink(null);
        } else {
          if (confirmation.action === 'block') await store.block(uid, confirmation.peer);
          else await store.respond(uid, confirmation.peer, 'remove', confirmation.epoch);
          if (current()) choose(selectedRef.current.filter((peer) => peer !== confirmation.peer), true);
        }
      }, confirmation.action === 'revoke' ? 'Invitation revoked.' : confirmation.action === 'block' ? 'Player blocked.' : 'Friend removed.'); }}>{confirmation.action === 'revoke' ? 'Revoke invitation' : confirmation.action === 'block' ? 'Block player' : 'Remove friend'}</button></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </Dialog>}
    {inviteOpen && <Dialog open titleId="invite-link-title" className="info-dialog" onClose={closeInvite}><h2 id="invite-link-title" data-autofocus tabIndex={-1}>{creatingInvite ? 'Creating invite…' : link ? invitationStatus(link, now) === 'Active' ? 'Invite link' : 'Invitation expired' : 'Check invite links'}</h2>
      {creatingInvite ? <p role="status">Making your one-use link. It appears after the server confirms it.</p> : link ?
        invitationStatus(link, now) === 'Active' ? <><p>One use. Expires {dateFormat.format(link.expiresAt)}. Share only with the person you want to invite.</p><label htmlFor="friend-invite-link">Invitation link</label><input id="friend-invite-link" value={createInviteUrl(link.token)} readOnly onFocus={(event) => event.target.select()} /><div className="button-row"><button className="button button-dark" onClick={() => { void shareLink(link, false); }}>Copy link</button><button className="text-button" onClick={() => { void shareLink(link, true); }}>Share</button></div>{copyState && <p role="status">{copyState}</p>}</> : <p>This link is no longer active. Create a new invitation when you need one.</p> :
        <><p className="inline-error" role="alert">{error || 'The result could not be confirmed. Refresh your links before trying again.'}</p><button className="button button-outline" onClick={() => { closeInvite(); if (view.view === 'invites') void refresh(); else updateView({ view: 'invites' }); }}>Open invite links</button></>}
    </Dialog>}
  </section>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../lib/types';
import type { PersonalLibraryState, LibraryRecord } from '../lib/personal-types';
import { compareFriendRankings, getComparisonPage } from '../lib/friend-comparison';
import type { ComparisonParticipant, ComparisonMode } from '../lib/friend-comparison';
import { projectOwnRanking, recordFromPublic } from '../lib/community';
import type { FriendGroup, FriendIdentity, FriendPair, FriendCursor } from '../lib/friend-types';
import { FriendStore } from './friend-store';
import { cloudAuth } from './firebase-client';
import { Avatar } from '../components/avatar/Avatar';
import { Icon } from '../components/Icon';
import { onlineError } from './errors';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';
import { syncFailure } from '../lib/sync-retry';

const peerOf = (pair: FriendPair, uid: string) => pair.a === uid ? pair.b : pair.a;
export function FriendComparisonPage({ store, uid, identity, ownState, games, onOpen, onFriends }: {
  store: FriendStore; uid: string; identity: { displayName: string; avatar: FriendIdentity['avatar'] };
  ownState: PersonalLibraryState; games: Game[]; onOpen: (record: LibraryRecord) => void; onFriends: () => void;
}) {
  const [choices, setChoices] = useState<FriendPair[]>([]);
  const [identities, setIdentities] = useState<Record<string, FriendIdentity>>({});
  const [cursor, setCursor] = useState<FriendCursor>();
  const [selected, setSelected] = useState<string[]>([uid]);
  const [participants, setParticipants] = useState<Record<string, ComparisonParticipant>>({});
  const [mode, setMode] = useState<ComparisonMode>('common-ranked');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [groupCursor, setGroupCursor] = useState<FriendCursor>();
  const [group, setGroup] = useState<FriendGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [refreshGroupId, setRefreshGroupId] = useState<string | null>(null);
  const groupCreationId = useRef<string | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const ownEntries = useMemo(() => projectOwnRanking(ownState, games), [ownState, games]);
  const currentUid = useRef(uid); currentUid.current = uid;
  const addChoices = async (next?: FriendCursor) => {
    const found = await store.listRelations(uid, 'accepted', next);
    if (currentUid.current !== uid) return;
    setChoices((old) => next ? [...old, ...found.items] : found.items); setCursor(found.cursor);
    for (const pair of found.items) {
      const peer = peerOf(pair, uid);
      void store.identity(peer).then((value) => {
        if (value && currentUid.current === uid) setIdentities((old) => ({ ...old, [peer]: value }));
      }).catch((cause) => { if (currentUid.current === uid) setError(`A friend profile is unavailable. ${onlineError(cause)}`); });
    }
  };
  useEffect(() => {
    let alive = true;
    setChoices([]); setParticipants({}); setSelected([uid]); setError('');
    void addChoices().catch((cause) => { if (alive) setError(onlineError(cause)); });
    void store.listGroups(uid).then((result) => { if (alive) { setGroups(result.items); setGroupCursor(result.cursor); } }).catch((cause) => { if (alive) setError(onlineError(cause)); });
    const requested = new URLSearchParams(location.search).get('group');
    if (requested) void store.getGroup(uid, requested).then((saved) => {
      if (!alive) return;
      if (!saved) throw new Error('This group is no longer available.');
      setGroup(saved); setGroupName(saved.name); setSelected(saved.participantUids);
    }).catch((cause) => { if (alive) setError(onlineError(cause)); });
    return () => { alive = false; generation.current += 1; };
  }, [uid, store]);
  const selection = selected.join('|');
  useEffect(() => {
    const operation = ++generation.current;
    let alive = true;
    const releases: Array<() => void> = [];
    const current = () => alive && generation.current === operation && cloudAuth.currentUser?.uid === uid;
    for (const peer of selected.filter((value) => value !== uid)) {
      let identityValue: FriendIdentity | null = null;
      let paired = false;
      let request = 0;
      let expectedHead = 0;
      let reading = false;
      let scheduled = false;
      let refreshNeeded = false;
      let bound: Array<() => void> = [];
      let contentWatches: Array<() => void> = [];
      const basic = () => ({ id: peer, displayName: identityValue?.displayName ?? 'Unavailable player', kind: 'friend' as const, freshness: 'unknown' as const, updatedAt: null });
      const unavailable = (availability: 'unavailable' | 'error' | 'loading' | 'unshared') => {
        if (!current()) return;
        if (availability === 'unavailable' || availability === 'error') {
          identityValue = null;
          setIdentities((old) => { const next = { ...old }; delete next[peer]; return next; });
        }
        setParticipants((old) => ({ ...old, [peer]: { ...basic(), availability } }));
      };
      const load = async () => {
        const version = ++request;
        if (!current() || !paired || !identityValue || !expectedHead || document.hidden || !navigator.onLine) return;
        if (reading) { refreshNeeded = true; return; }
        reading = true;
        unavailable('loading');
        try {
          const ranking = await store.ranking(peer);
          if (!current() || request !== version || !paired) return;
          if (ranking.head.revision !== expectedHead) { unavailable('loading'); return; }
          setParticipants((old) => ({ ...old, [peer]: { ...basic(), availability: 'ready', freshness: 'fresh', updatedAt: ranking.head.updatedAt, entries: ranking.entries } }));
        } catch (cause) {
          if (!current() || request !== version) return;
          const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : '';
          unavailable(code === 'unavailable' || code === 'permission-denied' ? 'unavailable' : 'error');
        } finally {
          reading = false;
          if (refreshNeeded && current()) { refreshNeeded = false; schedule(); }
        }
      };
      const schedule = () => {
        if (scheduled || !current()) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; if (current()) void load(); });
      };
      const detachContent = () => { contentWatches.splice(0).forEach((release) => release()); request += 1; expectedHead = 0; };
      const bind = () => {
        if (!current()) return;
        bound.splice(0).forEach((release) => release()); detachContent(); paired = false;
        if (document.hidden || !navigator.onLine) { unavailable('unavailable'); return; }
        unavailable('loading');
        bound.push(store.watchPair(uid, peer, (pair) => {
          if (!current()) return;
          detachContent();
          paired = pair?.state === 'accepted';
          if (!paired) { identityValue = null; unavailable('unavailable'); return; }
          contentWatches.push(store.watchIdentity(peer, (value) => {
            identityValue = value;
            if (!value) { request += 1; unavailable('unavailable'); }
            else if (current()) { setIdentities((old) => ({ ...old, [peer]: value })); schedule(); }
          }, () => { request += 1; identityValue = null; unavailable('unavailable'); }));
          contentWatches.push(store.watchShareHead(peer, (head) => {
            if (!head?.current) { request += 1; expectedHead = 0; unavailable('unshared'); }
            else { expectedHead = head.revision; schedule(); }
          }, () => { request += 1; expectedHead = 0; unavailable('unavailable'); }));
        }, () => { paired = false; detachContent(); identityValue = null; unavailable('unavailable'); }));
      };
      window.addEventListener('online', bind); document.addEventListener('visibilitychange', bind);
      window.addEventListener('offline', bind);
      releases.push(() => { bound.splice(0).forEach((release) => release()); detachContent(); window.removeEventListener('online', bind); window.removeEventListener('offline', bind); document.removeEventListener('visibilitychange', bind); });
      bind();
    }
    return () => { alive = false; releases.forEach((release) => release()); };
  }, [uid, store, selection]);
  const datasets = useMemo<ComparisonParticipant[]>(() => selected.map((id) => id === uid
    ? { id: uid, displayName: identity.displayName, kind: 'self', availability: 'ready', freshness: 'fresh', updatedAt: null, entries: ownEntries }
    : participants[id] ?? { id, displayName: identities[id]?.displayName ?? 'Loading player', kind: 'friend', availability: 'loading', freshness: 'unknown' }), [selected, uid, identity.displayName, ownEntries, participants, identities]);
  const comparison = useMemo(() => datasets.length >= 2 ? compareFriendRankings(datasets) : null, [datasets]);
  const result = useMemo(() => comparison ? getComparisonPage(comparison, { mode, query, page, pageSize: 25, sort: { by: 'title' } }) : null, [comparison, mode, query, page]);
  const useGroup = (value: FriendGroup) => {
    setGroup(value); setGroupName(value.name); setSelected(value.participantUids); setPage(1);
    history.replaceState(null, '', `/compare?group=${encodeURIComponent(value.id)}`);
  };
  const run = async (operation: () => Promise<void>) => {
    if (running.current) return; running.current = true; setBusy(true); setError(''); setMessage('');
    try { await operation(); } catch (cause) {
      const committed = committedFriendChange(cause, uid);
      if (committed) { setMessage(committedFriendMessage(committed)); setRefreshGroupId(committed.receipt.groupId ?? 'pending'); }
      else {
        if (groupCreationId.current && syncFailure(cause) !== 'blocked') setRefreshGroupId(groupCreationId.current);
        setError(friendMutationError(cause));
      }
    } finally { running.current = false; setBusy(false); }
  };
  return <section className="app-page friend-compare-page">
    <div className="page-heading"><h1 data-page-heading tabIndex={-1}>Compare rankings</h1><button className="text-button" onClick={onFriends}>Friends<Icon name="back" /></button></div>
    <fieldset className="compare-people"><legend>Choose 2–6 people</legend>
      {[uid, ...new Set([...choices.map((pair) => peerOf(pair, uid)), ...selected.filter((value) => value !== uid)])].map((id) => <label className="check-control" key={id}>
        <input type="checkbox" checked={selected.includes(id)} disabled={!selected.includes(id) && selected.length === 6} onChange={(event) => { setPage(1); setSelected((old) => event.target.checked ? [...old, id] : old.filter((value) => value !== id)); }} />
        {id === uid ? <Avatar descriptor={identity.avatar} size={32} /> : identities[id] ? <Avatar descriptor={identities[id].avatar} size={32} /> : null}
        <span>{id === uid ? 'You (private device copy)' : identities[id]?.displayName ?? 'Unavailable player'}</span>
      </label>)}
    </fieldset>
    {cursor && <button className="text-button" disabled={busy} onClick={() => { void run(() => addChoices(cursor)); }}>More friends</button>}
    <div className="compare-toolbar"><label>Games<select aria-label="Games" value={mode} onChange={(event) => { setMode(event.target.value as ComparisonMode); setPage(1); }}><option value="common-ranked">Ranked by everyone</option><option value="all-shared">All available games</option></select></label><label>Search games<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label></div>
    {error && <p className="inline-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {comparison?.cohort.incomplete && <p className="inline-error" role="status">Some rankings are unavailable or unshared. Results identify only the available contributors.</p>}
    <ul className="compare-freshness">{datasets.filter((value) => value.kind !== 'self').map((value) => <li key={value.id}>{value.displayName}: {value.availability === 'ready' ? value.updatedAt ? `shared ${new Date(value.updatedAt).toLocaleString()}` : 'Available' : value.availability}</li>)}</ul>
    {comparison && <p className="section-help">{comparison.summary.sharedGameCount ?? 'Unknown'} games in common.{comparison.summary.pairs.length === 1 && comparison.summary.pairs[0]?.meanAbsoluteScoreGap != null ? ` Mean score gap ${comparison.summary.pairs[0].meanAbsoluteScoreGap.toFixed(2)} across ${comparison.summary.pairs[0].jointlyRatedCount} jointly rated games.` : ''}</p>}
    {result ? <><div className="comparison-scroll" tabIndex={0} role="region" aria-label="Ranking comparison table"><table className="friend-matrix"><thead><tr><th scope="col">Game</th>{datasets.map((person) => {
      const profile = identities[person.id];
      return <th scope="col" key={person.id}>{person.id === uid ? <Avatar descriptor={identity.avatar} size={32} /> : profile && person.availability === 'ready' ? <Avatar descriptor={profile.avatar} size={32} /> : null}{person.displayName}</th>;
    })}<th scope="col">Mean · spread</th></tr></thead><tbody>
      {result.rows.map((row) => <tr key={row.key}><th scope="row"><button className="text-button" onClick={() => { try { onOpen(recordFromPublic({ ...row.game, score: null, position: 1 }, games)); } catch (cause) { setError(onlineError(cause)); } }}>{row.game.title}</button><small>{row.game.source} · {row.game.year ?? 'Year unknown'}</small></th>
        {row.cells.map((cell) => <td key={cell.participantId}>{cell.status === 'ranked' ? <><strong>{cell.score === null ? 'Unrated' : cell.score.toFixed(1)}</strong><small>Rank {cell.position}</small></> : <span>{cell.status === 'absent' ? 'Not in shared list' : cell.status}</span>}</td>)}
        <td>{row.meanScore === null ? 'Unrated' : row.meanScore.toFixed(2)}<small>{row.raterCount} raters · {row.scoreSpread === null ? 'No spread' : row.scoreSpread.toFixed(2)}{row.scoreDifference === null ? '' : ` · difference ${row.scoreDifference.toFixed(2)}`}</small></td>
      </tr>)}
    </tbody></table></div>{!result.rows.length && <p>No matching games in this view.</p>}<div className="button-row"><button className="text-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>{result.totalRows ? result.page : 0} / {result.pageCount}</span><button className="text-button" disabled={page >= result.pageCount} onClick={() => setPage((value) => value + 1)}>Next 25</button></div></> : <p>Choose at least two people.</p>}
    <section className="account-section"><h2>Private groups</h2><form onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const id = group?.id ?? groupCreationId.current ?? crypto.randomUUID();
      if (!group) groupCreationId.current = id;
      const saved = await store.saveGroup(uid, { id, name: groupName, participantUids: selected }, group?.revision ?? 0);
      groupCreationId.current = null;
      useGroup(saved); setGroups((old) => [saved, ...old.filter((item) => item.id !== saved.id)]); setMessage('Group saved.');
    }); }}><label>Group name<input required maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><div className="button-row">
      <button className="button button-outline" disabled={busy || Boolean(refreshGroupId) || selected.length < 2 || selected.length > 6}>Save group</button>
      {group && <button type="button" className="text-button" disabled={Boolean(refreshGroupId)} onClick={() => { setGroup(null); setGroupName(''); groupCreationId.current = null; history.replaceState(null, '', '/compare'); }}>New group</button>}
      {group && <button type="button" className="text-button danger-text" disabled={busy || Boolean(refreshGroupId)} onClick={() => { void run(async () => { await store.deleteGroup(uid, group.id, group.revision); setGroups((old) => old.filter((item) => item.id !== group.id)); setGroup(null); setGroupName(''); history.replaceState(null, '', '/compare'); setMessage('Group deleted.'); }); }}>Delete group</button>}
    </div></form>
    {refreshGroupId && <button className="button button-outline" disabled={busy} onClick={() => { void run(async () => {
      const saved = refreshGroupId === 'pending' ? null : await store.getGroup(uid, refreshGroupId);
      const listed = await store.listGroups(uid);
      setGroups(listed.items); setGroupCursor(listed.cursor);
      if (saved) { useGroup(saved); groupCreationId.current = null; }
      setRefreshGroupId(null); setMessage('Groups refreshed.');
    }); }}>Refresh groups</button>}
    <ul className="friend-groups">{groups.map((item) => <li key={item.id}><button className="text-button" onClick={() => useGroup(item)}>{item.name}<Icon name="arrow" /></button></li>)}</ul>
    {groupCursor && <button className="text-button" disabled={busy} onClick={() => { void run(async () => { const more = await store.listGroups(uid, groupCursor); setGroups((old) => [...old, ...more.items]); setGroupCursor(more.cursor); }); }}>More groups</button>}
    </section>
  </section>;
}

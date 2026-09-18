import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../lib/types';
import type { PersonalLibraryState, LibraryRecord } from '../lib/personal-types';
import { compareFriendRankings, getComparisonPage } from '../lib/friend-comparison';
import type { ComparisonParticipant, ComparisonMode } from '../lib/friend-comparison';
import { projectOwnRanking, recordFromPublic } from '../lib/community';
import type { FriendGroup, FriendIdentity, FriendPair, FriendCursor } from '../lib/friend-types';
import { FriendStore } from './friend-store';
import { cloudAuth, firebaseApp } from './firebase-client';
import { Avatar } from '../components/avatar/Avatar';
import { Icon } from '../components/Icon';
import { onlineError } from './errors';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';
import { syncFailure } from '../lib/sync-retry';
import { friendPeer as peerOf, uniqueFriendPairs } from '../lib/friend-manager';
import { comparisonScope, readComparisonView, rememberComparisonView } from '../lib/friend-comparison-intent';
import { accountScope } from '../lib/cloud-types';
import { useComparisonGameFilter } from '../hooks/useComparisonGameFilter';
import { COMPARISON_GAMES_EVENT } from '../lib/comparison-game-filter';
import { FriendComparisonLoader } from './FriendComparisonLoader';

export function FriendComparisonPage({ store, uid, identity, ownState, games, onOpen, onFriends }: {
  store: FriendStore; uid: string; identity: { displayName: string; avatar: FriendIdentity['avatar'] };
  ownState: PersonalLibraryState; games: Game[]; onOpen: (record: LibraryRecord) => void; onFriends: () => void;
}) {
  const scope = comparisonScope(firebaseApp.options.projectId ?? '', uid);
  const filteredGames = useComparisonGameFilter(accountScope(uid, firebaseApp.options.projectId));
  const [restored] = useState(() => readComparisonView(scope));
  const [requestedGroup] = useState(() => new URLSearchParams(location.search).get('group'));
  const [viewReady, setViewReady] = useState(!requestedGroup);
  const [choices, setChoices] = useState<FriendPair[]>([]);
  const [identities, setIdentities] = useState<Record<string, FriendIdentity>>({});
  const [cursor, setCursor] = useState<FriendCursor>();
  const [selected, setSelected] = useState<string[]>(() => requestedGroup ? [] : restored?.selected ?? [uid]);
  const [participants, setParticipants] = useState<Record<string, ComparisonParticipant>>({});
  const [mode, setMode] = useState<ComparisonMode>(restored?.mode ?? 'common-ranked');
  const [query, setQuery] = useState(restored?.query ?? '');
  const [page, setPage] = useState(restored?.page ?? 1);
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
  const currentUid = useRef<string | null>(uid); currentUid.current = uid;
  const addChoices = useCallback(async (next?: FriendCursor) => {
    const found = await store.listRelations(uid, 'accepted', next);
    if (currentUid.current !== uid || cloudAuth.currentUser?.uid !== uid) return;
    setChoices((old) => uniqueFriendPairs(next ? [...old, ...found.items] : found.items)); setCursor(found.cursor);
    for (const pair of found.items) {
      const peer = peerOf(pair, uid);
      void store.identity(peer).then((value) => {
        if (value && currentUid.current === uid && cloudAuth.currentUser?.uid === uid) setIdentities((old) => ({ ...old, [peer]: value }));
      }).catch((cause) => { if (currentUid.current === uid && cloudAuth.currentUser?.uid === uid) setError(`A friend profile is unavailable. ${onlineError(cause)}`); });
    }
  }, [store, uid]);
  useEffect(() => {
    let alive = true;
    currentUid.current = uid;
    setChoices([]); setIdentities({}); setParticipants({}); setError('');
    const prior = readComparisonView(scope);
    if (!requestedGroup && prior) { setSelected(prior.selected); setMode(prior.mode); setQuery(prior.query); setPage(prior.page); }
    void addChoices().catch((cause) => { if (alive) setError(onlineError(cause)); });
    void store.listGroups(uid).then((result) => { if (alive) { setGroups(result.items); setGroupCursor(result.cursor); } }).catch((cause) => { if (alive) setError(onlineError(cause)); });
    if (requestedGroup) void store.getGroup(uid, requestedGroup).then((saved) => {
      if (!alive || cloudAuth.currentUser?.uid !== uid) return;
      if (!saved) throw new Error('This group is no longer available.');
      setGroup(saved); setGroupName(saved.name); setSelected(prior?.groupId === saved.id ? prior.selected : saved.participantUids); setViewReady(true);
    }).catch((cause) => { if (alive) { setError(onlineError(cause)); setSelected([uid]); setViewReady(true); } });
    return () => { alive = false; currentUid.current = null; generation.current += 1; };
  }, [uid, store, scope, requestedGroup, addChoices]);
  useEffect(() => {
    const transition = () => {
      if (currentUid.current !== uid || cloudAuth.currentUser?.uid !== uid) return;
      const next = readComparisonView(scope);
      if (!next) return;
      setSelected(next.selected); setMode(next.mode); setQuery(next.query); setPage(next.page);
    };
    window.addEventListener(COMPARISON_GAMES_EVENT, transition);
    return () => window.removeEventListener(COMPARISON_GAMES_EVENT, transition);
  }, [scope, uid]);
  useEffect(() => {
    if (viewReady && currentUid.current === uid && cloudAuth.currentUser?.uid === uid) {
      rememberComparisonView({ version: 1, scope, selected, mode, query, page, groupId: group?.id ?? null });
    }
  }, [viewReady, uid, scope, selected, mode, query, page, group?.id]);
  const exactIds = useMemo(() => filteredGames.value?.records.map(record => record.id) ?? null, [filteredGames.value]);
  const acceptParticipant = useCallback((peer: string, person: FriendIdentity | null, participant: ComparisonParticipant) => {
    if (currentUid.current !== uid || cloudAuth.currentUser?.uid !== uid) return;
    setParticipants(old => ({ ...old, [peer]: participant }));
    setIdentities(old => { const next = { ...old }; if (person) next[peer] = person; else delete next[peer]; return next; });
  }, [uid]);
  const removeParticipant = useCallback((peer: string) => {
    if (currentUid.current !== uid || cloudAuth.currentUser?.uid !== uid) return;
    setIdentities(old => { const next = { ...old }; delete next[peer]; return next; });
    setParticipants(old => { const next = { ...old }; delete next[peer]; return next; });
    setChoices(old => old.filter(pair => peerOf(pair, uid) !== peer));
    setSelected(old => old.filter(value => value !== peer));
    setMessage('A player is no longer a friend and was removed from this comparison.');
  }, [uid]);
  const datasets = useMemo<ComparisonParticipant[]>(() => selected.map((id) => id === uid
    ? { id: uid, displayName: identity.displayName, kind: 'self', availability: 'ready', freshness: 'fresh', updatedAt: null, entries: ownEntries }
    : participants[id] ?? { id, displayName: identities[id]?.displayName ?? 'Loading player', kind: 'friend', availability: 'loading', freshness: 'unknown' }), [selected, uid, identity.displayName, ownEntries, participants, identities]);
  const comparison = useMemo(() => datasets.length >= 2 ? compareFriendRankings(datasets) : null, [datasets]);
  const result = useMemo(() => comparison ? getComparisonPage(comparison, { mode, query, page, pageSize: 25, sort: { by: 'title' },
    ...(filteredGames.value ? { games: filteredGames.value.records } : {}) }) : null, [comparison, mode, query, page, filteredGames.value]);
  const chooseGroup = (value: FriendGroup) => {
    setGroup(value); setGroupName(value.name); setSelected(value.participantUids); setPage(1);
    history.replaceState(history.state, '', `/compare?group=${encodeURIComponent(value.id)}`);
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
    {filteredGames.value && <section className="compare-game-filter" aria-label="Games chosen for comparison"><div className="button-row"><strong>{filteredGames.value.records.length} {filteredGames.value.records.length === 1 ? 'game' : 'games'} from your tray</strong><button className="text-button" onClick={() => { filteredGames.clear(); setPage(1); }}>Clear game filter</button></div><ul>{filteredGames.value.records.map((record) => <li key={record.id}><button className="text-button" onClick={() => onOpen(record)}>{record.title}</button></li>)}</ul></section>}
    {filteredGames.warning && <p role="status">{filteredGames.warning}</p>}
    <fieldset className="compare-people"><legend>Choose 2–6 people</legend>
      {[uid, ...new Set([...choices.map((pair) => peerOf(pair, uid)), ...selected.filter((value) => value !== uid)])].map((id) => <label className="check-control" key={id}>
        <input type="checkbox" checked={selected.includes(id)} disabled={!selected.includes(id) && selected.length === 6} onChange={(event) => { setPage(1); setSelected((old) => event.target.checked ? [...old, id] : old.filter((value) => value !== id)); }} />
        {id === uid ? <Avatar descriptor={identity.avatar} size={32} /> : identities[id] ? <Avatar descriptor={identities[id].avatar} size={32} /> : null}
        <span>{id === uid ? 'You (private device copy)' : identities[id]?.displayName ?? 'Unavailable player'}</span>
      </label>)}
    </fieldset>
    {cursor && <button className="text-button" disabled={busy} onClick={() => { void run(() => addChoices(cursor)); }}>More friends</button>}
    <div className="compare-toolbar"><label>Games<select aria-label="Games" value={mode} onChange={(event) => { setMode(event.target.value === 'all-shared' ? 'all-shared' : 'common-ranked'); setPage(1); }}><option value="common-ranked">Ranked by everyone</option><option value="all-shared">All available games</option></select></label><label>Search games<input type="search" maxLength={160} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label></div>
    {error && <p className="inline-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {comparison?.cohort.incomplete && <p className="section-help" role="status">{filteredGames.value ? 'This comparison checks only the games from your tray.' : 'Some shared lists are incomplete or unavailable. Search and results cover loaded games; whole-list totals remain unknown.'}</p>}
    <ul className="compare-freshness">{selected.filter(value => value !== uid).map(peer => <FriendComparisonLoader key={`${uid}:${peer}`} store={store} uid={uid} peer={peer} exactIds={exactIds} onData={acceptParticipant} onRemove={removeParticipant} />)}</ul>
    {comparison && !filteredGames.value && <p className="section-help">{comparison.summary.sharedGameCount ?? 'Unknown'} games in common.{comparison.summary.pairs.length === 1 && comparison.summary.pairs[0]?.meanAbsoluteScoreGap != null ? ` Mean score gap ${comparison.summary.pairs[0].meanAbsoluteScoreGap.toFixed(2)} across ${comparison.summary.pairs[0].jointlyRatedCount} jointly rated games.` : ''}</p>}
    {result ? <><div className="comparison-scroll" tabIndex={0} role="region" aria-label="Ranking comparison table"><table className="friend-matrix"><thead><tr><th scope="col">Game</th>{datasets.map((person) => {
      const profile = identities[person.id];
      return <th scope="col" key={person.id}>{person.id === uid ? <Avatar descriptor={identity.avatar} size={32} /> : profile && person.availability === 'ready' ? <Avatar descriptor={profile.avatar} size={32} /> : null}{person.displayName}</th>;
    })}<th scope="col">Mean · spread</th></tr></thead><tbody>
      {result.rows.map((row) => <tr key={row.key}><th scope="row"><button className="text-button" onClick={() => { try { onOpen(recordFromPublic({ ...row.game, score: null, position: 1 }, games)); } catch (cause) { setError(onlineError(cause)); } }}>{row.game.title}</button><small>{row.game.source} · {row.game.year ?? 'Year unknown'}</small></th>
        {row.cells.map((cell) => <td key={cell.participantId}>{cell.status === 'ranked' ? <><strong>{cell.score === null ? 'Unrated' : cell.score.toFixed(1)}</strong><small>Rank {cell.position}</small></> : <span>{cell.status === 'absent' ? 'Not in shared list' : cell.status === 'unfetched' ? 'Not loaded yet' : cell.status}</span>}</td>)}
        <td>{row.cells.some(cell => cell.status === 'unfetched') ? 'Incomplete' : row.meanScore === null ? 'Unrated' : row.meanScore.toFixed(2)}<small>{row.raterCount} {row.raterCount === 1 ? 'rater' : 'raters'} · {row.scoreSpread === null ? 'No spread' : row.scoreSpread.toFixed(2)}{row.scoreDifference === null ? '' : ` · difference ${row.scoreDifference.toFixed(2)}`}</small></td>
      </tr>)}
    </tbody></table></div>{!result.rows.length && <p>{filteredGames.value ? 'No chosen games match the available rankings and filters. Unshared rankings cannot contribute scores.' : 'No matching games in this view.'}</p>}<div className="button-row"><button className="text-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>{result.totalRows ? result.page : 0} / {result.pageCount}</span><button className="text-button" disabled={page >= result.pageCount} onClick={() => setPage((value) => value + 1)}>Next 25</button></div></> : <p>Choose at least two people.</p>}
    <section className="account-section"><h2>Private groups</h2><form onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const id = group?.id ?? groupCreationId.current ?? crypto.randomUUID();
      if (!group) groupCreationId.current = id;
      const saved = await store.saveGroup(uid, { id, name: groupName, participantUids: selected }, group?.revision ?? 0);
      groupCreationId.current = null;
      chooseGroup(saved); setGroups((old) => [saved, ...old.filter((item) => item.id !== saved.id)]); setMessage('Group saved.');
    }); }}><label>Group name<input required maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><div className="button-row">
      <button className="button button-outline" disabled={busy || Boolean(refreshGroupId) || selected.length < 2 || selected.length > 6}>Save group</button>
      {group && <button type="button" className="text-button" disabled={Boolean(refreshGroupId)} onClick={() => { setGroup(null); setGroupName(''); groupCreationId.current = null; history.replaceState(history.state, '', '/compare'); }}>New group</button>}
      {group && <button type="button" className="text-button danger-text" disabled={busy || Boolean(refreshGroupId)} onClick={() => { void run(async () => { await store.deleteGroup(uid, group.id, group.revision); setGroups((old) => old.filter((item) => item.id !== group.id)); setGroup(null); setGroupName(''); history.replaceState(history.state, '', '/compare'); setMessage('Group deleted.'); }); }}>Delete group</button>}
    </div></form>
    {refreshGroupId && <button className="button button-outline" disabled={busy} onClick={() => { void run(async () => {
      const saved = refreshGroupId === 'pending' ? null : await store.getGroup(uid, refreshGroupId);
      const listed = await store.listGroups(uid);
      setGroups(listed.items); setGroupCursor(listed.cursor);
      if (saved) { chooseGroup(saved); groupCreationId.current = null; }
      setRefreshGroupId(null); setMessage('Groups refreshed.');
    }); }}>Refresh groups</button>}
    <ul className="friend-groups">{groups.map((item) => <li key={item.id}><button className="text-button" onClick={() => chooseGroup(item)}>{item.name}<Icon name="arrow" /></button></li>)}</ul>
    {groupCursor && <button className="text-button" disabled={busy} onClick={() => { void run(async () => { const more = await store.listGroups(uid, groupCursor); setGroups((old) => [...old, ...more.items]); setGroupCursor(more.cursor); }); }}>More groups</button>}
    </section>
  </section>;
}

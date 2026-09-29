import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../lib/types';
import type { PersonalLibraryState, LibraryRecord } from '../lib/personal-types';
import { compareFriendRankings, getComparisonPage } from '../lib/friend-comparison';
import type { ComparisonParticipant, ComparisonMode } from '../lib/friend-comparison';
import { projectOwnRanking } from '../lib/community';
import type { FriendGroup, FriendIdentity, FriendPair, FriendCursor } from '../lib/friend-types';
import { FriendStore } from './friend-store';
import { cloudAuth, firebaseApp } from './firebase-client';
import { Icon } from '../components/Icon';
import { onlineError } from './errors';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';
import { syncFailure } from '../lib/sync-retry';
import { friendPeer as peerOf, uniqueFriendPairs } from '../lib/friend-manager';
import { comparisonScope, readComparisonView, rememberComparisonView } from '../lib/friend-comparison-intent';
import { accountScope } from '../lib/cloud-types';
import { useComparisonGameFilter } from '../hooks/useComparisonGameFilter';
import { COMPARISON_GAMES_EVENT } from '../lib/comparison-game-filter';
import { initialPeopleDisclosure, useCoverageDisclosure, usePeopleDisclosure } from './compare-disclosures';
import { FriendComparisonPeople } from './FriendComparisonPeople';
import { FriendComparisonFilters } from './FriendComparisonFilters';
import { FriendComparisonCoverage } from './FriendComparisonCoverage';
import { FriendComparisonTable } from './FriendComparisonTable';
import { FriendComparisonGroups } from './FriendComparisonGroups';

export function FriendComparisonPage({
  store,
  uid,
  identity,
  urlGroup,
  ownState,
  games,
  onOpen,
  onFriends,
  onGroupRoute,
}: {
  store: FriendStore;
  uid: string;
  identity: { displayName: string; avatar: FriendIdentity['avatar'] };
  /** The group the URL names, or ''. The page opens the one it named at mount; the parent remounts it for another. */
  urlGroup: string;
  ownState: PersonalLibraryState;
  games: Game[];
  onOpen: (record: LibraryRecord) => void;
  onFriends: () => void;
  /** Told of each group this page puts in the URL itself, which the parent must not take for a navigation. */
  onGroupRoute: (group: string) => void;
}) {
  const scope = comparisonScope(firebaseApp.options.projectId ?? '', uid);
  const filteredGames = useComparisonGameFilter(accountScope(uid, firebaseApp.options.projectId));
  const [restored] = useState(() => readComparisonView(scope));
  const [requestedGroup] = useState(() => urlGroup || null);
  const [viewReady, setViewReady] = useState(!requestedGroup);
  const [choices, setChoices] = useState<FriendPair[]>([]);
  const [identities, setIdentities] = useState<Record<string, FriendIdentity>>({});
  const [cursor, setCursor] = useState<FriendCursor>();
  const [selected, setSelected] = useState<string[]>(() => (requestedGroup ? [] : (restored?.selected ?? [uid])));
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
  // The committed account: a read that settles after it changed is discarded.
  const currentUid = useRef<string | null>(uid);
  useLayoutEffect(() => {
    currentUid.current = uid;
  }, [uid]);
  const addChoices = useCallback(
    async (next?: FriendCursor) => {
      const found = await store.listRelations(uid, 'accepted', next);
      if (currentUid.current !== uid || cloudAuth.currentUser?.uid !== uid) return;
      setChoices((old) => uniqueFriendPairs(next ? [...old, ...found.items] : found.items));
      setCursor(found.cursor);
      for (const pair of found.items) {
        const peer = peerOf(pair, uid);
        void store
          .identity(peer)
          .then((value) => {
            if (value && currentUid.current === uid && cloudAuth.currentUser?.uid === uid)
              setIdentities((old) => ({ ...old, [peer]: value }));
          })
          .catch((cause) => {
            if (currentUid.current === uid && cloudAuth.currentUser?.uid === uid)
              setError(`A friend profile is unavailable. ${onlineError(cause)}`);
          });
      }
    },
    [store, uid],
  );
  // Each account starts from its own friends, groups and remembered view.
  const [loaded, setLoaded] = useState<{
    uid: string;
    store: FriendStore;
    scope: string;
    requestedGroup: string | null;
  } | null>(null);
  if (
    loaded?.uid !== uid ||
    loaded.store !== store ||
    loaded.scope !== scope ||
    loaded.requestedGroup !== requestedGroup
  ) {
    setLoaded({ uid, store, scope, requestedGroup });
    setChoices([]);
    setIdentities({});
    setParticipants({});
    setError('');
    const prior = readComparisonView(scope);
    if (!requestedGroup && prior) {
      setSelected(prior.selected);
      setMode(prior.mode);
      setQuery(prior.query);
      setPage(prior.page);
    }
  }
  useEffect(() => {
    let alive = true;
    const request = ++generation.current;
    currentUid.current = uid;
    const prior = readComparisonView(scope);
    void addChoices().catch((cause) => {
      if (alive) setError(onlineError(cause));
    });
    void store
      .listGroups(uid)
      .then((result) => {
        if (alive) {
          setGroups(result.items);
          setGroupCursor(result.cursor);
        }
      })
      .catch((cause) => {
        if (alive) setError(onlineError(cause));
      });
    if (requestedGroup)
      void store
        .getGroup(uid, requestedGroup)
        .then((saved) => {
          if (!alive || request !== generation.current || cloudAuth.currentUser?.uid !== uid) return;
          if (!saved) throw new Error('This group is no longer available.');
          setGroup(saved);
          setGroupName(saved.name);
          setSelected(prior?.groupId === saved.id ? prior.selected : saved.participantUids);
          setViewReady(true);
        })
        .catch((cause) => {
          if (alive && request === generation.current) {
            setError(onlineError(cause));
            setSelected([uid]);
            setViewReady(true);
          }
        });
    return () => {
      alive = false;
      currentUid.current = null;
      generation.current += 1;
    };
  }, [uid, store, scope, requestedGroup, addChoices]);
  useEffect(() => {
    const transition = () => {
      if (currentUid.current !== uid || cloudAuth.currentUser?.uid !== uid) return;
      const next = readComparisonView(scope);
      if (!next) return;
      generation.current += 1;
      setSelected(next.selected);
      setMode(next.mode);
      setQuery(next.query);
      setPage(next.page);
      setViewReady(true);
    };
    window.addEventListener(COMPARISON_GAMES_EVENT, transition);
    return () => window.removeEventListener(COMPARISON_GAMES_EVENT, transition);
  }, [scope, uid]);
  // The people chooser opens itself once the view is known, and again whenever fewer than two people are chosen.
  const {
    open: peopleOpen,
    chooserRef: peopleRef,
    onToggle: onPeopleToggle,
    chooseGroup: choosePeopleForGroup,
  } = usePeopleDisclosure(viewReady, selected.length, () =>
    initialPeopleDisclosure(!requestedGroup, !requestedGroup && (restored?.selected.length ?? 1) < 2),
  );
  useEffect(() => {
    if (viewReady && currentUid.current === uid && cloudAuth.currentUser?.uid === uid) {
      rememberComparisonView({ version: 1, scope, selected, mode, query, page, groupId: group?.id ?? null });
    }
  }, [viewReady, uid, scope, selected, mode, query, page, group?.id]);
  const exactIds = useMemo(
    () => filteredGames.value?.records.map((record) => record.id) ?? null,
    [filteredGames.value],
  );
  const acceptParticipant = useCallback(
    (peer: string, person: FriendIdentity | null, participant: ComparisonParticipant) => {
      if (currentUid.current !== uid || cloudAuth.currentUser?.uid !== uid) return;
      setParticipants((old) => ({ ...old, [peer]: participant }));
      setIdentities((old) => {
        const next = { ...old };
        if (person) next[peer] = person;
        else delete next[peer];
        return next;
      });
    },
    [uid],
  );
  const removeParticipant = useCallback(
    (peer: string) => {
      if (currentUid.current !== uid || cloudAuth.currentUser?.uid !== uid) return;
      setIdentities((old) => {
        const next = { ...old };
        delete next[peer];
        return next;
      });
      setParticipants((old) => {
        const next = { ...old };
        delete next[peer];
        return next;
      });
      setChoices((old) => old.filter((pair) => peerOf(pair, uid) !== peer));
      setSelected((old) => old.filter((value) => value !== peer));
      setMessage('A player is no longer a friend and was removed from this comparison.');
    },
    [uid],
  );
  const datasets = useMemo<ComparisonParticipant[]>(
    () =>
      selected.map((id) =>
        id === uid
          ? {
              id: uid,
              displayName: identity.displayName,
              kind: 'self',
              availability: 'ready',
              freshness: 'fresh',
              updatedAt: null,
              entries: ownEntries,
            }
          : (participants[id] ?? {
              id,
              displayName: identities[id]?.displayName ?? 'Loading player…',
              kind: 'friend',
              availability: 'loading',
              freshness: 'unknown',
            }),
      ),
    [selected, uid, identity.displayName, ownEntries, participants, identities],
  );
  const comparison = useMemo(() => (datasets.length >= 2 ? compareFriendRankings(datasets) : null), [datasets]);
  const result = useMemo(
    () =>
      comparison
        ? getComparisonPage(comparison, {
            mode,
            query,
            page,
            pageSize: 25,
            sort: { by: 'title' },
            ...(filteredGames.value ? { games: filteredGames.value.records } : {}),
          })
        : null,
    [comparison, mode, query, page, filteredGames.value],
  );
  const unavailable = datasets.filter(
    (person) =>
      person.availability === 'error' || person.availability === 'unavailable' || person.availability === 'unshared',
  );
  const availabilityProblems = unavailable
    .filter((person) => person.availability === 'error')
    .map((person) => person.id)
    .join('|');
  // A person whose ranking couldn't be read opens the coverage details, once per set of such people.
  const {
    open: coverageOpen,
    coverageRef,
    onToggle: onCoverageToggle,
    review: showCoverage,
  } = useCoverageDisclosure(availabilityProblems);
  const reviewCoverage = () => {
    showCoverage();
    coverageRef.current?.querySelector('summary')?.focus();
  };
  // Picking, saving or clearing a group changes ?group= in place, which is not a navigation: this page stays mounted,
  // with its unsaved name and selection. A save or delete that settles after the page closed leaves the URL alone.
  const routeGroup = (id: string | null) => {
    if (currentUid.current !== uid) return;
    history.replaceState(history.state, '', id ? `/compare?group=${encodeURIComponent(id)}` : '/compare');
    onGroupRoute(id ?? '');
  };
  const chooseGroup = (value: FriendGroup) => {
    generation.current += 1;
    setGroup(value);
    setGroupName(value.name);
    setSelected(value.participantUids);
    setPage(1);
    setViewReady(true);
    choosePeopleForGroup(value.participantUids.length);
    routeGroup(value.id);
  };
  const run = async (operation: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await operation();
    } catch (cause) {
      const committed = committedFriendChange(cause, uid);
      if (committed) {
        setMessage(committedFriendMessage(committed));
        setRefreshGroupId(committed.receipt.groupId ?? 'pending');
      } else {
        if (groupCreationId.current && syncFailure(cause) !== 'blocked') setRefreshGroupId(groupCreationId.current);
        setError(friendMutationError(cause));
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="app-page friend-compare-page">
      <div className="page-heading">
        <h1 data-page-heading tabIndex={-1}>
          Compare rankings
        </h1>
        <button className="text-button" onClick={onFriends}>
          Friends
          <Icon name="back" width="17" height="17" />
        </button>
      </div>
      {filteredGames.warning && <p role="status">{filteredGames.warning}</p>}
      <FriendComparisonPeople
        uid={uid}
        identity={identity}
        viewReady={viewReady}
        selected={selected}
        setSelected={setSelected}
        setPage={setPage}
        datasets={datasets}
        choices={choices}
        identities={identities}
        cursor={cursor}
        busy={busy}
        run={run}
        addChoices={addChoices}
        peopleRef={peopleRef}
        peopleOpen={peopleOpen}
        onPeopleToggle={onPeopleToggle}
      />
      <FriendComparisonFilters
        viewReady={viewReady}
        mode={mode}
        setMode={setMode}
        query={query}
        setQuery={setQuery}
        setPage={setPage}
        filteredGames={filteredGames}
        onOpen={onOpen}
      />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <FriendComparisonCoverage
        store={store}
        uid={uid}
        selected={selected}
        datasets={datasets}
        unavailable={unavailable}
        comparison={comparison}
        filtered={Boolean(filteredGames.value)}
        exactIds={exactIds}
        acceptParticipant={acceptParticipant}
        removeParticipant={removeParticipant}
        reviewCoverage={reviewCoverage}
        coverageRef={coverageRef}
        coverageOpen={coverageOpen}
        onCoverageToggle={onCoverageToggle}
      />
      {result ? (
        <FriendComparisonTable
          uid={uid}
          identity={identity}
          datasets={datasets}
          identities={identities}
          result={result}
          filtered={Boolean(filteredGames.value)}
          page={page}
          setPage={setPage}
          games={games}
          onOpen={onOpen}
          setError={setError}
        />
      ) : (
        viewReady && <p>Choose at least two people.</p>
      )}
      <FriendComparisonGroups
        store={store}
        uid={uid}
        selected={selected}
        viewReady={viewReady}
        busy={busy}
        run={run}
        setMessage={setMessage}
        group={group}
        setGroup={setGroup}
        groupName={groupName}
        setGroupName={setGroupName}
        groups={groups}
        setGroups={setGroups}
        groupCursor={groupCursor}
        setGroupCursor={setGroupCursor}
        refreshGroupId={refreshGroupId}
        setRefreshGroupId={setRefreshGroupId}
        groupCreationIdRef={groupCreationId}
        chooseGroup={chooseGroup}
        routeGroup={routeGroup}
      />
    </section>
  );
}

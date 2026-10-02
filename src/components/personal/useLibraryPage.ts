import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import type { SelectionAction } from '../SelectionBar';
import type { LibraryPageProps } from './LibraryPage';
import { searchText } from '../../lib/collection';
import {
  effectiveProgressFilter,
  matchesProgress,
  progressFilterPatch,
  selectionOperation,
} from '../../lib/game-progress';
import { getLocalPage } from '../../lib/local-pagination';
import { useCommittedCue } from '../../hooks/useCommittedCue';
import { useUrlState } from '../../hooks/useUrlState';
import { myGamesTab, parseLibraryPage } from '../../lib/my-games-navigation';
import { pageFromPath } from '../../lib/url';
import type { CommittedCue } from '../../lib/route-continuity';
import { usePendingEdits } from '../../hooks/useExitSave';
import { useNavigationScope } from '../../hooks/useNavigationScope';
import { useDiscoveryArtwork } from '../../hooks/useDiscoveryArtwork';
import { useLibraryMode } from '../../lib/library-mode';
import { focusMovedRecord } from './reorder-focus';
import type { MoveDirection } from './reorder-focus';
import { useRetainedRecords } from './useRetainedRecords';
import { resolveLibraryPageCursor } from './library-page-cursor';
import { captureControlFocus } from '../../lib/control-focus';
import { visibleFocusTarget } from '../../lib/dialog-focus';

export const LIBRARY_PAGE_SIZE = 25;

export function useLibraryPage({
  state,
  filters,
  busy,
  onFilters,
  onAction,
  onPresentationChange,
  active = true,
  workspaceView,
  completedOnly = false,
  progressFilter,
}: LibraryPageProps) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<LibraryRecord[]>([]);
  const tab: 'later' | 'completed' | 'all' = workspaceView
    ? workspaceView === 'queue'
      ? 'later'
      : completedOnly
        ? 'completed'
        : 'all'
    : filters.list === 'completed'
      ? 'completed'
      : filters.list === 'later'
        ? 'later'
        : 'all';
  const { page: hostPage, libraryPage: urlPage, changeLibraryPage: changeUrlPage } = useUrlState();
  const usesUrlPage = tab !== 'later' && (hostPage === 'games' || hostPage === 'library' || hostPage === 'rankings');
  const [localPage, setLocalPage] = useState(1);
  const [queuePage, setQueuePage] = useState(1);
  const libraryPage = tab === 'later' ? queuePage : usesUrlPage ? urlPage : localPage;
  const changeLibraryPage = useCallback(
    (nextPage: number, method: 'push' | 'replace' = 'push') => {
      if (tab === 'later') setQueuePage(nextPage);
      else if (usesUrlPage) changeUrlPage(nextPage, method);
      else setLocalPage(nextPage);
    },
    [tab, usesUrlPage, changeUrlPage],
  );
  const pendingEdits = usePendingEdits();
  const mode = useLibraryMode();
  const { captureFocusGuard } = useNavigationScope(mode.scope);
  const queueResults = useRef<HTMLDivElement>(null);
  const moveCommand = useRef(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [followMove, setFollowMove] = useState<{
    id: string;
    position: number;
    offset: number;
    revision: number;
    direction?: MoveDirection;
    origin: Element | null;
    isCurrent: () => boolean;
  } | null>(null);
  const followedMove = useRef<typeof followMove>(null);
  const [pageCue, setPageCue] = useState<CommittedCue | null>(null);
  const pageCueSerial = useRef(0);
  const pageCueLease = useRef(0);
  const pageBoundary = useRef<HTMLDivElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterPage = useRef(false);
  const removalTrigger = useRef<HTMLElement | null>(null);
  const removalFocus = useRef<{ trigger: HTMLElement | null; generation: number } | null>(null);
  const queueRemoval = useRef<ReturnType<typeof captureControlFocus> | null>(null);
  const [removedQueue, setRemovedQueue] = useState<{
    id: string;
    neighbors: string[];
    handoff: ReturnType<typeof captureControlFocus>;
    isCurrent: () => boolean;
  } | null>(null);
  const followedQueueRemoval = useRef<typeof removedQueue>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const queuePositions = useMemo(
    () => new Map(state.queueOrder.map((id, index) => [id, index + 1])),
    [state.queueOrder],
  );
  const rankedIds = useMemo(() => new Set(state.ranking.map((entry) => entry.id)), [state.ranking]);
  const progressView = progressFilter ?? (completedOnly ? 'completed' : effectiveProgressFilter(filters));
  const records = useMemo(() => {
    const ordered =
      tab === 'later'
        ? state.queueOrder.flatMap((id) => (state.records[id] ? [state.records[id]] : []))
        : Object.values(state.records).sort((a, b) => a.title.localeCompare(b.title));
    const term = searchText(query);
    return ordered.filter(
      (record) => matchesProgress(state.progress[record.id], progressView) && searchText(record.title).includes(term),
    );
  }, [state, tab, query, progressView]);
  const definition = JSON.stringify([tab, query, progressView]);
  const [selectionView, setSelectionView] = useState({ definition, active });
  if (selectionView.definition !== definition || selectionView.active !== active) {
    setSelectionView({ definition, active });
    setSelected(new Set());
  }
  const [previousTab, setPreviousTab] = useState(tab);
  if (previousTab !== tab) {
    setPreviousTab(tab);
    setQuery('');
    setMoveError('');
  }
  const [cursor, setCursor] = useState({ definition, query, input: libraryPage, target: libraryPage });
  const { page, cursor: nextCursor } = resolveLibraryPageCursor(cursor, {
    definition,
    query,
    input: libraryPage,
    usesUrlPage,
    total: records.length,
    pageSize: LIBRARY_PAGE_SIZE,
  });
  const boundedPage = nextCursor.target;
  if (!(tab === 'later' && pendingEdits)) {
    if (
      cursor.definition !== definition ||
      cursor.query !== query ||
      cursor.input !== libraryPage ||
      cursor.target !== boundedPage
    ) {
      setCursor(nextCursor);
    }
    if (active && !usesUrlPage && libraryPage !== boundedPage) {
      if (tab === 'later') setQueuePage(boundedPage);
      else setLocalPage(boundedPage);
    }
  }
  useEffect(() => {
    if (active && usesUrlPage && libraryPage !== boundedPage) changeUrlPage(boundedPage, 'replace');
  }, [active, usesUrlPage, libraryPage, boundedPage, changeUrlPage]);
  const current = useRef({ active, definition, total: records.length, offset: page.offset, libraryPage, state });
  useLayoutEffect(() => {
    if (current.current.active !== active || current.current.definition !== definition) generation.current += 1;
    current.current = { active, definition, total: records.length, offset: page.offset, libraryPage, state };
  });
  useCommittedCue(
    pageBoundary,
    pageCue,
    active && !busy && !moving && !pendingEdits,
    () => mounted.current && current.current.active && generation.current === pageCueLease.current,
  );
  const pageRecords = useMemo(
    () => records.slice(page.offset, page.offset + LIBRARY_PAGE_SIZE),
    [records, page.offset],
  );
  const queueRecords = useMemo(() => (tab === 'later' ? pageRecords : []), [tab, pageRecords]);
  const visibleQueue = useRetainedRecords(queueRecords, pendingEdits);
  const visibleRecords = tab === 'later' ? visibleQueue : pageRecords;
  const artwork = useDiscoveryArtwork(visibleRecords, active);
  const selectedRecords = records.filter((record) => selected.has(record.id));
  if (!active && removing.length > 0) setRemoving([]);
  useLayoutEffect(() => {
    if (!active) removalFocus.current = null;
  }, [active]);
  useEffect(() => {
    mounted.current = true;
    const restorePage = () => {
      const { pathname, search } = window.location;
      if (
        current.current.active &&
        ['games', 'library'].includes(pageFromPath(pathname)) &&
        myGamesTab(pathname, search) === 'library' &&
        parseLibraryPage(search) !== current.current.libraryPage
      ) {
        focusAfterPage.current = true;
      }
    };
    window.addEventListener('popstate', restorePage);
    return () => {
      mounted.current = false;
      generation.current += 1;
      queueRemoval.current?.cancel();
      window.removeEventListener('popstate', restorePage);
    };
  }, []);
  const focusResults = () => {
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  useLayoutEffect(() => {
    if (!focusAfterPage.current || pendingEdits) return;
    focusAfterPage.current = false;
    if (mounted.current && current.current.active) focusResults();
  });
  useLayoutEffect(() => {
    if (!followMove || followedMove.current === followMove || !active || busy || moving || pendingEdits) return;
    if (!followMove.isCurrent() || tab !== 'later') {
      followedMove.current = followMove;
      return;
    }
    const position = queuePositions.get(followMove.id);
    if (state.revision <= followMove.revision || position !== followMove.position) return;
    const offset = Math.floor((position - 1) / LIBRARY_PAGE_SIZE) * LIBRARY_PAGE_SIZE;
    if (offset === followMove.offset) {
      if (followMove.direction)
        focusMovedRecord(queueResults.current, followMove.id, followMove.direction, followMove.origin);
      followedMove.current = followMove;
      return;
    }
    if (page.offset !== offset) {
      pageCueLease.current = generation.current;
      setPageCue({ serial: ++pageCueSerial.current, kind: 'library-page', direction: offset > page.offset ? 1 : -1 });
      setQueuePage(offset / LIBRARY_PAGE_SIZE + 1);
      return;
    }
    if (!focusMovedRecord(queueResults.current, followMove.id, followMove.direction, followMove.origin)) return;
    followedMove.current = followMove;
  }, [followMove, active, busy, moving, pendingEdits, tab, queuePositions, state.revision, page.offset]);
  useEffect(() => {
    if (removing.length) return;
    const requested = removalFocus.current;
    removalFocus.current = null;
    if (requested && active && requested.generation === generation.current && !requested.trigger?.isConnected)
      focusResults();
  }, [removing.length, active]);
  useLayoutEffect(() => {
    if (!removedQueue || followedQueueRemoval.current === removedQueue) return;
    if (removedQueue.isCurrent() && (state.progress[removedQueue.id]?.later || pendingEdits)) return;
    if (removedQueue.isCurrent()) {
      const target = removedQueue.neighbors
        .map(
          (id) =>
            queueResults.current?.querySelector<HTMLElement>(
              `[data-record-id="${CSS.escape(id)}"] .remove-library-action`,
            ) ?? null,
        )
        .find(visibleFocusTarget);
      removedQueue.handoff.focus(target ?? resultsHeading.current);
    } else removedQueue.handoff.cancel();
    queueRemoval.current = null;
    followedQueueRemoval.current = removedQueue;
  }, [removedQueue, state, pendingEdits, active]);
  const removeFromQueue = async (record: LibraryRecord, trigger: HTMLElement) => {
    if (!active || busy || tab !== 'later' || queueRemoval.current) return;
    const request = generation.current;
    const scopeAndNavigation = captureFocusGuard();
    const isCurrent = () =>
      mounted.current && current.current.active && generation.current === request && scopeAndNavigation();
    const handoff = captureControlFocus(trigger);
    queueRemoval.current = handoff;
    const index = records.findIndex((item) => item.id === record.id);
    const neighbors = [...records.slice(index + 1), ...records.slice(0, index).reverse()].map((item) => item.id);
    let saved = false;
    try {
      saved = await onAction({ type: 'set-progress', records: [record], key: 'later', value: false });
      if (saved && isCurrent()) setRemovedQueue({ id: record.id, neighbors, handoff, isCurrent });
    } catch (cause) {
      console.error('The game could not be removed from Play later.', cause);
      if (isCurrent()) setMoveError('The game could not be removed from Play later. Your list is unchanged; retry.');
    } finally {
      if (!saved || !isCurrent()) {
        handoff.cancel();
        if (queueRemoval.current === handoff) queueRemoval.current = null;
      }
    }
  };
  const changePage = (offset: number) => {
    if ((busy && tab !== 'later') || !active || moving) return;
    setFollowMove(null);
    const next = getLocalPage(records.length, LIBRARY_PAGE_SIZE, offset);
    if (next.offset === page.offset) return;
    queueRemoval.current?.cancel();
    const request = generation.current;
    void onPresentationChange(() => {
      if (!mounted.current || !current.current.active || generation.current !== request) return;
      const bounded = getLocalPage(current.current.total, LIBRARY_PAGE_SIZE, offset);
      const previousOffset = current.current.offset;
      focusAfterPage.current = true;
      changeLibraryPage(Math.max(1, bounded.page));
      if (bounded.offset !== previousOffset) {
        pageCueLease.current = request;
        setPageCue({
          serial: ++pageCueSerial.current,
          kind: 'library-page',
          direction: bounded.offset > previousOffset ? 1 : -1,
        });
      }
    });
  };
  const requestRemoval = (
    chosen: LibraryRecord[],
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null,
  ) => {
    removalTrigger.current = trigger;
    setRemoving(chosen);
  };
  const canReorder = tab === 'later' && !query && !selecting && progressView === 'all';
  const move = async (id: string, overId: string, direction?: MoveDirection) => {
    if (!active || busy || !canReorder || moveCommand.current) return;
    const origin = document.activeElement;
    const request = generation.current;
    const scopeAndNavigation = captureFocusGuard();
    const isCurrent = () =>
      mounted.current && current.current.active && generation.current === request && scopeAndNavigation();
    moveCommand.current = true;
    setMoving(true);
    setMoveError('');
    setFollowMove(null);
    try {
      const saved = await onPresentationChange(() => {});
      if (!saved || !isCurrent()) return;
      const { queueOrder, revision } = current.current.state;
      const from = queueOrder.indexOf(id);
      const to = queueOrder.indexOf(overId);
      if (from < 0 || to < 0) {
        setMoveError('That Play later position is no longer available. Choose a current position and retry.');
        return;
      }
      if (from === to) return;
      const moved = await onAction({ type: 'move-item', list: 'queue', id, overId });
      if (!isCurrent()) return;
      if (!moved) {
        setMoveError('The position could not be saved. Play later has not changed; retry.');
        return;
      }
      setFollowMove({ id, position: to + 1, offset: current.current.offset, revision, direction, origin, isCurrent });
    } catch (cause) {
      console.error('The Queue change could not finish.', cause);
      if (isCurrent()) setMoveError('Play later could not be changed. Your current view is still open; retry.');
    } finally {
      moveCommand.current = false;
      if (mounted.current) setMoving(false);
    }
  };
  const filtered = Boolean(query || progressView !== 'all');
  const firstRunEmpty = Object.keys(state.records).length === 0 && !filtered && !selecting;
  const clearView = () => {
    setQuery('');
    onFilters(progressFilterPatch('all', filters));
  };
  const toggleSelected = (id: string) =>
    setSelected((prior) => {
      const next = new Set(prior);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulkAction = async (action: SelectionAction) => {
    const chosen = records.filter((record) => selected.has(record.id));
    if (await onAction(selectionOperation(action, chosen))) setSelected(new Set());
  };
  const removeRecords = async (ids: string[]) => {
    const request = generation.current;
    const success = await onAction({ type: 'remove-records', ids });
    if (success && mounted.current) {
      const removed = new Set(ids);
      setSelected((prior) => new Set([...prior].filter((id) => !removed.has(id))));
      if (current.current.active && request === generation.current) {
        removalFocus.current = { trigger: removalTrigger.current, generation: request };
      }
    }
    return success;
  };
  const completedCount = Object.values(state.progress).filter((value) => value.completed).length;
  return {
    selecting,
    setSelecting,
    selected,
    setSelected,
    query,
    setQuery,
    removing,
    setRemoving,
    tab,
    progressView,
    records,
    page,
    visibleRecords,
    artwork,
    selectedRecords,
    pendingEdits,
    moving,
    moveError,
    queuePositions,
    rankedIds,
    pageBoundary,
    resultsHeading,
    queueResults,
    canReorder,
    move,
    changePage,
    requestRemoval,
    removeFromQueue,
    removeRecords,
    filtered,
    firstRunEmpty,
    clearView,
    toggleSelected,
    bulkAction,
    completedCount,
  };
}

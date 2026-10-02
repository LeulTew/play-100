/* eslint react-hooks/set-state-in-effect: "error" */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import type { RankingsPageProps, RankingViewState } from './RankingsPage';
import { searchText } from '../../lib/collection';
import { matchesProgress } from '../../lib/game-progress';
import { flushPendingEdits, hasPendingEdits, usePendingEdits } from '../../hooks/useExitSave';
import { useLibraryMode } from '../../lib/library-mode';
import { useNavigationScope } from '../../hooks/useNavigationScope';
import { useDiscoveryArtwork } from '../../hooks/useDiscoveryCatalog';
import { focusPendingEditor } from '../../lib/dialog-focus';
import { getLocalPage } from '../../lib/local-pagination';
import { useRetainedRecords } from './useRetainedRecords';
import { focusMovedRecord } from './reorder-focus';
import type { MoveDirection } from './reorder-focus';

export const RANKING_PAGE_SIZE = 25;

export function useRankingsPage({
  state,
  busy,
  onAction,
  active = true,
  completedOnly = false,
  progressFilter,
  viewState,
  onViewStateChange,
}: RankingsPageProps) {
  const mode = useLibraryMode();
  const [arrivalId, setArrivalId] = useState(() =>
    typeof location === 'undefined' ? null : new URLSearchParams(location.hash.slice(1)).get('rank'),
  );
  const [localView, setLocalView] = useState<RankingViewState>({ searchInput: '', query: '', offset: 0 });
  const view = viewState ?? localView;
  const { searchInput, query } = view;
  const latestView = useRef(view);
  useLayoutEffect(() => {
    latestView.current = view;
  }, [view]);
  const updateView = useCallback(
    (patch: Partial<RankingViewState>) => {
      const next = { ...latestView.current, ...patch };
      latestView.current = next;
      if (onViewStateChange) onViewStateChange(next);
      else setLocalView(next);
    },
    [onViewStateChange],
  );
  const mounted = useRef(true);
  const current = useRef({ active, state });
  useLayoutEffect(() => {
    current.current = { active, state };
  }, [active, state]);
  const { captureFocusGuard } = useNavigationScope(mode.scope);
  const [changing, setChanging] = useState(false);
  const command = useRef(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<{ target: HTMLElement | null; isCurrent: () => boolean } | null>(null);
  const recovered = useRef<typeof recovery>(null);
  const [followMove, setFollowMove] = useState<{
    id: string;
    position: number | null;
    manualBefore: number | null;
    offset: number;
    revision: number;
    direction?: MoveDirection;
    origin: Element | null;
    isCurrent: () => boolean;
  } | null>(null);
  const followedMove = useRef<typeof followMove>(null);
  const results = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterPage = useRef(false);
  const wasActive = useRef(active);
  const [searchHeld, setSearchHeld] = useState(searchInput !== query);
  const searchRequest = useRef(0);
  const pendingEdits = usePendingEdits();
  const search = (value: string) => {
    const request = ++searchRequest.current;
    updateView({ searchInput: value });
    if (!hasPendingEdits()) {
      updateView({ query: value, offset: 0 });
      setSearchHeld(false);
      return;
    }
    const isCurrent = captureFocusGuard();
    flushPendingEdits().then(
      (saved) => {
        if (!mounted.current || !current.current.active || !isCurrent() || request !== searchRequest.current) return;
        if (saved) updateView({ query: value, offset: 0 });
        setSearchHeld(!saved);
      },
      (cause: unknown) => {
        console.error(
          'Ranking search could not save a pending edit.',
          cause instanceof Error ? cause.message : 'Unknown editor failure.',
        );
        if (mounted.current && isCurrent() && request === searchRequest.current) setSearchHeld(true);
      },
    );
  };
  const showFullRanking = () => {
    searchRequest.current += 1;
    updateView({ searchInput: '', query: '', offset: 0 });
    setSearchHeld(false);
  };
  useEffect(() => {
    if (active && searchHeld && !pendingEdits) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- A previously blocked search resumes only after the external editor registry reports its save committed.
      setSearchHeld(false);
      updateView({ query: searchInput, offset: 0 });
    }
  }, [active, searchHeld, pendingEdits, searchInput, updateView]);
  const [removal, setRemoval] = useState<{
    record: LibraryRecord;
    scope: string;
    getFallbackFocus: () => HTMLElement | null;
  } | null>(null);
  const progressView = progressFilter ?? (completedOnly ? 'completed' : 'all');
  const rankingById = useMemo(
    () => new Map(state.ranking.map((entry, index) => [entry.id, { entry, position: index + 1 }])),
    [state.ranking],
  );
  const rankedIds = useMemo(() => new Set(state.ranking.map((entry) => entry.id)), [state.ranking]);
  const records = useMemo(() => {
    const term = searchText(query);
    return state.ranking.flatMap((entry) => {
      const record = state.records[entry.id];
      if (
        !record ||
        !matchesProgress(state.progress[entry.id], progressView) ||
        !searchText(record.title).includes(term)
      )
        return [];
      return [record];
    });
  }, [state, query, progressView]);
  const arrivalIndex = arrivalId ? records.findIndex((record) => record.id === arrivalId) : -1;
  const page = getLocalPage(
    records.length,
    RANKING_PAGE_SIZE,
    arrivalIndex < 0 ? view.offset : Math.floor(arrivalIndex / RANKING_PAGE_SIZE) * RANKING_PAGE_SIZE,
  );
  const priorProgress = useRef(progressView);
  const pageRecords = useMemo(
    () => records.slice(page.offset, page.offset + RANKING_PAGE_SIZE),
    [records, page.offset],
  );
  const visibleRecords = useRetainedRecords(pageRecords, pendingEdits);
  const artwork = useDiscoveryArtwork(visibleRecords, active);
  useEffect(() => {
    if (!active || busy || pendingEdits || !arrivalId || arrivalIndex < 0) return;
    const isCurrent = captureFocusGuard();
    const frame = requestAnimationFrame(() => {
      if (!isCurrent()) return;
      const title = results.current?.querySelector<HTMLElement>(
        `[data-record-id="${CSS.escape(arrivalId)}"] .record-title`,
      );
      if (!title) return;
      title.focus({ preventScroll: true });
      title.scrollIntoView({ block: 'center', behavior: 'instant' });
      updateView({ offset: page.offset });
      setArrivalId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, busy, pendingEdits, arrivalId, arrivalIndex, page.offset, captureFocusGuard, updateView]);
  useEffect(() => {
    if (!active || pendingEdits) return;
    const offset = priorProgress.current !== progressView ? 0 : page.offset;
    priorProgress.current = progressView;
    if (view.offset !== offset) updateView({ offset });
  }, [active, pendingEdits, progressView, page.offset, view.offset, updateView]);
  useLayoutEffect(() => {
    if (active && !wasActive.current && pendingEdits) {
      focusPendingEditor(results.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? null);
    }
    wasActive.current = active;
  }, [active, pendingEdits]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchRequest.current += 1;
    };
  }, []);
  useLayoutEffect(() => {
    if (busy || changing || !recovery || recovered.current === recovery) return;
    if (recovery.isCurrent()) focusPendingEditor(recovery.target);
    recovered.current = recovery;
  }, [busy, changing, recovery]);
  useLayoutEffect(() => {
    if (!active || busy || changing || pendingEdits) return;
    if (followMove && followedMove.current !== followMove) {
      if (!followMove.isCurrent()) {
        followedMove.current = followMove;
        return;
      }
      const moved = rankingById.get(followMove.id);
      if (state.revision <= followMove.revision || !moved) return;
      if (
        followMove.position === null
          ? moved.entry.manualPosition === followMove.manualBefore
          : moved.entry.manualPosition !== followMove.position
      )
        return;
      const offset = Math.floor((moved.position - 1) / RANKING_PAGE_SIZE) * RANKING_PAGE_SIZE;
      const focus = followMove.position !== null ? 'position' : followMove.direction;
      if (offset === followMove.offset) {
        if (focus) focusMovedRecord(results.current, followMove.id, focus, followMove.origin);
        followedMove.current = followMove;
        return;
      }
      if (page.offset !== offset) {
        updateView({ offset });
        return;
      }
      if (!focusMovedRecord(results.current, followMove.id, focus, followMove.origin)) return;
      followedMove.current = followMove;
    } else if (focusAfterPage.current) {
      focusAfterPage.current = false;
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [active, busy, changing, followMove, state.revision, rankingById, page.offset, pendingEdits, updateView]);
  const change = async (work: (isCurrent: () => boolean) => Promise<boolean> | boolean, allowWhileBusy = false) => {
    if (!active || (busy && !allowWhileBusy) || command.current) return false;
    const scopeAndNavigation = captureFocusGuard();
    const inputAtStart = latestView.current.searchInput;
    const searchAtStart = searchRequest.current;
    const isCurrent = () =>
      mounted.current &&
      current.current.active &&
      scopeAndNavigation() &&
      searchRequest.current === searchAtStart &&
      latestView.current.searchInput === inputAtStart;
    command.current = true;
    setChanging(true);
    setError('');
    setRecovery(null);
    try {
      const saved = await flushPendingEdits((target) => {
        if (isCurrent()) setRecovery({ target, isCurrent });
      });
      if (!isCurrent()) return false;
      if (!saved) {
        setError('Your edit has not saved. Correct the highlighted field or retry before changing this ranking.');
        return false;
      }
      return await work(isCurrent);
    } catch (cause) {
      console.error('The Ranking change could not finish.', cause);
      if (isCurrent()) setError('The ranking could not be changed. Your current view is still open; retry.');
      return false;
    } finally {
      command.current = false;
      if (mounted.current) setChanging(false);
    }
  };
  const changePage = (offset: number) => {
    // A pager click can follow blur's save; the flush owns that already-started write.
    void change(() => {
      updateView({ offset: getLocalPage(records.length, RANKING_PAGE_SIZE, offset).offset });
      focusAfterPage.current = true;
      return true;
    }, true);
  };
  const move = (id: string, destination: string | number, direction?: MoveDirection) => {
    const origin = document.activeElement;
    return change(async (isCurrent) => {
      const ranking = current.current.state.ranking;
      const from = ranking.findIndex((entry) => entry.id === id);
      const to =
        typeof destination === 'number' ? destination - 1 : ranking.findIndex((entry) => entry.id === destination);
      const target = ranking[to];
      if (from < 0 || !target || !Number.isInteger(to)) {
        setError('That ranking position is no longer available. Choose a current position and retry.');
        return false;
      }
      if (from === to && typeof destination !== 'number') return true;
      const revision = current.current.state.revision;
      const saved = await onAction(
        typeof destination === 'number'
          ? { type: 'move-item', list: 'ranking', id, position: destination }
          : { type: 'move-item', list: 'ranking', id, overId: target.id },
      );
      if (!isCurrent()) return false;
      if (!saved) {
        setError('The position could not be saved. Your ranking has not moved; retry.');
        if (typeof destination === 'number' && origin instanceof HTMLElement) {
          setRecovery({
            target: origin,
            isCurrent: () =>
              isCurrent() && (document.activeElement === origin || document.activeElement === document.body),
          });
        }
        return false;
      }
      setFollowMove({
        id,
        position: typeof destination === 'number' ? destination : null,
        manualBefore: ranking[from]?.manualPosition ?? null,
        offset: page.offset,
        revision,
        direction,
        origin,
        isCurrent,
      });
      return true;
    });
  };
  const applyRatingOrder = (id?: string) => {
    void change(async (isCurrent) => {
      const saved = await onAction(id ? { type: 'use-rating-order', id } : { type: 'use-rating-order' });
      if (isCurrent() && !saved) setError('Rating order could not be saved. Your current order is unchanged; retry.');
      return saved;
    });
  };
  const editorBusy = busy || changing;
  const canReorder = !query && !searchInput && progressView === 'all';
  const manualCount = state.ranking.filter((entry) => entry.manualPosition !== null).length;
  const removalCurrent =
    removal !== null &&
    active &&
    removal.scope === mode.scope &&
    state.records[removal.record.id]?.title === removal.record.title &&
    rankedIds.has(removal.record.id);
  if (removal && !removalCurrent) setRemoval(null);
  return {
    mode,
    view,
    searchInput,
    updateView,
    changing,
    error,
    searchHeld,
    search,
    showFullRanking,
    removal,
    setRemoval,
    rankingById,
    rankedIds,
    records,
    page,
    visibleRecords,
    artwork,
    results,
    heading,
    changePage,
    move,
    applyRatingOrder,
    editorBusy,
    canReorder,
    manualCount,
    removalCurrent,
  };
}

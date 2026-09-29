import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { useCollection } from './useCollection';
import type { Filters } from '../lib/types';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../lib/personal-types';
import { recordFromGame } from '../lib/personal-types';
import { filterGames } from '../lib/collection';
import { createSearch } from '../lib/url';
import { useExtendedSearch } from './useExtendedSearch';
import { filterUnranked, unrankedRecords } from '../lib/extended-search';
import { collectionExtrasModule } from '../lib/collection-extras-preload';
import { effectiveProgressFilter, pickCandidates, selectionOperation } from '../lib/game-progress';
import { catalogActionRecord, catalogOwnership, catalogProgress } from '../lib/catalog-identity';
import { useStableHandler } from './useLatest';
import type { MotionOriginHint } from '../motion';
import type { SelectionAction } from '../components/SelectionBar';
import { scrollCollectionIntoView } from '../components/collection-landing';

export const PAGE_SIZE = 24;

interface CollectionViewOptions {
  collection: ReturnType<typeof useCollection>;
  state: PersonalLibraryState;
  filters: Filters;
  animate: boolean;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onOpen: (id: string, origin?: MotionOriginHint) => void;
  onPreview: (record: LibraryRecord, origin?: MotionOriginHint) => void;
  notify: (message: string) => void;
}

type ProgressKey = 'later' | 'completed' | 'played';

export function useCollectionView({
  collection,
  state,
  filters,
  animate,
  onAction,
  onOpen,
  onPreview,
  notify,
}: CollectionViewOptions) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [browseRequest, setBrowseRequest] = useState(0);
  const handledBrowseRequest = useRef(0);
  const collectionRef = useRef<HTMLElement>(null);
  const appendedFocus = useRef<{ id: string; signature: string; trigger: HTMLButtonElement } | null>(null);
  const [extrasReady, setExtrasReady] = useState(() => collectionExtrasModule.peek() !== null);
  const markExtrasReady = useCallback(() => setExtrasReady(true), []);
  const games = collection.data?.games;
  const ownership = useMemo(() => catalogOwnership(state.records), [state.records]);
  const progress = useMemo(() => catalogProgress(state, ownership), [state, ownership]);
  const onlineScope = filters.tier === 'all' && filters.list !== 'later' && effectiveProgressFilter(filters) === 'all';
  const online = useExtendedSearch(filters.q, Boolean(games) && onlineScope && filters.catalogs === 'on', games ?? []);
  const onlineIds = useMemo(() => new Set(online.records.map((record) => record.id)), [online.records]);
  const results = useMemo(
    () => filterGames(games ?? [], filters, progress, onlineIds),
    [games, filters, progress, onlineIds],
  );
  const extras = useMemo(
    () => unrankedRecords(games ?? [], state.records, online.records),
    [games, state.records, online.records],
  );
  const extraResults = useMemo(
    () => filterUnranked(extras, filters, state.progress, onlineIds),
    [extras, filters, state.progress, onlineIds],
  );
  const resultRecords = useMemo(() => [...results.map(recordFromGame), ...extraResults], [results, extraResults]);
  const currentSelection = useMemo(
    () => new Set(resultRecords.filter((record) => selected.has(record.id)).map((record) => record.id)),
    [resultRecords, selected],
  );
  const showExtended = extraResults.length > 0 || online.eligible;
  const additions = useMemo(() => unrankedRecords(games ?? [], state.records, []), [games, state.records]);
  const signature = createSearch(filters);
  // A new view starts at its first page with nothing selected.
  const [viewSignature, setViewSignature] = useState(signature);
  if (viewSignature !== signature) {
    setViewSignature(signature);
    setVisibleCount(PAGE_SIZE);
    setSelected(new Set());
  }
  useLayoutEffect(() => {
    const requested = appendedFocus.current;
    if (!requested) return;
    if (
      requested.signature !== signature ||
      (document.activeElement !== requested.trigger && document.activeElement !== document.body)
    ) {
      appendedFocus.current = null;
      return;
    }
    const title = collectionRef.current?.querySelector<HTMLAnchorElement>(
      `[data-game="${CSS.escape(requested.id)}"] ${filters.view === 'table' ? '.table-game a' : '.game-link'}`,
    );
    // The table's placeholder rows carry no data-game: keep the request until the loaded table commits.
    if (!title) return;
    appendedFocus.current = null;
    title.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    title.focus({ preventScroll: true });
  }, [visibleCount, signature, filters.view, extrasReady]);
  useEffect(() => {
    if (collection.status === 'loading' || location.hash !== '#collection-films') return;
    const frame = requestAnimationFrame(() => {
      document.getElementById('collection-films')?.scrollIntoView({ behavior: 'instant' });
      document.getElementById('collection-films-title')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [collection.status]);
  const { savedCount, completedCount } = useMemo(
    () => ({
      savedCount: Object.values(state.progress).filter((progress) => progress.later).length,
      completedCount: Object.values(state.progress).filter((progress) => progress.completed).length,
    }),
    [state.progress],
  );
  useLayoutEffect(() => {
    if (browseRequest === handledBrowseRequest.current) return;
    handledBrowseRequest.current = browseRequest;
    scrollCollectionIntoView(animate ? 'smooth' : 'instant');
  }, [browseRequest, animate]);
  const browse = () => setBrowseRequest((request) => request + 1);
  const toggle = useStableHandler((id: string, key: ProgressKey, value?: boolean) => {
    const game = games?.find((candidate) => candidate.slug === id);
    if (game) {
      const record = catalogActionRecord(recordFromGame(game), ownership);
      void onAction(
        value === undefined
          ? { type: 'toggle-progress', record, key }
          : { type: 'set-progress', records: [record], key, value },
      );
    }
  });
  const toggleSelection = useCallback(
    (id: string) =>
      setSelected((prior) => {
        const next = new Set(prior);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const bulk = async (action: SelectionAction) => {
    const records = resultRecords
      .filter((record) => currentSelection.has(record.id))
      .map((record) => catalogActionRecord(record, ownership));
    if (!records.length) {
      notify('Select a matching game before applying a bulk action.');
      return;
    }
    const change = selectionOperation(action, records);
    if (await onAction(change)) setSelected(new Set());
  };
  const pick = () => {
    const candidates = pickCandidates(resultRecords, progress, filters);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    if (chosen && chosen.collectionRank !== null) onOpen(chosen.id);
    else if (chosen) onPreview(chosen);
    else
      notify(
        resultRecords.length
          ? 'You have completed every game in this view. Change a filter to discover more.'
          : 'No loaded games match this view. Reset filters for a fresh pick.',
      );
  };
  return {
    visibleCount,
    setVisibleCount,
    selecting,
    setSelecting,
    selected,
    setSelected,
    collectionRef,
    appendedFocus,
    markExtrasReady,
    games,
    ownership,
    progress,
    onlineScope,
    online,
    results,
    extras,
    extraResults,
    resultRecords,
    currentSelection,
    showExtended,
    additions,
    signature,
    savedCount,
    completedCount,
    browse,
    toggle,
    toggleSelection,
    bulk,
    pick,
  };
}

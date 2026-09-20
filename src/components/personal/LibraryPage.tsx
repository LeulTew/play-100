import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Filters } from '../../lib/types';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { searchText } from '../../lib/collection';
import { Icon } from '../Icon';
import { SelectionBar } from '../SelectionBar';
import type { SelectionAction } from '../SelectionBar';
import { RecordIdentity } from './RecordIdentity';
import ReorderList from './ReorderList';
import ManualGameForm from './ManualGameForm';
import { PlayedToggle } from '../PlayedToggle';
import { CompletedToggle } from '../CompletedToggle';
import { effectiveProgressFilter, matchesProgress, progressFilterPatch, selectionOperation } from '../../lib/game-progress';
import type { ProgressFilter } from '../../lib/game-progress';
import { RemoveGamesDialog } from './RemoveGamesDialog';
import { LocalPager } from '../LocalPager';
import { getLocalPage } from '../../lib/local-pagination';
import './library-pagination.css';

const LIBRARY_PAGE_SIZE = 25;

export interface LibraryPageProps {
  state: PersonalLibraryState;
  filters: Filters;
  busy: boolean;
  animate: boolean;
  onFilters: (patch: Partial<Filters>, method?: 'push' | 'replace') => void;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onOpen: (id: string) => void;
  onDiscover: () => void;
  onBrowse: () => void;
  onPresentationChange: (commit: () => void) => Promise<boolean>;
  embedded?: boolean;
  active?: boolean;
  workspaceView?: 'library' | 'queue';
  completedOnly?: boolean;
  progressFilter?: ProgressFilter;
  onPin?: (record: LibraryRecord) => void;
  onUnpin?: (id: string) => void;
  pinnedIds?: ReadonlySet<string>;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
}

export default function LibraryPage({ state, filters, busy, animate, onFilters, onAction, onOpen, onDiscover, onBrowse, onPresentationChange, embedded = false, active = true, workspaceView, completedOnly = false, progressFilter, onPin, onUnpin, pinnedIds, renderDragHandle }: LibraryPageProps) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<LibraryRecord[]>([]);
  const [requestedPage, setRequestedPage] = useState({ definition: '', offset: 0 });
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const removalTrigger = useRef<HTMLElement | null>(null);
  const removalFocus = useRef<{ trigger: HTMLElement | null; generation: number } | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const queuePositions = useMemo(() => new Map(state.queueOrder.map((id, index) => [id, index + 1])), [state.queueOrder]);
  const rankedIds = useMemo(() => new Set(state.ranking.map((entry) => entry.id)), [state.ranking]);
  const tab = workspaceView ? workspaceView === 'queue' ? 'later' : completedOnly ? 'completed' : 'all' : filters.list === 'completed' ? 'completed' : filters.list === 'later' ? 'later' : 'all';
  const progressView = progressFilter ?? (completedOnly ? 'completed' : effectiveProgressFilter(filters));
  const records = useMemo(() => {
    const ordered = tab === 'later' ? state.queueOrder.flatMap((id) => state.records[id] ? [state.records[id]] : []) : Object.values(state.records).sort((a, b) => a.title.localeCompare(b.title));
    const term = searchText(query);
    return ordered.filter((record) => matchesProgress(state.progress[record.id], progressView) && searchText(record.title).includes(term));
  }, [state, tab, query, progressView]);
  const definition = JSON.stringify([tab, query, progressView]);
  const current = useRef({ active, definition, total: records.length });
  if (current.current.active !== active || current.current.definition !== definition) generation.current += 1;
  current.current = { active, definition, total: records.length };
  const page = getLocalPage(records.length, LIBRARY_PAGE_SIZE, requestedPage.definition === definition ? requestedPage.offset : 0);
  const visibleRecords = tab === 'later' ? records : records.slice(page.offset, page.offset + LIBRARY_PAGE_SIZE);
  const selectedRecords = records.filter((record) => selected.has(record.id));
  useEffect(() => { setSelected(new Set()); }, [tab, query, progressView, active]);
  useEffect(() => { setQuery(''); }, [tab]);
  useEffect(() => {
    setRequestedPage(prior => prior.definition === definition && prior.offset === page.offset ? prior : { definition, offset: page.offset });
  }, [definition, page.offset]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  useEffect(() => {
    if (!active) { setRemoving([]); removalFocus.current = null; }
  }, [active]);
  const focusResults = () => {
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  useEffect(() => {
    if (removing.length) return;
    const requested = removalFocus.current;
    removalFocus.current = null;
    if (requested && active && requested.generation === generation.current && !requested.trigger?.isConnected) focusResults();
  }, [removing.length, active]);
  const changePage = (offset: number) => {
    if (busy || !active || tab === 'later') return;
    const next = getLocalPage(records.length, LIBRARY_PAGE_SIZE, offset);
    if (next.offset === page.offset) return;
    const request = generation.current;
    void onPresentationChange(() => {
      if (!mounted.current || !current.current.active || generation.current !== request) return;
      const bounded = getLocalPage(current.current.total, LIBRARY_PAGE_SIZE, offset);
      setRequestedPage({ definition: current.current.definition, offset: bounded.offset });
      focusResults();
    });
  };
  const requestRemoval = (chosen: LibraryRecord[], trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null) => {
    removalTrigger.current = trigger;
    setRemoving(chosen);
  };
  const canReorder = tab === 'later' && !query && !selecting && progressView === 'all';
  const filtered = Boolean(query || progressView !== 'all');
  const clearView = () => { setQuery(''); onFilters(progressFilterPatch('all', filters)); };
  const toggleSelected = (id: string) => setSelected((prior) => { const next = new Set(prior); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const bulkAction = async (action: SelectionAction) => {
    const chosen = records.filter((record) => selected.has(record.id));
    const operation = selectionOperation(action, chosen);
    if (await onAction(operation)) setSelected(new Set());
  };
  const completedCount = Object.values(state.progress).filter((value) => value.completed).length;
  const renderRecord = (record: LibraryRecord) => <div className="library-row-content">
    {selecting && <label className="select-control"><input type="checkbox" checked={selected.has(record.id)} onChange={() => toggleSelected(record.id)} aria-label={`Select ${record.title}`} /></label>}
    <RecordIdentity record={record} onOpen={onOpen} />
    <div className="record-actions">
      {onPin && <button className="icon-button" disabled={pinnedIds?.has(record.id) && !onUnpin} aria-pressed={pinnedIds?.has(record.id) ?? false} aria-label={`${pinnedIds?.has(record.id) ? 'Unpin' : 'Pin'} ${record.title} ${pinnedIds?.has(record.id) ? 'from' : 'for'} comparison`} title="Compare tray" onClick={() => { if (pinnedIds?.has(record.id)) onUnpin?.(record.id); else onPin(record); }}><Icon name="stack" width="19" height="19" /></button>}
      {renderDragHandle?.(record)}
      <PlayedToggle id={record.id} title={record.title} played={Boolean(state.progress[record.id]?.played)} completed={state.progress[record.id]?.completed} busy={busy} compact onChange={value => { void onAction({ type: 'set-progress', records: [record], key: 'played', value }); }} />
      <CompletedToggle title={record.title} completed={Boolean(state.progress[record.id]?.completed)} busy={busy} onChange={value => { void onAction({ type: 'set-progress', records: [record], key: 'completed', value }); }} />
      <button className="icon-button" disabled={busy} aria-pressed={Boolean(state.progress[record.id]?.later)} aria-label={`${state.progress[record.id]?.later ? 'Remove' : 'Add'} ${record.title} ${state.progress[record.id]?.later ? 'from' : 'to'} play later`} onClick={() => { void onAction({ type: 'toggle-progress', record, key: 'later' }); }}><Icon name="bookmark" width="19" height="19" /></button>
      <button className="icon-button" disabled={busy || rankedIds.has(record.id)} aria-label={`Add ${record.title} to my ranking`} onClick={() => { void onAction({ type: 'add-ranking', records: [record] }); }}><Icon name="rank" width="20" height="20" /></button>
      <button className="icon-button remove-library-action" disabled={busy} aria-label={`Remove ${record.title} from my library`} title="Remove from my library" onClick={event => requestRemoval([record], event.currentTarget)}><Icon name="trash" width="19" height="19" /></button>
    </div>
    <span className={`play-state ${state.progress[record.id]?.completed ? 'state-completed' : ''}`}>{state.progress[record.id]?.completed ? 'Completed' : state.progress[record.id]?.played ? 'Played, not completed' : 'Not played'}</span>
  </div>;
  return (
    <section className={embedded ? 'my-games-editor' : 'app-page'} aria-labelledby="library-title">
      {embedded ? <h2 id="library-title" className="sr-only">{workspaceView === 'queue' ? 'Queue' : 'Library'}</h2> : <div className="page-heading"><div><h1 id="library-title" tabIndex={-1} data-page-heading>My library</h1></div><button className="button button-dark" onClick={onDiscover}><Icon name="plus" width="18" height="18" />Find more games</button></div>}
      {!embedded && <div className="personal-tabs" aria-label="Personal library views">
        <button aria-pressed={tab === 'later'} onClick={() => onFilters({ list: 'later', q: '' })}>Play later<span>{state.queueOrder.length}</span></button>
        <button aria-pressed={tab === 'completed'} onClick={() => onFilters({ list: 'completed', q: '' })}>Completed<span>{completedCount}</span></button>
        <button aria-pressed={tab === 'all'} onClick={() => onFilters({ list: 'all', q: '' })}>All my games<span>{Object.keys(state.records).length}</span></button>
      </div>}
      <div className="personal-tools"><div className="search-field"><Icon name="search" /><label className="sr-only" htmlFor="library-search">Search your library</label><input id="library-search" type="search" placeholder="Find a game in your library" value={query} maxLength={160} onChange={(event) => setQuery(event.target.value)} /></div><button className="button button-outline" aria-pressed={selecting} onClick={() => { setSelecting((value) => !value); setSelected(new Set()); }}><Icon name="select" width="18" height="18" />{selecting ? 'Exit selection' : 'Select games'}</button></div>
      {progressView !== 'all' && <p className="section-help" role="status">{records.length} {records.length === 1 ? 'game matches' : 'games match'} this progress view. <button className="text-button" onClick={() => onFilters(progressFilterPatch('all', filters))}>Clear progress filter</button></p>}
      {tab === 'later' && <p className="queue-instructions">{canReorder ? 'Drag or use arrows to reorder. Completed games can stay here for a replay.' : 'Clear search, progress filters and selection to reorder.'}</p>}
      {selecting && <SelectionBar context="library" count={selectedRecords.length} total={records.length} busy={busy} selectAllLabel={tab !== 'later' ? `Select all ${records.length} matching games${page.pageCount > 1 ? ` (all ${page.pageCount} pages)` : ''}` : undefined} selectionHelp={tab !== 'later' ? 'Selection includes matching games on other pages. Changing filters or tabs clears it.' : undefined} onSelectAll={() => setSelected(new Set(records.map((record) => record.id)))} onClear={() => setSelected(new Set())} onDone={() => { setSelecting(false); setSelected(new Set()); }} onAction={(action) => { void bulkAction(action); }} onRemove={() => requestRemoval(selectedRecords)} />}
      {tab !== 'later' && <div className="library-results-boundary">
        <h3 ref={resultsHeading} tabIndex={-1}>Your library results</h3>
        <span className="sr-only" role="status" aria-atomic="true">Showing {page.start}-{page.end} of {records.length} matching games</span>
        <LocalPager total={records.length} pageSize={LIBRARY_PAGE_SIZE} offset={page.offset} disabled={busy} label="Library pages" itemLabel="matching games" onOffsetChange={changePage} />
      </div>}
      {records.length ? tab === 'later' ? <ReorderList records={records} kind="queue" canReorder={canReorder} busy={busy} animate={animate} positionFor={(id) => queuePositions.get(id) ?? null} onMove={(id, overId) => { void onAction({ type: 'move-item', list: 'queue', id, overId }); }}>{renderRecord}</ReorderList> : <ul className="personal-records" aria-label="Your games">{visibleRecords.map((record) => <li key={record.id} className="personal-row personal-row-static" data-record-id={record.id}><div className="record-content">{renderRecord(record)}</div></li>)}</ul> : <div className="empty-state"><Icon name={tab === 'completed' ? 'check' : 'bookmark'} width="42" height="42" /><h2>{filtered ? 'No matches' : tab === 'later' ? 'Queue empty' : 'No games yet'}</h2><p>{filtered ? 'Try another progress filter or clear your search. Your saved games are unchanged.' : tab === 'later' ? 'Choose Play later on a game to add it here.' : 'Add games from the 100, Discover or the form below.'}</p><div className="button-row"><button className="button button-dark" onClick={filtered ? clearView : onBrowse}>{filtered ? 'Clear search and progress filter' : 'Choose from the 100'}</button><button className="button button-outline" onClick={onDiscover}>Discover more games</button></div></div>}
      <ManualGameForm busy={busy} actionLabel={tab === 'later' ? 'Add to my play queue' : 'Add to my library'} onAdd={(record) => onAction(tab === 'later' ? { type: 'set-progress', records: [record], key: 'later', value: true } : { type: 'add-records', records: [record] })} />
      {removing.length > 0 && <RemoveGamesDialog records={removing} state={state} busy={busy} onClose={() => setRemoving([])} onRemove={async (ids) => {
        const request = generation.current;
        const success = await onAction({ type: 'remove-records', ids });
        if (success && mounted.current) {
          const removed = new Set(ids);
          setSelected((prior) => new Set([...prior].filter((id) => !removed.has(id))));
          if (tab !== 'later' && current.current.active && request === generation.current) {
            removalFocus.current = { trigger: removalTrigger.current, generation: request };
          }
        }
        return success;
      }} />}
    </section>
  );
}

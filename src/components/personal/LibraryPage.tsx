import { useEffect, useMemo, useState } from 'react';
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
import { RemoveGamesDialog } from './RemoveGamesDialog';

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
  embedded?: boolean;
  workspaceView?: 'library' | 'queue';
  completedOnly?: boolean;
  onPin?: (record: LibraryRecord) => void;
  onUnpin?: (id: string) => void;
  pinnedIds?: ReadonlySet<string>;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
}

export default function LibraryPage({ state, filters, busy, animate, onFilters, onAction, onOpen, onDiscover, onBrowse, embedded = false, workspaceView, completedOnly = false, onPin, onUnpin, pinnedIds, renderDragHandle }: LibraryPageProps) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<LibraryRecord[]>([]);
  const queuePositions = useMemo(() => new Map(state.queueOrder.map((id, index) => [id, index + 1])), [state.queueOrder]);
  const rankedIds = useMemo(() => new Set(state.ranking.map((entry) => entry.id)), [state.ranking]);
  const tab = workspaceView ? workspaceView === 'queue' ? 'later' : completedOnly ? 'completed' : 'all' : filters.list === 'completed' ? 'completed' : filters.list === 'later' ? 'later' : 'all';
  const records = useMemo(() => {
    const ordered = tab === 'later' ? state.queueOrder.flatMap((id) => state.records[id] ? [state.records[id]] : []) : Object.values(state.records).sort((a, b) => a.title.localeCompare(b.title));
    const term = searchText(query);
    return ordered.filter((record) => (!(tab === 'completed' || completedOnly) || state.progress[record.id]?.completed) && searchText(record.title).includes(term));
  }, [state, tab, query, completedOnly]);
  const selectedRecords = records.filter((record) => selected.has(record.id));
  useEffect(() => { setSelected(new Set()); }, [tab, query, completedOnly]);
  useEffect(() => { setQuery(''); }, [tab]);
  const canReorder = tab === 'later' && !query && !selecting && !completedOnly;
  const toggleSelected = (id: string) => setSelected((prior) => { const next = new Set(prior); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const bulkAction = async (action: SelectionAction) => {
    const chosen = records.filter((record) => selected.has(record.id));
    const operation: PersonalAction = action === 'ranking' ? { type: 'add-ranking', records: chosen } :
      { type: 'set-progress', records: chosen, key: action === 'completed' || action === 'uncomplete' ? 'completed' : 'later', value: action !== 'remove-later' && action !== 'uncomplete' };
    if (await onAction(operation)) setSelected(new Set());
  };
  const completedCount = Object.values(state.progress).filter((value) => value.completed).length;
  const renderRecord = (record: LibraryRecord) => <div className="library-row-content">
    {selecting && <label className="select-control"><input type="checkbox" checked={selected.has(record.id)} onChange={() => toggleSelected(record.id)} aria-label={`Select ${record.title}`} /></label>}
    <RecordIdentity record={record} onOpen={onOpen} />
    <div className="record-actions">
      {onPin && <button className="icon-button" disabled={pinnedIds?.has(record.id) && !onUnpin} aria-pressed={pinnedIds?.has(record.id) ?? false} aria-label={`${pinnedIds?.has(record.id) ? 'Unpin' : 'Pin'} ${record.title} ${pinnedIds?.has(record.id) ? 'from' : 'for'} comparison`} title="Compare tray" onClick={() => { if (pinnedIds?.has(record.id)) onUnpin?.(record.id); else onPin(record); }}><Icon name="stack" width="19" height="19" /></button>}
      {renderDragHandle?.(record)}
      <PlayedToggle id={record.id} title={record.title} played={Boolean(state.progress[record.id]?.played)} completed={state.progress[record.id]?.completed} busy={busy} compact onChange={() => { void onAction({ type: 'toggle-progress', record, key: 'played' }); }} />
      <button className="icon-button" disabled={busy} aria-pressed={Boolean(state.progress[record.id]?.later)} aria-label={`${state.progress[record.id]?.later ? 'Remove' : 'Add'} ${record.title} ${state.progress[record.id]?.later ? 'from' : 'to'} play later`} onClick={() => { void onAction({ type: 'toggle-progress', record, key: 'later' }); }}><Icon name="bookmark" width="19" height="19" /></button>
      <button className="icon-button" disabled={busy} aria-pressed={Boolean(state.progress[record.id]?.completed)} aria-label={`${state.progress[record.id]?.completed ? 'Unmark' : 'Mark'} ${record.title} completed`} onClick={() => { void onAction({ type: 'toggle-progress', record, key: 'completed' }); }}><Icon name="check" width="20" height="20" /></button>
      <button className="icon-button" disabled={busy || rankedIds.has(record.id)} aria-label={`Add ${record.title} to my ranking`} onClick={() => { void onAction({ type: 'add-ranking', records: [record] }); }}><Icon name="rank" width="20" height="20" /></button>
      <button className="icon-button remove-library-action" disabled={busy} aria-label={`Remove ${record.title} from my library`} title="Remove from my library" onClick={() => setRemoving([record])}><Icon name="trash" width="19" height="19" /></button>
    </div>
    <span className={`play-state ${state.progress[record.id]?.completed ? 'state-completed' : ''}`}>{state.progress[record.id]?.completed ? 'Completed' : state.progress[record.id]?.played ? 'Marked played' : 'Not marked played'}</span>
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
      {tab === 'later' && <p className="queue-instructions">{canReorder ? 'Drag or use arrows to reorder. Completed games can stay here for a replay.' : 'Clear search, Completed only and selection to reorder.'}</p>}
      {selecting && <SelectionBar context="library" count={selectedRecords.length} total={records.length} busy={busy} onSelectAll={() => setSelected(new Set(records.map((record) => record.id)))} onClear={() => setSelected(new Set())} onDone={() => { setSelecting(false); setSelected(new Set()); }} onAction={(action) => { void bulkAction(action); }} onRemove={() => setRemoving(selectedRecords)} />}
      {records.length ? tab === 'later' ? <ReorderList records={records} kind="queue" canReorder={canReorder} busy={busy} animate={animate} positionFor={(id) => queuePositions.get(id) ?? null} onMove={(id, overId) => { void onAction({ type: 'move-item', list: 'queue', id, overId }); }}>{renderRecord}</ReorderList> : <ul className="personal-records" aria-label="Your games">{records.map((record) => <li key={record.id} className="personal-row personal-row-static" data-record-id={record.id}><div className="record-content">{renderRecord(record)}</div></li>)}</ul> : <div className="empty-state"><Icon name={tab === 'completed' ? 'check' : 'bookmark'} width="42" height="42" /><h2>{query ? 'No matches' : tab === 'completed' ? 'No completed games' : tab === 'later' ? 'Queue empty' : 'No games yet'}</h2><p>{query ? 'Try a shorter title or clear search.' : tab === 'completed' ? 'Mark games completed as you finish them.' : tab === 'later' ? 'Choose Play later on a game to add it here.' : 'Add games from the 100, Discover or the form below.'}</p><div className="button-row"><button className="button button-dark" onClick={query ? () => setQuery('') : onBrowse}>{query ? 'Clear search' : 'Choose from the 100'}</button><button className="button button-outline" onClick={onDiscover}>Discover more games</button></div></div>}
      <ManualGameForm busy={busy} actionLabel={tab === 'later' ? 'Add to my play queue' : 'Add to my library'} onAdd={(record) => onAction(tab === 'later' ? { type: 'set-progress', records: [record], key: 'later', value: true } : { type: 'add-records', records: [record] })} />
      {removing.length > 0 && <RemoveGamesDialog records={removing} state={state} busy={busy} onClose={() => setRemoving([])} onRemove={async (ids) => {
        const success = await onAction({ type: 'remove-records', ids });
        if (success) {
          const removed = new Set(ids);
          setSelected((prior) => new Set([...prior].filter((id) => !removed.has(id))));
        }
        return success;
      }} />}
    </section>
  );
}

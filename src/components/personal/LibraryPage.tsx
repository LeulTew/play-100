import { useEffect, useMemo, useState } from 'react';
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

interface LibraryPageProps {
  state: PersonalLibraryState;
  filters: Filters;
  busy: boolean;
  animate: boolean;
  onFilters: (patch: Partial<Filters>, method?: 'push' | 'replace') => void;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onOpen: (id: string) => void;
  onDiscover: () => void;
  onBrowse: () => void;
}

export default function LibraryPage({ state, filters, busy, animate, onFilters, onAction, onOpen, onDiscover, onBrowse }: LibraryPageProps) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const queuePositions = useMemo(() => new Map(state.queueOrder.map((id, index) => [id, index + 1])), [state.queueOrder]);
  const rankedIds = useMemo(() => new Set(state.ranking.map((entry) => entry.id)), [state.ranking]);
  const tab = filters.list === 'completed' ? 'completed' : filters.list === 'later' ? 'later' : 'all';
  const records = useMemo(() => {
    const ordered = tab === 'later' ? state.queueOrder.flatMap((id) => state.records[id] ? [state.records[id]] : []) : Object.values(state.records).sort((a, b) => a.title.localeCompare(b.title));
    const term = searchText(query);
    return ordered.filter((record) => (tab !== 'completed' || state.progress[record.id]?.completed) && searchText(record.title).includes(term));
  }, [state, tab, query]);
  useEffect(() => { setSelected(new Set()); }, [tab, query]);
  useEffect(() => { setQuery(''); }, [tab]);
  const canReorder = tab === 'later' && !query && !selecting;
  const toggleSelected = (id: string) => setSelected((prior) => { const next = new Set(prior); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const bulkAction = async (action: SelectionAction) => {
    const chosen = records.filter((record) => selected.has(record.id));
    const operation: PersonalAction = action === 'ranking' ? { type: 'add-ranking', records: chosen } :
      { type: 'set-progress', records: chosen, key: action === 'completed' || action === 'uncomplete' ? 'completed' : 'later', value: action !== 'remove-later' && action !== 'uncomplete' };
    if (await onAction(operation)) setSelected(new Set());
  };
  const completedCount = Object.values(state.progress).filter((value) => value.completed).length;
  return (
    <section className="app-page" aria-labelledby="library-title">
      <div className="page-heading"><div><h1 id="library-title" tabIndex={-1} data-page-heading>YOUR GAMES.<br /><span>YOUR NEXT MOVE.</span></h1><p>Your private library, including games beyond the original 100.</p></div><button className="button button-dark" onClick={onDiscover}><Icon name="plus" width="18" height="18" />Find more games</button></div>
      <div className="personal-tabs" aria-label="Personal library views">
        <button aria-pressed={tab === 'later'} onClick={() => onFilters({ list: 'later', q: '' })}>Play later<span>{state.queueOrder.length}</span></button>
        <button aria-pressed={tab === 'completed'} onClick={() => onFilters({ list: 'completed', q: '' })}>Completed<span>{completedCount}</span></button>
        <button aria-pressed={tab === 'all'} onClick={() => onFilters({ list: 'all', q: '' })}>All my games<span>{Object.keys(state.records).length}</span></button>
      </div>
      <div className="personal-tools"><div className="search-field"><Icon name="search" /><label className="sr-only" htmlFor="library-search">Search your library</label><input id="library-search" type="search" placeholder="Find a game in your library" value={query} maxLength={160} onChange={(event) => setQuery(event.target.value)} /></div><button className="button button-outline" aria-pressed={selecting} onClick={() => { setSelecting((value) => !value); setSelected(new Set()); }}><Icon name="select" width="18" height="18" />{selecting ? 'Exit selection' : 'Select games'}</button></div>
      {tab === 'later' && <p className="queue-instructions">{canReorder ? 'Drag a handle to set your playing order. The arrow buttons work too.' : 'Clear search and exit selection mode to change your playing order.'} Your queue is independent of the author's ranking.</p>}
      {selecting && <SelectionBar context="library" count={selected.size} total={records.length} busy={busy} onSelectAll={() => setSelected(new Set(records.map((record) => record.id)))} onClear={() => setSelected(new Set())} onDone={() => { setSelecting(false); setSelected(new Set()); }} onAction={(action) => { void bulkAction(action); }} />}
      {records.length ? <ReorderList records={records} kind="queue" canReorder={canReorder} busy={busy} animate={animate} positionFor={(id) => tab === 'later' ? queuePositions.get(id) ?? null : null} onMove={(id, overId) => { void onAction({ type: 'move-item', list: 'queue', id, overId }); }}>
        {(record: LibraryRecord) => <div className="library-row-content">
          {selecting && <label className="select-control"><input type="checkbox" checked={selected.has(record.id)} onChange={() => toggleSelected(record.id)} aria-label={`Select ${record.title}`} /></label>}
          <RecordIdentity record={record} onOpen={onOpen} />
          <div className="record-actions">
            <PlayedToggle id={record.id} title={record.title} played={Boolean(state.progress[record.id]?.played)} completed={state.progress[record.id]?.completed} busy={busy} compact onChange={() => { void onAction({ type: 'toggle-progress', record, key: 'played' }); }} />
            <button className="icon-button" disabled={busy} aria-pressed={Boolean(state.progress[record.id]?.later)} aria-label={`${state.progress[record.id]?.later ? 'Remove' : 'Add'} ${record.title} ${state.progress[record.id]?.later ? 'from' : 'to'} play later`} onClick={() => { void onAction({ type: 'toggle-progress', record, key: 'later' }); }}><Icon name="bookmark" width="19" height="19" /></button>
            <button className="icon-button" disabled={busy} aria-pressed={Boolean(state.progress[record.id]?.completed)} aria-label={`${state.progress[record.id]?.completed ? 'Unmark' : 'Mark'} ${record.title} completed`} onClick={() => { void onAction({ type: 'toggle-progress', record, key: 'completed' }); }}><Icon name="check" width="20" height="20" /></button>
            <button className="icon-button" disabled={busy || rankedIds.has(record.id)} aria-label={`Add ${record.title} to my ranking`} onClick={() => { void onAction({ type: 'add-ranking', records: [record] }); }}><Icon name="rank" width="20" height="20" /></button>
          </div>
          <span className={`play-state ${state.progress[record.id]?.completed ? 'state-completed' : ''}`}>{state.progress[record.id]?.completed ? 'Completed' : state.progress[record.id]?.played ? 'Marked played' : 'Not marked played'}</span>
        </div>}
      </ReorderList> : <div className="empty-state"><Icon name={tab === 'completed' ? 'check' : 'bookmark'} width="42" height="42" /><h2>{query ? 'No matching games here.' : tab === 'completed' ? 'Every collection starts somewhere.' : tab === 'later' ? 'Build your next-great-game queue.' : 'Make room for your kind of games.'}</h2><p>{query ? 'Try a shorter title or clear the search.' : 'Choose games from the original 100, discover more from public catalogs, or add your own title. Everything stays on this device.'}</p><div className="button-row"><button className="button button-dark" onClick={query ? () => setQuery('') : onBrowse}>{query ? 'Clear search' : 'Choose from the 100'}</button><button className="button button-outline" onClick={onDiscover}>Discover more games</button></div></div>}
      <ManualGameForm busy={busy} actionLabel={tab === 'later' ? 'Add to my play queue' : 'Add to my library'} onAdd={(record) => onAction(tab === 'later' ? { type: 'set-progress', records: [record], key: 'later', value: true } : { type: 'add-records', records: [record] })} />
    </section>
  );
}

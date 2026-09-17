import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LibraryRecord, PersonalAction, PersonalLibraryState, PersonalRanking } from '../../lib/personal-types';
import { searchText } from '../../lib/collection';
import { Icon } from '../Icon';
import { RecordIdentity } from './RecordIdentity';
import ReorderList from './ReorderList';
import AddGamesPanel from './AddGamesPanel';
import { PlayedToggle } from '../PlayedToggle';
import { PersonalRatingInput } from './PersonalRatingInput';
import { useExitSave } from '../../hooks/useExitSave';
import { useLibraryMode } from '../../lib/library-mode';
import './my-games.css';

export interface RankingsPageProps {
  state: PersonalLibraryState; availableRecords: LibraryRecord[]; busy: boolean; persistent: boolean; animate: boolean;
  onAction: (action: PersonalAction) => Promise<boolean>; onOpen: (id: string) => void; onDiscover: () => void;
  onPublish?: () => void;
  embedded?: boolean;
  completedOnly?: boolean;
  onPin?: (record: LibraryRecord) => void;
  onUnpin?: (id: string) => void;
  pinnedIds?: ReadonlySet<string>;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
}

export default function RankingsPage({ state, availableRecords, busy, persistent, animate, onAction, onOpen, onDiscover, onPublish, embedded = false, completedOnly = false, onPin, onUnpin, pinnedIds, renderDragHandle }: RankingsPageProps) {
  const mode = useLibraryMode();
  const [query, setQuery] = useState('');
  const [playedOnly, setPlayedOnly] = useState(false);
  const rankingById = useMemo(() => new Map(state.ranking.map((entry, index) => [entry.id, { entry, position: index + 1 }])), [state.ranking]);
  const rankedIds = useMemo(() => new Set(state.ranking.map((entry) => entry.id)), [state.ranking]);
  const records = useMemo(() => {
    const term = searchText(query);
    return state.ranking.flatMap((entry) => {
      const record = state.records[entry.id];
      if (!record || (playedOnly && !state.progress[entry.id]?.played) || (completedOnly && !state.progress[entry.id]?.completed) || !searchText(record.title).includes(term)) return [];
      return [record];
    });
  }, [state, query, playedOnly, completedOnly]);
  const canReorder = !query && !playedOnly && !completedOnly;
  const manualCount = state.ranking.filter((entry) => entry.manualPosition !== null).length;
  return (
    <section className={embedded ? 'my-games-editor' : 'app-page'} aria-labelledby="rankings-title">
      <div className={embedded ? 'my-games-ranking-heading' : 'page-heading'}><div>{embedded ? <h2 id="rankings-title" className="sr-only">Ranking</h2> : <h1 id="rankings-title" data-page-heading tabIndex={-1}>My rankings</h1>}</div><div className="ranking-sharing"><div className="private-label"><Icon name="bookmark" width="17" height="17" />{persistent ? mode.scope === 'guest' ? 'Private · saved on this device' : mode.label : 'Private · temporary tab data'}</div>{onPublish && <button className="text-button" onClick={onPublish}><Icon name="share" width="18" height="18" />Publish a ranking</button>}</div></div>
      <AddGamesPanel records={availableRecords} existingIds={rankedIds} onAdd={(recordsToAdd) => onAction({ type: 'add-ranking', records: recordsToAdd })} onDiscover={onDiscover} busy={busy} />
      {state.ranking.length > 0 && <>
        <div className="ranking-order-info"><p><strong>Games without a fixed position follow scores, highest first.</strong> Unrated comes last, not zero. {manualCount ? `${manualCount} manual ${manualCount === 1 ? 'position stays' : 'positions stay'} fixed until released.` : 'Manual positions stay fixed until released.'} {canReorder ? 'Drag or use arrows to set a position.' : 'Clear search and filters to reorder.'} Scores save automatically. Ranking or rating never marks a game played.</p>{manualCount > 0 && <button className="button button-outline" disabled={busy} onClick={() => { void onAction({ type: 'use-rating-order' }); }}>Use rating order for all</button>}</div>
        <div className="personal-tools"><div className="search-field"><Icon name="search" /><label className="sr-only" htmlFor="ranking-search">Search your ranking</label><input id="ranking-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a game in your ranking" /></div><label className="check-control"><input type="checkbox" checked={playedOnly} onChange={(event) => setPlayedOnly(event.target.checked)} />Only games I've marked played</label></div>
      </>}
      {records.length ? <ReorderList records={records} kind="ranking" canReorder={canReorder} busy={busy} animate={animate} positionFor={(id) => rankingById.get(id)?.position ?? null} onMove={(id, overId) => { void onAction({ type: 'move-item', list: 'ranking', id, overId }); }}>
        {(record) => {
          const entry = rankingById.get(record.id)?.entry;
          if (!entry) return null;
          return <RankingRow key={record.id} record={record} entry={entry} played={Boolean(state.progress[record.id]?.played)} completed={Boolean(state.progress[record.id]?.completed)} busy={busy} onOpen={onOpen} onAction={onAction} onPin={onPin} onUnpin={onUnpin} pinned={pinnedIds?.has(record.id)} renderDragHandle={renderDragHandle} />;
        }}
      </ReorderList> : <div className="empty-state"><Icon name="rank" width="43" height="43" /><h2>{state.ranking.length ? 'No matches' : 'No ranked games yet'}</h2><p>{state.ranking.length ? 'Clear search or turn off the active filters.' : 'Open Add games to start. You can rank games you have not played.'}</p>{state.ranking.length > 0 && <button className="button button-dark" onClick={() => { setQuery(''); setPlayedOnly(false); }}>{completedOnly ? 'Clear ranking search and played filter' : 'Show my full ranking'}</button>}</div>}
      {!persistent && <p className="personal-storage-footnote" role="alert"><strong>Device storage is unavailable.</strong> Export these temporary changes from Settings before closing this tab.</p>}
    </section>
  );
}

function RankingRow({ record, entry, played, completed, busy, onOpen, onAction, onPin, onUnpin, pinned = false, renderDragHandle }: {
  record: LibraryRecord; entry: PersonalRanking; played: boolean; completed: boolean; busy: boolean;
  onOpen: (id: string) => void; onAction: (action: PersonalAction) => Promise<boolean>;
  onPin?: (record: LibraryRecord) => void; onUnpin?: (id: string) => void; pinned?: boolean;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
}) {
  const [note, setNote] = useState(entry.note);
  const [noteError, setNoteError] = useState('');
  const [noteEdited, setNoteEdited] = useState(false);
  const noteSaving = useRef<Promise<boolean> | null>(null);
  const noteEdits = useRef(0);
  const committedNote = useRef(-1);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!noteEdited) setNote(entry.note); }, [entry.note, noteEdited]);
  useEffect(() => {
    if (!noteEdited) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [noteEdited]);
  const saveNote = (): Promise<boolean> => {
    if (noteSaving.current) return noteSaving.current;
    if (!noteEdited || committedNote.current === noteEdits.current) return Promise.resolve(true);
    setNoteError('');
    if (note === entry.note) { committedNote.current = noteEdits.current; setNoteEdited(false); return Promise.resolve(true); }
    const version = noteEdits.current;
    const task = (async () => {
      if (await onAction({ type: 'edit-ranking', id: entry.id, note })) {
        if (version === noteEdits.current) { committedNote.current = version; setNoteEdited(false); }
        return version === noteEdits.current;
      }
      setNoteError('The note could not be saved. Keep this field open to retry or copy your text.');
      return false;
    })();
    noteSaving.current = task;
    void task.finally(() => { if (noteSaving.current === task) noteSaving.current = null; });
    return task;
  };
  useExitSave(() => noteError ? Promise.resolve(false) : saveNote(), noteEdited);
  return (
    <div className="ranking-row-content">
      <div className="ranking-game-identity"><RecordIdentity record={record} onOpen={onOpen} />{(onPin || renderDragHandle) && <div className="ranking-compare-actions">{onPin && <button className="text-button" disabled={pinned && !onUnpin} aria-pressed={pinned} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${record.title} ${pinned ? 'from' : 'for'} comparison`} onClick={() => { if (pinned) onUnpin?.(record.id); else onPin(record); }}><Icon name="stack" width="17" height="17" />{pinned ? 'Pinned for comparison' : 'Pin for comparison'}</button>}{renderDragHandle?.(record)}</div>}</div>
      <PersonalRatingInput title={record.title} value={entry.score} busy={busy} onCommit={(score) => onAction({ type: 'edit-ranking', id: entry.id, score })} />
      <div className="played-check"><PlayedToggle id={record.id} title={record.title} played={played} completed={completed} busy={busy} onChange={() => { void onAction({ type: 'toggle-progress', record, key: 'played' }); }} /></div>
      <button className="icon-button" aria-label={`Remove ${record.title} from my ranking`} disabled={busy} onClick={() => { void onAction({ type: 'remove-ranking', ids: [entry.id] }); }}><Icon name="close" width="18" height="18" /></button>
      {entry.manualPosition !== null && <div className="manual-rank"><span>Fixed at #{entry.manualPosition}</span><button className="text-button" disabled={busy} aria-label={`Use rating order for ${record.title}`} onClick={() => { void onAction({ type: 'use-rating-order', id: entry.id }); }}>Use rating order<Icon name="rank" width="16" height="16" /></button></div>}
      <details className="ranking-note"><summary>{entry.note ? 'Your note' : 'Add a note'}<Icon name="plus" width="15" height="15" /></summary><label htmlFor={`note-${entry.id}`} className="sr-only">Your note for {record.title}</label><textarea ref={noteRef} id={`note-${entry.id}`} rows={3} maxLength={2000} value={note} disabled={busy} aria-invalid={Boolean(noteError)} aria-describedby={noteError ? `note-error-${entry.id}` : undefined} onChange={(event) => { noteEdits.current += 1; setNoteEdited(true); setNoteError(''); setNote(event.target.value); }} onBlur={() => { void saveNote(); }} placeholder="Why this game belongs here..." /><span>Saves on exit. Not included in published rankings.</span></details>
      {noteError && <p id={`note-error-${entry.id}`} className="inline-error" role="alert">{noteError}</p>}
    </div>
  );
}

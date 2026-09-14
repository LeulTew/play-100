import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryRecord, PersonalAction, PersonalLibraryState, PersonalRanking } from '../../lib/personal-types';
import { searchText } from '../../lib/collection';
import { Icon } from '../Icon';
import { RecordIdentity } from './RecordIdentity';
import ReorderList from './ReorderList';
import AddGamesPanel from './AddGamesPanel';
import { PlayedToggle } from '../PlayedToggle';
import { PersonalRatingInput } from './PersonalRatingInput';
import { useExitSave } from '../../hooks/useExitSave';

export default function RankingsPage({ state, availableRecords, busy, persistent, animate, onAction, onOpen, onDiscover }: {
  state: PersonalLibraryState; availableRecords: LibraryRecord[]; busy: boolean; persistent: boolean; animate: boolean;
  onAction: (action: PersonalAction) => Promise<boolean>; onOpen: (id: string) => void; onDiscover: () => void;
}) {
  const [query, setQuery] = useState('');
  const [playedOnly, setPlayedOnly] = useState(false);
  const rankingById = useMemo(() => new Map(state.ranking.map((entry, index) => [entry.id, { entry, position: index + 1 }])), [state.ranking]);
  const rankedIds = useMemo(() => new Set(state.ranking.map((entry) => entry.id)), [state.ranking]);
  const records = useMemo(() => {
    const term = searchText(query);
    return state.ranking.flatMap((entry) => {
      const record = state.records[entry.id];
      if (!record || (playedOnly && !state.progress[entry.id]?.played) || !searchText(record.title).includes(term)) return [];
      return [record];
    });
  }, [state, query, playedOnly]);
  const canReorder = !query && !playedOnly;
  const manualCount = state.ranking.filter((entry) => entry.manualPosition !== null).length;
  return (
    <section className="app-page" aria-labelledby="rankings-title">
      <div className="page-heading"><div><h1 id="rankings-title" data-page-heading tabIndex={-1}>YOUR RANKING.<br /><span>NO CONSENSUS NEEDED.</span></h1><p>Played it or not, put it where you want. This is your order, not a change to the author's 100.</p></div><div className="private-label"><Icon name="bookmark" width="17" height="17" />{persistent ? 'Private · saved on this device' : 'Private · temporary tab data'}</div></div>
      <AddGamesPanel records={availableRecords} existingIds={rankedIds} onAdd={(recordsToAdd) => onAction({ type: 'add-ranking', records: recordsToAdd })} onDiscover={onDiscover} busy={busy} />
      {state.ranking.length > 0 && <>
        <div className="ranking-order-info"><p><strong>Highest ratings first.</strong> {manualCount ? `${manualCount} manually positioned ${manualCount === 1 ? 'game keeps its place' : 'games keep their places'}; the rest follow your scores. Previously saved orders are preserved until you choose automatic ordering.` : 'Unrated games follow rated games. Dragging a game fixes its position until you release it.'}</p>{manualCount > 0 && <button className="button button-outline" disabled={busy} onClick={() => { void onAction({ type: 'use-rating-order' }); }}>Use rating order for all</button>}</div>
        <div className="personal-tools"><div className="search-field"><Icon name="search" /><label className="sr-only" htmlFor="ranking-search">Search your ranking</label><input id="ranking-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a game in your ranking" /></div><label className="check-control"><input type="checkbox" checked={playedOnly} onChange={(event) => setPlayedOnly(event.target.checked)} />Only games I've marked played</label></div>
        <p className="queue-instructions">{canReorder ? 'Drag or use the arrows to choose a fixed position. Scores save after a short pause or when you leave the field.' : 'Your full rank positions are preserved. Clear search and the played filter to drag.'} Ranking or rating a game never marks it played.</p>
      </>}
      {records.length ? <ReorderList records={records} kind="ranking" canReorder={canReorder} busy={busy} animate={animate} positionFor={(id) => rankingById.get(id)?.position ?? null} onMove={(id, overId) => { void onAction({ type: 'move-item', list: 'ranking', id, overId }); }}>
        {(record) => {
          const entry = rankingById.get(record.id)?.entry;
          if (!entry) return null;
          return <RankingRow record={record} entry={entry} played={Boolean(state.progress[record.id]?.played)} completed={Boolean(state.progress[record.id]?.completed)} busy={busy} onOpen={onOpen} onAction={onAction} />;
        }}
      </ReorderList> : <div className="empty-state"><Icon name="rank" width="43" height="43" /><h2>{state.ranking.length ? 'No ranked games match this view.' : 'What comes first is up to you.'}</h2><p>{state.ranking.length ? 'Clear the search or include games not marked played. Your full ranking is still saved.' : 'Open Add games to build your ranking. Include titles you have not played, add an optional score and notes, then arrange your own order.'}</p>{state.ranking.length > 0 && <button className="button button-dark" onClick={() => { setQuery(''); setPlayedOnly(false); }}>Show my full ranking</button>}</div>}
      <p className="personal-storage-footnote">{persistent ? "Stored in this browser's IndexedDB, never Supabase." : 'Device storage is unavailable; export these temporary changes before closing this tab.'} Use Settings to download a backup or restore one on another device. This URL opens each visitor's own private ranking, not yours.</p>
    </section>
  );
}

function RankingRow({ record, entry, played, completed, busy, onOpen, onAction }: {
  record: LibraryRecord; entry: PersonalRanking; played: boolean; completed: boolean; busy: boolean;
  onOpen: (id: string) => void; onAction: (action: PersonalAction) => Promise<boolean>;
}) {
  const [note, setNote] = useState(entry.note);
  const [noteError, setNoteError] = useState('');
  const [noteEdited, setNoteEdited] = useState(false);
  const noteSaving = useRef(false);
  const noteEdits = useRef(0);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!noteEdited) setNote(entry.note); }, [entry.note, noteEdited]);
  useEffect(() => {
    if (!noteEdited) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [noteEdited]);
  const saveNote = async () => {
    if (!noteEdited || noteSaving.current) return;
    setNoteError('');
    if (note === entry.note) { setNoteEdited(false); return; }
    const version = noteEdits.current;
    noteSaving.current = true;
    try {
      if (await onAction({ type: 'edit-ranking', id: entry.id, note })) {
        if (version === noteEdits.current) setNoteEdited(false);
      } else setNoteError('The note could not be saved. Keep this field open to retry or copy your text.');
    } finally { noteSaving.current = false; }
  };
  useExitSave(() => { if (!noteError) void saveNote(); });
  return (
    <div className="ranking-row-content">
      <RecordIdentity record={record} onOpen={onOpen} />
      <PersonalRatingInput title={record.title} value={entry.score} busy={busy} onCommit={(score) => onAction({ type: 'edit-ranking', id: entry.id, score })} />
      <div className="played-check"><PlayedToggle id={record.id} title={record.title} played={played} completed={completed} busy={busy} onChange={() => { void onAction({ type: 'toggle-progress', record, key: 'played' }); }} /></div>
      <button className="icon-button" aria-label={`Remove ${record.title} from my ranking`} disabled={busy} onClick={() => { void onAction({ type: 'remove-ranking', ids: [entry.id] }); }}><Icon name="close" width="18" height="18" /></button>
      {entry.manualPosition !== null && <div className="manual-rank"><span>Fixed at #{entry.manualPosition}</span><button className="text-button" disabled={busy} aria-label={`Use rating order for ${record.title}`} onClick={() => { void onAction({ type: 'use-rating-order', id: entry.id }); }}>Use rating order<Icon name="rank" width="16" height="16" /></button></div>}
      <details className="ranking-note"><summary>{entry.note ? 'Your note' : 'Add a note'}<Icon name="plus" width="15" height="15" /></summary><label htmlFor={`note-${entry.id}`} className="sr-only">Your note for {record.title}</label><textarea ref={noteRef} id={`note-${entry.id}`} rows={3} maxLength={2000} value={note} disabled={busy} aria-invalid={Boolean(noteError)} aria-describedby={noteError ? `note-error-${entry.id}` : undefined} onChange={(event) => { noteEdits.current += 1; setNoteEdited(true); setNoteError(''); setNote(event.target.value); }} onBlur={() => { void saveNote(); }} placeholder="Why this game belongs here..." /><span>Saved when you leave the field or this page. Only on this device.</span></details>
      {noteError && <p id={`note-error-${entry.id}`} className="inline-error" role="alert">{noteError}</p>}
    </div>
  );
}

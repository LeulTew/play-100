import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FriendIdentity } from '../lib/friend-types';
import type { FriendShelfConfig, FriendShelfEntry } from '../lib/friend-shelf-types';
import { FriendShelfCommittedError, projectFriendShelf } from '../lib/friend-shelf-types';
import type { PersonalLibraryState } from '../lib/personal-types';
import { SOURCE_LABELS } from '../lib/personal-types';
import type { Game } from '../lib/types';
import { Avatar } from '../components/avatar/Avatar';
import { DataUseLink } from '../components/DataUseLink';
import { Dialog } from '../components/Dialog';
import { onlineError } from './errors';
import './friend-shelf.css';

type Artwork = (entry: FriendShelfEntry) => ReactNode;
function ShelfMetadata({ entry }: { entry: FriendShelfEntry }) {
  return <span className="friend-shelf-metadata">{entry.year ?? 'Year not listed'}<span aria-hidden="true"> / </span>{entry.source === 'manual' ? 'Manual addition' : SOURCE_LABELS[entry.source]}</span>;
}
function shelfError(cause: unknown): string { return cause instanceof FriendShelfCommittedError ? cause.message : onlineError(cause); }

export interface FriendShelfEditorProps {
  state: PersonalLibraryState; games: Game[]; config: FriendShelfConfig | null;
  identity: Pick<FriendIdentity, 'displayName' | 'avatar'>; connected: boolean; status: string; error: string;
  onPrepare: () => Promise<FriendShelfConfig>;
  onSave: (ids: string[], expected: FriendShelfConfig, reviewedStateRevision: number) => Promise<void>;
  onStop: () => Promise<void>; onRetry: () => Promise<void>; renderArtwork?: Artwork;
}
export function FriendShelfEditor({ state, games, config, identity, connected, status, error: operationError, onPrepare, onSave, onStop, onRetry, renderArtwork }: FriendShelfEditorProps) {
  const id = useId();
  const [selected, setSelected] = useState(() => new Set(config?.selectedIds ?? []));
  const [edited, setEdited] = useState(false);
  const [count, setCount] = useState(50);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<{ config: FriendShelfConfig; entries: FriendShelfEntry[]; revision: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const running = useRef(false);
  const rows = useMemo(() => Object.values(state.records).sort((a, b) => a.title.localeCompare(b.title)), [state.records]);
  const visible = rows.filter((row) => row.title.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  useEffect(() => { if (!edited) setSelected(new Set(config?.selectedIds ?? [])); }, [config?.revision, config?.selectedIds, edited]);
  useEffect(() => { setPreview(null); }, [state.revision]);
  const run = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (cause) { setError(shelfError(cause)); setPreview(null); }
    finally { running.current = false; setBusy(false); }
  };
  return <section className="friend-shelf-editor" aria-labelledby={`${id}-title`}>
    <div className="friend-shelf-heading"><h2 id={`${id}-title`}>Shared games</h2><span role="status">{status === 'off' ? 'Off' : status}</span></div>
    <p className="section-help">Choose saved games for accepted friends. New additions stay private. <DataUseLink /></p>
    {connected ? <>
      <div className="friend-shelf-controls">
        <label htmlFor={`${id}-filter`}>Find a saved game<input id={`${id}-filter`} type="search" value={filter} onChange={(event) => { setFilter(event.target.value); setCount(50); }} /></label>
        <span>{selected.size} / 200 selected</span>
        <button className="text-button" disabled={busy || !selected.size} onClick={() => { setSelected(new Set()); setEdited(true); setPreview(null); }}>Clear selection</button>
      </div>
      <ul className="friend-shelf-selection">{visible.slice(0, count).map((record) => <li key={record.id}>
        <label><input type="checkbox" checked={selected.has(record.id)} disabled={busy || (!selected.has(record.id) && selected.size >= 200)} onChange={(event) => {
          setEdited(true); setPreview(null); const checked = event.target.checked;
          setSelected((old) => { const next = new Set(old); if (checked) next.add(record.id); else next.delete(record.id); return next; });
        }} /><span><strong>{record.title}</strong><small>{record.year ?? 'Year not listed'}</small></span></label>
      </li>)}</ul>
      {!rows.length && <p>Save a game to your library to choose it here.</p>}
      {rows.length > 0 && !visible.length && <p>No saved games match this search.</p>}
      {visible.length > count && <button className="text-button" onClick={() => setCount((old) => old + 50)}>Show 50 more saved games</button>}
      <div className="button-row"><button className="button button-dark" disabled={busy || !selected.size} onClick={() => { void run(async () => {
        const control = await onPrepare();
        const projected = projectFriendShelf(state, [...selected], games);
        if (projected.selectedIds.length !== selected.size) throw new Error('A selected game was removed. Choose it again before sharing.');
        setPreview({ config: control, entries: projected.entries, revision: state.revision });
      }); }}>Preview shared games</button></div>
    </> : <p>Turn on account saving to choose games for this shelf.</p>}
    {config?.enabled && <button className="text-button danger-text" disabled={busy} onClick={() => { void run(async () => {
      await onStop(); setEdited(false); setSelected(new Set()); setPreview(null); setNotice('Shared games stopped.');
    }); }}>Stop sharing</button>}
    {(error || operationError) && <div role="alert"><p className="inline-error">{error || operationError}</p><button className="text-button" disabled={busy} onClick={() => { void run(onRetry); }}>Refresh shared games</button></div>}
    {notice && <p role="status">{notice}</p>}
    {preview && <Dialog open titleId={`${id}-preview-title`} className="friend-shelf-preview" onClose={() => { if (!busy) setPreview(null); }}>
      <h2 id={`${id}-preview-title`}>{preview.entries.length} shared {preview.entries.length === 1 ? 'game' : 'games'}</h2>
      <div className="friend-shelf-person"><Avatar descriptor={identity.avatar} size={48} /><strong>{identity.displayName}</strong></div>
      <p>Accepted friends see these names, years and sources. Scores stay in your separately shared ranking.</p>
      <ul className="friend-shelf-preview-list">{preview.entries.map((entry) => <li key={entry.id}>
        {renderArtwork && <div className="friend-shelf-art">{renderArtwork(entry)}</div>}
        <div><strong>{entry.title}</strong><ShelfMetadata entry={entry} /></div>
      </li>)}</ul>
      <div className="button-row"><button data-autofocus className="button button-outline" disabled={busy} onClick={() => setPreview(null)}>Back to selection</button>
        <button className="button button-dark" disabled={busy || state.revision !== preview.revision} onClick={() => { void run(async () => {
          await onSave(preview.entries.map((entry) => entry.id), preview.config, preview.revision);
          setPreview(null); setEdited(false); setNotice('Selection saved. Shared games update after your private save.');
        }); }}>{busy ? 'Saving selection…' : config?.enabled ? 'Update shared games' : 'Share these games'}</button></div>
    </Dialog>}
  </section>;
}
export interface FriendShelfCardsProps {
  entries: FriendShelfEntry[]; status: 'loading' | 'ready' | 'unavailable'; error?: string;
  onSave: (entry: FriendShelfEntry) => void | Promise<void>; onPin: (entry: FriendShelfEntry) => void;
  onOpen?: (entry: FriendShelfEntry) => void; savedIds?: ReadonlySet<string>; renderArtwork?: Artwork;
  paged?: boolean; total?: number | null;
}
export function FriendShelfCards({ entries, status, error: operationError, onSave, onPin, onOpen, savedIds, renderArtwork, paged = false, total }: FriendShelfCardsProps) {
  const id = useId(); const [count, setCount] = useState(24); const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ entries: FriendShelfEntry[]; text: string } | null>(null);
  const current = useRef(entries); current.current = entries;
  const save = async (entry: FriendShelfEntry) => {
    if (saving) return;
    const request = entries; setSaving(entry.id); setError(''); setNotice(null);
    try { await onSave(entry); if (current.current === request) setNotice({ entries: request, text: `${entry.title} saved to your library.` }); }
    catch (cause) { if (current.current === request) setError(shelfError(cause)); }
    finally { setSaving(null); }
  };
  return <section className="friend-shelf-cards" aria-labelledby={`${id}-title`}>
    <div className="friend-shelf-heading"><h2 id={`${id}-title`}>Shared games</h2>{status === 'ready' && <span>{entries.length}{paged ? ` / ${total ?? '?'} loaded` : ' games'}</span>}</div>
    {status === 'loading' ? <p role="status">Loading shared games…</p> : status === 'unavailable' ? <p>Shared games are unavailable.</p> : !entries.length ? <p>No games are shared in this view.</p> : <>
      <ul className="friend-shelf-grid">{entries.slice(0, paged ? entries.length : count).map((entry) => <li key={entry.id}>
        {renderArtwork && <div className="friend-shelf-art">{renderArtwork(entry)}</div>}
        <div className="friend-shelf-game"><h3>{onOpen ? <button className="text-button" onClick={() => {
          try { onOpen(entry); } catch (cause) { setError(shelfError(cause)); }
        }}>{entry.title}</button> : entry.title}</h3><ShelfMetadata entry={entry} />
          {entry.sourceUrl && <a className="friend-shelf-source" href={entry.sourceUrl} target="_blank" rel="noreferrer">View source</a>}
          <div className="button-row"><button className="button button-outline" disabled={Boolean(saving) || savedIds?.has(entry.id)} onClick={() => { void save(entry); }}>{savedIds?.has(entry.id) ? 'Saved' : saving === entry.id ? 'Saving…' : 'Save'}</button>
            <button className="text-button" aria-label={`Pin ${entry.title}`} onClick={() => { try { onPin(entry); setNotice({ entries, text: `${entry.title} pinned.` }); } catch (cause) { setError(shelfError(cause)); } }}>Pin</button></div>
        </div>
      </li>)}</ul>
      {!paged && count < entries.length && <button className="text-button" onClick={() => setCount((old) => old + 24)}>Show 24 more shared games</button>}
    </>}
    {(error || operationError) && <p className="inline-error" role="alert">{error || operationError}</p>}{notice?.entries === entries && status === 'ready' && <p role="status">{notice.text}</p>}
  </section>;
}

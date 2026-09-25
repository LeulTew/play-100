import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FriendIdentity } from '../lib/friend-types';
import type { FriendShelfConfig, FriendShelfEntry } from '../lib/friend-shelf-types';
import { FriendShelfCommittedError, projectFriendShelf } from '../lib/friend-shelf-types';
import type { PersonalLibraryState } from '../lib/personal-types';
import type { Game } from '../lib/types';
import { Avatar } from '../components/avatar/Avatar';
import { DataUseLink } from '../components/DataUseLink';
import { Dialog } from '../components/Dialog';
import { onlineError } from './errors';
import { ShelfMetadata } from './ShelfMetadata';
import './friend-shelf.css';

type Artwork = (entry: FriendShelfEntry) => ReactNode;
function shelfError(cause: unknown): string {
  return cause instanceof FriendShelfCommittedError ? cause.message : onlineError(cause);
}

export interface FriendShelfEditorProps {
  state: PersonalLibraryState;
  games: Game[];
  config: FriendShelfConfig | null;
  identity: Pick<FriendIdentity, 'displayName' | 'avatar'>;
  connected: boolean;
  status: string;
  error: string;
  onPrepare: () => Promise<FriendShelfConfig>;
  onSave: (ids: string[], expected: FriendShelfConfig, reviewedStateRevision: number) => Promise<void>;
  onStop: () => Promise<void>;
  onRetry: () => Promise<void>;
  renderArtwork?: Artwork;
}
export function FriendShelfEditor({
  state,
  games,
  config,
  identity,
  connected,
  status,
  error: operationError,
  onPrepare,
  onSave,
  onStop,
  onRetry,
  renderArtwork,
}: FriendShelfEditorProps) {
  const id = useId();
  const [selected, setSelected] = useState(() => new Set(config?.selectedIds ?? []));
  const [edited, setEdited] = useState(false);
  const [count, setCount] = useState(50);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<{
    config: FriendShelfConfig;
    entries: FriendShelfEntry[];
    revision: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const running = useRef(false);
  const rows = useMemo(
    () => Object.values(state.records).sort((a, b) => a.title.localeCompare(b.title)),
    [state.records],
  );
  const visible = rows.filter((row) => row.title.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  useEffect(() => {
    if (!edited) setSelected(new Set(config?.selectedIds ?? []));
  }, [config?.revision, config?.selectedIds, edited]);
  useEffect(() => {
    setPreview(null);
  }, [state.revision]);
  const run = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (cause) {
      setError(shelfError(cause));
      setPreview(null);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="friend-shelf-editor" aria-labelledby={`${id}-title`}>
      <div className="friend-shelf-heading">
        <h2 id={`${id}-title`}>Shared games</h2>
        <span role="status">{status === 'off' ? 'Off' : status}</span>
      </div>
      <p className="section-help">
        Choose saved games for accepted friends. New additions stay private. <DataUseLink />
      </p>
      {connected ? (
        <>
          <div className="friend-shelf-controls">
            <label htmlFor={`${id}-filter`}>
              Find a saved game
              <input
                id={`${id}-filter`}
                type="search"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setCount(50);
                }}
              />
            </label>
            <span>{selected.size} / 200 selected</span>
            <button
              className="text-button"
              disabled={busy || !selected.size}
              onClick={() => {
                setSelected(new Set());
                setEdited(true);
                setPreview(null);
              }}
            >
              Clear selection
            </button>
          </div>
          <ul className="friend-shelf-selection">
            {visible.slice(0, count).map((record) => (
              <li key={record.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(record.id)}
                    disabled={busy || (!selected.has(record.id) && selected.size >= 200)}
                    onChange={(event) => {
                      setEdited(true);
                      setPreview(null);
                      const checked = event.target.checked;
                      setSelected((old) => {
                        const next = new Set(old);
                        if (checked) next.add(record.id);
                        else next.delete(record.id);
                        return next;
                      });
                    }}
                  />
                  <span>
                    <strong>{record.title}</strong>
                    <small>{record.year ?? 'Year not listed'}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {!rows.length && <p>Save a game to your library to choose it here.</p>}
          {rows.length > 0 && !visible.length && <p>No saved games match this search.</p>}
          {visible.length > count && (
            <button className="text-button" onClick={() => setCount((old) => old + 50)}>
              Show 50 more saved games
            </button>
          )}
          <div className="button-row">
            <button
              className="button button-dark"
              disabled={busy || !selected.size}
              onClick={() => {
                void run(async () => {
                  const control = await onPrepare();
                  const projected = projectFriendShelf(state, [...selected], games);
                  if (projected.selectedIds.length !== selected.size)
                    throw new Error('A selected game was removed. Choose it again before sharing.');
                  setPreview({ config: control, entries: projected.entries, revision: state.revision });
                });
              }}
            >
              Preview shared games
            </button>
          </div>
        </>
      ) : (
        <p>Turn on account saving to choose games for this shelf.</p>
      )}
      {config?.enabled && (
        <button
          className="text-button danger-text"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              await onStop();
              setEdited(false);
              setSelected(new Set());
              setPreview(null);
              setNotice('Shared games stopped.');
            });
          }}
        >
          Stop sharing
        </button>
      )}
      {(error || operationError) && (
        <div role="alert">
          <p className="inline-error">{error || operationError}</p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              void run(onRetry);
            }}
          >
            Refresh shared games
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {preview && (
        <Dialog
          open
          titleId={`${id}-preview-title`}
          className="friend-shelf-preview"
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <h2 id={`${id}-preview-title`}>
            {preview.entries.length} shared {preview.entries.length === 1 ? 'game' : 'games'}
          </h2>
          <div className="friend-shelf-person">
            <Avatar descriptor={identity.avatar} size={48} />
            <strong>{identity.displayName}</strong>
          </div>
          <p>Accepted friends see these names, years and sources. Scores stay in your separately shared ranking.</p>
          <ul className="friend-shelf-preview-list">
            {preview.entries.map((entry) => (
              <li key={entry.id}>
                {renderArtwork && <div className="friend-shelf-art">{renderArtwork(entry)}</div>}
                <div>
                  <strong>{entry.title}</strong>
                  <ShelfMetadata entry={entry} />
                </div>
              </li>
            ))}
          </ul>
          <div className="button-row">
            <button data-autofocus className="button button-outline" disabled={busy} onClick={() => setPreview(null)}>
              Back to selection
            </button>
            <button
              className="button button-dark"
              disabled={busy || state.revision !== preview.revision}
              onClick={() => {
                void run(async () => {
                  await onSave(
                    preview.entries.map((entry) => entry.id),
                    preview.config,
                    preview.revision,
                  );
                  setPreview(null);
                  setEdited(false);
                  setNotice('Selection saved. Shared games update after your private save.');
                });
              }}
            >
              {busy ? 'Saving selection…' : config?.enabled ? 'Update shared games' : 'Share these games'}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

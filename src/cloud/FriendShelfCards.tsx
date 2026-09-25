import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FriendShelfEntry } from '../lib/friend-shelf-types';
import { FriendShelfCommittedError } from '../lib/friend-shelf-types';
import { onlineError } from './errors';
import { ShelfMetadata } from './ShelfMetadata';
import './friend-shelf.css';

function shelfError(cause: unknown): string {
  return cause instanceof FriendShelfCommittedError ? cause.message : onlineError(cause);
}

export interface FriendShelfCardsProps {
  entries: FriendShelfEntry[];
  status: 'loading' | 'ready' | 'unavailable';
  error?: string;
  onSave: (entry: FriendShelfEntry) => void | Promise<void>;
  onPin: (entry: FriendShelfEntry) => void;
  onOpen?: (entry: FriendShelfEntry) => void;
  savedIds?: ReadonlySet<string>;
  renderArtwork?: (entry: FriendShelfEntry) => ReactNode;
  paged?: boolean;
  total?: number | null;
}
export function FriendShelfCards({
  entries,
  status,
  error: operationError,
  onSave,
  onPin,
  onOpen,
  savedIds,
  renderArtwork,
  paged = false,
  total,
}: FriendShelfCardsProps) {
  const id = useId();
  const [count, setCount] = useState(24);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ entries: FriendShelfEntry[]; text: string } | null>(null);
  const current = useRef(entries);
  current.current = entries;
  const save = async (entry: FriendShelfEntry) => {
    if (saving) return;
    const request = entries;
    setSaving(entry.id);
    setError('');
    setNotice(null);
    try {
      await onSave(entry);
      if (current.current === request) setNotice({ entries: request, text: `${entry.title} saved to your library.` });
    } catch (cause) {
      if (current.current === request) setError(shelfError(cause));
    } finally {
      setSaving(null);
    }
  };
  return (
    <section className="friend-shelf-cards" aria-labelledby={`${id}-title`}>
      <div className="friend-shelf-heading">
        <h2 id={`${id}-title`}>Shared games</h2>
        {status === 'ready' && (
          <span>
            {entries.length}
            {paged ? ` / ${total ?? '?'} loaded` : ' games'}
          </span>
        )}
      </div>
      {status === 'loading' ? (
        <p role="status">Loading shared games…</p>
      ) : status === 'unavailable' ? (
        <p>Shared games are unavailable.</p>
      ) : !entries.length ? (
        <p>No games are shared in this view.</p>
      ) : (
        <>
          <ul className="friend-shelf-grid">
            {entries.slice(0, paged ? entries.length : count).map((entry) => (
              <li key={entry.id}>
                {renderArtwork && <div className="friend-shelf-art">{renderArtwork(entry)}</div>}
                <div className="friend-shelf-game">
                  <h3>
                    {onOpen ? (
                      <button
                        className="text-button"
                        onClick={() => {
                          try {
                            onOpen(entry);
                          } catch (cause) {
                            setError(shelfError(cause));
                          }
                        }}
                      >
                        {entry.title}
                      </button>
                    ) : (
                      entry.title
                    )}
                  </h3>
                  <ShelfMetadata entry={entry} />
                  {entry.sourceUrl && (
                    <a className="friend-shelf-source" href={entry.sourceUrl} target="_blank" rel="noreferrer">
                      View source
                    </a>
                  )}
                  <div className="button-row">
                    <button
                      className="button button-outline"
                      disabled={Boolean(saving) || savedIds?.has(entry.id)}
                      onClick={() => {
                        void save(entry);
                      }}
                    >
                      {savedIds?.has(entry.id) ? 'Saved' : saving === entry.id ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      className="text-button"
                      aria-label={`Pin ${entry.title}`}
                      onClick={() => {
                        try {
                          onPin(entry);
                          setNotice({ entries, text: `${entry.title} pinned.` });
                        } catch (cause) {
                          setError(shelfError(cause));
                        }
                      }}
                    >
                      Pin
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {!paged && count < entries.length && (
            <button className="text-button" onClick={() => setCount((old) => old + 24)}>
              Show 24 more shared games
            </button>
          )}
        </>
      )}
      {(error || operationError) && (
        <p className="inline-error" role="alert">
          {error || operationError}
        </p>
      )}
      {notice?.entries === entries && status === 'ready' && <p role="status">{notice.text}</p>}
    </section>
  );
}

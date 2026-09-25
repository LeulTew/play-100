import { useEffect, useRef, useState } from 'react';
import type { FriendSettings } from '../lib/friend-types';
import type { Game } from '../lib/types';
import type { PersonalLibraryState } from '../lib/personal-types';
import { projectFriendRanking } from '../lib/friend-types';
import { projectOwnRanking } from '../lib/community';
import type { PublicEntry } from '../lib/community';
import type { FriendStore } from './friend-store';
import { cloudAuth } from './firebase-client';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { DataUseLink } from '../components/DataUseLink';
import { prepareFriendIdentity } from './friend-page-actions';
import type { OwnFriendIdentity } from './friend-page-actions';

export function FriendSharingPage({
  store,
  identity,
  settings,
  ownState,
  connected,
  games,
  onSettings,
  onAccount,
  status,
  error: operationError,
}: {
  store: FriendStore;
  identity: OwnFriendIdentity;
  settings: FriendSettings | null;
  ownState: PersonalLibraryState;
  connected: boolean;
  games: Game[];
  onSettings: (settings: FriendSettings, explicitThroughRevision?: number) => void;
  onAccount: () => void;
  status: string;
  error: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(settings?.selectedIds ?? []));
  const [edited, setEdited] = useState(false);
  const [limit, setLimit] = useState(50);
  const [preview, setPreview] = useState<{
    settings: FriendSettings;
    entries: PublicEntry[];
    sourceRevision: number;
    ids: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const rows = projectOwnRanking(ownState, games);
  useEffect(() => {
    if (!edited) setSelected(new Set(settings?.selectedIds ?? []));
  }, [settings?.revision, settings?.selectedIds, edited]);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const confirmedSelection = useRef<{ revision: number; epoch: number; ids: string[]; sourceRevision: number } | null>(
    null,
  );
  const saving = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      const committed = committedFriendChange(cause, identity.uid);
      if (committed) {
        setNotice(committedFriendMessage(committed));
        setPreview(null);
        setRefreshRequired(true);
      } else setError(friendMutationError(cause));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="app-page friends-sharing-page">
      <div className="page-heading">
        <h1 data-page-heading tabIndex={-1}>
          Friends sharing
        </h1>
        <button className="text-button" onClick={onAccount}>
          Account
          <Icon name="back" />
        </button>
      </div>
      <p className="section-help">
        Only accepted friends see these selected games, order and scores. Edits update them automatically.{' '}
        <DataUseLink />
      </p>
      <p role="status">{settings?.enabled ? `Sharing ${status}` : 'Off'}</p>
      {!connected ? (
        <>
          <p>
            Enable account saving before sharing an account ranking. Existing shared rankings stay visible until you
            turn sharing off.
          </p>
          <button className="button button-outline" onClick={onAccount}>
            Account saving
          </button>
        </>
      ) : (
        <>
          <h2>{selected.size} / 200 selected</h2>
          <div className="button-row">
            <button
              className="text-button"
              disabled={rows.length > 200 || busy}
              onClick={() => {
                setSelected(new Set(rows.map((row) => row.id)));
                setEdited(true);
              }}
            >
              Select all
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSelected(new Set());
                setEdited(true);
              }}
            >
              Clear
            </button>
          </div>
          <ol className="publish-selection-list">
            {rows.slice(0, limit).map((row) => (
              <li key={row.id}>
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    disabled={busy || (!selected.has(row.id) && selected.size >= 200)}
                    onChange={(event) => {
                      setEdited(true);
                      setPreview(null);
                      setSelected((old) => {
                        const next = new Set(old);
                        if (event.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      });
                    }}
                  />
                  <span>{row.title}</span>
                </label>
                <strong>{row.score ?? 'Unrated'}</strong>
              </li>
            ))}
          </ol>
          {limit < rows.length && (
            <button className="text-button" onClick={() => setLimit((value) => value + 50)}>
              Next 50 games
            </button>
          )}
          <button
            className="button button-dark"
            disabled={busy || !identity.verified || refreshRequired}
            onClick={() => {
              void run(async () => {
                const control = await prepareFriendIdentity(store, identity);
                onSettings(control);
                const projected = projectFriendRanking(ownState, [...selected], games);
                if (projected.selectedIds.length !== selected.size)
                  throw new Error('Your ranking changed. Review your selected games.');
                setPreview({
                  settings: control,
                  entries: projected.entries,
                  ids: projected.selectedIds,
                  sourceRevision: ownState.revision,
                });
              });
            }}
          >
            Preview friends sharing
          </button>
        </>
      )}
      {settings?.enabled && (
        <button
          className="text-button danger-text"
          disabled={busy || refreshRequired}
          onClick={() => {
            void run(async () => {
              const next = await store.saveSettings(
                identity.uid,
                { enabled: false, selectedIds: settings.selectedIds },
                settings,
              );
              onSettings(next);
              setNotice('Friends sharing stopped.');
            });
          }}
        >
          Stop friends sharing
        </button>
      )}
      {refreshRequired && (
        <button
          className="button button-outline"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              const saved = await store.settings(identity.uid);
              const selection = confirmedSelection.current;
              if (saved)
                onSettings(
                  saved,
                  saved.enabled &&
                    selection &&
                    saved.revision === selection.revision &&
                    saved.epoch === selection.epoch &&
                    saved.selectedIds.join('|') === selection.ids.join('|')
                    ? selection.sourceRevision
                    : undefined,
                );
              confirmedSelection.current = null;
              setRefreshRequired(false);
              setNotice('Sharing status refreshed.');
            });
          }}
        >
          Refresh sharing status
        </button>
      )}
      {(error || operationError) && (
        <p className="inline-error" role="alert">
          {error || operationError}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {preview && (
        <Dialog
          open
          titleId="friend-sharing-title"
          className="info-dialog"
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <h2 id="friend-sharing-title">Share with friends?</h2>
          <p>
            Accepted friends can view and copy these games and scores. Notes, email, queue and play history are
            excluded. Later edits update only these selected games.
          </p>
          <ol className="publication-preview-list">
            {preview.entries.map((entry) => (
              <li key={entry.id}>
                <span>
                  {entry.position}. {entry.title}
                </span>
                <strong>{entry.score ?? 'Unrated'}</strong>
              </li>
            ))}
          </ol>
          {!preview.entries.length && <p>This shares an empty ranking.</p>}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button data-autofocus className="button button-outline" disabled={busy} onClick={() => setPreview(null)}>
              Keep editing
            </button>
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  if (
                    ownState.revision !== preview.sourceRevision ||
                    cloudAuth.currentUser?.uid !== identity.uid ||
                    !connected
                  )
                    throw new Error('Your account or ranking changed. Review the preview again.');
                  confirmedSelection.current = {
                    revision: preview.settings.revision + 1,
                    epoch: preview.settings.epoch + 1,
                    ids: preview.ids,
                    sourceRevision: preview.sourceRevision,
                  };
                  const next = await store.saveSettings(
                    identity.uid,
                    { enabled: true, selectedIds: preview.ids },
                    preview.settings,
                  );
                  onSettings(next, preview.sourceRevision);
                  confirmedSelection.current = null;
                  setEdited(false);
                  setPreview(null);
                  setNotice('Friends sharing enabled.');
                });
              }}
            >
              Agree & share with friends
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

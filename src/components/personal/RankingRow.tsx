import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LibraryRecord, PersonalAction, PersonalRanking } from '../../lib/personal-types';
import type { CatalogArtwork } from '../../lib/discovery-catalog-shared';
import { Icon } from '../Icon';
import { RecordIdentity } from './RecordIdentity';
import { PlayedToggle } from '../PlayedToggle';
import { CompletedToggle } from '../CompletedToggle';
import { PersonalRatingInput } from './PersonalRatingInput';
import { CompareDragSource } from '../compare-tray/CompareDragSource';
import { useExitSave } from '../../hooks/useExitSave';

export function RankingRow({
  record,
  artwork,
  entry,
  played,
  completed,
  busy,
  active,
  onOpen,
  onAction,
  position,
  total,
  canReorder,
  onMoveToPosition,
  onUseRatingOrder,
  onRemove,
  onPin,
  onUnpin,
  pinned = false,
  renderDragHandle,
}: {
  record: LibraryRecord;
  artwork?: CatalogArtwork;
  entry: PersonalRanking;
  played: boolean;
  completed: boolean;
  busy: boolean;
  active: boolean;
  onOpen: (id: string) => void;
  onAction: (action: PersonalAction) => Promise<boolean>;
  position: number;
  total: number;
  canReorder: boolean;
  onMoveToPosition: (position: number) => Promise<boolean>;
  onUseRatingOrder: () => void;
  onRemove: () => void;
  onPin?: (record: LibraryRecord) => void;
  onUnpin?: (id: string) => void;
  pinned?: boolean;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
}) {
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const note = draftNote ?? entry.note;
  const noteEdited = draftNote !== null;
  const [noteError, setNoteError] = useState('');
  const noteSaving = useRef<Promise<boolean> | null>(null);
  const noteEdits = useRef(0);
  const committedNote = useRef(-1);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!noteEdited) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [noteEdited]);
  const saveNote = (): Promise<boolean> => {
    if (noteSaving.current) return noteSaving.current;
    if (!noteEdited || committedNote.current === noteEdits.current) return Promise.resolve(true);
    setNoteError('');
    if (note === entry.note) {
      committedNote.current = noteEdits.current;
      setDraftNote(null);
      return Promise.resolve(true);
    }
    const version = noteEdits.current;
    const task = (async () => {
      if (await onAction({ type: 'edit-ranking', id: entry.id, note })) {
        if (version === noteEdits.current) {
          committedNote.current = version;
          setDraftNote(null);
        }
        return version === noteEdits.current;
      }
      setNoteError('The note could not be saved. Keep this field open to retry or copy your text.');
      return false;
    })();
    noteSaving.current = task;
    void task.finally(() => {
      if (noteSaving.current === task) noteSaving.current = null;
    });
    return task;
  };
  useExitSave(() => (noteError ? Promise.resolve(false) : saveNote()), noteEdited, noteRef);
  return (
    <div className="ranking-row-content">
      <CompareDragSource record={record} disabled={!active}>
        {(binding) => (
          <div ref={binding.sourceRef} {...binding.surfaceProps} className="ranking-game-identity">
            <RecordIdentity record={record} artwork={artwork} onOpen={onOpen} compareDrag={binding} />
            {(onPin || renderDragHandle) && (
              <div className="ranking-compare-actions">
                {onPin && (
                  <button
                    className="text-button"
                    disabled={pinned && !onUnpin}
                    aria-pressed={onUnpin ? pinned : undefined}
                    aria-label={`${pinned && !onUnpin ? 'Pinned' : 'Pin'} for comparison: ${record.title}`}
                    onClick={() => {
                      if (pinned) onUnpin?.(record.id);
                      else onPin(record);
                    }}
                  >
                    <Icon name="stack" width="17" height="17" fill={pinned ? 'currentColor' : 'none'} />
                    {pinned && !onUnpin ? 'Pinned for comparison' : 'Pin for comparison'}
                  </button>
                )}
                {renderDragHandle?.(record)}
              </div>
            )}
          </div>
        )}
      </CompareDragSource>
      <PersonalRatingInput
        title={record.title}
        value={entry.score}
        busy={busy}
        onCommit={(score) => onAction({ type: 'edit-ranking', id: entry.id, score })}
      />
      <div className="played-check">
        <PlayedToggle
          id={record.id}
          title={record.title}
          played={played}
          completed={completed}
          busy={busy}
          onChange={(value) => {
            void onAction({ type: 'set-progress', records: [record], key: 'played', value });
          }}
        />
        <CompletedToggle
          title={record.title}
          completed={completed}
          busy={busy}
          onChange={(value) => {
            void onAction({ type: 'set-progress', records: [record], key: 'completed', value });
          }}
        />
      </div>
      <button className="icon-button" aria-label={`Remove ${record.title} from my ranking`} onClick={onRemove}>
        <Icon name="close" width="18" height="18" />
      </button>
      {entry.manualPosition !== null && (
        <div className="manual-rank">
          <span>Fixed at #{entry.manualPosition}</span>
          <button
            className="text-button"
            disabled={busy}
            aria-label={`Use rating order for ${record.title}`}
            onClick={onUseRatingOrder}
          >
            Use rating order
            <Icon name="rank" width="16" height="16" />
          </button>
        </div>
      )}
      <RankingPosition
        title={record.title}
        position={position}
        total={total}
        disabled={busy || !canReorder}
        onMove={onMoveToPosition}
      />
      <details className="ranking-note">
        <summary>
          {entry.note ? 'Your note' : 'Add a note'}
          <Icon name="plus" width="15" height="15" />
        </summary>
        <label htmlFor={`note-${entry.id}`} className="sr-only">
          Your note for {record.title}
        </label>
        <textarea
          ref={noteRef}
          id={`note-${entry.id}`}
          rows={3}
          maxLength={2000}
          value={note}
          disabled={busy}
          aria-invalid={Boolean(noteError)}
          aria-describedby={noteError ? `note-error-${entry.id}` : undefined}
          onChange={(event) => {
            noteEdits.current += 1;
            setNoteError('');
            setDraftNote(event.target.value);
          }}
          onBlur={() => {
            // A recovered focus followed by another navigation attempt is not an explicit retry.
            if (!noteError) void saveNote();
          }}
          placeholder="Why this game belongs here…"
        />
        <span>Saves on exit. Not included in published rankings.</span>
      </details>
      {noteError && (
        <p id={`note-error-${entry.id}`} className="inline-error" role="alert">
          {noteError}
        </p>
      )}
    </div>
  );
}

function RankingPosition({
  title,
  position,
  total,
  disabled,
  onMove,
}: {
  title: string;
  position: number;
  total: number;
  disabled: boolean;
  onMove: (position: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const applying = useRef(false);
  useExitSave(
    () => {
      if (!draft || applying.current) return Promise.resolve(true);
      const details = input.current?.closest('details');
      if (details) details.open = true;
      setError('Apply this position or clear it before leaving the editor.');
      return Promise.resolve(false);
    },
    Boolean(draft),
    input,
  );
  useEffect(() => {
    if (!draft) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [draft]);
  return (
    <details className="ranking-position-control">
      <summary>Move to position</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = Number(draft);
          if (!Number.isInteger(next) || next < 1 || next > total) {
            setError(`Choose a position from 1 to ${total}.`);
            return;
          }
          setError('');
          applying.current = true;
          void onMove(next).then((saved) => {
            applying.current = false;
            if (saved) setDraft('');
          });
        }}
      >
        <label>
          Position
          <input
            ref={input}
            type="number"
            min="1"
            max={total}
            step="1"
            aria-label={`Position for ${title}`}
            value={draft}
            placeholder={String(position)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            disabled={disabled}
            onChange={(event) => {
              setDraft(event.target.value);
              setError('');
            }}
          />
        </label>
        <button className="button button-outline" type="submit" disabled={disabled}>
          Move
        </button>
        {error && (
          <p id={errorId} className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}

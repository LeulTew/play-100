import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useExitSave } from '../../hooks/useExitSave';

export const PERSONAL_RATING_DEBOUNCE_MS = 650;

export function PersonalRatingInput({
  title,
  value,
  busy,
  onCommit,
}: {
  title: string;
  value: number | null;
  busy: boolean;
  onCommit: (score: number | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState('');
  const [editVersion, setEditVersion] = useState(0);
  const edits = useRef(0);
  const committedEdit = useRef(-1);
  const saving = useRef<Promise<boolean> | null>(null);
  const badInput = useRef(false);
  const commit = useRef(onCommit);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const shown = edited ? draft : value === null ? '' : String(value);
  useLayoutEffect(() => {
    if (!edited) commit.current = onCommit;
  }, [edited, onCommit]);
  const save = useCallback((): Promise<boolean> => {
    if (saving.current) return saving.current;
    if (!edited || committedEdit.current === edits.current) return Promise.resolve(true);
    if (badInput.current) {
      setError(
        'Enter a rating from 0 to 10, or clear the field to remove your rating. Your saved rating is unchanged.',
      );
      return Promise.resolve(false);
    }
    const next = draft.trim() === '' ? null : Number(draft);
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > 10)) {
      setError('Use a rating from 0 to 10, or leave it blank.');
      return Promise.resolve(false);
    }
    setError('');
    if (next === value) {
      committedEdit.current = edits.current;
      setEdited(false);
      return Promise.resolve(true);
    }
    const version = edits.current;
    const task = (async () => {
      if (await commit.current(next)) {
        if (version === edits.current) {
          committedEdit.current = version;
          setEdited(false);
        }
        return version === edits.current;
      }
      setError('The rating could not be saved. Your previous rating is unchanged. Press Enter in this field to retry.');
      return false;
    })();
    saving.current = task;
    void task.finally(() => {
      if (saving.current === task) saving.current = null;
    });
    return task;
  }, [edited, draft, value]);
  useEffect(() => {
    if (!edited) return;
    const flush = () => {
      if (!error) void save();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      // Explicitly choosing Leave accepts losing an unfinished write; keep the unsaved-data warning until it saves.
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [edited, error, save]);
  useEffect(() => {
    if (!edited || busy || error || badInput.current) return;
    const pointer = window.matchMedia('(pointer: coarse)');
    if (pointer.matches) return;
    const next = draft.trim() === '' ? null : Number(draft);
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > 10)) return;
    const timer = window.setTimeout(() => {
      if (!pointer.matches) void save();
    }, PERSONAL_RATING_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [edited, draft, editVersion, busy, error, save]);
  useExitSave(() => (error ? Promise.resolve(false) : save()), edited, input);
  return (
    <>
      <label className="personal-score">
        Your rating / 10
        <input
          ref={input}
          type="number"
          inputMode="decimal"
          min="0"
          max="10"
          step="any"
          value={shown}
          placeholder="—"
          readOnly={busy}
          aria-disabled={busy || undefined}
          aria-label={`Your rating / 10 for ${title}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            if (!edited) commit.current = onCommit;
            badInput.current = event.currentTarget.validity.badInput;
            edits.current += 1;
            setEditVersion(edits.current);
            setEdited(true);
            setError('');
            setDraft(event.target.value);
          }}
          onBlur={() => {
            // Returning focus after blocked navigation must not turn the next blur into a retry.
            if (!error) void save();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void save();
          }}
        />
      </label>
      {error && (
        <p id={errorId} className="inline-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

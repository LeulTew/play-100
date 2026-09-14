import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useExitSave } from '../../hooks/useExitSave';

export function PersonalRatingInput({ title, value, busy, onCommit }: {
  title: string; value: number | null; busy: boolean; onCommit: (score: number | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState('');
  const [editVersion, setEditVersion] = useState(0);
  const edits = useRef(0);
  const saving = useRef(false);
  const badInput = useRef(false);
  const commit = useRef(onCommit);
  const errorId = useId();
  commit.current = onCommit;
  useEffect(() => { if (!edited) setDraft(value === null ? '' : String(value)); }, [value, edited]);
  useEffect(() => {
    if (!edited) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [edited]);
  const save = useCallback(async () => {
    if (!edited || saving.current) return;
    if (badInput.current) { setError('Enter a valid rating from 0 to 10, or deliberately clear the field. Your saved rating is unchanged.'); return; }
    const next = draft.trim() === '' ? null : Number(draft);
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > 10)) { setError('Use a rating from 0 to 10, or leave it blank.'); return; }
    setError('');
    if (next === value) { setEdited(false); return; }
    const version = edits.current;
    saving.current = true;
    try {
      if (await commit.current(next)) {
        if (version === edits.current) setEdited(false);
      } else setError('The rating could not be saved. Your previous rating is unchanged.');
    } finally { saving.current = false; }
  }, [edited, draft, value]);
  useEffect(() => {
    if (!edited || busy || error || badInput.current) return;
    const next = draft.trim() === '' ? null : Number(draft);
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > 10)) return;
    const timer = window.setTimeout(() => { void save(); }, 650);
    return () => window.clearTimeout(timer);
  }, [edited, draft, editVersion, busy, error, save]);
  useExitSave(() => { if (!error) void save(); });
  return (
    <>
      <label className="personal-score">Your rating / 10<input type="number" inputMode="decimal" min="0" max="10" step="any"
        value={draft} placeholder="—" disabled={busy} aria-label={`Your rating for ${title}`}
        aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          badInput.current = event.currentTarget.validity.badInput;
          edits.current += 1;
          setEditVersion(edits.current);
          setEdited(true);
          setError('');
          setDraft(event.target.value);
        }}
        onBlur={() => { void save(); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      </label>
      {error && <p id={errorId} className="inline-error" role="alert">{error}</p>}
    </>
  );
}

import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';

export interface ManualGameDraft {
  title: string;
  year: string;
  expanded?: boolean;
}

export default function ManualGameForm({
  onAdd,
  busy,
  actionLabel = 'Add game',
  draft: controlledDraft,
  onDraftChange,
}: {
  onAdd: (record: LibraryRecord) => Promise<boolean>;
  busy: boolean;
  actionLabel?: string;
  draft?: ManualGameDraft;
  onDraftChange?: (draft: ManualGameDraft) => void;
}) {
  const prefix = useId();
  const [localDraft, setLocalDraft] = useState<ManualGameDraft>({ title: '', year: '' });
  const draft = controlledDraft ?? localDraft;
  const { title, year } = draft;
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const changeDraft = (next: ManualGameDraft) => {
    latestDraft.current = next;
    if (onDraftChange) onDraftChange(next);
    else setLocalDraft(next);
  };
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [error, setError] = useState('');
  // Fields stay editable while a game saves; a late success clears only the draft it submitted.
  const edits = useRef(0);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Enter a game title.');
      return;
    }
    const enteredYear = year ? Number(year) : null;
    if (enteredYear !== null && (!Number.isInteger(enteredYear) || enteredYear < 1900 || enteredYear > 2100)) {
      setError('Use a four-digit year between 1900 and 2100, or leave it blank.');
      return;
    }
    const id = crypto.randomUUID();
    const record: LibraryRecord = {
      id: `manual:${id}`,
      title: trimmed,
      year: enteredYear,
      studio: null,
      genre: null,
      source: 'manual',
      sourceId: id,
      sourceUrl: null,
      collectionRank: null,
    };
    setError('');
    const submitted = edits.current;
    let added: boolean;
    try {
      added = await onAdd(record);
    } catch (cause) {
      console.error(
        'A manual game could not be added.',
        cause instanceof Error ? cause.message : 'Unknown storage failure.',
      );
      if (mounted.current) setError('The game could not be added. Your entry is unchanged; try again.');
      return;
    }
    if (mounted.current && !added) {
      setError('The game could not be added. Your entry is unchanged; try again.');
    }
    if (
      mounted.current &&
      added &&
      submitted === edits.current &&
      latestDraft.current.title === title &&
      latestDraft.current.year === year
    ) {
      changeDraft({ title: '', year: '', expanded: latestDraft.current.expanded });
    }
  };
  return (
    <details
      className="manual-add"
      open={draft.expanded}
      onToggle={(event) => {
        if (mounted.current && event.currentTarget.open !== latestDraft.current.expanded) {
          changeDraft({ ...latestDraft.current, expanded: event.currentTarget.open });
        }
      }}
    >
      <summary>
        <Icon name="plus" width="17" height="17" />
        Add a game manually
      </summary>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <p>Adding a game does not mark it played or completed.</p>
        <div className="manual-fields">
          <label htmlFor={`${prefix}-title`}>
            Game title
            <input
              id={`${prefix}-title`}
              value={title}
              maxLength={200}
              required
              onChange={(event) => {
                edits.current += 1;
                changeDraft({ ...latestDraft.current, title: event.target.value });
              }}
            />
          </label>
          <label htmlFor={`${prefix}-year`}>
            Year <span>(optional)</span>
            <input
              id={`${prefix}-year`}
              value={year}
              type="number"
              min="1900"
              max="2100"
              onChange={(event) => {
                edits.current += 1;
                changeDraft({ ...latestDraft.current, year: event.target.value });
              }}
            />
          </label>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-dark" disabled={busy || !title.trim()} type="submit">
          <Icon name="plus" width="17" height="17" />
          {actionLabel}
        </button>
      </form>
    </details>
  );
}

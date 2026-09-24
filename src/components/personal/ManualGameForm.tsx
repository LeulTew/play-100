import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';

export default function ManualGameForm({
  onAdd,
  busy,
  actionLabel = 'Add game',
}: {
  onAdd: (record: LibraryRecord) => Promise<boolean>;
  busy: boolean;
  actionLabel?: string;
}) {
  const prefix = useId();
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
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
      setError('The game could not be added. Your entry is unchanged; try again.');
      return;
    }
    if (added && submitted === edits.current) {
      setTitle('');
      setYear('');
    }
  };
  return (
    <details className="manual-add">
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
                setTitle(event.target.value);
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
                setYear(event.target.value);
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

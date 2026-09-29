import { useId, useState } from 'react';
import { Dialog } from './Dialog';
import { useLibraryMode } from '../lib/library-mode';

export function PlayedToggle({
  id,
  title,
  played,
  completed = false,
  busy = false,
  onChange,
}: {
  id: string;
  title: string;
  played: boolean;
  completed?: boolean;
  busy?: boolean;
  compact?: boolean;
  onChange: (value: boolean) => void;
}) {
  const titleId = useId();
  const { scope } = useLibraryMode();
  const key = `${scope}:${id}`;
  const eligible = played && completed;
  const [review, setReview] = useState({ key, eligible, open: false });
  if (review.key !== key || review.eligible !== eligible) setReview({ key, eligible, open: false });
  const reviewOpen = (open: boolean) => setReview({ key, eligible, open });
  const label = 'Played';
  return (
    <>
      <label className="check-control played-toggle" data-played-id={id}>
        <input
          type="checkbox"
          checked={played}
          // Pending, not disabled: disabling the focused checkbox during a save dropped keyboard focus.
          aria-disabled={busy || undefined}
          onChange={(event) => {
            if (busy) return;
            if (!event.target.checked && completed) reviewOpen(true);
            else onChange(event.target.checked);
          }}
          aria-label={`${label}: ${title}`}
        />
        <span>{label}</span>
      </label>
      {review.key === key && review.open && eligible && (
        <Dialog open titleId={titleId} className="info-dialog" onClose={() => reviewOpen(false)}>
          <h2 id={titleId}>Mark {title} not played?</h2>
          <p>This also clears Completed. Play later, rating, notes and ranking position stay unchanged.</p>
          <div className="button-row">
            <button data-autofocus className="button button-outline" onClick={() => reviewOpen(false)}>
              Keep completed
            </button>
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => {
                onChange(false);
                reviewOpen(false);
              }}
            >
              Mark not played
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

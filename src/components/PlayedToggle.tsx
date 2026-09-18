import { useEffect, useId, useState } from 'react';
import { Dialog } from './Dialog';
import { useLibraryMode } from '../lib/library-mode';

export function PlayedToggle({ id, title, played, completed = false, busy = false, compact = false, onChange }: {
  id: string; title: string; played: boolean; completed?: boolean; busy?: boolean; compact?: boolean; onChange: (value: boolean) => void;
}) {
  const titleId = useId();
  const { scope } = useLibraryMode();
  const [review, setReview] = useState<string | null>(null);
  const key = `${scope}:${id}`;
  useEffect(() => { setReview(null); }, [key]);
  useEffect(() => { if (!played || !completed) setReview(null); }, [played, completed]);
  const label = compact ? 'Played' : 'I have played it';
  return <>
    <label className="check-control played-toggle" data-played-id={id}>
      <input type="checkbox" checked={played} disabled={busy} onChange={event => {
        if (!event.target.checked && completed) setReview(key);
        else onChange(event.target.checked);
      }} aria-label={`${label}: ${title}`} />
      <span>{label}</span>
    </label>
    {review === key && played && completed && <Dialog open titleId={titleId} className="info-dialog" onClose={() => setReview(null)}>
      <h2 id={titleId}>Mark {title} not played?</h2>
      <p>This also clears Completed. Your play queue, rating, notes and ranking position stay unchanged.</p>
      <div className="button-row">
        <button data-autofocus className="button button-outline" onClick={() => setReview(null)}>Keep completed</button>
        <button className="button button-dark" disabled={busy} onClick={() => { onChange(false); setReview(null); }}>Mark not played</button>
      </div>
    </Dialog>}
  </>;
}

import { useId } from 'react';

export function PlayedToggle({ id, title, played, completed = false, busy = false, compact = false, onChange }: {
  id: string; title: string; played: boolean; completed?: boolean; busy?: boolean; compact?: boolean; onChange: () => void;
}) {
  const hintId = useId();
  const label = compact ? 'Played' : 'I have played it';
  return (
    <label className="check-control played-toggle" data-played-id={id}>
      <input type="checkbox" checked={played} disabled={busy} onChange={onChange}
        aria-label={`${label}: ${title}`} aria-describedby={completed ? hintId : undefined} />
      <span>{label}</span>
      {completed && <span id={hintId} className="sr-only">Unchecking played also removes the completed mark.</span>}
    </label>
  );
}

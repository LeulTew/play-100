import { Icon } from './Icon';

export function CompletedToggle({
  title,
  completed,
  busy = false,
  onChange,
}: {
  title: string;
  completed: boolean;
  busy?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="text-button completed-toggle"
      aria-disabled={busy || undefined}
      aria-pressed={completed}
      aria-label={`Completed: ${title}`}
      onClick={() => {
        if (!busy) onChange(!completed);
      }}
    >
      <Icon name={completed ? 'check' : 'plus'} width="17" height="17" />
      Completed
    </button>
  );
}

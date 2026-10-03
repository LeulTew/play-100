import { Icon } from './Icon';
import { useLibraryPressedState } from '../lib/library-state';

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
  const pressed = useLibraryPressedState(completed);
  return (
    <button
      type="button"
      className="text-button completed-toggle"
      aria-disabled={busy || undefined}
      {...pressed}
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

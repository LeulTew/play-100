import { Icon } from './Icon';

export function CompletedToggle({ title, completed, busy = false, onChange }: {
  title: string; completed: boolean; busy?: boolean; onChange: (value: boolean) => void;
}) {
  return <button type="button" className="text-button completed-toggle" disabled={busy} aria-pressed={completed}
    aria-label={`${completed ? 'Unmark' : 'Mark'} ${title} completed`} onClick={() => onChange(!completed)}>
    <Icon name="check" width="17" height="17" />{completed ? 'Completed' : 'Mark completed'}
  </button>;
}

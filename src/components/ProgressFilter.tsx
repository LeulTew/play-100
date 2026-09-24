import { parseProgressFilter, progressLabels } from '../lib/game-progress';
import type { ProgressFilter as Filter } from '../lib/game-progress';
import { useId } from 'react';
import { SelectField } from './SelectField';

export function ProgressFilter({
  value,
  onChange,
  disabled = false,
}: {
  value: Filter;
  onChange: (value: Filter) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <SelectField
      id={id}
      className="progress-filter"
      label="Progress"
      value={value}
      disabled={disabled}
      onChange={(value) => onChange(parseProgressFilter(value))}
    >
      {(['all', 'not-played', 'unfinished', 'completed', 'any-played'] as const).map((option) => (
        <option key={option} value={option}>
          {progressLabels[option]}
        </option>
      ))}
      {value === 'not-completed' && <option value="not-completed">Not completed (any played state)</option>}
    </SelectField>
  );
}

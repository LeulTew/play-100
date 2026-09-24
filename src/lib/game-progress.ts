import type { Filters } from './types.js';
import type { LibraryRecord, PersonalAction, PersonalProgress } from './personal-types.js';

export type ProgressFilter = 'all' | 'not-played' | 'unfinished' | 'completed' | 'any-played' | 'not-completed';
export const progressFilters: readonly ProgressFilter[] = [
  'all',
  'not-played',
  'unfinished',
  'completed',
  'any-played',
  'not-completed',
];
export const progressLabels: Record<ProgressFilter, string> = {
  all: 'All progress',
  'not-played': 'Not played',
  unfinished: 'Played (not completed)',
  completed: 'Completed',
  'any-played': 'Played, including completed',
  'not-completed': 'Not completed',
};
export function parseProgressFilter(value: unknown): ProgressFilter {
  return progressFilters.find((option) => option === value) ?? 'all';
}
export function effectiveProgressFilter(filters: Pick<Filters, 'list' | 'progress'>): ProgressFilter {
  if (filters.progress && filters.progress !== 'all') return filters.progress;
  return filters.list === 'completed' ? 'completed' : filters.list === 'unplayed' ? 'not-completed' : 'all';
}
export function matchesProgress(value: Partial<PersonalProgress> | undefined, filter: ProgressFilter): boolean {
  const completed = Boolean(value?.completed);
  const played = Boolean(value?.played || completed);
  switch (filter) {
    case 'all':
      return true;
    case 'not-played':
      return !played;
    case 'unfinished':
      return played && !completed;
    case 'completed':
      return completed;
    case 'any-played':
      return played;
    case 'not-completed':
      return !completed;
  }
}
export function matchesProgressFilters(
  value: Partial<PersonalProgress> | undefined,
  filters: Pick<Filters, 'list' | 'progress'>,
): boolean {
  return (
    (filters.list !== 'later' || Boolean(value?.later)) && matchesProgress(value, effectiveProgressFilter(filters))
  );
}
// A Completed view (new progress chooser or legacy list) picks among its own completed results;
// every other view skips games that are already completed.
export function pickCandidates<T extends { id: string }>(
  records: readonly T[],
  progress: Readonly<Record<string, Partial<PersonalProgress> | undefined>>,
  filters: Pick<Filters, 'list' | 'progress'>,
): T[] {
  return effectiveProgressFilter(filters) === 'completed'
    ? [...records]
    : records.filter((record) => !progress[record.id]?.completed);
}
export function progressFilterPatch(value: ProgressFilter, filters: Pick<Filters, 'list'>): Partial<Filters> {
  return { progress: value, list: filters.list === 'later' ? 'later' : 'all' };
}
export type SelectionAction = 'later' | 'played' | 'completed' | 'ranking' | 'remove-later' | 'uncomplete';
export function selectionOperation(action: SelectionAction, records: LibraryRecord[]): PersonalAction {
  switch (action) {
    case 'ranking':
      return { type: 'add-ranking', records };
    case 'played':
      return { type: 'set-progress', records, key: 'played', value: true };
    case 'completed':
      return { type: 'set-progress', records, key: 'completed', value: true };
    case 'uncomplete':
      return { type: 'set-progress', records, key: 'completed', value: false };
    case 'later':
      return { type: 'set-progress', records, key: 'later', value: true };
    case 'remove-later':
      return { type: 'set-progress', records, key: 'later', value: false };
  }
}

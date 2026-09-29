import type { LibraryRecord, PersonalAction, PersonalLibraryState } from './personal-types';

/** Populated only after the device transaction commits; never persisted. */
export interface ActionFeedback {
  message?: string;
}
type ProgressState = Pick<PersonalLibraryState, 'records' | 'progress'>;

function counted(changed: number, total: number, change: string, unchanged: string): string {
  const result = `${changed} ${changed === 1 ? 'game' : 'games'} ${change}`;
  const prior = total - changed;
  return prior ? `${result}; ${prior} ${prior === 1 ? 'was' : 'were'} ${unchanged}.` : `${result}.`;
}

function progressMessage(
  records: readonly LibraryRecord[],
  key: 'later' | 'played' | 'completed',
  value: boolean,
  before: ProgressState,
): string {
  const unique = [...new Map(records.map((record) => [record.id, record])).values()];
  const changed = unique.filter((record) => Boolean(before.progress[record.id]?.[key]) !== value).length;
  const change =
    key === 'later' ? `${value ? 'added to' : 'removed from'} Play later` : `${value ? 'marked' : 'unmarked'} ${key}`;
  const unchanged =
    key === 'later'
      ? value
        ? 'already there'
        : 'already absent'
      : `already ${value ? 'marked' : 'not marked'} ${key}`;
  if (unique.length === 1) {
    const title = unique[0]!.title;
    if (!changed && key === 'later') return `${title} is ${value ? 'already' : 'not'} in Play later.`;
    return changed ? `${title} ${change}.` : `${title} was ${unchanged}${key === 'later' ? ' in Play later' : ''}.`;
  }
  return counted(changed, unique.length, change, unchanged);
}

/** Accurate counts use the validated pre-commit state, not a potentially stale rendered snapshot. */
export function actionMessage(action: PersonalAction, before?: ProgressState, after?: ProgressState): string {
  switch (action.type) {
    case 'add-records': {
      if (!before) return 'My games updated.';
      const ids = [...new Set(action.records.map((record) => record.id))];
      return counted(ids.filter((id) => !before.records[id]).length, ids.length, 'added to My games', 'already there');
    }
    case 'remove-records':
      return 'Selected games removed from your private library. The original 100 is unchanged.';
    case 'add-ranking':
      return 'Your ranking has been updated. Games are not automatically marked played.';
    case 'remove-ranking':
      return 'Removed from your personal ranking.';
    case 'move-item':
      return `${action.list === 'queue' ? 'Play later' : 'Ranking'} order updated.`;
    case 'edit-ranking':
      return 'Your opinion is saved.';
    case 'rate-game':
      return 'Your rating is saved. This game is in your private library.';
    case 'use-rating-order':
      return action.id
        ? 'This game now follows rating order.'
        : 'Automatic rating order restored. Manual positions have been cleared.';
    case 'set-motion':
      return 'Visual preference saved.';
    case 'set-progress':
      return before
        ? progressMessage(action.records, action.key, action.value, before)
        : action.key === 'later'
          ? 'Play later updated.'
          : 'Your play history is updated.';
    case 'toggle-progress':
      return before && after
        ? progressMessage([action.record], action.key, Boolean(after.progress[action.record.id]?.[action.key]), before)
        : action.key === 'later'
          ? 'Play later updated.'
          : 'Your play history is updated.';
    default:
      return 'Your library is updated.';
  }
}

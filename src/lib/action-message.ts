import type { LibraryRecord, PersonalAction, PersonalLibraryState } from './personal-types';

/** Populated only after the device transaction commits; never persisted. */
export interface ActionFeedback {
  message?: string;
}
type ActionState = Pick<PersonalLibraryState, 'records' | 'progress' | 'ranking'>;

function counted(changed: number, total: number, change: string, unchanged: string): string {
  const result = `${changed} ${changed === 1 ? 'game' : 'games'} ${change}`;
  const prior = total - changed;
  return prior ? `${result}; ${prior} ${prior === 1 ? 'was' : 'were'} ${unchanged}.` : `${result}.`;
}

function progressMessage(
  records: readonly LibraryRecord[],
  key: 'later' | 'played' | 'completed',
  value: boolean,
  before: ActionState,
): string {
  const unique = [...new Map(records.map((record) => [record.id, record])).values()];
  const changed = unique.filter((record) => Boolean(before.progress[record.id]?.[key]) !== value).length;
  const change =
    key === 'later'
      ? `${value ? 'added to' : 'removed from'} Play later`
      : `${value ? 'marked' : 'no longer marked'} ${key}`;
  const unchanged =
    key === 'later'
      ? value
        ? 'already there'
        : 'already absent'
      : value
        ? `already marked ${key}`
        : `not marked ${key}`;
  if (unique.length === 1) {
    const title = before.records[unique[0]!.id]?.title ?? unique[0]!.title;
    if (!changed && key === 'later') return `${title} is ${value ? 'already' : 'not'} in Play later.`;
    if (key !== 'later')
      return changed ? `${title} ${value ? 'marked' : 'is no longer marked'} ${key}.` : `${title} is ${unchanged}.`;
    return `${title} ${change}.`;
  }
  return counted(changed, unique.length, change, unchanged);
}

/** Accurate counts use the validated pre-commit state, not a potentially stale rendered snapshot. */
export function actionMessage(action: PersonalAction, before?: ActionState, after?: ActionState): string {
  switch (action.type) {
    case 'add-records': {
      const records = [...new Map(action.records.map((record) => [record.id, record])).values()];
      if (records.length === 1) {
        const record = records[0]!;
        const title = after?.records[record.id]?.title ?? before?.records[record.id]?.title ?? record.title;
        return `${title} ${before?.records[record.id] ? 'is already in' : 'added to'} My games.`;
      }
      if (!before) return 'My games updated.';
      const ids = records.map((record) => record.id);
      return counted(ids.filter((id) => !before.records[id]).length, ids.length, 'added to My games', 'already there');
    }
    case 'remove-records': {
      const ids = [...new Set(action.ids)];
      if (ids.length === 1 && before?.records[ids[0]!])
        return `${before.records[ids[0]!]!.title} removed from My games.`;
      return 'Selected games removed from your private library. The original 100 is unchanged.';
    }
    case 'add-ranking': {
      const records = [...new Map(action.records.map((record) => [record.id, record])).values()];
      if (records.length === 1) {
        const record = records[0]!;
        const prior = before?.ranking.some((entry) => entry.id === record.id);
        const position = after ? after.ranking.findIndex((entry) => entry.id === record.id) + 1 : 0;
        const title = after?.records[record.id]?.title ?? record.title;
        return `${title} ${prior ? 'is already in' : 'added to'} your ranking${position ? ` at #${position}` : ''}.`;
      }
      if (!before) return 'Ranking updated.';
      const ranked = new Set(before.ranking.map((entry) => entry.id));
      return counted(
        records.filter((record) => !ranked.has(record.id)).length,
        records.length,
        'added to your ranking',
        'already there',
      );
    }
    case 'remove-ranking': {
      const ids = [...new Set(action.ids)];
      if (ids.length === 1 && before?.records[ids[0]!])
        return `${before.records[ids[0]!]!.title} removed from your ranking.`;
      return 'Selected games removed from your ranking.';
    }
    case 'move-item': {
      const title = after?.records[action.id]?.title ?? before?.records[action.id]?.title;
      return `${title ? `${title}: ` : ''}${action.list === 'queue' ? 'Play later' : 'Ranking'} order updated.`;
    }
    case 'edit-ranking': {
      const title = after?.records[action.id]?.title ?? before?.records[action.id]?.title;
      const saved = Object.hasOwn(action, 'note')
        ? Object.hasOwn(action, 'score')
          ? 'rating and note saved'
          : 'note saved'
        : 'rating saved';
      return title ? `${title}: ${saved}.` : `${saved[0]!.toUpperCase()}${saved.slice(1)}.`;
    }
    case 'rate-game':
      return `${after?.records[action.record.id]?.title ?? action.record.title}: rating saved.`;
    case 'use-rating-order':
      return action.id
        ? `${after?.records[action.id]?.title ?? before?.records[action.id]?.title ?? 'This game'} now follows rating order.`
        : 'Ranking now follows your ratings. Fixed positions cleared.';
    case 'set-motion':
      return 'Visual preference saved.';
    case 'set-progress':
      return before
        ? progressMessage(action.records, action.key, action.value, before)
        : action.key === 'later'
          ? 'Play later updated.'
          : 'Play history updated.';
    case 'toggle-progress':
      return before && after
        ? progressMessage([action.record], action.key, Boolean(after.progress[action.record.id]?.[action.key]), before)
        : action.key === 'later'
          ? 'Play later updated.'
          : 'Play history updated.';
    default:
      return 'My games updated.';
  }
}

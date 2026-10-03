import type { PersonalLibraryState } from './personal-types.js';
import { MAX_BACKUP_FILE_BYTES, MAX_LIBRARY_BACKUP_BYTES } from './personal-types.js';
import {
  budgetError,
  formatBackupBytes,
  formatBackupLimit,
  invalidLibrary,
  libraryBackupBytes,
  libraryObject,
  libraryShape,
  parsePersonalLibrary,
} from './personal-library.js';

// Restoring a backup file, which only Settings does. Kept out of personal-library.ts, which every page loads at start.

/** Pre-parse size gate for a backup file; pretty-printed older exports get the extra allowance. */
export function backupFileSizeError(size: number, budget = MAX_LIBRARY_BACKUP_BYTES): string | null {
  const cap = budget + (MAX_BACKUP_FILE_BYTES - MAX_LIBRARY_BACKUP_BYTES);
  return size > cap
    ? `This backup file exceeds the ${formatBackupLimit(cap)} import limit. No data was changed.`
    : null;
}

/** Parses backup text and applies the library budget to its compact size. */
export function readLibraryBackup(text: string, budget = MAX_LIBRARY_BACKUP_BYTES): PersonalLibraryState {
  const state = parseLibraryBackup(JSON.parse(text));
  const bytes = libraryBackupBytes(state);
  if (bytes > budget) {
    return budgetError(
      `This backup holds a library ${formatBackupBytes(bytes - budget)} over the ${formatBackupLimit(budget)} backup limit. No data was changed.`,
    );
  }
  return state;
}

/** The restore preview's counts, with one saved game in the singular. */
export function describeLibraryBackup(state: Pick<PersonalLibraryState, 'records' | 'queueOrder' | 'ranking'>): string {
  const games = Object.keys(state.records).length;
  return `${games} ${games === 1 ? 'game' : 'games'}, ${state.queueOrder.length} in Play later, ${state.ranking.length} ranked.`;
}

export function parseLibraryBackup(value: unknown): PersonalLibraryState {
  const input = libraryShape(value, ['app', 'formatVersion', 'exportedAt', 'library'], 'The backup');
  if (input.app !== 'Play 100' || (input.formatVersion !== 2 && input.formatVersion !== 3)) {
    return invalidLibrary('this is not a supported Play 100 backup.');
  }
  const library = libraryObject(input.library, 'The backup library');
  if (library.version !== input.formatVersion) return invalidLibrary('the backup and library versions do not agree.');
  if (
    typeof input.exportedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.exportedAt) ||
    !Number.isFinite(Date.parse(input.exportedAt)) ||
    new Date(`${input.exportedAt.slice(0, 10)}T00:00:00.000Z`).toISOString().slice(0, 10) !==
      input.exportedAt.slice(0, 10)
  ) {
    return invalidLibrary('the backup export date is missing or invalid. Export a new backup and try again.');
  }
  return parsePersonalLibrary(library);
}

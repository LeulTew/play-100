import type { Game, MotionPreference } from './types.js';

export const MAX_LIBRARY_RECORDS = 10_000;
export const MAX_LIBRARY_ID_CHARACTERS = 200;
export const MAX_LIBRARY_TITLE_CHARACTERS = 200;
/**
 * One byte contract for the whole library: the exact UTF-8 length of the compact backup JSON
 * (`JSON.stringify(createLibraryBackup(state))`). Writes that would grow past it are refused,
 * export refuses to produce a larger file, and import rejects a larger library after parsing.
 */
export const MAX_LIBRARY_BACKUP_BYTES = 20 * 1024 * 1024;
/** Pre-parse file cap: the budget plus room for pretty-printed v2/v3 backups from older exports. */
export const MAX_BACKUP_FILE_BYTES = MAX_LIBRARY_BACKUP_BYTES + 4 * 1024 * 1024;

export type GameSource = 'collection' | 'steam' | 'wikidata' | 'freetogame' | 'manual';

export interface LibraryRecord {
  id: string;
  title: string;
  year: number | null;
  studio: string | null;
  genre: string | null;
  source: GameSource;
  sourceId: string;
  sourceUrl: string | null;
  collectionRank: number | null;
}

export interface PersonalProgress {
  later: boolean;
  completed: boolean;
  played: boolean;
}

export interface PersonalRanking {
  id: string;
  score: number | null;
  note: string;
  manualPosition: number | null;
}

export interface PersonalLibraryState {
  version: 3;
  revision: number;
  records: Record<string, LibraryRecord>;
  progress: Record<string, PersonalProgress>;
  queueOrder: string[];
  ranking: PersonalRanking[];
  motion: MotionPreference;
}

export type PersonalAction =
  | { type: 'add-records'; records: LibraryRecord[] }
  | { type: 'remove-records'; ids: string[] }
  | { type: 'set-progress'; records: LibraryRecord[]; key: keyof PersonalProgress; value: boolean }
  | { type: 'toggle-progress'; record: LibraryRecord; key: keyof PersonalProgress }
  | { type: 'add-ranking'; records: LibraryRecord[] }
  | { type: 'remove-ranking'; ids: string[] }
  | { type: 'edit-ranking'; id: string; score?: number | null; note?: string }
  | { type: 'rate-game'; record: LibraryRecord; score: number | null }
  | { type: 'use-rating-order'; id?: string }
  | { type: 'move-item'; list: 'queue' | 'ranking'; id: string; overId: string }
  | { type: 'set-motion'; motion: MotionPreference };

export interface PersonalLibraryLoad {
  state: PersonalLibraryState;
  notice: string | null;
  migrated: boolean;
}

export interface LibraryBackup {
  app: 'Play 100';
  formatVersion: 3;
  exportedAt: string;
  library: PersonalLibraryState;
}

export function recordFromGame(game: Game): LibraryRecord {
  return {
    id: game.slug,
    title: game.title,
    year: game.year,
    studio: game.studio,
    genre: game.genre,
    source: 'collection',
    sourceId: game.slug,
    sourceUrl: null,
    collectionRank: game.rank,
  };
}

export const SOURCE_LABELS: Record<GameSource, string> = {
  collection: 'Author\'s 100',
  steam: 'Steam',
  wikidata: 'Wikidata',
  freetogame: 'FreeToGame',
  manual: 'Added by you',
};

import type { Game, MotionPreference } from './types';

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

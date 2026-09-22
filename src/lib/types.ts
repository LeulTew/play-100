export interface Critics {
  metacritic: number | null;
  metacriticPc: number | null;
  ign: number | null;
  gamespot: number | null;
  pcGamer: number | null;
}

export interface AuthorRating {
  value: number;
  rawValue: string;
  display: string;
  sourceCell: string;
  numberFormat: string;
  sourceType: 'number' | 'text';
}

export interface Game {
  rank: number;
  slug: string;
  title: string;
  year: number;
  studio: string;
  genre: string;
  genreTags: string[];
  tier: 'core' | 'essential';
  critics: Critics;
  criticAverage: number | null;
  rankIndex: number;
  authorRating: AuthorRating | null;
  rationale: string;
  sourceNote: string | null;
  artwork: { file: string; source: 'User-provided workbook' } | null;
}

export interface CollectionData {
  schemaVersion: 1;
  collection: {
    title: string;
    sourceFile: string;
    scope: string;
    rankingBasis: string;
    criticScoresAreSnapshot: true;
    authorRatingsAreOriginal: boolean;
  };
  games: Game[];
}

export type ListFilter = 'all' | 'later' | 'completed' | 'unplayed';
export type SortOrder = 'rank' | 'title' | 'newest' | 'oldest' | 'score' | keyof Critics | 'rank-index' | 'author-rating';
export type SortDirection = 'auto' | 'asc' | 'desc';
export type ViewMode = 'grid' | 'list' | 'table';
export type AppPage = 'collection' | 'games' | 'library' | 'rankings' | 'discover' | 'account' | 'publish' | 'community' | 'profile' | 'creator' | 'friends' | 'friend' | 'invite' | 'compare' | 'friend-sharing' | 'friend-shelf';
export type MotionPreference = 'auto' | 'full' | 'lite';

export interface Filters {
  q: string;
  genre: string;
  year: string;
  tier: 'all' | 'core' | 'essential';
  list: ListFilter;
  sort: SortOrder;
  direction: SortDirection;
  view: ViewMode;
  catalogs: 'on' | 'off';
  progress?: import('./game-progress.js').ProgressFilter;
}

export interface GameProgress {
  later: boolean;
  completed: boolean;
  played?: boolean;
}

export type Progress = Record<string, GameProgress>;

export interface LibraryState {
  version: 1;
  progress: Progress;
  motion: MotionPreference;
}

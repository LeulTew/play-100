import type { AuthorRating, CollectionData, Critics, Filters, Game, Progress, SortOrder } from './types';

const SCORE_SCALES: Record<keyof Critics, number> = {
  metacritic: 100,
  metacriticPc: 100,
  ign: 10,
  gamespot: 10,
  pcGamer: 100,
};

export const criticColumns: { key: keyof Critics; label: string; scale: number }[] = [
  { key: 'metacritic', label: 'Metacritic', scale: 100 },
  { key: 'metacriticPc', label: 'Metacritic PC', scale: 100 },
  { key: 'ign', label: 'IGN', scale: 10 },
  { key: 'gamespot', label: 'GameSpot', scale: 10 },
  { key: 'pcGamer', label: 'PC Gamer', scale: 100 },
];

export function normalizedAverage(critics: Critics): number | null {
  const entered = criticColumns.flatMap(({ key, scale }) =>
    critics[key] === null ? [] : [(critics[key] / scale) * 100],
  );
  return entered.length ? entered.reduce((sum, score) => sum + score, 0) / entered.length : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readAuthorRating(value: unknown, rank: number): AuthorRating | null {
  if (value === undefined || value === null) return null;
  if (
    !isRecord(value) || typeof value.value !== 'number' || !Number.isFinite(value.value) ||
    value.value < 0 || value.value > 10 || !hasText(value.rawValue) || value.rawValue.length > 150 ||
    !hasText(value.display) || value.display.length > 150 ||
    value.sourceCell !== `L${rank <= 50 ? rank + 4 : rank + 5}` ||
    !hasText(value.numberFormat) || value.numberFormat.length > 100 ||
    (value.sourceType !== 'number' && value.sourceType !== 'text') ||
    Number.parseFloat(value.rawValue) !== value.value
  ) throw new Error(`The original author rating is invalid for entry ${rank}.`);
  return {
    value: value.value, rawValue: value.rawValue, display: value.display, sourceCell: value.sourceCell,
    numberFormat: value.numberFormat, sourceType: value.sourceType,
  };
}

export function parseCollection(value: unknown): CollectionData {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.collection) || !Array.isArray(value.games)) {
    throw new Error('The collection file has an unsupported format.');
  }
  const metadata = value.collection;
  if (
    !hasText(metadata.title) || !hasText(metadata.sourceFile) || !hasText(metadata.scope) ||
    !hasText(metadata.rankingBasis) || metadata.criticScoresAreSnapshot !== true
  ) {
    throw new Error('The collection source information is incomplete.');
  }
  if (value.games.length !== 100) throw new Error('The collection must contain exactly 100 games.');

  const slugs = new Set<string>();
  const games: Game[] = value.games.map((row: unknown, index: number) => {
    if (!isRecord(row)) throw new Error(`Collection entry ${index + 1} is unreadable.`);
    const tier = index < 50 ? 'core' : 'essential';
    const authorRating = readAuthorRating(row.authorRating, index + 1);
    if (metadata.authorRatingsAreOriginal === true && !authorRating) throw new Error(`The original author rating is missing for entry ${index + 1}.`);
    if (
      row.rank !== index + 1 || !hasText(row.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) ||
      slugs.has(row.slug) || !hasText(row.title) || !hasText(row.studio) || !hasText(row.genre) ||
      !hasText(row.rationale) || !Number.isInteger(row.year) || typeof row.year !== 'number' ||
      row.year < 1970 || row.year > 2100 ||
      !Array.isArray(row.genreTags) || !row.genreTags.every(hasText) ||
      row.tier !== tier ||
      (row.sourceNote !== null && !hasText(row.sourceNote)) ||
      typeof row.rankIndex !== 'number' || Math.abs(row.rankIndex - (10 - index * 3 / 99)) > 0.0001
    ) {
      throw new Error(`Collection entry ${index + 1} has invalid or inconsistent information.`);
    }
    if (!isRecord(row.critics)) throw new Error(`Critic data is missing for entry ${index + 1}.`);
    const values = row.critics;
    const readScore = (key: keyof Critics): number | null => {
      const score = values[key];
      if (score !== null && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > SCORE_SCALES[key])) {
        throw new Error(`The ${key} score is invalid for entry ${index + 1}.`);
      }
      return score;
    };
    const critics: Critics = {
      metacritic: readScore('metacritic'), metacriticPc: readScore('metacriticPc'),
      ign: readScore('ign'), gamespot: readScore('gamespot'), pcGamer: readScore('pcGamer'),
    };
    const average = normalizedAverage(critics);
    if (
      (average === null && row.criticAverage !== null) ||
      (average !== null && (typeof row.criticAverage !== 'number' || Math.abs(row.criticAverage - average) > 0.001))
    ) {
      throw new Error(`The score average is inconsistent for entry ${index + 1}.`);
    }
    let artwork: Game['artwork'] = null;
    if (row.artwork !== null) {
      if (
        !isRecord(row.artwork) || row.artwork.source !== 'User-provided workbook' ||
        typeof row.artwork.file !== 'string' || !/^assets\/[a-z0-9-]+\.(?:jpe?g|png|webp)$/i.test(row.artwork.file)
      ) {
        throw new Error(`The artwork reference is invalid for entry ${index + 1}.`);
      }
      artwork = { file: row.artwork.file, source: 'User-provided workbook' };
    }
    slugs.add(row.slug);
    return {
      rank: index + 1, slug: row.slug, title: row.title, year: row.year, studio: row.studio,
      genre: row.genre, genreTags: row.genreTags, tier, critics, criticAverage: average,
      rankIndex: row.rankIndex, authorRating, rationale: row.rationale, sourceNote: row.sourceNote, artwork,
    };
  });
  return {
    schemaVersion: 1,
    collection: {
      title: metadata.title, sourceFile: metadata.sourceFile, scope: metadata.scope,
      rankingBasis: metadata.rankingBasis, criticScoresAreSnapshot: true,
      authorRatingsAreOriginal: metadata.authorRatingsAreOriginal === true,
    },
    games,
  };
}

export function searchText(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function filterGames(games: Game[], filters: Filters, progress: Progress, catalogMatches: ReadonlySet<string> = new Set()): Game[] {
  const terms = searchText(filters.q).split(' ').filter(Boolean);
  const selected = games.filter((game) => {
    if (filters.genre && game.genre !== filters.genre) return false;
    if (filters.year && game.year !== Number(filters.year)) return false;
    if (filters.tier !== 'all' && game.tier !== filters.tier) return false;
    const state = progress[game.slug];
    if (!matchesProgressFilters(state, filters)) return false;
    const searchable = searchText(`${game.title} ${game.studio} ${game.genre} ${game.year}`);
    const words = searchable.split(' ');
    return catalogMatches.has(game.slug) || terms.every((term) => /^\d+$/.test(term) ? words.includes(term) : searchable.includes(term));
  });
  const sign = sortDirection(filters) === 'asc' ? 1 : -1;
  return selected.sort((a, b) => {
    const left = sortValue(a, filters.sort);
    const right = sortValue(b, filters.sort);
    if (left === null) return right === null ? a.rank - b.rank : 1;
    if (right === null) return -1;
    const difference = typeof left === 'string' && typeof right === 'string'
      ? left.localeCompare(right, 'en') : Number(left) - Number(right);
    return sign * difference || a.rank - b.rank;
  });
}

export function sortDirection(filters: Pick<Filters, 'sort' | 'direction'>): 'asc' | 'desc' {
  if (filters.direction !== 'auto') return filters.direction;
  return ['rank', 'title', 'oldest'].includes(filters.sort) ? 'asc' : 'desc';
}

function sortValue(game: Game, sort: SortOrder): number | string | null {
  if (sort === 'title') return game.title;
  if (sort === 'newest' || sort === 'oldest') return game.year;
  if (sort === 'score') return game.criticAverage;
  if (sort === 'author-rating') return game.authorRating?.value ?? null;
  if (sort === 'rank-index') return game.rankIndex;
  if (sort === 'rank') return game.rank;
  return game.critics[sort];
}

export function artworkUrl(game: Game): string | null {
  if (!game.artwork) return null;
  return `/covers/${game.slug}.webp`;
}

export function formatAverage(score: number | null): string {
  return score === null ? 'Unavailable' : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(score);
}
import { matchesProgressFilters } from './game-progress';

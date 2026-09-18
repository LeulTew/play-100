import type { PublicEntry } from './community';
import type { GameSource } from './personal-types';

export const FRIEND_COMPARISON_LIMITS = Object.freeze({
  minParticipants: 2,
  maxParticipants: 6,
  maxFriendEntries: 200,
  maxSelfEntries: 10_000,
  maxPageSize: 25,
});

export type ComparisonEntry = Readonly<PublicEntry>;
export type ComparisonIdentity = Readonly<Pick<PublicEntry, 'id' | 'source' | 'sourceId'>>;
export type ComparisonAvailability = 'ready' | 'loading' | 'unshared' | 'unavailable' | 'error';
export type ComparisonFreshness = 'fresh' | 'stale' | 'unknown';
type UnreadyAvailability = Exclude<ComparisonAvailability, 'ready'>;
export type ComparisonCoverage = { kind: 'complete' | 'page'; total: number } | { kind: 'exact'; total: number; ids: readonly string[] };

export interface ComparisonParticipantInfo {
  readonly id: string;
  readonly displayName: string;
  readonly kind: 'self' | 'friend';
  readonly availability: ComparisonAvailability;
  readonly freshness: ComparisonFreshness;
  readonly updatedAt: number | null;
  readonly coverage?: ComparisonCoverage;
}

type ParticipantDetails = Omit<ComparisonParticipantInfo, 'availability' | 'updatedAt'> & {
  readonly updatedAt?: number | null;
};

/**
 * Only ready snapshots contribute entries. Usable cached data is ready + stale;
 * all other availability states must omit entries, not substitute an empty list.
 */
export type ComparisonParticipant = ParticipantDetails & (
  | { readonly availability: 'ready'; readonly entries: readonly ComparisonEntry[] }
  | { readonly availability: UnreadyAvailability; readonly entries?: never }
);

export type ComparisonCell =
  | {
    readonly participantId: string;
    readonly status: 'ranked';
    readonly entry: ComparisonEntry;
    readonly position: number;
    readonly score: number | null;
  }
  | {
    readonly participantId: string;
    /** Absent means not in the supplied list, not necessarily unranked or unplayed. */
    readonly status: 'absent' | 'unfetched' | UnreadyAvailability;
    readonly position: null;
    readonly score: null;
  };

export interface ComparisonRow {
  readonly key: string;
  /** Metadata from the first participant in cohort order who supplied this identity. */
  readonly game: Readonly<Omit<PublicEntry, 'position' | 'score'>>;
  readonly cells: readonly ComparisonCell[];
  /** Ranked entries, including entries whose score is null. */
  readonly coverage: number;
  readonly raterCount: number;
  readonly meanScore: number | null;
  /** Null unless at least two scores were supplied. Equal scores have spread zero. */
  readonly scoreSpread: number | null;
  /** First participant minus second; null outside a two-person, jointly-rated row. */
  readonly scoreDifference: number | null;
}

export interface ComparisonCohort {
  readonly participantIds: readonly string[];
  readonly participantCount: number;
  readonly availableParticipantIds: readonly string[];
  readonly availableParticipantCount: number;
  readonly unavailableParticipantIds: readonly string[];
  readonly staleParticipantIds: readonly string[];
  /** Missing snapshots, not empty ready lists. Freshness is reported separately. */
  readonly incomplete: boolean;
}

export interface ComparisonPairSummary {
  readonly participantIds: readonly [string, string];
  readonly incomplete: boolean;
  readonly hasStaleData: boolean;
  /** Counts are unknown (null), not zero, if either snapshot is not ready. */
  readonly sharedGameCount: number | null;
  readonly jointlyRatedCount: number | null;
  readonly meanAbsoluteScoreGap: number | null;
}

export interface ComparisonSummary {
  readonly availableGameCount: number;
  /** Whole-cohort intersection counts are unknown until every participant is ready. */
  readonly sharedGameCount: number | null;
  readonly jointlyRatedCount: number | null;
  readonly pairs: readonly ComparisonPairSummary[];
}

export type ComparisonMode = 'common-ranked' | 'all-shared';

export interface FriendComparison {
  readonly participants: readonly ComparisonParticipantInfo[];
  readonly cohort: ComparisonCohort;
  readonly rows: Readonly<Record<ComparisonMode, readonly ComparisonRow[]>>;
  readonly summary: ComparisonSummary;
}

type AggregateSort = 'title' | 'coverage' | 'rater-count' | 'mean-score' | 'score-spread' | 'score-difference';
export type ComparisonSort = (
  | { readonly by: AggregateSort }
  | { readonly by: 'position' | 'score'; readonly participantId: string }
) & { readonly direction?: 'asc' | 'desc' };

export interface ComparisonPageOptions {
  readonly mode?: ComparisonMode;
  readonly query?: string;
  readonly minCoverage?: number;
  readonly minRaters?: number;
  readonly sort?: ComparisonSort;
  readonly page?: number;
  /** Defaults to 25; smaller pages are allowed, larger pages are rejected. */
  readonly pageSize?: number;
  /** Optional UI-only filter; it never adds games or entries to a participant snapshot. */
  readonly games?: readonly ComparisonIdentity[];
}

export interface ComparisonPage {
  readonly mode: ComparisonMode;
  readonly cohort: ComparisonCohort;
  readonly rows: readonly ComparisonRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
  readonly pageCount: number;
}

export class FriendComparisonValidationError extends Error {
  constructor(message: string) {
    super(`Invalid friend comparison: ${message}`);
    this.name = 'FriendComparisonValidationError';
  }
}

const sources: readonly GameSource[] = ['collection', 'steam', 'wikidata', 'freetogame', 'manual'];
const availabilityStates: readonly ComparisonAvailability[] = ['ready', 'loading', 'unshared', 'unavailable', 'error'];
const freshnessStates: readonly ComparisonFreshness[] = ['fresh', 'stale', 'unknown'];
const forbiddenIds = new Set(['__proto__', 'constructor', 'prototype']);
const entryFields = ['id', 'title', 'year', 'source', 'sourceId', 'sourceUrl', 'score', 'position'];

function invalid(message: string): never {
  throw new FriendComparisonValidationError(message);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(`${label} must be an object.`);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid(`${label} must contain plain data.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || forbiddenIds.has(key) || !property?.enumerable || !('value' in property)) {
      return invalid(`${label} contains unsupported fields or accessors.`);
    }
  }
  return value as Record<string, unknown>;
}

function shape(value: unknown, required: readonly string[], label: string, optional: readonly string[] = []) {
  const row = object(value, label);
  if (required.some((key) => !Object.hasOwn(row, key)) ||
    Object.keys(row).some((key) => !required.includes(key) && !optional.includes(key))) {
    return invalid(`${label} has missing or unsupported fields.`);
  }
  return row;
}

function text(value: unknown, label: string, nonempty = true): string {
  if (typeof value !== 'string' || value.length > 200 || (nonempty && !value.trim())) {
    return invalid(`${label} must be ${nonempty ? 'nonempty ' : ''}text of at most 200 characters.`);
  }
  return value;
}

function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    return invalid(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function safeGameId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(value) || forbiddenIds.has(value)) {
    return invalid('A game identity has an unsupported ID.');
  }
  return value;
}

function identity(row: Record<string, unknown>) {
  const source = sources.find((candidate) => candidate === row.source);
  if (!source) return invalid('A game identity has an unsupported source.');
  const id = safeGameId(row.id);
  const sourceId = safeGameId(row.sourceId);
  if (source === 'collection') {
    if (id !== sourceId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceId)) {
      return invalid('A collection identity must use its exact collection slug.');
    }
  } else if (id !== `${source}:${sourceId}` ||
    (source === 'wikidata' && !/^Q[1-9]\d*$/.test(sourceId)) ||
    ((source === 'steam' || source === 'freetogame') && !/^[1-9]\d*$/.test(sourceId))) {
    return invalid('A game identity has an unsupported or inconsistent source ID.');
  }
  return { id, source, sourceId, key: source === 'manual' ? id : `${source}:${sourceId}` };
}

/** Exact, case-sensitive identities only. Titles, years and URLs never establish a match. */
export function comparisonGameKey(value: ComparisonIdentity): string {
  return identity(object(value, 'Game identity')).key;
}

function sourceUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || /\s/.test(value) || !/^https:\/\//i.test(value)) {
    return invalid('A source URL must be null or an HTTPS URL without credentials.');
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      return invalid('A source URL must be an HTTPS URL without credentials.');
    }
  } catch {
    return invalid('A source URL must be an HTTPS URL without credentials.');
  }
  return value;
}

function readEntry(value: unknown, limit: number) {
  const row = shape(value, entryFields, 'A ranked entry');
  const game = identity(row);
  const position = integer(row.position, 1, limit, 'A ranked position');
  const score = row.score;
  if (score !== null && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 10)) {
    return invalid('A score must be null or a finite number from 0 to 10.');
  }
  const entry: ComparisonEntry = {
    id: game.id,
    title: text(row.title, 'A game title'),
    year: row.year === null ? null : integer(row.year, 1900, 2100, 'A game year'),
    source: game.source,
    sourceId: game.sourceId,
    sourceUrl: sourceUrl(row.sourceUrl),
    score,
    position,
  };
  return { key: game.key, entry };
}

interface IndexedParticipant {
  readonly info: ComparisonParticipantInfo;
  readonly entries: ReadonlyMap<string, ComparisonEntry> | null;
  readonly complete: boolean;
  readonly resolvedIds: ReadonlySet<string> | null;
}

function readParticipant(value: unknown): IndexedParticipant {
  const row = shape(value, ['id', 'displayName', 'kind', 'availability', 'freshness'], 'A participant', ['updatedAt', 'entries', 'coverage']);
  const id = text(row.id, 'A participant ID');
  if (id !== id.trim()) return invalid('A participant ID must not have surrounding whitespace.');
  if (row.kind !== 'self' && row.kind !== 'friend') return invalid('A participant kind must be self or friend.');
  const availability = availabilityStates.find((state) => state === row.availability);
  const freshness = freshnessStates.find((state) => state === row.freshness);
  if (!availability || !freshness) return invalid('A participant has unsupported availability or freshness.');
  const info: ComparisonParticipantInfo = {
    id,
    displayName: text(row.displayName, 'A display name'),
    kind: row.kind,
    availability,
    freshness,
    updatedAt: row.updatedAt === undefined || row.updatedAt === null
      ? null : integer(row.updatedAt, 0, Number.MAX_SAFE_INTEGER, 'A snapshot timestamp'),
  };
  let complete = true; let resolvedIds: ReadonlySet<string> | null = null;
  if (row.coverage !== undefined) {
    const coverage = object(row.coverage, 'Coverage');
    if (!['complete', 'page', 'exact'].includes(String(coverage.kind))) return invalid('Unsupported loaded coverage.');
    const total = integer(coverage.total, 0, 10_000, 'Shared total');
    if (coverage.kind === 'exact') {
      shape(coverage, ['kind', 'total', 'ids'], 'Exact coverage');
      if (!Array.isArray(coverage.ids) || !coverage.ids.length || coverage.ids.length > 6) return invalid('Exact coverage requires one to six IDs.');
      resolvedIds = new Set(coverage.ids.map(safeGameId));
      if (resolvedIds.size !== coverage.ids.length) return invalid('Exact coverage contains duplicate IDs.');
      Object.assign(info, { coverage: { kind: 'exact', total, ids: [...resolvedIds] } });
    } else {
      shape(coverage, ['kind', 'total'], 'Paged coverage');
      Object.assign(info, { coverage: { kind: coverage.kind, total } });
    }
    complete = coverage.kind === 'complete';
  }
  if (availability !== 'ready') {
    if (row.entries !== undefined) return invalid('A participant that is not ready must omit entries.');
    return { info, entries: null, complete: false, resolvedIds: null };
  }
  const limit = row.kind === 'self' || row.coverage !== undefined
    ? FRIEND_COMPARISON_LIMITS.maxSelfEntries : FRIEND_COMPARISON_LIMITS.maxFriendEntries;
  if (!Array.isArray(row.entries) || row.entries.length > limit) {
    return invalid(`A ${row.kind} snapshot must have an entries array of at most ${limit} rows.`);
  }
  const entries = new Map<string, ComparisonEntry>();
  const positions = new Set<number>();
  const entryCount = row.entries.length;
  for (let index = 0; index < entryCount; index += 1) {
    const { key, entry } = readEntry(row.entries[index], limit);
    if (entries.has(key)) return invalid(`Participant ${id} has a duplicate game identity.`);
    if (positions.has(entry.position)) return invalid(`Participant ${id} has a duplicate ranked position.`);
    entries.set(key, entry);
    positions.add(entry.position);
    if (resolvedIds && !resolvedIds.has(entry.id)) return invalid('An exact lookup returned an unresolved game.');
  }
  if (info.coverage && (entries.size > info.coverage.total || complete && entries.size !== info.coverage.total)) return invalid('Loaded coverage disagrees with the shared total.');
  return { info, entries, complete, resolvedIds };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareTitles(left: ComparisonRow, right: ComparisonRow): number {
  return compareText(left.game.title.toLowerCase(), right.game.title.toLowerCase()) ||
    compareText(left.game.title, right.game.title) || compareText(left.key, right.key);
}

function makeRow(key: string, game: ComparisonRow['game'], participants: readonly IndexedParticipant[]): ComparisonRow {
  let coverage = 0;
  const scores: number[] = [];
  const cells = participants.map(({ info, entries, complete, resolvedIds }): ComparisonCell => {
    if (info.availability !== 'ready') {
      return { participantId: info.id, status: info.availability, position: null, score: null };
    }
    const entry = entries!.get(key);
    if (!entry) return { participantId: info.id, status: complete || resolvedIds?.has(game.id) ? 'absent' : 'unfetched', position: null, score: null };
    coverage++;
    if (entry.score !== null) scores.push(entry.score);
    return { participantId: info.id, status: 'ranked', entry, position: entry.position, score: entry.score };
  });
  const first = cells[0]!;
  const second = cells[1]!;
  const partial = cells.some(cell => cell.status === 'unfetched');
  return {
    key,
    game,
    cells,
    coverage,
    raterCount: scores.length,
    meanScore: !partial && scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    scoreSpread: !partial && scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : null,
    scoreDifference: !partial && cells.length === 2 && first.score !== null && second.score !== null
      ? first.score - second.score : null,
  };
}

function pairSummary(left: IndexedParticipant, right: IndexedParticipant): ComparisonPairSummary {
  const base = {
    participantIds: [left.info.id, right.info.id] as const,
    hasStaleData: [left, right].some(({ info }) => info.availability === 'ready' && info.freshness === 'stale'),
  };
  if (left.entries === null || right.entries === null || !left.complete || !right.complete) {
    return { ...base, incomplete: true, sharedGameCount: null, jointlyRatedCount: null, meanAbsoluteScoreGap: null };
  }
  // Only explicitly complete bounded snapshots contribute whole-list metrics.
  const [smaller, larger] = left.entries.size <= right.entries.size
    ? [left.entries, right.entries] : [right.entries, left.entries];
  const common: { key: string; left: ComparisonEntry; right: ComparisonEntry }[] = [];
  for (const [key, entry] of smaller!) {
    const other = larger!.get(key);
    if (other) common.push({ key, left: entry, right: other });
  }
  // A fixed accumulation order also makes floating-point results independent of input array order.
  common.sort((a, b) => compareText(a.key, b.key));
  let jointlyRatedCount = 0;
  let gapSum = 0;
  for (const { left: a, right: b } of common) {
    if (a.score !== null && b.score !== null) {
      jointlyRatedCount++;
      gapSum += Math.abs(a.score - b.score);
    }
  }
  return {
    ...base,
    incomplete: false,
    sharedGameCount: common.length,
    jointlyRatedCount,
    meanAbsoluteScoreGap: jointlyRatedCount ? gapSum / jointlyRatedCount : null,
  };
}

/**
 * Pure calculation: callers enforce privacy, fetch snapshots and validate catalog membership.
 * Array order never replaces an entry's position; sparse positions within the appropriate
 * private/public limit are allowed. All-shared includes available local self entries, if supplied.
 * Common-ranked requires the entire selected cohort; an incomplete cohort has no confirmed
 * common rows and null intersection counts, while ready pairs still have their own metrics.
 */
export function compareFriendRankings(input: readonly ComparisonParticipant[]): FriendComparison {
  if (!Array.isArray(input) || input.length < FRIEND_COMPARISON_LIMITS.minParticipants ||
    input.length > FRIEND_COMPARISON_LIMITS.maxParticipants) {
    return invalid('Choose between 2 and 6 distinct participants.');
  }
  // Index the bounded arrays; user-supplied iterators must not expand a checked cohort.
  const indexed: IndexedParticipant[] = [];
  const participantCount = input.length;
  for (let index = 0; index < participantCount; index += 1) indexed.push(readParticipant(input[index]));
  const participants = indexed.map(({ info }) => info);
  if (new Set(participants.map(({ id }) => id)).size !== participants.length) {
    return invalid('The cohort contains duplicate participants.');
  }
  if (participants.filter(({ kind }) => kind === 'self').length > 1) {
    return invalid('The cohort may contain at most one local self.');
  }
  const availableParticipantIds = participants.filter(({ availability }) => availability === 'ready').map(({ id }) => id);
  const cohort: ComparisonCohort = {
    participantIds: participants.map(({ id }) => id),
    participantCount: participants.length,
    availableParticipantIds,
    availableParticipantCount: availableParticipantIds.length,
    unavailableParticipantIds: participants.filter(({ availability }) => availability !== 'ready').map(({ id }) => id),
    staleParticipantIds: participants.filter(({ availability, freshness }) => availability === 'ready' && freshness === 'stale').map(({ id }) => id),
    incomplete: availableParticipantIds.length !== participants.length || indexed.some(value => !value.complete),
  };
  const games = new Map<string, ComparisonRow['game']>();
  for (const { entries } of indexed) {
    if (entries === null) continue;
    for (const [key, entry] of entries) {
      if (!games.has(key)) {
        const { id, title, year, source, sourceId, sourceUrl } = entry;
        games.set(key, { id, title, year, source, sourceId, sourceUrl });
      }
    }
  }
  const allShared = Array.from(games, ([key, game]) => makeRow(key, game, indexed)).sort(compareTitles);
  const commonRanked = allShared.filter((row) => row.coverage === participants.length);
  const pairs: ComparisonPairSummary[] = [];
  for (let left = 0; left < indexed.length; left++) {
    for (let right = left + 1; right < indexed.length; right++) {
      pairs.push(pairSummary(indexed[left]!, indexed[right]!));
    }
  }
  return {
    participants,
    cohort,
    rows: { 'common-ranked': commonRanked, 'all-shared': allShared },
    summary: {
      availableGameCount: allShared.length,
      sharedGameCount: cohort.incomplete ? null : commonRanked.length,
      jointlyRatedCount: cohort.incomplete ? null : commonRanked.filter((row) => row.raterCount === participants.length).length,
      pairs,
    },
  };
}

function sortRows(rows: ComparisonRow[], comparison: FriendComparison, value: unknown): void {
  const sort: Record<string, unknown> = value === undefined
    ? { by: 'title' } : shape(value, ['by'], 'A row sort', ['direction', 'participantId']);
  const fields = ['title', 'coverage', 'rater-count', 'mean-score', 'score-spread', 'score-difference', 'position', 'score'];
  if (typeof sort.by !== 'string' || !fields.includes(sort.by)) return invalid('The row sort is unsupported.');
  const direction = sort.direction === undefined ? 'asc' : sort.direction;
  if (direction !== 'asc' && direction !== 'desc') return invalid('A sort direction must be asc or desc.');
  const perParticipant = sort.by === 'position' || sort.by === 'score';
  const participantIndex = comparison.participants.findIndex(({ id }) => id === sort.participantId);
  if (perParticipant ? participantIndex < 0 : Object.hasOwn(sort, 'participantId')) {
    return invalid('A position or score sort requires exactly one selected participant ID.');
  }
  const metric = (row: ComparisonRow): number | null => {
    switch (sort.by) {
      case 'coverage': return row.coverage;
      case 'rater-count': return row.raterCount;
      case 'mean-score': return row.meanScore;
      case 'score-spread': return row.scoreSpread;
      case 'score-difference': return row.scoreDifference;
      case 'position': return row.cells[participantIndex]!.position;
      case 'score': return row.cells[participantIndex]!.score;
      default: return null;
    }
  };
  const multiplier = direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    if (sort.by === 'title') return multiplier * compareTitles(a, b);
    const left = metric(a);
    const right = metric(b);
    // Missing and unrated values stay last in either direction; zero is sortable data.
    if (left === null || right === null) {
      return left === right ? compareTitles(a, b) : left === null ? 1 : -1;
    }
    return multiplier * (left - right) || compareTitles(a, b);
  });
}

/** Defaults to common-ranked, title ascending, page 1, and at most 25 rows. No result arrays are mutated. */
export function getComparisonPage(comparison: FriendComparison, options: ComparisonPageOptions = {}): ComparisonPage {
  const input = shape(options, [], 'Page options', ['mode', 'query', 'minCoverage', 'minRaters', 'sort', 'page', 'pageSize', 'games']);
  const mode = input.mode === undefined ? 'common-ranked' : input.mode;
  if (mode !== 'common-ranked' && mode !== 'all-shared') return invalid('The comparison mode is unsupported.');
  const query = input.query === undefined ? '' : text(input.query, 'A search query', false).trim().toLowerCase();
  const minCoverage = input.minCoverage === undefined ? 1
    : integer(input.minCoverage, 1, comparison.cohort.participantCount, 'Minimum coverage');
  const minRaters = input.minRaters === undefined ? 0
    : integer(input.minRaters, 0, comparison.cohort.participantCount, 'Minimum raters');
  const page = input.page === undefined ? 1 : integer(input.page, 1, Number.MAX_SAFE_INTEGER, 'A page number');
  const pageSize = input.pageSize === undefined ? FRIEND_COMPARISON_LIMITS.maxPageSize
    : integer(input.pageSize, 1, FRIEND_COMPARISON_LIMITS.maxPageSize, 'A page size');
  let selectedGames: Set<string> | null = null;
  if (input.games !== undefined) {
    if (!Array.isArray(input.games) || input.games.length < 1 || input.games.length > 6) return invalid('Choose one to six comparison games.');
    selectedGames = new Set();
    for (let index = 0; index < input.games.length; index += 1) selectedGames.add(identity(object(input.games[index], 'A comparison game')).key);
    if (selectedGames.size !== input.games.length) return invalid('Comparison games must use distinct source identities.');
  }
  const rows = comparison.rows[mode].filter((row) => (!selectedGames || selectedGames.has(row.key)) && row.coverage >= minCoverage && row.raterCount >= minRaters &&
    (!query || row.key.toLowerCase().includes(query) || row.cells.some((cell) =>
      cell.status === 'ranked' && cell.entry.title.toLowerCase().includes(query))));
  sortRows(rows, comparison, input.sort);
  const pageCount = Math.ceil(rows.length / pageSize);
  return {
    mode,
    cohort: comparison.cohort,
    rows: page > pageCount ? [] : rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalRows: rows.length,
    pageCount,
  };
}

import type {
  GameSource, LibraryBackup, LibraryRecord, PersonalAction, PersonalLibraryState,
  PersonalProgress, PersonalRanking,
} from './personal-types.js';
import { parseLibrary } from './storage.js';
import type { MotionPreference } from './types.js';
import { orderByRating, retainManualPositions } from './ranking-order.js';
import {
  MAX_BACKUP_FILE_BYTES, MAX_LIBRARY_BACKUP_BYTES, MAX_LIBRARY_RECORDS as MAX_RECORDS, MAX_LIBRARY_ID_CHARACTERS,
  MAX_LIBRARY_TITLE_CHARACTERS,
} from './personal-types.js';

const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const sources: readonly GameSource[] = ['collection', 'steam', 'wikidata', 'freetogame', 'manual'];

function invalid(message: string): never {
  const error = new Error(`Your personal library could not be read: ${message}`);
  error.name = 'PersonalLibraryValidationError';
  throw error;
}

function budgetError(message: string): never {
  const error = new Error(message);
  error.name = 'PersonalLibraryBudgetError';
  throw error;
}

function dictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(`${label} must be an object.`);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid(`${label} has an unsupported object type.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || forbiddenKeys.has(key)) {
      return invalid(`${label} contains an unsafe key.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      return invalid(`${label} must contain enumerable data, not accessors or hidden fields.`);
    }
  }
  return value as Record<string, unknown>;
}

function shape(
  value: unknown, required: readonly string[], label: string, optional: readonly string[] = [],
): Record<string, unknown> {
  const result = object(value, label);
  if (
    required.some((key) => !Object.hasOwn(result, key)) ||
    Object.getOwnPropertyNames(result).some((key) => !required.includes(key) && !optional.includes(key))
  ) {
    return invalid(`${label} has missing or unsupported fields.`);
  }
  return result;
}

function safeId(value: unknown): string {
  if (
    typeof value !== 'string' || value.length > MAX_LIBRARY_ID_CHARACTERS || !/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(value) ||
    forbiddenKeys.has(value)
  ) {
    return invalid('a game has an unsafe or missing ID.');
  }
  return value;
}

function text(value: unknown, label: string, limit: number, nonempty = false): string {
  if (typeof value !== 'string' || value.length > limit || (nonempty && !value.trim())) {
    return invalid(`${label} must be ${nonempty ? 'nonempty ' : ''}text of at most ${limit} characters.`);
  }
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label, 200);
}

function motion(value: unknown): MotionPreference {
  if (value !== 'auto' && value !== 'full' && value !== 'lite') {
    return invalid('the motion preference is invalid.');
  }
  return value;
}

function score(value: unknown): number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10)) {
    return invalid('a rating must be null or a finite number from 0 to 10.');
  }
  return value;
}

function record(value: unknown): LibraryRecord {
  const input = shape(value, [
    'id', 'title', 'year', 'studio', 'genre', 'source', 'sourceId', 'sourceUrl', 'collectionRank',
  ], 'A game record');
  const source = sources.find((candidate) => candidate === input.source);
  if (!source) return invalid('a game has an unsupported source.');
  const year = input.year;
  if (year !== null && (typeof year !== 'number' || !Number.isInteger(year) || year < 1900 || year > 2100)) {
    return invalid('a game year must be null or an integer from 1900 to 2100.');
  }
  const rank = input.collectionRank;
  if (source === 'collection') {
    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1 || rank > 100) {
      return invalid('an author collection rank must be an integer from 1 to 100.');
    }
  } else if (rank !== null) {
    return invalid('only author collection games may have an author rank.');
  }
  const sourceUrl = input.sourceUrl;
  if (sourceUrl !== null) {
    if (typeof sourceUrl !== 'string' || /\s/.test(sourceUrl) || !/^https:\/\//i.test(sourceUrl)) {
      return invalid('a source URL must be null or a valid HTTPS URL.');
    }
    try {
      const url = new URL(sourceUrl);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
        return invalid('a source URL must be a valid HTTPS URL without credentials.');
      }
    } catch {
      return invalid('a source URL must be null or a valid HTTPS URL.');
    }
  }
  return {
    id: safeId(input.id),
    title: text(input.title, 'A game title', MAX_LIBRARY_TITLE_CHARACTERS, true),
    year,
    studio: nullableText(input.studio, 'A studio'),
    genre: nullableText(input.genre, 'A genre'),
    source,
    sourceId: safeId(input.sourceId),
    sourceUrl,
    collectionRank: rank as number | null,
  };
}

function progress(value: unknown): PersonalProgress {
  const input = shape(value, ['later', 'completed', 'played'], 'Game progress');
  if (
    typeof input.later !== 'boolean' || typeof input.completed !== 'boolean' ||
    typeof input.played !== 'boolean' || (input.completed && !input.played)
  ) {
    return invalid('game progress must use booleans, and completed games must also be played.');
  }
  return { later: input.later, completed: input.completed, played: input.played };
}

function ranking(value: unknown, legacy: boolean, index: number): PersonalRanking {
  const input = shape(value, legacy ? ['id', 'score', 'note'] : ['id', 'score', 'note', 'manualPosition'], 'A personal ranking');
  const position = legacy ? index + 1 : input.manualPosition;
  if (position !== null && (typeof position !== 'number' || !Number.isInteger(position) || position < 1)) {
    return invalid('a manual rank must be null or a positive integer.');
  }
  return { id: safeId(input.id), score: score(input.score), note: text(input.note, 'A note', 2_000), manualPosition: position };
}

function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) {
    return invalid(`${label} must be a list of at most ${MAX_RECORDS} items.`);
  }
  return Array.from(value as unknown[]);
}

function nextRevision(revision: number): number {
  if (revision >= Number.MAX_SAFE_INTEGER) {
    return invalid('the revision limit has been reached. Export your library before resetting it.');
  }
  return revision + 1;
}

export function emptyPersonalLibrary(): PersonalLibraryState {
  return {
    version: 3, revision: 0, records: dictionary(), progress: dictionary(),
    queueOrder: [], ranking: [], motion: 'auto',
  };
}

export function parsePersonalLibrary(value: unknown): PersonalLibraryState {
  const input = shape(value, [
    'version', 'revision', 'records', 'progress', 'queueOrder', 'ranking', 'motion',
  ], 'The library');
  if (
    (input.version !== 2 && input.version !== 3) || typeof input.revision !== 'number' ||
    !Number.isSafeInteger(input.revision) || input.revision < 0
  ) {
    return invalid('the saved version or revision is unsupported.');
  }
  const result = emptyPersonalLibrary();
  result.revision = input.revision;
  result.motion = motion(input.motion);
  const records = Object.entries(object(input.records, 'Game records'));
  if (records.length > MAX_RECORDS) return invalid(`a library cannot exceed ${MAX_RECORDS} games.`);
  for (const [id, value] of records) {
    const parsed = record(value);
    if (safeId(id) !== parsed.id) return invalid('a game record does not match its ID.');
    result.records[id] = parsed;
  }
  for (const [id, value] of Object.entries(object(input.progress, 'Game progress'))) {
    if (!result.records[safeId(id)]) return invalid('progress refers to a missing game.');
    result.progress[id] = progress(value);
  }
  const queued = new Set<string>();
  result.queueOrder = list(input.queueOrder, 'The play queue').map((value) => {
    const id = safeId(value);
    if (queued.has(id) || !result.records[id] || !result.progress[id]?.later) {
      return invalid('the play queue has a duplicate, missing, or non-queued game.');
    }
    queued.add(id);
    return id;
  });
  if (Object.entries(result.progress).some(([id, value]) => value.later && !queued.has(id))) {
    return invalid('the play queue is missing a Play later game.');
  }
  const ranked = new Set<string>();
  const positions = new Set<number>();
  const entries = list(input.ranking, 'Personal rankings');
  result.ranking = entries.map((value, index) => {
    const parsed = ranking(value, input.version === 2, index);
    if (ranked.has(parsed.id) || !result.records[parsed.id]) {
      return invalid('personal rankings contain a duplicate or missing game.');
    }
    if (parsed.manualPosition !== null) {
      if (parsed.manualPosition > entries.length || positions.has(parsed.manualPosition)) {
        return invalid('manual ranking positions must be unique and inside the ranking.');
      }
      positions.add(parsed.manualPosition);
    }
    ranked.add(parsed.id);
    return parsed;
  });
  result.ranking = orderByRating(result.ranking);
  return result;
}

function addRecords(state: PersonalLibraryState, values: unknown): LibraryRecord[] {
  const records = list(values, 'Games to add').map(record);
  for (const item of records) {
    // Adding a list membership must not rewrite already saved source/author metadata.
    if (!state.records[item.id]) state.records[item.id] = item;
  }
  if (Object.keys(state.records).length > MAX_RECORDS) {
    return invalid(`a library cannot exceed ${MAX_RECORDS} games.`);
  }
  return records;
}

function progressKey(value: unknown): keyof PersonalProgress {
  if (value !== 'later' && value !== 'completed' && value !== 'played') {
    return invalid('the progress action is unsupported.');
  }
  return value;
}

function setProgress(
  state: PersonalLibraryState, queued: Set<string>, id: string, key: keyof PersonalProgress, value: boolean,
): void {
  const current = state.progress[id] ?? { later: false, completed: false, played: false };
  const updated = { ...current, [key]: value };
  if (key === 'completed' && value) updated.played = true;
  if (key === 'played' && !value) updated.completed = false;
  state.progress[id] = updated;
  if (updated.later && !queued.has(id)) {
    queued.add(id);
    state.queueOrder.push(id);
  } else if (!updated.later) {
    queued.delete(id);
  }
}

function move<T>(items: T[], id: string, overId: string, getId: (item: T) => string): void {
  const from = items.findIndex((item) => getId(item) === id);
  const to = items.findIndex((item) => getId(item) === overId);
  if (from < 0 || to < 0) return invalid('a game being moved is no longer in this list. Refresh and try again.');
  const [item] = items.splice(from, 1);
  if (item === undefined) return invalid('the game being moved is missing.');
  items.splice(to, 0, item);
}

const MEASURED_EXPORT_TIME = '2000-01-01T00:00:00.000Z';

/** Exact UTF-8 length of a string, as TextEncoder would encode it, without allocating the bytes. */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index += 1; } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Bytes of `JSON.stringify(createLibraryBackup(state))` for an already parsed state. The export time is a
 * fixed-width ISO string, so a stand-in measures the same as the real one; one compact stringify, O(n).
 */
export function libraryBackupBytes(state: PersonalLibraryState): number {
  return utf8Length(JSON.stringify({ app: 'Play 100', formatVersion: 3, exportedAt: MEASURED_EXPORT_TIME, library: state }));
}

export function formatBackupBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(Math.ceil(bytes / (1024 * 1024) * 10) / 10).toFixed(1)} MB`;
}

/** A budget as user copy: whole mebibytes read as "20 MB"; anything else uses the rounded-up size. */
export function formatBackupLimit(budget: number): string {
  return budget % (1024 * 1024) === 0 ? `${budget / (1024 * 1024)} MB` : formatBackupBytes(budget);
}

export function applyPersonalAction(state: unknown, action: PersonalAction): PersonalLibraryState {
  return applyPersonalActionWithin(state, action, MAX_LIBRARY_BACKUP_BYTES);
}

// The reducer is the validation boundary for a commit: it parses the stored (or in-memory) state once into a
// fresh copy it may mutate, so callers pass raw values and must not parse first. It also enforces the backup
// byte budget: a result past the budget is refused unless the action did not grow the library, so removals,
// dequeues and reorders always succeed, even for a legacy library that is already over. Cost: one compact
// stringify per action; a second parse and stringify of the prior state only when the result is over budget.
export function applyPersonalActionWithin(state: unknown, action: PersonalAction, budget: number): PersonalLibraryState {
  const result = parsePersonalLibrary(state);
  const input = object(action, 'The library action');
  const queued = new Set(result.queueOrder);
  switch (input.type) {
    case 'add-records':
      shape(input, ['type', 'records'], 'The add games action');
      addRecords(result, input.records);
      break;
    case 'remove-records': {
      shape(input, ['type', 'ids'], 'The private library removal');
      const ids = new Set(list(input.ids, 'Games to remove').map(safeId));
      for (const id of ids) {
        delete result.records[id];
        delete result.progress[id];
        queued.delete(id);
      }
      result.ranking = result.ranking.filter((entry) => !ids.has(entry.id));
      retainManualPositions(result.ranking);
      break;
    }
    case 'set-progress': {
      shape(input, ['type', 'records', 'key', 'value'], 'The progress action');
      const key = progressKey(input.key);
      if (typeof input.value !== 'boolean') return invalid('a progress change must be a boolean.');
      for (const item of addRecords(result, input.records)) {
        setProgress(result, queued, item.id, key, input.value);
      }
      break;
    }
    case 'toggle-progress': {
      shape(input, ['type', 'record', 'key'], 'The progress action');
      const key = progressKey(input.key);
      const [item] = addRecords(result, [input.record]);
      if (!item) return invalid('the game to update is missing.');
      setProgress(result, queued, item.id, key, !(result.progress[item.id]?.[key] ?? false));
      break;
    }
    case 'add-ranking': {
      shape(input, ['type', 'records'], 'The ranking action');
      const ranked = new Set(result.ranking.map((item) => item.id));
      for (const item of addRecords(result, input.records)) {
        if (!ranked.has(item.id)) {
          result.ranking.push({ id: item.id, score: null, note: '', manualPosition: null });
          ranked.add(item.id);
        }
      }
      break;
    }
    case 'remove-ranking': {
      shape(input, ['type', 'ids'], 'The ranking removal');
      const ids = new Set(list(input.ids, 'Games to remove').map(safeId));
      result.ranking = result.ranking.filter((item) => !ids.has(item.id));
      retainManualPositions(result.ranking);
      break;
    }
    case 'edit-ranking': {
      shape(input, ['type', 'id'], 'The ranking edit', ['score', 'note']);
      const id = safeId(input.id);
      const item = result.ranking.find((item) => item.id === id);
      if (!item) return invalid('the ranking being edited no longer exists.');
      if (Object.hasOwn(input, 'score')) item.score = score(input.score);
      if (Object.hasOwn(input, 'note')) item.note = text(input.note, 'A note', 2_000);
      break;
    }
    case 'rate-game': {
      shape(input, ['type', 'record', 'score'], 'The save game rating action');
      const value = score(input.score);
      const [game] = addRecords(result, [input.record]);
      if (!game) return invalid('the game being rated is missing.');
      let entry = result.ranking.find((item) => item.id === game.id);
      if (!entry) {
        entry = { id: game.id, score: null, note: '', manualPosition: null };
        result.ranking.push(entry);
      }
      entry.score = value;
      break;
    }
    case 'move-item': {
      shape(input, ['type', 'list', 'id', 'overId'], 'The reorder action');
      const id = safeId(input.id);
      const overId = safeId(input.overId);
      if (input.list === 'queue') move(result.queueOrder, id, overId, (item) => item);
      else if (input.list === 'ranking') {
        if (id !== overId) {
          move(result.ranking, id, overId, (item) => item.id);
          retainManualPositions(result.ranking, id);
        } else if (!result.ranking.some((entry) => entry.id === id)) return invalid('the game being moved is missing.');
      }
      else return invalid('the list to reorder is unsupported.');
      break;
    }
    case 'use-rating-order': {
      shape(input, ['type'], 'The automatic ranking action', ['id']);
      const id = Object.hasOwn(input, 'id') ? safeId(input.id) : null;
      if (id !== null && !result.ranking.some((entry) => entry.id === id)) {
        return invalid('the ranking position being reset no longer exists.');
      }
      for (const entry of result.ranking) {
        if (id === null || entry.id === id) entry.manualPosition = null;
      }
      break;
    }
    case 'set-motion':
      shape(input, ['type', 'motion'], 'The motion action');
      result.motion = motion(input.motion);
      break;
    default:
      return invalid('the requested library action is unsupported.');
  }
  result.queueOrder = result.queueOrder.filter((id) => queued.has(id));
  result.ranking = orderByRating(result.ranking);
  result.revision = nextRevision(result.revision);
  const after = libraryBackupBytes(result);
  if (after > budget) {
    const prior = parsePersonalLibrary(state);
    // The revision always advances; its extra digit is not growth the user can undo.
    const revisionDigits = String(result.revision).length - String(prior.revision).length;
    if (after - revisionDigits > libraryBackupBytes(prior)) {
      return budgetError(`This change would take your library past its ${formatBackupLimit(budget)} backup limit. Remove games or shorten notes, then try again. Nothing was changed.`);
    }
  }
  return result;
}

export function migrateLegacyLibrary(raw: string, canonicalRecords: LibraryRecord[]): PersonalLibraryState {
  try {
    if (typeof raw !== 'string') return invalid('the previous library must be saved JSON text.');
    const legacy = parseLibrary(raw);
    const canonical = dictionary<LibraryRecord>();
    for (const item of list(canonicalRecords, 'The author collection').map(record)) {
      if (item.source !== 'collection' || canonical[item.id]) {
        return invalid('the author collection contains an invalid or duplicate game.');
      }
      canonical[item.id] = item;
    }
    const state = emptyPersonalLibrary();
    state.motion = legacy.motion;
    for (const [id, value] of Object.entries(legacy.progress)) {
      const item = canonical[safeId(id)];
      if (!item) throw new Error(`The previous library contains an unknown game ID: ${id}.`);
      state.records[id] = { ...item };
      state.progress[id] = { ...value, played: value.completed };
    }
    state.queueOrder = Object.keys(state.progress)
      .filter((id) => state.progress[id]?.later)
      .sort((a, b) => (canonical[a]?.collectionRank ?? 101) - (canonical[b]?.collectionRank ?? 101));
    return parsePersonalLibrary(state);
  } catch (cause) {
    const detail = cause instanceof Error ? ` ${cause.message}` : '';
    const error = new Error(
      `Your previous device library could not be migrated.${detail} The original data has not been changed.`,
      { cause },
    );
    error.name = 'PersonalLibraryMigrationError';
    throw error;
  }
}

export function createLibraryBackup(state: PersonalLibraryState): LibraryBackup {
  return {
    app: 'Play 100', formatVersion: 3, exportedAt: new Date().toISOString(),
    library: parsePersonalLibrary(state),
  };
}

/** Compact backup text for download, or how far a (legacy) library is over the budget. */
export function exportLibraryBackup(
  state: PersonalLibraryState, budget = MAX_LIBRARY_BACKUP_BYTES,
): { ok: true; text: string; bytes: number } | { ok: false; bytes: number; message: string } {
  const text = JSON.stringify(createLibraryBackup(state));
  const bytes = utf8Length(text);
  if (bytes <= budget) return { ok: true, text, bytes };
  const over = formatBackupBytes(bytes - budget);
  return {
    ok: false, bytes,
    message: `This library is ${over} over its ${formatBackupLimit(budget)} backup limit, so no file was made. Remove games or shorten notes by at least ${over}, then export again. Nothing was changed.`,
  };
}

/** Pre-parse size gate for a backup file; pretty-printed older exports get the extra allowance. */
export function backupFileSizeError(size: number, budget = MAX_LIBRARY_BACKUP_BYTES): string | null {
  const cap = budget + (MAX_BACKUP_FILE_BYTES - MAX_LIBRARY_BACKUP_BYTES);
  return size > cap ? `This backup file exceeds the ${formatBackupLimit(cap)} import limit. No data was changed.` : null;
}

/** Parses backup text and applies the library budget to its compact size. */
export function readLibraryBackup(text: string, budget = MAX_LIBRARY_BACKUP_BYTES): PersonalLibraryState {
  const state = parseLibraryBackup(JSON.parse(text));
  const bytes = libraryBackupBytes(state);
  if (bytes > budget) {
    return budgetError(`This backup holds a library ${formatBackupBytes(bytes - budget)} over the ${formatBackupLimit(budget)} backup limit. No data was changed.`);
  }
  return state;
}

export function parseLibraryBackup(value: unknown): PersonalLibraryState {
  const input = shape(value, ['app', 'formatVersion', 'exportedAt', 'library'], 'The backup');
  if (input.app !== 'Play 100' || (input.formatVersion !== 2 && input.formatVersion !== 3)) {
    return invalid('this is not a supported Play 100 backup.');
  }
  const library = object(input.library, 'The backup library');
  if (library.version !== input.formatVersion) return invalid('the backup and library versions do not agree.');
  if (
    typeof input.exportedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.exportedAt) ||
    !Number.isFinite(Date.parse(input.exportedAt)) ||
    new Date(`${input.exportedAt.slice(0, 10)}T00:00:00.000Z`).toISOString().slice(0, 10) !== input.exportedAt.slice(0, 10)
  ) {
    return invalid('the backup export date must be an ISO timestamp.');
  }
  return parsePersonalLibrary(library);
}

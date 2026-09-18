import type { Game } from './types';
import type { LibraryRecord, PersonalLibraryState } from './personal-types';
import { recordFromGame } from './personal-types';
import type { PublicEntry } from './community';
import { projectOwnRanking } from './community';
import type { FriendSettings } from './friend-types';
import type { FriendShelfConfig, FriendShelfEntry } from './friend-shelf-types';
import { parseFriendShelfEntry, recordFromFriendShelf } from './friend-shelf-types';
import { accountScope } from './cloud-types';
import type { LibraryScope } from './cloud-types';

export const FRIEND_ALL_LIMIT = 10_000;
export const FRIEND_ALL_PAGE_SIZE = 25;
export const FRIEND_ALL_EXACT_LIMIT = 6;
export type FriendAllKind = 'games' | 'ranking';
export type FriendAllEntry = FriendShelfEntry | PublicEntry;
export interface FriendAllBinding { epoch: number; revision: number }
export interface FriendAllPolicy {
  format: 2;
  uid: string;
  enabled: boolean;
  deleted: boolean;
  origin: 'default' | 'explicit';
  epoch: number;
  revision: number;
  syncEpoch: number;
  ranking: FriendAllBinding;
  shelf: FriendAllBinding;
  updatedAt: number;
}
export interface FriendAllFacts {
  uid: string | null;
  scope: LibraryScope | null;
  projectId: string;
  verified: boolean;
  cacheReady: boolean;
  confirmed: boolean;
  source: { enabled: boolean; deleted: boolean; epoch: number } | null;
  ranking: FriendSettings | null;
  shelf: FriendShelfConfig | null;
  policy: FriendAllPolicy | null;
}
export type FriendAllEligibility =
  | { kind: 'checking' }
  | { kind: 'paused'; reason: 'account' | 'verification' | 'saving' | 'saving-restarted'; canEnable: boolean }
  | { kind: 'revoked'; canEnable: false }
  | { kind: 'legacy'; reason: 'existing-choice' | 'changed-controls'; canEnable: boolean }
  | { kind: 'default'; canEnable: true }
  | { kind: 'all'; canEnable: false }
  | { kind: 'off'; canEnable: boolean };

export class FriendAllValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'FriendAllValidationError'; }
}

function bindingMatches(binding: FriendAllBinding, settings: FriendSettings | null): boolean {
  return Boolean(settings && binding.epoch === settings.epoch && binding.revision === settings.revision);
}

export function friendAllEligibility(facts: FriendAllFacts): FriendAllEligibility {
  if (!facts.uid || !facts.cacheReady || facts.scope !== accountScope(facts.uid, facts.projectId)) return { kind: 'paused', reason: 'account', canEnable: false };
  if (!facts.verified) return { kind: 'paused', reason: 'verification', canEnable: false };
  if (!facts.confirmed) return { kind: 'checking' };
  const { source, ranking, shelf, policy } = facts;
  if (policy && policy.uid !== facts.uid) throw new FriendAllValidationError('This sharing policy belongs to another account.');
  if (source?.deleted || ranking?.deleted || shelf?.deleted || policy?.deleted) return { kind: 'revoked', canEnable: false };
  const connected = Boolean(source?.enabled && source.epoch > 0);
  if (!policy) {
    if (ranking || shelf) return { kind: 'legacy', reason: 'existing-choice', canEnable: connected };
    return connected ? { kind: 'default', canEnable: true } : { kind: 'paused', reason: 'saving', canEnable: false };
  }
  if (!bindingMatches(policy.ranking, ranking) || !bindingMatches(policy.shelf, shelf)) {
    return { kind: 'legacy', reason: 'changed-controls', canEnable: connected };
  }
  if (!policy.enabled) return { kind: 'off', canEnable: connected };
  if (!ranking?.enabled || !shelf?.enabled || ranking.selectedIds.length || shelf.selectedIds.length) return { kind: 'legacy', reason: 'changed-controls', canEnable: connected };
  if (!source?.enabled || source.epoch < 1) return { kind: 'paused', reason: 'saving', canEnable: false };
  if (policy.syncEpoch !== source.epoch || shelf.consentSyncEpoch !== source.epoch) return { kind: 'paused', reason: 'saving-restarted', canEnable: true };
  return { kind: 'all', canEnable: false };
}

export function parseFriendAllRankingEntry(value: unknown): PublicEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FriendAllValidationError('The shared ranking entry is unreadable.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== 'id,position,score,source,sourceId,sourceUrl,title,year' ||
    typeof row.position !== 'number' || !Number.isSafeInteger(row.position) || row.position < 1 || row.position > FRIEND_ALL_LIMIT ||
    (row.score !== null && (typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > 10))) {
    throw new FriendAllValidationError('The shared ranking entry contains unsupported fields or values.');
  }
  const entry = parseFriendShelfEntry({ id: row.id, title: row.title, year: row.year, source: row.source, sourceId: row.sourceId, sourceUrl: row.sourceUrl });
  return { ...entry, position: row.position, score: row.score };
}

function bounded<T extends FriendAllEntry>(entries: readonly T[]): T[] {
  if (entries.length > FRIEND_ALL_LIMIT || new Set(entries.map(entry => entry.id)).size !== entries.length) {
    throw new FriendAllValidationError('Sharing supports up to 10,000 distinct account games; nothing is silently omitted.');
  }
  return [...entries].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function projectAllFriendGames(state: PersonalLibraryState, games: readonly Game[]): FriendShelfEntry[] {
  const records = Object.values(state.records);
  if (records.length > FRIEND_ALL_LIMIT) throw new FriendAllValidationError('This account exceeds the 10,000-game sharing limit.');
  const canonical = new Map(games.map(game => [game.slug, game]));
  return bounded(records.map(saved => {
    const original = canonical.get(saved.id);
    if (saved.source === 'collection' && !original) throw new FriendAllValidationError('Reload the original collection before sharing its metadata.');
    const record = saved.source === 'collection' && original ? recordFromGame(original) : saved;
    return parseFriendShelfEntry({ id: record.id, title: record.title, year: record.year, source: record.source, sourceId: record.sourceId, sourceUrl: record.sourceUrl });
  }));
}

export function projectAllFriendRankings(state: PersonalLibraryState, games: Game[]): PublicEntry[] {
  if (state.ranking.length > FRIEND_ALL_LIMIT || Object.keys(state.records).length > FRIEND_ALL_LIMIT) throw new FriendAllValidationError('This account exceeds the 10,000-game sharing limit.');
  return bounded(projectOwnRanking(state, games).map(parseFriendAllRankingEntry));
}
export function recordFromFriendAll(entry: FriendAllEntry, games: Game[]): LibraryRecord {
  return recordFromFriendShelf({ id: entry.id, title: entry.title, year: entry.year, source: entry.source, sourceId: entry.sourceId, sourceUrl: entry.sourceUrl }, games);
}

export interface FriendAllChanges<T extends FriendAllEntry> {
  upserts: T[];
  removals: string[];
  count: number;
}
export function friendAllEntrySignature(entry: FriendAllEntry): string {
  return JSON.stringify([entry.id, entry.title, entry.year, entry.source, entry.sourceId, entry.sourceUrl,
    ...('position' in entry ? [entry.position, entry.score] : [])]);
}
export function planFriendAllChanges<T extends FriendAllEntry>(previous: readonly T[], next: readonly T[]): FriendAllChanges<T> {
  const before = new Map(bounded(previous).map(entry => [entry.id, entry]));
  const after = bounded(next);
  const remaining = new Set(after.map(entry => entry.id));
  return {
    upserts: after.filter(entry => {
      const old = before.get(entry.id);
      return !old || friendAllEntrySignature(entry) !== friendAllEntrySignature(old);
    }),
    removals: [...before.keys()].filter(id => !remaining.has(id)),
    count: after.length,
  };
}

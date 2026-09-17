import type { LibraryRecord, PersonalLibraryState } from './personal-types';
import { recordFromGame } from './personal-types';
import type { Game } from './types';
import {
  FriendStoreError, parseFriendSettings, parseFriendHead, friendSelection,
} from './friend-types';
import type { FriendSettings, FriendShareHead, FriendSourceRevision } from './friend-types';

export const FRIEND_SHELF_LIMIT = 200;
export const FRIEND_SHELF_CHUNK_SIZE = 2;
export const FRIEND_SHELF_CHUNK_LIMIT = 100;
export interface FriendShelfEntry {
  id: string; title: string; year: number | null;
  source: LibraryRecord['source']; sourceId: string; sourceUrl: string | null;
}
export type FriendShelfConfig = FriendSettings;
export type FriendShelfHead = FriendShareHead;
export interface FriendShelf { head: FriendShelfHead; entries: FriendShelfEntry[] }
export interface FriendShelfReceipt {
  operation: 'initialize-shelf' | 'save-shelf-config' | 'publish-shelf';
  uid: string; epoch?: number; revision?: number; generation?: string;
}
export class FriendShelfCommittedError extends FriendStoreError {
  readonly committed = true;
  constructor(readonly receipt: FriendShelfReceipt, readonly cause: unknown, readonly phase: 'refresh' | 'cleanup' = 'refresh') {
    super('committed-refresh-failed', 'Shared games were saved; refresh their details instead of repeating the change.');
    this.name = 'FriendShelfCommittedError';
  }
}
export const parseFriendShelfConfig = parseFriendSettings;
export const parseFriendShelfHead = parseFriendHead;
function invalid(message = 'Shared games contain unsupported metadata. Review the selection before sharing.'): never {
  throw new FriendStoreError('invalid', message);
}
export function shelfSelection(value: unknown): string[] {
  try { return friendSelection(value); }
  catch { return invalid('Choose up to 200 distinct saved games.'); }
}
export function parseFriendShelfEntry(value: unknown): FriendShelfEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== 'id,source,sourceId,sourceUrl,title,year' ||
    typeof row.title !== 'string' || !row.title.trim() || row.title.length > 200 || [...row.title].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
    (row.year !== null && (typeof row.year !== 'number' || !Number.isInteger(row.year) || row.year < 1900 || row.year > 2100))) invalid();
  shelfSelection([row.id]); shelfSelection([row.sourceId]);
  const id = row.id as string; const sourceId = row.sourceId as string;
  const source = row.source; const url = row.sourceUrl;
  const valid = source === 'collection' ? id === sourceId && url === null
    : source === 'wikidata' ? /^Q[1-9][0-9]*$/.test(sourceId) && id === `wikidata:${sourceId}` && url === `https://www.wikidata.org/wiki/${sourceId}`
    : source === 'steam' ? /^[1-9][0-9]*$/.test(sourceId) && id === `steam:${sourceId}` && url === `https://store.steampowered.com/app/${sourceId}/`
    : source === 'freetogame' ? /^[1-9][0-9]*$/.test(sourceId) && id === `freetogame:${sourceId}` && (url === null || typeof url === 'string' && /^https:\/\/www\.freetogame\.com\/[a-z0-9/-]+$/.test(url))
    : source === 'manual' && id === `manual:${sourceId}` && url === null;
  if (!valid) invalid('A shared game has an unsupported identity or source link.');
  return { id, title: row.title, year: row.year as number | null, source: source as LibraryRecord['source'], sourceId, sourceUrl: url as string | null };
}
export function validateFriendShelfEntries(input: readonly FriendShelfEntry[], selectedIds: readonly string[]): FriendShelfEntry[] {
  const ids = shelfSelection(selectedIds); const entries = input.map(parseFriendShelfEntry);
  if (entries.length !== ids.length || entries.some((entry, index) => entry.id !== ids[index])) invalid('The saved selection changed. Preview it again.');
  return entries;
}
export function parseFriendShelfChunk(value: unknown, index: number, count: number): FriendShelfEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    !Number.isInteger(index) || index < 0 || index >= FRIEND_SHELF_CHUNK_LIMIT ||
    !Number.isInteger(count) || count < 1 || count > FRIEND_SHELF_LIMIT) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== 'entries,ids,index' || row.index !== index || !Array.isArray(row.entries) ||
    row.entries.length !== Math.min(FRIEND_SHELF_CHUNK_SIZE, count - index * FRIEND_SHELF_CHUNK_SIZE) || !row.entries.length) invalid();
  return validateFriendShelfEntries(row.entries, shelfSelection(row.ids));
}
export function projectFriendShelf(state: PersonalLibraryState, selectedIds: readonly string[], games: Game[], removed: ReadonlySet<string> = new Set()): { entries: FriendShelfEntry[]; selectedIds: string[] } {
  const ids = shelfSelection(selectedIds).filter((id) => Object.hasOwn(state.records, id) && !removed.has(id));
  const canonical = new Map(games.map((game) => [game.slug, game]));
  const entries = ids.map((id) => {
    const saved = state.records[id]!;
    const trusted = canonical.get(id);
    if (saved.source === 'collection' && !trusted) invalid('An original game is missing from the public catalog. Reload it before sharing.');
    const record = saved.source === 'collection' && trusted ? recordFromGame(trusted) : saved;
    return parseFriendShelfEntry({ id: record.id, title: record.title, year: record.year, source: record.source, sourceId: record.sourceId, sourceUrl: record.sourceUrl });
  });
  return { selectedIds: ids, entries: validateFriendShelfEntries(entries, ids) };
}
export function recordFromFriendShelf(value: FriendShelfEntry, games: Game[]): LibraryRecord {
  const entry = parseFriendShelfEntry(value);
  const canonical = games.find((game) => game.slug === entry.id);
  if (entry.source === 'collection') {
    if (!canonical || entry.title !== canonical.title || entry.year !== canonical.year) invalid('The shared original game does not match the public catalog.');
    return recordFromGame(canonical);
  }
  if (canonical) invalid('The shared game has a conflicting source identity.');
  return { ...entry, genre: null, studio: null, collectionRank: null };
}
export async function friendShelfDigest(entries: readonly FriendShelfEntry[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function sameShelfSource(a: FriendSourceRevision, b: FriendSourceRevision): boolean {
  return a.syncEpoch === b.syncEpoch && a.remoteRevision === b.remoteRevision;
}

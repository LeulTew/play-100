import type { Game } from './types';
import type { GameSource, LibraryRecord, PersonalLibraryState } from './personal-types';
import { recordFromGame } from './personal-types';
import { emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import type { AvatarDescriptor } from './avatar';
export { parseAvatarDescriptor as parseAvatar } from './avatar';

export const PUBLIC_LIMIT = 200;
export const PUBLIC_SOURCE_URL_LIMIT = 2048;
export const RESERVED_HANDLES = ['admin', 'administrator', 'creator', 'leul', 'leultew', 'play100', 'play-100', 'support', 'system', 'moderator', 'firebase', 'account', 'community', 'settings', 'official'];
export type AvatarValue = AvatarDescriptor;
export interface Member {
  uid: string; displayName: string; avatar: AvatarValue; createdAt: number; updatedAt: number;
  consentVersion: 1; rankCount: number; gameCount: number;
}
export interface PublicEntry {
  position: number; id: string; title: string; year: number | null;
  source: GameSource; sourceId: string; sourceUrl: string | null; score: number | null;
}
export interface PublicProfile {
  uid: string; handle: string; displayName: string; avatar: AvatarValue; title: string;
  count: number; preview: string[]; generation: string; epoch: number; published: boolean;
  listed: boolean; hidden: boolean; creator: boolean; updatedAt: number;
}
export interface PublicControl { epoch: number; hidden: boolean; deleted: boolean }
export interface ProfileReport { id: string; reporterUid: string; targetUid: string; reason: string; status: 'open' | 'resolved'; createdAt: number }

export function normalizeHandle(value: string): string {
  const handle = parseHandle(value);
  if (RESERVED_HANDLES.some(reserved => handle.startsWith(reserved))) throw new Error('System and creator handle prefixes are reserved. Choose another handle.');
  return handle;
}

export function parseHandle(value: string): string {
  const handle = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle)) throw new Error('Choose 3-24 letters, numbers or underscores, starting with a letter.');
  return handle;
}

function sourceUrl(record: Pick<LibraryRecord, 'source' | 'sourceId' | 'sourceUrl'>): string | null {
  if (record.source === 'wikidata') return `https://www.wikidata.org/wiki/${record.sourceId}`;
  if (record.source === 'steam') return `https://store.steampowered.com/app/${record.sourceId}/`;
  if (record.source === 'freetogame' && record.sourceUrl && /^https:\/\/www\.freetogame\.com\/[a-z0-9/-]+$/.test(record.sourceUrl)) return record.sourceUrl;
  return null;
}

export function projectOwnRanking(state: PersonalLibraryState, games: Game[]): PublicEntry[] {
  const canonical = new Map(games.map((game) => [game.slug, game]));
  return state.ranking.map((entry, index): PublicEntry => {
    const saved = state.records[entry.id];
    if (!saved) throw new Error('A ranked game is missing its metadata.');
    const trusted = canonical.get(saved.id);
    if (saved.source === 'collection' && !trusted) throw new Error('This ranking references an unknown original game.');
    const record = trusted ? recordFromGame(trusted) : saved;
    return { position: index + 1, id: record.id, title: record.title, year: record.year, source: record.source, sourceId: record.sourceId, sourceUrl: sourceUrl(record), score: entry.score };
  });
}

export function projectPublicRanking(state: PersonalLibraryState, selected: ReadonlySet<string>, games: Game[]): PublicEntry[] {
  if (!selected.size || selected.size > PUBLIC_LIMIT) throw new Error('Choose between 1 and 200 ranked games. Nothing is automatically left out.');
  const canonical = new Map(games.map((game) => [game.slug, game]));
  const entries = state.ranking.filter((entry) => selected.has(entry.id)).map((entry, index): PublicEntry => {
    const saved = state.records[entry.id];
    if (!saved) throw new Error('A selected game is missing its metadata.');
    const trusted = canonical.get(saved.id);
    if (saved.source === 'collection' && !trusted) throw new Error('A selected entry claims an unknown original collection game. Correct that record before publishing.');
    const record = trusted ? recordFromGame(trusted) : saved;
    return { position: index + 1, id: record.id, title: record.title, year: record.year, source: record.source, sourceId: record.sourceId, sourceUrl: sourceUrl(record), score: entry.score };
  });
  if (entries.length !== selected.size) throw new Error('Your ranking changed while selecting games. Review the selection before publishing.');
  return entries.map(parsePublicationEntry);
}

export function parsePublicEntry(value: unknown): PublicEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A published game is unreadable.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== 'id,position,score,source,sourceId,sourceUrl,title,year' ||
    typeof row.position !== 'number' || !Number.isInteger(row.position) || row.position < 1 || row.position > PUBLIC_LIMIT ||
    (row.score !== null && (typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > 10))) {
    throw new Error('A published game contains unsupported fields or a rating outside 0-10.');
  }
  const candidate = { id: row.id, title: row.title, year: row.year, studio: null, genre: null, source: row.source, sourceId: row.sourceId, sourceUrl: row.sourceUrl, collectionRank: row.source === 'collection' ? 1 : null };
  const parsed = parsePersonalLibrary({ ...emptyPersonalLibrary(), records: { [String(row.id)]: candidate } });
  const record = parsed.records[String(row.id)];
  if (!record || (record.source !== 'collection' && record.id !== `${record.source}:${record.sourceId}`) ||
    (record.source === 'wikidata' && !/^Q[1-9]\d*$/.test(record.sourceId)) ||
    ((record.source === 'freetogame' || record.source === 'steam') && !/^[1-9]\d*$/.test(record.sourceId)) ||
    record.sourceUrl !== sourceUrl(record)) throw new Error('A published game has an unsupported identity or source link.');
  return { position: row.position, id: record.id, title: record.title, year: record.year, source: record.source, sourceId: record.sourceId, sourceUrl: record.sourceUrl, score: row.score };
}

export function parsePublicationEntry(value: unknown): PublicEntry {
  const entry = parsePublicEntry(value);
  if (entry.sourceUrl && entry.sourceUrl.length > PUBLIC_SOURCE_URL_LIMIT) {
    throw new Error('A selected game has a source link longer than 2048 characters. Correct its link or leave it out before publishing or sharing. Your private library is unchanged.');
  }
  return entry;
}

export function recordFromPublic(value: PublicEntry, games: Game[]): LibraryRecord {
  const entry = parsePublicEntry(value);
  const canonical = games.find((game) => game.slug === entry.id);
  if (canonical) return recordFromGame(canonical);
  if (entry.source === 'collection') throw new Error('This list references an unknown original game. Reload the collection before saving it.');
  return { id: entry.id, source: entry.source, sourceId: entry.sourceId, sourceUrl: entry.sourceUrl, title: entry.title, year: entry.year, genre: null, studio: null, collectionRank: null };
}

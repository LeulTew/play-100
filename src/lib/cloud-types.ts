import type { PersonalLibraryState } from './personal-types';
import { MAX_LIBRARY_RECORDS, MAX_LIBRARY_ID_CHARACTERS, MAX_LIBRARY_TITLE_CHARACTERS } from './personal-types';
import type { AvatarDescriptor } from './avatar';

export const CLOUD_PROJECT = 'play100-online-48823b32';
export const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
export const CHUNK_BYTES = 192 * 1024;
export const MAX_CHUNKS = Math.ceil(MAX_SNAPSHOT_BYTES / CHUNK_BYTES);
// Per row: fixed JSON punctuation/keys, ASCII ID, worst-case \uXXXX title, position, finite score.
export const MAX_RANKING_JSON_BYTES = MAX_LIBRARY_RECORDS *
  (42 + MAX_LIBRARY_ID_CHARACTERS + 6 * MAX_LIBRARY_TITLE_CHARACTERS + String(MAX_LIBRARY_RECORDS).length + 32) + 1;
export const MAX_RANKING_SNAPSHOT_BYTES = 2 ** Math.ceil(Math.log2(MAX_RANKING_JSON_BYTES));
export const MAX_RANKING_CHUNKS = Math.ceil(MAX_RANKING_SNAPSHOT_BYTES / CHUNK_BYTES);
export const CONSENT_VERSION = 1;
export type LibraryScope = 'guest' | `account:${typeof CLOUD_PROJECT | 'demo-play100'}:${string}`;

export function accountScope(uid: string, project: string = CLOUD_PROJECT): LibraryScope {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('This account has an unsupported identity. No local data was changed.');
  if (project !== CLOUD_PROJECT && project !== 'demo-play100') throw new Error('This Firebase project is not an approved Play 100 storage scope.');
  return `account:${project}:${uid}`;
}

export function scopeUid(scope: LibraryScope): string {
  if (scope === 'guest') throw new Error('Device-only data does not have an account identity.');
  const [, project, uid] = scope.split(':');
  if (!uid || !project || accountScope(uid, project) !== scope) throw new Error('The account storage scope is invalid.');
  return uid;
}

export interface SnapshotManifest {
  format: 1;
  generation: string;
  digest: string;
  bytes: number;
  chunks: string[];
}

export interface SnapshotChunk {
  digest: string;
  data: string;
  bytes: number;
}

export interface SyncHead {
  format: 1;
  epoch: number;
  revision: number;
  enabled: boolean;
  deleted: boolean;
  current: SnapshotManifest | null;
  previous: SnapshotManifest | null;
  updatedAt: number;
  cleanupEpoch?: number;
}

export interface SyncMetadata {
  enabled: boolean;
  epoch: number;
  baseRemoteRevision: number;
  remoteGeneration: string | null;
  dirty: boolean;
  dataRevision: number;
  displayName: string;
  lastSyncedAt: number | null;
}

export interface ScopedLibrary {
  version: 1;
  scope: LibraryScope;
  state: PersonalLibraryState;
  sync: SyncMetadata;
  recovery: { state: PersonalLibraryState; savedAt: number; reason: string } | null;
  profile: { displayName: string; avatar: AvatarDescriptor } | null;
}

export type SyncStatus = 'device' | 'loading' | 'pending' | 'retrying' | 'quota' | 'saving' | 'saved' | 'offline' | 'conflict' | 'paused' | 'error';
export const SYNC_LABELS: Record<SyncStatus, string> = {
  device: 'Device only', loading: 'Opening online library…', saving: 'Saving online…',
  saved: 'Saved online', offline: 'Offline · saved here', conflict: 'Needs a choice',
  paused: 'Online saving paused', error: 'Online saving paused',
  pending: 'Saved here · online pending', retrying: 'Retrying automatically…', quota: 'Waiting for free quota…',
};

export interface CreatorRank {
  position: number;
  id: string;
  title: string;
  score: number | null;
}

export function creatorRanks(state: PersonalLibraryState): CreatorRank[] {
  return state.ranking.map((entry, index) => {
    const record = state.records[entry.id];
    if (!record) throw new Error('A ranked game is missing its metadata. Your online copy has not been changed.');
    return { position: index + 1, id: entry.id, title: record.title, score: entry.score };
  });
}

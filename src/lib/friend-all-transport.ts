import { Timestamp } from 'firebase/firestore';
import type { FriendAllBinding, FriendAllEntry, FriendAllKind, FriendAllPolicy } from './friend-all';
import { FRIEND_ALL_LIMIT, FriendAllValidationError, parseFriendAllRankingEntry } from './friend-all';
import { parseFriendShelfEntry } from './friend-shelf-types';
import { friendToken, friendUid, friendUuid, parseFriendSource } from './friend-types';
import type { FriendSourceRevision } from './friend-types';

export const FRIEND_ALL_WRITE_GROUP = 2;
export const FRIEND_ALL_TRACKED_WRITE_GROUP = 1;
export const FRIEND_ALL_OWNER_PAGE = 100;
export interface FriendAllHead {
  format: 2 | 3;
  epoch: number;
  policyRevision: number;
  source: FriendSourceRevision;
  revision: number;
  status: 'updating' | 'ready';
  count: number;
  digest: string;
  updatedAt: number;
}
export interface FriendAllJob {
  format: 2 | 3;
  epoch: number;
  policyRevision: number;
  source: FriendSourceRevision;
  token: string;
  digest: string;
  targetCount: number;
  count: number;
  total: number;
  applied: number;
  last: string[];
  headRevision: number;
  updatedAt: number;
}
export interface FriendAllRow {
  format: 2 | 3;
  epoch: number;
  token: string;
  step: number;
  active: boolean;
  entry: FriendAllEntry | null;
}
function invalid(): never {
  throw new FriendAllValidationError('Automatic sharing contains an unsupported format. Refresh before continuing.');
}
function shape(value: unknown, fields: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== fields.split(',').sort().join()
  )
    invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
function time(value: unknown): number {
  if (!(value instanceof Timestamp)) invalid();
  return value.toMillis();
}
function binding(value: unknown): FriendAllBinding {
  const row = shape(value, 'epoch,revision');
  return { epoch: integer(row.epoch, 1), revision: integer(row.revision, 1) };
}
export function friendAllId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(value)) invalid();
  return value;
}
export function parseFriendAllPolicy(value: unknown, uid: string): FriendAllPolicy {
  const row = shape(value, 'format,uid,enabled,deleted,origin,epoch,revision,syncEpoch,ranking,shelf,updatedAt');
  if (
    row.format !== 2 ||
    row.uid !== friendUid(uid) ||
    typeof row.enabled !== 'boolean' ||
    typeof row.deleted !== 'boolean' ||
    (row.deleted && row.enabled) ||
    (row.origin !== 'default' && row.origin !== 'explicit')
  )
    invalid();
  return {
    format: 2,
    uid,
    enabled: row.enabled,
    deleted: row.deleted,
    origin: row.origin,
    epoch: integer(row.epoch, 1),
    revision: integer(row.revision, 1),
    syncEpoch: integer(row.syncEpoch, 1),
    ranking: binding(row.ranking),
    shelf: binding(row.shelf),
    updatedAt: time(row.updatedAt),
  };
}
export function parseFriendAllHead(value: unknown): FriendAllHead {
  const row = shape(value, 'format,epoch,policyRevision,source,revision,status,count,digest,updatedAt');
  if ((row.format !== 2 && row.format !== 3) || (row.status !== 'updating' && row.status !== 'ready')) invalid();
  return {
    format: row.format,
    epoch: integer(row.epoch, 1),
    policyRevision: integer(row.policyRevision, 1),
    source: parseFriendSource(row.source),
    revision: integer(row.revision, 1),
    status: row.status,
    count: integer(row.count, 0, FRIEND_ALL_LIMIT),
    digest: friendToken(row.digest),
    updatedAt: time(row.updatedAt),
  };
}
export function parseFriendAllJob(value: unknown): FriendAllJob {
  const row = shape(
    value,
    'format,epoch,policyRevision,source,token,digest,targetCount,count,total,applied,last,headRevision,updatedAt',
  );
  if (
    (row.format !== 2 && row.format !== 3) ||
    !Array.isArray(row.last) ||
    row.last.length > (row.format === 3 ? FRIEND_ALL_TRACKED_WRITE_GROUP : FRIEND_ALL_WRITE_GROUP)
  )
    invalid();
  const last = row.last.map(friendAllId);
  const total = integer(row.total, 0, FRIEND_ALL_LIMIT * 2);
  const applied = integer(row.applied, 0, total);
  if (
    new Set(last).size !== last.length ||
    (row.format === 2 && (applied === 0 ? last.length !== 0 : last.length === 0))
  )
    invalid();
  return {
    format: row.format,
    epoch: integer(row.epoch, 1),
    policyRevision: integer(row.policyRevision, 1),
    source: parseFriendSource(row.source),
    token: friendUuid(row.token),
    digest: friendToken(row.digest),
    targetCount: integer(row.targetCount, 0, FRIEND_ALL_LIMIT),
    count: integer(row.count, 0, FRIEND_ALL_LIMIT),
    total,
    applied,
    last,
    headRevision: integer(row.headRevision, 1),
    updatedAt: time(row.updatedAt),
  };
}
export function parseFriendAllEntry(value: unknown, kind: FriendAllKind): FriendAllEntry {
  return kind === 'games' ? parseFriendShelfEntry(value) : parseFriendAllRankingEntry(value);
}
export function parseFriendAllRow(value: unknown, id: string, kind: FriendAllKind): FriendAllRow {
  const row = shape(value, 'format,epoch,token,step,active,entry');
  if (
    (row.format !== 2 && row.format !== 3) ||
    typeof row.active !== 'boolean' ||
    (!row.active && row.entry !== null) ||
    (row.format === 3 && !row.active)
  )
    invalid();
  const entry = row.active ? parseFriendAllEntry(row.entry, kind) : null;
  if (entry && entry.id !== friendAllId(id)) invalid();
  return {
    format: row.format,
    epoch: integer(row.epoch, 1),
    token: friendUuid(row.token),
    step: integer(row.step, 1, FRIEND_ALL_LIMIT * 2),
    active: row.active,
    entry,
  };
}

import { Timestamp } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { parseAvatar, parsePublicEntry, projectPublicRanking } from './community';
import type { AvatarValue, PublicEntry } from './community';
import type { PersonalLibraryState } from './personal-types';
import type { Game } from './types';

export const FRIEND_PAGE_SIZE = 20;
export const FRIEND_SELECTION_LIMIT = 200;
export const FRIEND_CHUNK_SIZE = 3;
export const FRIEND_CHUNK_LIMIT = Math.ceil(FRIEND_SELECTION_LIMIT / FRIEND_CHUNK_SIZE);
export const FRIEND_INVITE_LIMIT = 20;
export const FRIEND_INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export type FriendCursor = QueryDocumentSnapshot<DocumentData>;
export interface FriendPage<T> { items: T[]; cursor: FriendCursor | undefined }
export type FriendErrorCode = 'invalid' | 'conflict' | 'unavailable' | 'invite-unavailable' | 'limit' | 'offline' | 'deleted' | 'committed-refresh-failed';
export class FriendStoreError extends Error {
  constructor(readonly code: FriendErrorCode, message: string) { super(message); this.name = 'FriendStoreError'; }
}
export interface FriendMutationReceipt {
  operation: 'initialize' | 'save-settings' | 'save-identity' | 'send-request' | 'respond' | 'create-invite' | 'accept-invite' | 'publish-ranking' | 'save-group';
  uid: string; otherUid?: string; groupId?: string; generation?: string; epoch?: number; revision?: number;
}
export class FriendCommittedError extends FriendStoreError {
  readonly committed = true;
  constructor(readonly receipt: FriendMutationReceipt, readonly cause: Error, readonly phase: 'refresh' | 'cleanup' = 'refresh') {
    super('committed-refresh-failed', 'The change was saved, but its latest details could not be refreshed. Refresh instead of repeating the action.');
    this.name = 'FriendCommittedError';
  }
}
export interface FriendIdentity {
  format: 1; uid: string; displayName: string; avatar: AvatarValue; revision: number; updatedAt: number;
}
export type FriendPairState = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'removed';
export interface FriendPair {
  format: 1; a: string; b: string; participants: [string, string]; from: string;
  state: FriendPairState; epoch: number; inviteSlot: number | null; createdAt: number; updatedAt: number;
}
export interface FriendSettings {
  format: 1; enabled: boolean; deleted: boolean; selectedIds: string[]; epoch: number; revision: number; updatedAt: number;
}
export interface FriendManifest { generation: string; digest: string; count: number }
export interface FriendSourceRevision { syncEpoch: number; remoteRevision: number }
export interface FriendShareHead {
  format: 1; epoch: number; settingsRevision: number; revision: number;
  source: FriendSourceRevision; current: FriendManifest | null; previous: FriendManifest | null; updatedAt: number;
}
export interface FriendRanking { head: FriendShareHead; entries: PublicEntry[] }
export function retainsFriendGeneration(id: string, head: FriendShareHead | null, settings: FriendSettings | null, preserveHead: boolean): boolean {
  if (head?.current?.generation !== id && head?.previous?.generation !== id) return false;
  return preserveHead || Boolean(settings?.enabled && !settings.deleted && head?.epoch === settings.epoch && head.settingsRevision === settings.revision);
}
export interface FriendGroup {
  format: 1; id: string; name: string; participantUids: string[]; revision: number; createdAt: number; updatedAt: number;
}
export interface FriendBlock { uid: string; createdAt: number }
export interface FriendInvitePreview {
  ownerUid: string; displayName: string; avatar: AvatarValue; createdAt: number; expiresAt: number; lifetimeDays: 7; singleUse: true;
}
export interface FriendInvitation extends FriendInvitePreview {
  token: string; slot: number; state: 'active' | 'consumed' | 'revoked';
}
export interface FriendExportPage {
  format: 1; identity: FriendIdentity | null; settings: FriendSettings | null;
  relations: FriendPage<FriendPair>; groups: FriendPage<FriendGroup>; blocks: FriendPage<FriendBlock>;
}
export interface FriendCleanupResult { deleted: number; done: boolean }
export interface FriendGeneration {
  epoch: number; settingsRevision: number; count: number; digest: string; uploaded: number;
  source: FriendSourceRevision; ids: string[]; status: 'staging' | 'ready' | 'published' | 'deleting'; createdAt: number;
}

function invalid(message = 'Friend data has an unsupported format. Reload before continuing.'): never {
  throw new FriendStoreError('invalid', message);
}
function object(value: unknown, keys: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== keys.split(',').sort().join()) invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
function time(value: unknown): number {
  if (!(value instanceof Timestamp)) invalid('Friend data has an invalid server timestamp.');
  return value.toMillis();
}
function bool(value: unknown): boolean { if (typeof value !== 'boolean') invalid(); return value; }
function version(value: unknown): 1 { if (value !== 1) invalid(); return 1; }
export function friendUid(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) invalid('This account identity is unsupported.');
  return value;
}
export function friendPairId(uid: string, otherUid: string): string {
  friendUid(uid); friendUid(otherUid);
  if (uid === otherUid) invalid('Choose another person, not your own account.');
  return [uid, otherUid].sort().join('~');
}
export function friendUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) invalid();
  return value;
}
export function friendToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid('This invitation link is malformed. Ask for a new link.');
  return value;
}
export function friendName(value: unknown, max = 60): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(`Choose a name between 1 and ${max} characters.`);
  return value.trim();
}
export function friendSelection(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > FRIEND_SELECTION_LIMIT || !value.every((id: unknown) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(id)) ||
    new Set(value).size !== value.length) invalid('Choose up to 200 distinct ranked game identities.');
  return [...value];
}
export function friendParticipants(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6 || new Set(value).size !== value.length) invalid('Choose between two and six different people.');
  return value.map(friendUid);
}
export function parseFriendIdentity(value: unknown): FriendIdentity {
  const row = object(value, 'format,uid,displayName,avatar,revision,updatedAt');
  return { format: version(row.format), uid: friendUid(row.uid), displayName: friendName(row.displayName), avatar: parseAvatar(row.avatar), revision: integer(row.revision, 1), updatedAt: time(row.updatedAt) };
}
export function parseFriendSettings(value: unknown): FriendSettings {
  const row = object(value, 'format,enabled,deleted,selection,epoch,revision,updatedAt');
  if (typeof row.selection !== 'string') invalid();
  const selectedIds = friendSelection(row.selection === '' ? [] : row.selection.split('|'));
  const enabled = bool(row.enabled); const deleted = bool(row.deleted);
  if (deleted && (enabled || selectedIds.length)) invalid();
  return { format: version(row.format), enabled, deleted, selectedIds, epoch: integer(row.epoch, 1), revision: integer(row.revision, 1), updatedAt: time(row.updatedAt) };
}
export function parseFriendPair(value: unknown): FriendPair {
  const row = object(value, 'format,a,b,participants,from,state,epoch,inviteSlot,createdAt,updatedAt');
  const a = friendUid(row.a); const b = friendUid(row.b); const from = friendUid(row.from);
  if (a >= b || !Array.isArray(row.participants) || row.participants.length !== 2 || row.participants[0] !== a || row.participants[1] !== b ||
    ![a, b].includes(from) || typeof row.state !== 'string' || !['pending', 'accepted', 'declined', 'cancelled', 'removed'].includes(row.state)) invalid();
  return {
    format: version(row.format), a, b, participants: [a, b], from, state: row.state as FriendPairState, epoch: integer(row.epoch, 1),
    inviteSlot: row.inviteSlot === null ? null : integer(row.inviteSlot, 0, 19), createdAt: time(row.createdAt), updatedAt: time(row.updatedAt),
  };
}
export function parseFriendManifest(value: unknown): FriendManifest {
  const row = object(value, 'generation,digest,count');
  return { generation: friendUuid(row.generation), digest: friendToken(row.digest), count: integer(row.count, 0, 200) };
}
export function parseFriendHead(value: unknown): FriendShareHead {
  const row = object(value, 'format,epoch,settingsRevision,revision,source,current,previous,updatedAt');
  return {
    format: version(row.format), epoch: integer(row.epoch, 1), settingsRevision: integer(row.settingsRevision, 1), revision: integer(row.revision, 1),
    source: parseFriendSource(row.source),
    current: row.current === null ? null : parseFriendManifest(row.current), previous: row.previous === null ? null : parseFriendManifest(row.previous), updatedAt: time(row.updatedAt),
  };
}
export function parseFriendGroup(id: string, value: unknown): FriendGroup {
  const row = object(value, 'format,name,participantUids,revision,createdAt,updatedAt');
  return { format: version(row.format), id: friendUuid(id), name: friendName(row.name, 80), participantUids: friendParticipants(row.participantUids), revision: integer(row.revision, 1), createdAt: time(row.createdAt), updatedAt: time(row.updatedAt) };
}
export function parseFriendBlock(uid: string, value: unknown): FriendBlock {
  const row = object(value, 'createdAt');
  return { uid: friendUid(uid), createdAt: time(row.createdAt) };
}
export function parseFriendInvite(token: string, value: unknown): FriendInvitation {
  const row = object(value, 'format,ownerUid,slot,displayName,avatar,createdAt,state,acceptedBy');
  if (row.format !== 1 || typeof row.state !== 'string' || !['active', 'consumed', 'revoked'].includes(row.state) ||
    (row.state === 'consumed' ? typeof row.acceptedBy !== 'string' : row.acceptedBy !== null)) invalid();
  if (row.acceptedBy !== null) friendUid(row.acceptedBy);
  const createdAt = time(row.createdAt);
  return {
    token: friendToken(token), ownerUid: friendUid(row.ownerUid), slot: integer(row.slot, 0, 19), displayName: friendName(row.displayName),
    avatar: parseAvatar(row.avatar), state: row.state as FriendInvitation['state'], createdAt, expiresAt: createdAt + FRIEND_INVITE_LIFETIME_MS, lifetimeDays: 7, singleUse: true,
  };
}
export function parseFriendGeneration(value: unknown): FriendGeneration {
  const row = object(value, 'epoch,settingsRevision,count,digest,uploaded,ids,status,createdAt,source');
  if (typeof row.status !== 'string' || !['staging', 'ready', 'published', 'deleting'].includes(row.status)) invalid();
  const count = integer(row.count, 0, FRIEND_SELECTION_LIMIT); const uploaded = integer(row.uploaded, 0, FRIEND_CHUNK_LIMIT); const ids = friendSelection(row.ids);
  if (uploaded > Math.ceil(count / FRIEND_CHUNK_SIZE) || ids.length !== Math.min(uploaded * FRIEND_CHUNK_SIZE, count) || ((row.status === 'ready' || row.status === 'published') && ids.length !== count)) invalid();
  return { epoch: integer(row.epoch, 1), settingsRevision: integer(row.settingsRevision, 1), source: parseFriendSource(row.source), count, digest: friendToken(row.digest), uploaded, ids, status: row.status as FriendGeneration['status'], createdAt: time(row.createdAt) };
}
export function parseFriendSource(value: unknown): FriendSourceRevision {
  const row = object(value, 'syncEpoch,remoteRevision');
  return { syncEpoch: integer(row.syncEpoch, 1), remoteRevision: integer(row.remoteRevision, 0) };
}
export function parseFriendChunk(value: unknown, index: number, count: number): PublicEntry[] {
  const row = object(value, 'index,entries,ids');
  integer(index, 0, FRIEND_CHUNK_LIMIT - 1); integer(count, 1, FRIEND_SELECTION_LIMIT);
  if (row.index !== index || !Array.isArray(row.entries) || row.entries.length !== Math.min(FRIEND_CHUNK_SIZE, count - index * FRIEND_CHUNK_SIZE) || row.entries.length < 1) invalid();
  const entries = row.entries.map(parsePublicEntry); const ids = friendSelection(row.ids);
  if (entries.some((entry, offset) => entry.position !== index * FRIEND_CHUNK_SIZE + offset + 1 || entry.id !== ids[offset]) || ids.length !== entries.length) invalid();
  return entries;
}
export function parseFriendRegistry(value: unknown): string[] {
  const row = object(value, 'ids,revision');
  integer(row.revision, 1);
  if (!Array.isArray(row.ids) || row.ids.length > 3 || new Set(row.ids).size !== row.ids.length) invalid();
  return row.ids.map(friendUuid);
}
export function parseFriendSlot(value: unknown): string {
  return friendToken(object(value, 'token').token);
}
export function validateFriendEntries(value: readonly PublicEntry[], selectedIds: readonly string[]): PublicEntry[] {
  const selected = new Set(friendSelection(selectedIds)); const entries = value.map(parsePublicEntry);
  if (entries.length > 200 || new Set(entries.map((entry) => entry.id)).size !== entries.length ||
    entries.some((entry, index) => entry.position !== index + 1 || !selected.has(entry.id))) invalid('The selected ranking changed. Review its games and order before sharing.');
  return entries;
}
export function projectFriendRanking(state: PersonalLibraryState, selectedIds: readonly string[], games: Game[]): { entries: PublicEntry[]; selectedIds: string[] } {
  const selected = friendSelection(selectedIds);
  const ranked = new Set(state.ranking.map((entry) => entry.id));
  const remaining = selected.filter((id) => ranked.has(id));
  return { entries: remaining.length ? projectPublicRanking(state, new Set(remaining), games) : [], selectedIds: remaining };
}

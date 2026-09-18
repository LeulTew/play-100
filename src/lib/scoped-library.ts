import { accountStorageTransaction, publishLibraryChange } from './personal-db';
import { applyPersonalAction, emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import type { PersonalAction, PersonalLibraryState } from './personal-types';
import type { LibraryScope, ScopedLibrary, SyncHead } from './cloud-types';
import { scopeUid } from './cloud-types';
import type { MotionPreference } from './types';
import { parseAvatarDescriptor } from './avatar';
import type { Member } from './community';
import { recordFriendRemovals } from './friend-selection-cache';
import { recordFriendShelfRemovals } from './friend-shelf-selection-cache';
import { friendShelfSelectionKey } from './friend-shelf-selection';

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = 'PersonalLibraryConflictError';
  return error;
}

function initial(scope: LibraryScope, motion: MotionPreference = 'auto'): ScopedLibrary {
  scopeUid(scope);
  return {
    version: 1, scope, state: { ...emptyPersonalLibrary(), motion },
    sync: { enabled: false, epoch: 0, baseRemoteRevision: 0, remoteGeneration: null, dirty: false, dataRevision: 0, displayName: '', lastSyncedAt: null },
    recovery: null, profile: null,
  };
}

export function parseScopedLibrary(value: unknown, scope: LibraryScope): ScopedLibrary {
  scopeUid(scope);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This account cache is unreadable. It has not been overwritten.');
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || row.scope !== scope || !['recovery,scope,state,sync,version', 'profile,recovery,scope,state,sync,version'].includes(Object.keys(row).sort().join(',')) ||
    !row.sync || typeof row.sync !== 'object' || Array.isArray(row.sync)) throw new Error('This cache belongs to a different account or storage version. Nothing was changed.');
  const meta = row.sync as Record<string, unknown>;
  if (Object.keys(meta).sort().join(',') !== 'baseRemoteRevision,dataRevision,dirty,displayName,enabled,epoch,lastSyncedAt,remoteGeneration' ||
    typeof meta.enabled !== 'boolean' || typeof meta.dirty !== 'boolean' ||
    typeof meta.displayName !== 'string' || meta.displayName.length > 60 ||
    typeof meta.epoch !== 'number' || !Number.isSafeInteger(meta.epoch) || meta.epoch < 0 ||
    typeof meta.baseRemoteRevision !== 'number' || !Number.isSafeInteger(meta.baseRemoteRevision) || meta.baseRemoteRevision < 0 ||
    typeof meta.dataRevision !== 'number' || !Number.isSafeInteger(meta.dataRevision) || meta.dataRevision < 0 ||
    (meta.remoteGeneration !== null && (typeof meta.remoteGeneration !== 'string' || !/^[a-f0-9-]{36}$/.test(meta.remoteGeneration))) ||
    (meta.lastSyncedAt !== null && (typeof meta.lastSyncedAt !== 'number' || !Number.isFinite(meta.lastSyncedAt)))) throw new Error('Account sync metadata is invalid. Existing local data is retained.');
  let recovery: ScopedLibrary['recovery'] = null;
  let profile: ScopedLibrary['profile'] = null;
  if (row.profile !== undefined && row.profile !== null) {
    if (!row.profile || typeof row.profile !== 'object' || !('displayName' in row.profile) || typeof row.profile.displayName !== 'string' || row.profile.displayName.length > 60 || !('avatar' in row.profile)) throw new Error('The cached account profile is invalid.');
    profile = { displayName: row.profile.displayName, avatar: parseAvatarDescriptor(row.profile.avatar) };
  }
  if (row.recovery !== null) {
    if (!row.recovery || typeof row.recovery !== 'object' || !('state' in row.recovery) ||
      !('savedAt' in row.recovery) || typeof row.recovery.savedAt !== 'number' ||
      !('reason' in row.recovery) || typeof row.recovery.reason !== 'string') throw new Error('The account recovery copy is invalid.');
    recovery = { state: parsePersonalLibrary(row.recovery.state), savedAt: row.recovery.savedAt, reason: row.recovery.reason };
  }
  return {
    version: 1, scope, state: parsePersonalLibrary(row.state), recovery, profile,
    sync: { enabled: meta.enabled, dirty: meta.dirty, dataRevision: meta.dataRevision, displayName: meta.displayName, epoch: meta.epoch,
      baseRemoteRevision: meta.baseRemoteRevision, remoteGeneration: meta.remoteGeneration, lastSyncedAt: meta.lastSyncedAt },
  };
}

async function update(scope: LibraryScope, change: (current: ScopedLibrary) => ScopedLibrary): Promise<ScopedLibrary> {
  const saved = await accountStorageTransaction(scope, (value, store) => {
    const current = value === undefined ? initial(scope) : parseScopedLibrary(value, scope);
    const next = parseScopedLibrary(change(current), scope);
    const ranked = new Set(next.state.ranking.map((entry) => entry.id));
    const removed = current.state.ranking.filter((entry) => !ranked.has(entry.id)).map((entry) => entry.id);
    recordFriendRemovals(store, scope, removed, current.state.revision, next.state.revision);
    const removedRecords = Object.keys(current.state.records).filter((id) => !Object.hasOwn(next.state.records, id));
    recordFriendShelfRemovals(store, scope, removedRecords, current.state.revision, next.state.revision);
    store.put(next, scope);
    return next;
  });
  publishLibraryChange(scope);
  return saved;
}

export async function loadScopedLibrary(scope: LibraryScope, deviceMotion: MotionPreference = 'auto'): Promise<ScopedLibrary> {
  return accountStorageTransaction(scope, (value, store) => {
    if (value !== undefined) return parseScopedLibrary(value, scope);
    const empty = initial(scope, deviceMotion);
    store.put(empty, scope);
    return empty;
  });
}

export function commitScopedAction(scope: LibraryScope, action: PersonalAction): Promise<ScopedLibrary> {
  return update(scope, (current) => ({
    ...current, state: applyPersonalAction(current.state, action),
    sync: { ...current.sync, dirty: action.type === 'set-motion' ? current.sync.dirty : true,
      dataRevision: current.sync.dataRevision + (action.type === 'set-motion' ? 0 : 1) },
  }));
}

export function restoreScopedLibrary(scope: LibraryScope, state: PersonalLibraryState, reason = 'Before replacing this account library'): Promise<ScopedLibrary> {
  const validated = parsePersonalLibrary(state);
  return update(scope, (current) => ({
    ...current, state: { ...validated, revision: current.state.revision + 1 },
    sync: { ...current.sync, dirty: true, dataRevision: current.sync.dataRevision + 1 },
    recovery: { state: current.state, savedAt: Date.now(), reason },
  }));
}

export function connectScopedLibrary(scope: LibraryScope, state: PersonalLibraryState, head: SyncHead, displayName: string, upload: boolean, expected: { localRevision: number; epoch: number; enabled: boolean }): Promise<ScopedLibrary> {
  const validated = parsePersonalLibrary(state);
  return update(scope, (current) => {
    if (current.state.revision !== expected.localRevision || current.sync.epoch !== expected.epoch || current.sync.enabled !== expected.enabled) {
      throw conflict('This account library or connection changed while the preview was open. Your current copy is intact; review the connection again.');
    }
    return {
      ...current, state: { ...validated, revision: current.state.revision + 1, motion: current.state.motion },
      sync: { enabled: true, epoch: head.epoch, baseRemoteRevision: head.revision, remoteGeneration: head.current?.generation ?? null, dirty: upload, dataRevision: current.sync.dataRevision + 1, displayName, lastSyncedAt: upload ? null : Date.now() },
      recovery: { state: current.state, savedAt: Date.now(), reason: 'Before connecting this account library' },
    };
  });
}

export function isInitialAccountCache(current: ScopedLibrary | null): boolean {
  return Boolean(current && !current.sync.enabled && current.sync.epoch === 0 && !current.sync.dirty && current.sync.dataRevision === 0 &&
    Object.keys(current.state.records).length === 0 && current.state.ranking.length === 0 && current.state.queueOrder.length === 0 && current.recovery === null);
}

export function restoreConsentedAccount(scope: LibraryScope, state: PersonalLibraryState, head: SyncHead, member: Member, isCurrent: () => boolean): Promise<ScopedLibrary> {
  const validated = parsePersonalLibrary(state);
  if (member.uid !== scopeUid(scope) || member.consentVersion !== 1 || !head.enabled || head.deleted || !head.current) {
    return Promise.reject(conflict('An active, previously saved online copy is required before restoring this account.'));
  }
  const generation = head.current.generation;
  return update(scope, (current) => {
    if (!isCurrent() || !isInitialAccountCache(current)) {
      throw conflict('This account copy changed or was previously connected. Its data and connection choice are retained.');
    }
    return {
      ...current,
      state: { ...validated, revision: current.state.revision + 1, motion: current.state.motion },
      sync: {
        enabled: true, epoch: head.epoch, baseRemoteRevision: head.revision, remoteGeneration: generation,
        dirty: false, dataRevision: current.sync.dataRevision + 1,
        displayName: current.profile?.displayName || member.displayName, lastSyncedAt: Date.now(),
      },
      profile: current.profile ?? { displayName: member.displayName, avatar: parseAvatarDescriptor(member.avatar) },
    };
  });
}

export function acknowledgeScopedUpload(scope: LibraryScope, uploadedDataRevision: number, head: SyncHead, isCurrent: () => boolean = () => true): Promise<ScopedLibrary> {
  return update(scope, (current) => {
    if (!isCurrent()) throw conflict('The account session changed before acknowledging the upload. Its pending copy is retained.');
    if (!current.sync.enabled || current.sync.epoch !== head.epoch || head.revision < current.sync.baseRemoteRevision) return current;
    return {
      ...current,
      sync: { ...current.sync, baseRemoteRevision: head.revision, remoteGeneration: head.current?.generation ?? null,
        dirty: current.sync.dataRevision !== uploadedDataRevision, lastSyncedAt: Date.now() },
    };
  });
}

export function adoptScopedRemote(scope: LibraryScope, state: PersonalLibraryState, head: SyncHead, expectedLocalRevision: number, replace = false, canAdopt: () => boolean = () => true): Promise<ScopedLibrary> {
  const validated = parsePersonalLibrary(state);
  return update(scope, (current) => {
    if (!canAdopt() || !current.sync.enabled || current.sync.epoch !== head.epoch || !head.enabled || head.deleted || current.state.revision !== expectedLocalRevision || (!replace && current.sync.dirty) || head.revision < current.sync.baseRemoteRevision) throw conflict('Your local library or online permission changed while the online copy was loading. Both copies are safe; review them again.');
    return {
      ...current, state: { ...validated, revision: current.state.revision + 1, motion: current.state.motion },
      sync: { ...current.sync, enabled: head.enabled, epoch: head.epoch, baseRemoteRevision: head.revision, remoteGeneration: head.current?.generation ?? null, dirty: false, dataRevision: current.sync.dataRevision + 1, lastSyncedAt: Date.now() },
      recovery: { state: current.state, savedAt: Date.now(), reason: replace ? 'Before choosing the online conflict copy' : 'Previous online snapshot' },
    };
  });
}

export function pauseScopedLibrary(scope: LibraryScope, expectedEpoch?: number, isCurrent: () => boolean = () => true): Promise<ScopedLibrary> {
  return update(scope, (current) => {
    if (!isCurrent() || (expectedEpoch !== undefined && current.sync.epoch !== expectedEpoch)) throw conflict('The online session changed before it could be paused. Its current state is retained.');
    return { ...current, sync: { ...current.sync, enabled: false } };
  });
}

export function rebaseScopedLibrary(scope: LibraryScope, head: SyncHead, expectedLocalRevision: number, isCurrent: () => boolean = () => true): Promise<ScopedLibrary> {
  return update(scope, (current) => {
    if (!isCurrent() || !current.sync.enabled || !head.enabled || head.deleted || current.sync.epoch !== head.epoch || current.state.revision !== expectedLocalRevision) throw conflict('Your device copy or online permission changed. Review the replacement again.');
    return { ...current, sync: { ...current.sync, enabled: true, epoch: head.epoch, baseRemoteRevision: head.revision, dirty: true } };
  });
}

export async function deleteScopedLibrary(scope: LibraryScope): Promise<void> {
  scopeUid(scope);
  await accountStorageTransaction(scope, (_, store) => { store.delete(scope); store.delete(`friends-selection:v1:${scope}`); store.delete(friendShelfSelectionKey(scope)); store.delete(`friends-all-work:v2:${scope}`); });
  publishLibraryChange(scope);
}

export function cacheScopedProfile(scope: LibraryScope, member: Member, isCurrent: () => boolean = () => true): Promise<ScopedLibrary> {
  if (scopeUid(scope) !== member.uid) return Promise.reject(conflict('A profile from another account cannot be cached here.'));
  return update(scope, (current) => {
    if (!isCurrent()) throw conflict('The account changed before its profile could be cached.');
    return { ...current, profile: { displayName: member.displayName, avatar: parseAvatarDescriptor(member.avatar) } };
  });
}

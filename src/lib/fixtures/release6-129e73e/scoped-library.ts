// Release 6 account mutations, selected verbatim; see provenance.json.
import { accountStorageTransaction, publishLibraryChange } from './personal-db';
import { applyPersonalAction, emptyPersonalLibrary, parsePersonalLibrary } from '../../personal-library';
import type { PersonalAction, PersonalLibraryState } from '../../personal-types';
import type { LibraryScope, ScopedLibrary } from '../../cloud-types';
import { scopeUid } from '../../cloud-types';
import type { MotionPreference } from '../../types';
import { parseAvatarDescriptor } from '../../avatar';
import { recordFriendRemovals } from '../../friend-selection-cache';
import { recordFriendShelfRemovals } from '../../friend-shelf-selection-cache';
import { friendShelfSelectionKey } from '../../friend-shelf-selection';
import { clearMotionHint, rememberMotionHint } from '../../motion-hint';

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = 'PersonalLibraryConflictError';
  return error;
}

function initial(scope: LibraryScope, motion: MotionPreference = 'auto'): ScopedLibrary {
  scopeUid(scope);
  return {
    version: 1,
    scope,
    state: { ...emptyPersonalLibrary(), motion },
    sync: {
      enabled: false,
      epoch: 0,
      baseRemoteRevision: 0,
      remoteGeneration: null,
      dirty: false,
      dataRevision: 0,
      displayName: '',
      lastSyncedAt: null,
    },
    recovery: null,
    profile: null,
  };
}

export function parseScopedLibrary(value: unknown, scope: LibraryScope): ScopedLibrary {
  scopeUid(scope);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error("This account's copy on this device is unreadable. It has not been overwritten.");
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    row.scope !== scope ||
    !['recovery,scope,state,sync,version', 'profile,recovery,scope,state,sync,version'].includes(
      Object.keys(row).sort().join(','),
    ) ||
    !row.sync ||
    typeof row.sync !== 'object' ||
    Array.isArray(row.sync)
  )
    throw new Error('This cache belongs to a different account or storage version. Nothing was changed.');
  const meta = row.sync as Record<string, unknown>;
  if (
    Object.keys(meta).sort().join(',') !==
      'baseRemoteRevision,dataRevision,dirty,displayName,enabled,epoch,lastSyncedAt,remoteGeneration' ||
    typeof meta.enabled !== 'boolean' ||
    typeof meta.dirty !== 'boolean' ||
    typeof meta.displayName !== 'string' ||
    meta.displayName.length > 60 ||
    typeof meta.epoch !== 'number' ||
    !Number.isSafeInteger(meta.epoch) ||
    meta.epoch < 0 ||
    typeof meta.baseRemoteRevision !== 'number' ||
    !Number.isSafeInteger(meta.baseRemoteRevision) ||
    meta.baseRemoteRevision < 0 ||
    typeof meta.dataRevision !== 'number' ||
    !Number.isSafeInteger(meta.dataRevision) ||
    meta.dataRevision < 0 ||
    (meta.remoteGeneration !== null &&
      (typeof meta.remoteGeneration !== 'string' || !/^[a-f0-9-]{36}$/.test(meta.remoteGeneration))) ||
    (meta.lastSyncedAt !== null && (typeof meta.lastSyncedAt !== 'number' || !Number.isFinite(meta.lastSyncedAt)))
  )
    throw new Error('Account sync metadata is invalid. Existing local data is retained.');
  let recovery: ScopedLibrary['recovery'] = null;
  let profile: ScopedLibrary['profile'] = null;
  if (row.profile !== undefined && row.profile !== null) {
    if (
      !row.profile ||
      typeof row.profile !== 'object' ||
      !('displayName' in row.profile) ||
      typeof row.profile.displayName !== 'string' ||
      row.profile.displayName.length > 60 ||
      !('avatar' in row.profile)
    )
      throw new Error('The cached account profile is invalid.');
    profile = { displayName: row.profile.displayName, avatar: parseAvatarDescriptor(row.profile.avatar) };
  }
  if (row.recovery !== null) {
    if (
      !row.recovery ||
      typeof row.recovery !== 'object' ||
      !('state' in row.recovery) ||
      !('savedAt' in row.recovery) ||
      typeof row.recovery.savedAt !== 'number' ||
      !('reason' in row.recovery) ||
      typeof row.recovery.reason !== 'string'
    )
      throw new Error('The account recovery copy is invalid.');
    recovery = {
      state: parsePersonalLibrary(row.recovery.state),
      savedAt: row.recovery.savedAt,
      reason: row.recovery.reason,
    };
  }
  return {
    version: 1,
    scope,
    state: parsePersonalLibrary(row.state),
    recovery,
    profile,
    sync: {
      enabled: meta.enabled,
      dirty: meta.dirty,
      dataRevision: meta.dataRevision,
      displayName: meta.displayName,
      epoch: meta.epoch,
      baseRemoteRevision: meta.baseRemoteRevision,
      remoteGeneration: meta.remoteGeneration,
      lastSyncedAt: meta.lastSyncedAt,
    },
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
  rememberMotionHint(scope, saved.state.motion);
  publishLibraryChange(scope);
  return saved;
}

export async function loadScopedLibrary(
  scope: LibraryScope,
  deviceMotion: MotionPreference = 'auto',
): Promise<ScopedLibrary> {
  const loaded = await accountStorageTransaction(scope, (value, store) => {
    if (value !== undefined) return parseScopedLibrary(value, scope);
    const empty = initial(scope, deviceMotion);
    store.put(empty, scope);
    return empty;
  });
  rememberMotionHint(scope, loaded.state.motion);
  return loaded;
}

export function commitScopedAction(scope: LibraryScope, action: PersonalAction): Promise<ScopedLibrary> {
  return update(scope, (current) => ({
    ...current,
    state: applyPersonalAction(current.state, action),
    sync: {
      ...current.sync,
      dirty: action.type === 'set-motion' ? current.sync.dirty : true,
      dataRevision: current.sync.dataRevision + (action.type === 'set-motion' ? 0 : 1),
    },
  }));
}

export function restoreScopedLibrary(
  scope: LibraryScope,
  state: PersonalLibraryState,
  reason = 'Before replacing this account library',
): Promise<ScopedLibrary> {
  const validated = parsePersonalLibrary(state);
  return update(scope, (current) => ({
    ...current,
    state: { ...validated, revision: current.state.revision + 1 },
    sync: { ...current.sync, dirty: true, dataRevision: current.sync.dataRevision + 1 },
    recovery: { state: current.state, savedAt: Date.now(), reason },
  }));
}

export async function deleteScopedLibrary(scope: LibraryScope, expectedRevision?: number): Promise<void> {
  scopeUid(scope);
  await accountStorageTransaction(scope, (value, store) => {
    if (expectedRevision !== undefined && value !== undefined) {
      const current = parseScopedLibrary(value, scope);
      if (current.sync.dirty || current.state.revision !== expectedRevision) {
        throw conflict(
          'Signed out, but this device copy changed or has unsynced edits. It was kept. Sign in to save or export it before removing it.',
        );
      }
    }
    store.delete(scope);
    store.delete(`friends-selection:v1:${scope}`);
    store.delete(friendShelfSelectionKey(scope));
    store.delete(`friends-all-work:v2:${scope}`);
  });
  clearMotionHint(scope);
  publishLibraryChange(scope);
}

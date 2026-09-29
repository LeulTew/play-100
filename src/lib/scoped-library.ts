import { accountStorageTransaction, accountWriterKey, publishLibraryChange } from './personal-db';
import type { AccountJournal } from './personal-db';
import { applyPersonalAction, emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import type { PersonalAction, PersonalLibraryState } from './personal-types';
import type { LibraryScope, ScopedLibrary, SyncHead, SyncMetadata } from './cloud-types';
import { scopeUid } from './cloud-types';
import type { MotionPreference } from './types';
import { parseAvatarDescriptor } from './avatar';
import type { Member } from './community';
import { recordFriendRemovals } from './friend-selection-cache';
import { recordFriendShelfRemovals } from './friend-shelf-selection-cache';
import { friendShelfSelectionKey } from './friend-shelf-selection';
import { motionHintKey, rememberMotionHint } from './motion-hint';

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = 'PersonalLibraryConflictError';
  return error;
}

export interface AccountWriter {
  readonly scope: LibraryScope;
  readonly generation: number;
}

type AccountTarget = LibraryScope | AccountWriter;
interface WriterStatus {
  version: 1;
  generation: number;
  retired: boolean;
}

function retiredWriter(): Error {
  const error = new Error(
    "This account's device copy was removed in another tab. This older edit was not saved. Sign in again to open a new copy.",
  );
  error.name = 'PersonalLibraryWriterRetiredError';
  return error;
}

function writerStatus(value: unknown): WriterStatus {
  if (value === undefined) return { version: 1, generation: 0, retired: false };
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'generation,retired,version' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('generation' in value) ||
    typeof value.generation !== 'number' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    !('retired' in value) ||
    typeof value.retired !== 'boolean'
  )
    throw conflict('The account writer marker is invalid. Its saved data has not been changed.');
  return { version: 1, generation: value.generation, retired: value.retired };
}

export function scopedWriter(snapshot: ScopedLibrary): AccountWriter {
  return { scope: snapshot.scope, generation: snapshot.writerGeneration ?? 0 };
}

/**
 * The sharing journals of a writer's device copy (personal-db's AccountJournal). A journal belongs to its copy: a copy
 * that was removed, or never opened, starts no journal, and a copy reopened since this writer opened it belongs to a
 * newer writer. Once the copy is gone, cleanup may still delete what a journal holds.
 */
export function accountJournal(target: AccountTarget): AccountJournal {
  const writer = targetWriter(target);
  return {
    scope: writer.scope,
    check(marker, row, cleanup) {
      if (row === undefined) {
        if (cleanup) return;
        throw retiredWriter();
      }
      requireWriter(writer, marker, row);
    },
  };
}

// Scope-only callers belong to the original generation; they cannot adopt a reopened cache.
function targetWriter(target: AccountTarget): AccountWriter {
  const writer = typeof target === 'string' ? { scope: target, generation: 0 } : target;
  scopeUid(writer.scope);
  if (!Number.isSafeInteger(writer.generation) || writer.generation < 0) throw retiredWriter();
  return { scope: writer.scope, generation: writer.generation };
}

function requireWriter(writer: AccountWriter, value: unknown, row: unknown): WriterStatus {
  const status = writerStatus(value);
  if (status.retired || status.generation !== writer.generation) throw retiredWriter();
  if (row && typeof row === 'object' && ('writerGeneration' in row ? row.writerGeneration : 0) !== writer.generation)
    throw retiredWriter();
  if (row === undefined && writer.generation !== 0) throw retiredWriter();
  return status;
}

function initial(scope: LibraryScope, motion: MotionPreference = 'auto', writerGeneration = 0): ScopedLibrary {
  scopeUid(scope);
  return {
    version: 1,
    scope,
    writerGeneration,
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

type ScopedEnvelope = Omit<ScopedLibrary, 'state'> & { state: unknown };
interface RemovalState {
  revision: number;
  ranking: readonly { id: string }[];
  records: Record<string, unknown>;
}

function parseSyncMetadata(value: unknown): SyncMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Account sync metadata is invalid. Existing local data is retained.');
  const meta = value as Record<string, unknown>;
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
  return {
    enabled: meta.enabled,
    dirty: meta.dirty,
    dataRevision: meta.dataRevision,
    displayName: meta.displayName,
    epoch: meta.epoch,
    baseRemoteRevision: meta.baseRemoteRevision,
    remoteGeneration: meta.remoteGeneration,
    lastSyncedAt: meta.lastSyncedAt,
  };
}

function parseScopedEnvelope(value: unknown, scope: LibraryScope): ScopedEnvelope {
  scopeUid(scope);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error("This account's copy on this device is unreadable. It has not been overwritten.");
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    row.scope !== scope ||
    ![
      'recovery,scope,state,sync,version',
      'profile,recovery,scope,state,sync,version',
      'recovery,scope,state,sync,version,writerGeneration',
      'profile,recovery,scope,state,sync,version,writerGeneration',
    ].includes(Object.keys(row).sort().join(',')) ||
    !row.sync ||
    typeof row.sync !== 'object' ||
    Array.isArray(row.sync)
  )
    throw new Error('This cache belongs to a different account or storage version. Nothing was changed.');
  const writerGeneration = row.writerGeneration === undefined ? 0 : row.writerGeneration;
  if (typeof writerGeneration !== 'number' || !Number.isSafeInteger(writerGeneration) || writerGeneration < 0)
    throw conflict('The account writer generation is invalid. Its saved data has not been changed.');
  const sync = parseSyncMetadata(row.sync);
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
    writerGeneration,
    state: row.state,
    recovery,
    profile,
    sync,
  };
}

export function parseScopedLibrary(value: unknown, scope: LibraryScope): ScopedLibrary {
  const envelope = parseScopedEnvelope(value, scope);
  return { ...envelope, state: parsePersonalLibrary(envelope.state) };
}

async function writeScopedUpdate(
  target: AccountTarget,
  prepare: (value: unknown) => { previous: RemovalState; next: ScopedLibrary },
): Promise<ScopedLibrary> {
  const writer = targetWriter(target);
  const scope = writer.scope;
  const saved = await accountStorageTransaction(scope, (value, store, marker) => {
    const status = requireWriter(writer, marker, value);
    const { previous, next } = prepare(value);
    if ((next.writerGeneration ?? 0) !== writer.generation) throw retiredWriter();
    const ranked = new Set(next.state.ranking.map((entry) => entry.id));
    const removed = previous.ranking.filter((entry) => !ranked.has(entry.id)).map((entry) => entry.id);
    recordFriendRemovals(store, scope, removed, previous.revision, next.state.revision);
    const removedRecords = Object.keys(previous.records).filter((id) => !Object.hasOwn(next.state.records, id));
    recordFriendShelfRemovals(store, scope, removedRecords, previous.revision, next.state.revision);
    store.put(next, scope);
    if (marker === undefined) store.put(status, accountWriterKey(scope));
    return next;
  });
  rememberMotionHint(scope, saved.state.motion);
  publishLibraryChange(scope);
  return saved;
}

function update(target: AccountTarget, change: (current: ScopedLibrary) => ScopedLibrary): Promise<ScopedLibrary> {
  const { scope } = targetWriter(target);
  return writeScopedUpdate(target, (value) => {
    const current = value === undefined ? initial(scope) : parseScopedLibrary(value, scope);
    return { previous: current.state, next: parseScopedLibrary(change(current), scope) };
  });
}

export async function loadScopedLibrary(
  target: AccountTarget,
  deviceMotion: MotionPreference = 'auto',
): Promise<ScopedLibrary> {
  const writer = targetWriter(target);
  const scope = writer.scope;
  const loaded = await accountStorageTransaction(scope, (value, store, marker) => {
    const reading = typeof target === 'string' ? { scope, generation: writerStatus(marker).generation } : writer;
    const status = requireWriter(reading, marker, value);
    if (value !== undefined) return parseScopedLibrary(value, scope);
    const empty = initial(scope, deviceMotion);
    store.put(empty, scope);
    store.put(status, accountWriterKey(scope));
    return empty;
  });
  rememberMotionHint(scope, loaded.state.motion);
  return loaded;
}

/** Only an explicit account-opening lifetime may reactivate a retired device copy. */
export async function openScopedLibrary(
  scope: LibraryScope,
  deviceMotion: MotionPreference = 'auto',
  isCurrent: () => boolean = () => true,
): Promise<ScopedLibrary> {
  scopeUid(scope);
  const opened = await accountStorageTransaction(scope, (value, store, marker) => {
    if (!isCurrent()) throw retiredWriter();
    const status = writerStatus(marker);
    if (!status.retired && value !== undefined) {
      requireWriter({ scope, generation: status.generation }, marker, value);
      return parseScopedLibrary(value, scope);
    }
    const next = initial(scope, deviceMotion, status.generation);
    store.put({ ...status, retired: false }, accountWriterKey(scope));
    store.put(next, scope);
    return next;
  });
  rememberMotionHint(scope, opened.state.motion);
  return opened;
}

export function commitScopedAction(target: AccountTarget, action: PersonalAction): Promise<ScopedLibrary> {
  const { scope } = targetWriter(target);
  return writeScopedUpdate(target, (value) => {
    const current = value === undefined ? initial(scope) : parseScopedEnvelope(value, scope);
    const state = applyPersonalAction(current.state, action);
    const sync = parseSyncMetadata({
      ...current.sync,
      dirty: action.type === 'set-motion' ? current.sync.dirty : true,
      dataRevision: current.sync.dataRevision + (action.type === 'set-motion' ? 0 : 1),
    });
    // The reducer validated the raw state into its own copy. Only these unchanged
    // input fields are read for removal journals; v2 and v3 share their shapes.
    const previous = current.state as RemovalState;
    return { previous, next: { ...current, state, sync } };
  });
}

export function restoreScopedLibrary(
  target: AccountTarget,
  state: PersonalLibraryState,
  reason = 'Before replacing this account library',
): Promise<ScopedLibrary> {
  const validated = parsePersonalLibrary(state);
  return update(target, (current) => ({
    ...current,
    state: { ...validated, revision: current.state.revision + 1 },
    sync: { ...current.sync, dirty: true, dataRevision: current.sync.dataRevision + 1 },
    recovery: { state: current.state, savedAt: Date.now(), reason },
  }));
}

export function connectScopedLibrary(
  target: AccountTarget,
  state: PersonalLibraryState,
  head: SyncHead,
  displayName: string,
  upload: boolean,
  expected: { localRevision: number; epoch: number; enabled: boolean },
): Promise<ScopedLibrary> {
  const validated = parsePersonalLibrary(state);
  return update(target, (current) => {
    if (
      current.state.revision !== expected.localRevision ||
      current.sync.epoch !== expected.epoch ||
      current.sync.enabled !== expected.enabled
    ) {
      throw conflict(
        'This account library or connection changed while the preview was open. Your current copy is intact; review the connection again.',
      );
    }
    return {
      ...current,
      state: { ...validated, revision: current.state.revision + 1, motion: current.state.motion },
      sync: {
        enabled: true,
        epoch: head.epoch,
        baseRemoteRevision: head.revision,
        remoteGeneration: head.current?.generation ?? null,
        dirty: upload,
        dataRevision: current.sync.dataRevision + 1,
        displayName,
        lastSyncedAt: upload ? null : Date.now(),
      },
      recovery: { state: current.state, savedAt: Date.now(), reason: 'Before connecting this account library' },
    };
  });
}

export function isInitialAccountCache(current: ScopedLibrary | null): boolean {
  return Boolean(
    current &&
    !current.sync.enabled &&
    current.sync.epoch === 0 &&
    !current.sync.dirty &&
    current.sync.dataRevision === 0 &&
    Object.keys(current.state.records).length === 0 &&
    current.state.ranking.length === 0 &&
    current.state.queueOrder.length === 0 &&
    current.recovery === null,
  );
}

export function restoreConsentedAccount(
  target: AccountTarget,
  state: PersonalLibraryState,
  head: SyncHead,
  member: Member,
  isCurrent: () => boolean,
): Promise<ScopedLibrary> {
  const { scope } = targetWriter(target);
  const validated = parsePersonalLibrary(state);
  if (member.uid !== scopeUid(scope) || member.consentVersion !== 1 || !head.enabled || head.deleted || !head.current) {
    return Promise.reject(
      conflict('An active, previously saved online copy is required before restoring this account.'),
    );
  }
  const generation = head.current.generation;
  return update(target, (current) => {
    if (!isCurrent() || !isInitialAccountCache(current)) {
      throw conflict(
        'This account copy changed or was previously connected. Its data and connection choice are retained.',
      );
    }
    return {
      ...current,
      state: { ...validated, revision: current.state.revision + 1, motion: current.state.motion },
      sync: {
        enabled: true,
        epoch: head.epoch,
        baseRemoteRevision: head.revision,
        remoteGeneration: generation,
        dirty: false,
        dataRevision: current.sync.dataRevision + 1,
        displayName: current.profile?.displayName || member.displayName,
        lastSyncedAt: Date.now(),
      },
      profile: current.profile ?? { displayName: member.displayName, avatar: parseAvatarDescriptor(member.avatar) },
    };
  });
}

export function acknowledgeScopedUpload(
  target: AccountTarget,
  uploadedDataRevision: number,
  head: SyncHead,
  isCurrent: () => boolean = () => true,
): Promise<ScopedLibrary> {
  return update(target, (current) => {
    if (!isCurrent())
      throw conflict('The account session changed before acknowledging the upload. Its pending copy is retained.');
    if (!current.sync.enabled || current.sync.epoch !== head.epoch || head.revision < current.sync.baseRemoteRevision)
      return current;
    return {
      ...current,
      sync: {
        ...current.sync,
        baseRemoteRevision: head.revision,
        remoteGeneration: head.current?.generation ?? null,
        dirty: current.sync.dataRevision !== uploadedDataRevision,
        lastSyncedAt: Date.now(),
      },
    };
  });
}

export function adoptScopedRemote(
  target: AccountTarget,
  state: PersonalLibraryState,
  head: SyncHead,
  expectedLocalRevision: number,
  replace = false,
  canAdopt: () => boolean = () => true,
): Promise<ScopedLibrary> {
  const validated = parsePersonalLibrary(state);
  return update(target, (current) => {
    if (
      !canAdopt() ||
      !current.sync.enabled ||
      current.sync.epoch !== head.epoch ||
      !head.enabled ||
      head.deleted ||
      current.state.revision !== expectedLocalRevision ||
      (!replace && current.sync.dirty) ||
      head.revision < current.sync.baseRemoteRevision
    )
      throw conflict(
        'Your local library or online permission changed while the online copy was loading. Both copies are safe; review them again.',
      );
    return {
      ...current,
      state: { ...validated, revision: current.state.revision + 1, motion: current.state.motion },
      sync: {
        ...current.sync,
        enabled: head.enabled,
        epoch: head.epoch,
        baseRemoteRevision: head.revision,
        remoteGeneration: head.current?.generation ?? null,
        dirty: false,
        dataRevision: current.sync.dataRevision + 1,
        lastSyncedAt: Date.now(),
      },
      recovery: {
        state: current.state,
        savedAt: Date.now(),
        reason: replace ? 'Before choosing the online conflict copy' : 'Previous online snapshot',
      },
    };
  });
}

export function pauseScopedLibrary(
  target: AccountTarget,
  expectedEpoch?: number,
  isCurrent: () => boolean = () => true,
): Promise<ScopedLibrary> {
  return update(target, (current) => {
    if (!isCurrent() || (expectedEpoch !== undefined && current.sync.epoch !== expectedEpoch))
      throw conflict('The online session changed before it could be paused. Its current state is retained.');
    return { ...current, sync: { ...current.sync, enabled: false } };
  });
}

export function rebaseScopedLibrary(
  target: AccountTarget,
  head: SyncHead,
  expectedLocalRevision: number,
  isCurrent: () => boolean = () => true,
): Promise<ScopedLibrary> {
  return update(target, (current) => {
    if (
      !isCurrent() ||
      !current.sync.enabled ||
      !head.enabled ||
      head.deleted ||
      current.sync.epoch !== head.epoch ||
      current.state.revision !== expectedLocalRevision
    )
      throw conflict('Your device copy or online permission changed. Review the replacement again.');
    return {
      ...current,
      sync: { ...current.sync, enabled: true, epoch: head.epoch, baseRemoteRevision: head.revision, dirty: true },
    };
  });
}

/**
 * Whether removing an account's device copy removed all of it. Its library, recovery data and sharing caches go in one
 * database transaction, which commits or throws. Its motion hint and saved Compare tray pins, which can hold manual
 * titles, live in localStorage, which can still refuse afterwards; `retry` removes them again for the same account.
 */
export type DeviceCopyRemoval =
  { readonly complete: true } | { readonly complete: false; readonly retry: () => DeviceCopyRemoval };

// The tray key is compareTrayStorageKey's, spelled out so that this lazy module needs nothing more from the eager tray
// code; the unit test pins the two together. Each key is removed even if the other is refused. A runtime without Web
// Storage, or with it switched off, keeps nothing there; one whose storage refuses access cannot confirm the removal.
function removeLocalCopy(scope: LibraryScope): DeviceCopyRemoval {
  let complete = true;
  for (const key of [motionHintKey(scope), `play100:compare-tray:v1:${scope}`]) {
    try {
      const storage = globalThis.localStorage;
      if (storage != null) storage.removeItem(key);
    } catch {
      complete = false;
    }
  }
  return complete ? { complete: true } : { complete: false, retry: () => removeLocalCopy(scope) };
}

// The sharing journals of an account's device copy, which go with it.
function removeJournals(store: IDBObjectStore, scope: LibraryScope): void {
  store.delete(`friends-selection:v1:${scope}`);
  store.delete(friendShelfSelectionKey(scope));
  store.delete(`friends-all-work:v2:${scope}`);
}

// Retires the copy's writer, so that no older writer recreates it, and removes it with its sharing journals.
function retireCopy(store: IDBObjectStore, scope: LibraryScope, status: WriterStatus): void {
  if (status.generation >= Number.MAX_SAFE_INTEGER)
    throw conflict('The device-copy generation limit was reached. No data was removed.');
  store.put({ version: 1, generation: status.generation + 1, retired: true }, accountWriterKey(scope));
  store.delete(scope);
  removeJournals(store, scope);
}

export async function deleteScopedLibrary(
  target: AccountTarget,
  expectedRevision?: number,
): Promise<DeviceCopyRemoval> {
  const writer = targetWriter(target);
  const scope = writer.scope;
  await accountStorageTransaction(scope, (value, store, marker) => {
    const status = writerStatus(marker);
    // Already removed: a journal an earlier release left behind still goes.
    if (status.retired && value === undefined) {
      removeJournals(store, scope);
      return;
    }
    requireWriter(writer, marker, value);
    if (expectedRevision !== undefined && value !== undefined) {
      const current = parseScopedLibrary(value, scope);
      if (current.sync.dirty || current.state.revision !== expectedRevision) {
        throw conflict(
          'Signed out, but this device copy changed or has unsynced edits. It was kept. Sign in to save or export it before removing it.',
        );
      }
    }
    retireCopy(store, scope, status);
  });
  const removal = removeLocalCopy(scope);
  publishLibraryChange(scope);
  return removal;
}

/**
 * Removes a deleted account's device copy, at whichever generation it reached and whatever its row holds: after an
 * earlier removal here, the copy may have been reopened, by this tab or another, and may since have become unreadable.
 * Only for an account whose sign-in is itself deleted, so that no sign-in can open that copy again.
 */
export async function deleteAccountCopy(scope: LibraryScope): Promise<DeviceCopyRemoval> {
  scopeUid(scope);
  await accountStorageTransaction(scope, (value, store, marker) => {
    const status = writerStatus(marker);
    if (status.retired && value === undefined) removeJournals(store, scope);
    else retireCopy(store, scope, status);
  });
  const removal = removeLocalCopy(scope);
  publishLibraryChange(scope);
  return removal;
}

/** A deleted account's device-copy removal. When the device database refused it, `retry` tries it all again. */
export type DeletedCopyRemoval =
  | { readonly complete: true }
  | { readonly complete: false; readonly retry: () => DeletedCopyRemoval | Promise<DeletedCopyRemoval> };

/**
 * deleteAccountCopy, for a deletion that has already happened: a removal the device database refuses is reported as
 * incomplete, with a retry, instead of failing a deletion that stands either way.
 */
export async function removeDeletedAccountCopy(scope: LibraryScope): Promise<DeletedCopyRemoval> {
  try {
    return await deleteAccountCopy(scope);
  } catch (cause) {
    console.error(
      "The deleted account's device copy could not be removed.",
      cause instanceof Error ? cause.message : 'Unknown storage failure.',
    );
    return { complete: false, retry: () => removeDeletedAccountCopy(scope) };
  }
}

export function cacheScopedProfile(
  target: AccountTarget,
  member: Member,
  isCurrent: () => boolean = () => true,
): Promise<ScopedLibrary> {
  const { scope } = targetWriter(target);
  if (scopeUid(scope) !== member.uid)
    return Promise.reject(conflict('A profile from another account cannot be cached here.'));
  return update(target, (current) => {
    if (!isCurrent()) throw conflict('The account changed before its profile could be cached.');
    return { ...current, profile: { displayName: member.displayName, avatar: parseAvatarDescriptor(member.avatar) } };
  });
}

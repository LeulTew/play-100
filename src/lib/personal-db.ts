import {
  applyPersonalAction,
  emptyPersonalLibrary,
  migrateLegacyLibrary,
  parsePersonalLibrary,
} from './personal-library';
import type { LibraryRecord, PersonalAction, PersonalLibraryLoad, PersonalLibraryState } from './personal-types';
import { STORAGE_KEY } from './storage';
import { rememberMotionHint } from './motion-hint';
import { STORAGE_DENIED_MESSAGE } from './storage-notices';

export const DB_NAME = 'play100-personal';
export const DB_VERSION = 2;
export const STORE_NAME = 'library';
export const STATE_KEY = 'state';
const ONLINE_HINT_KEY = 'online-hint:v1';

let database: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;
let cancelOpening: (() => void) | null = null;
let generation = 0;
let closed = false;
let channel: BroadcastChannel | null = null;
let legacyNotice: string | null = null;
const listeners = new Set<{ scope: string; listener: () => void }>();

function namedError(name: string, message: string, cause?: unknown): Error {
  const error = new Error(message, { cause });
  error.name = name;
  return error;
}

function storageError(cause: unknown): Error {
  if (cause instanceof Error && cause.name.startsWith('PersonalLibrary')) return cause;
  const name = cause instanceof Error ? cause.name : '';
  if (name === 'QuotaExceededError') {
    return namedError(
      'PersonalLibraryQuotaError',
      'Device storage is full. Your changes were not saved. Free some space and try again.',
      cause,
    );
  }
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return namedError('PersonalLibraryStorageError', STORAGE_DENIED_MESSAGE, cause);
  }
  if (name === 'VersionError') {
    return namedError(
      'PersonalLibraryVersionError',
      'A newer version of Play 100 is using this device library. Reload your Play 100 tabs before trying again. Your data has not been overwritten.',
      cause,
    );
  }
  return namedError(
    'PersonalLibraryStorageError',
    'Your device library could not be opened or saved. No pending changes were saved. Check storage permissions and retry.',
    cause,
  );
}

function notifyListeners(scope?: string): void {
  for (const entry of [...listeners]) {
    if (scope !== undefined && entry.scope !== scope) continue;
    try {
      entry.listener();
    } catch {
      // A subscriber failure cannot undo a completed database transaction.
    }
  }
}

function getChannel(): BroadcastChannel | null {
  if (closed || typeof window === 'undefined' || typeof BroadcastChannel !== 'function') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel('play100-personal-library');
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const value = event.data;
        if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'library-changed') {
          notifyListeners('scope' in value && typeof value.scope === 'string' ? value.scope : 'guest');
        }
      };
    } catch {
      channel = null;
    }
  }
  return channel;
}

export function publishLibraryChange(scope = 'guest'): void {
  if (closed) return;
  notifyListeners(scope);
  try {
    getChannel()?.postMessage(scope === 'guest' ? { type: 'library-changed' } : { type: 'library-changed', scope });
  } catch {
    // Visibility refresh still works when cross-tab notifications are unavailable.
  }
}

function openDatabase(): Promise<IDBDatabase> {
  closed = false;
  if (database) return Promise.resolve(database);
  if (opening) return opening;
  const startedGeneration = generation;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    cancelOpening = () =>
      fail(namedError('PersonalLibraryStorageError', 'The device library connection was closed. Retry to reconnect.'));
    const timer = setTimeout(() => {
      fail(
        namedError(
          'PersonalLibraryBlockedError',
          'The device library is blocked or is not responding. Close other Play 100 tabs, then retry. Your saved data has not been overwritten.',
        ),
      );
    }, 5_000);
    let request: IDBOpenDBRequest;
    try {
      if (typeof indexedDB === 'undefined') {
        throw namedError(
          'PersonalLibraryStorageError',
          'IndexedDB is unavailable. This browser cannot durably save your library. Enable device storage or use a supported browser.',
        );
      }
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (cause) {
      fail(storageError(cause));
      return;
    }
    request.onupgradeneeded = () => {
      if (settled || generation !== startedGeneration) {
        request.transaction?.abort();
        return;
      }
      try {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      } catch (cause) {
        request.transaction?.abort();
        fail(storageError(cause));
      }
    };
    request.onerror = () => fail(storageError(request.error));
    request.onsuccess = () => {
      const connection = request.result;
      if (settled || generation !== startedGeneration) {
        connection.close();
        fail(namedError('PersonalLibraryStorageError', 'The device library connection changed. Retry to reconnect.'));
        return;
      }
      settled = true;
      clearTimeout(timer);
      database = connection;
      connection.onversionchange = () => {
        connection.close();
        if (database === connection) database = null;
        notifyListeners();
      };
      connection.onclose = () => {
        if (database === connection) database = null;
      };
      resolve(connection);
    };
  });
  opening = pending;
  const clearOpening = (): void => {
    if (opening === pending) {
      opening = null;
      cancelOpening = null;
    }
  };
  void pending.then(clearOpening, clearOpening);
  return pending;
}

async function transaction<T>(
  work: (current: unknown, store: IDBObjectStore) => T,
  key = STATE_KEY,
  mode: IDBTransactionMode = 'readwrite',
): Promise<T> {
  const connection = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = connection.transaction(STORE_NAME, mode);
    } catch (cause) {
      reject(storageError(cause));
      return;
    }
    let outcome: { value: T } | undefined;
    let failure: unknown;
    tx.oncomplete = () => {
      if (outcome) resolve(outcome.value);
      else reject(storageError(new Error('The transaction completed without a result.')));
    };
    tx.onabort = () => reject(storageError(failure ?? tx.error));
    const abort = (cause: unknown): void => {
      failure = cause;
      try {
        tx.abort();
      } catch {
        reject(storageError(cause));
      }
    };
    try {
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => {
        failure = request.error;
      };
      request.onsuccess = () => {
        try {
          const current: unknown = request.result;
          outcome = { value: work(current, store) };
        } catch (cause) {
          abort(cause);
        }
      };
    } catch (cause) {
      abort(cause);
    }
  });
}

function readLegacy(): string | null {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY);
  } catch (cause) {
    throw namedError(
      'PersonalLibraryMigrationError',
      'Your previous device library could not be accessed. Allow device storage and retry, or reset device data in Settings. The original data has not been changed.',
      cause,
    );
  }
}

function removeLegacy(expectedRaw?: string): string | null {
  try {
    if (expectedRaw !== undefined && globalThis.localStorage.getItem(STORAGE_KEY) !== expectedRaw) {
      return 'Your library is safely saved, but the previous device data changed during migration and was retained. Export your library before resetting device data.';
    }
    globalThis.localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return 'Your library is safely saved in IndexedDB, but the previous device data could not be removed. Allow device storage to finish cleanup; the old copy has been retained.';
  }
}

export async function loadPersonalLibrary(canonicalRecords: LibraryRecord[]): Promise<PersonalLibraryLoad> {
  const existing = await transaction(
    (current) => {
      if (
        current === undefined ||
        (typeof current === 'object' && current !== null && 'version' in current && current.version === 2)
      )
        return null;
      return parsePersonalLibrary(current);
    },
    STATE_KEY,
    'readonly',
  );
  if (existing) {
    rememberMotionHint('guest', existing.motion);
    return { state: existing, notice: legacyNotice, migrated: false };
  }

  // Initialization/upgrades still re-read under the write lock: a different tab
  // may have initialized or edited this key since the readonly snapshot.
  const result = await transaction((current, store) => {
    if (current !== undefined) {
      const state = parsePersonalLibrary(current);
      const upgraded = typeof current === 'object' && current !== null && 'version' in current && current.version === 2;
      if (upgraded) {
        state.revision = replacementRevision(current);
        store.put(state, STATE_KEY);
      }
      return { state, initialized: false, legacy: null, upgraded };
    }
    const raw = readLegacy();
    const state = raw === null ? emptyPersonalLibrary() : migrateLegacyLibrary(raw, canonicalRecords);
    store.put(state, STATE_KEY);
    return { state, initialized: true, legacy: raw, upgraded: false };
  });
  rememberMotionHint('guest', result.state.motion);
  if (result.initialized) {
    legacyNotice = result.legacy === null ? null : removeLegacy(result.legacy);
    publishLibraryChange();
  }
  if (result.upgraded) {
    publishLibraryChange();
  }
  return { state: result.state, notice: legacyNotice, migrated: result.legacy !== null || result.upgraded };
}

export async function commitPersonalAction(action: PersonalAction): Promise<PersonalLibraryState> {
  const state = await transaction((current, store) => {
    if (current === undefined) {
      throw namedError(
        'PersonalLibraryStorageError',
        'Load your device library before making changes, so previous saved data can be migrated safely.',
      );
    }
    const updated = applyPersonalAction(current, action);
    store.put(updated, STATE_KEY);
    return updated;
  });
  rememberMotionHint('guest', state.motion);
  publishLibraryChange();
  return state;
}

function replacementRevision(current: unknown): number {
  if (
    typeof current === 'object' &&
    current !== null &&
    Object.hasOwn(current, 'revision') &&
    'revision' in current &&
    typeof current.revision === 'number' &&
    Number.isSafeInteger(current.revision) &&
    current.revision >= 0 &&
    current.revision < Number.MAX_SAFE_INTEGER
  ) {
    return current.revision + 1;
  }
  return 1;
}

export async function restorePersonalLibrary(state: PersonalLibraryState): Promise<PersonalLibraryState> {
  const validated = parsePersonalLibrary(state);
  const restored = await transaction((current, store) => {
    const updated = { ...validated, revision: replacementRevision(current) };
    store.put(updated, STATE_KEY);
    return updated;
  });
  rememberMotionHint('guest', restored.motion);
  publishLibraryChange();
  return restored;
}

export async function resetPersonalLibrary(): Promise<PersonalLibraryLoad> {
  const state = await transaction((current, store) => {
    const empty = { ...emptyPersonalLibrary(), revision: replacementRevision(current) };
    store.put(empty, STATE_KEY);
    return empty;
  });
  legacyNotice = removeLegacy();
  rememberMotionHint('guest', state.motion);
  publishLibraryChange();
  return { state, notice: legacyNotice, migrated: false };
}

export function subscribePersonalLibrary(listener: () => void, scope = 'guest'): () => void {
  closed = false;
  const entry = { scope, listener };
  listeners.add(entry);
  getChannel();
  return () => {
    listeners.delete(entry);
  };
}

export function accountStorageTransaction<T>(
  scope: string,
  work: (current: unknown, store: IDBObjectStore) => T,
): Promise<T> {
  if (!/^account:(?:play100-online-48823b32|demo-play100):[A-Za-z0-9_-]{1,128}$/.test(scope)) {
    return Promise.reject(
      namedError('PersonalLibraryValidationError', 'The requested account storage scope is invalid.'),
    );
  }
  return transaction(work, scope);
}

export function friendSelectionStorageTransaction<T>(
  scope: string,
  work: (current: unknown, store: IDBObjectStore) => T,
): Promise<T> {
  if (!/^account:(?:play100-online-48823b32|demo-play100):[A-Za-z0-9_-]{1,128}$/.test(scope))
    return Promise.reject(namedError('PersonalLibraryValidationError', 'The friends selection scope is invalid.'));
  return transaction(work, `friends-selection:v1:${scope}`);
}

export function friendShelfSelectionStorageTransaction<T>(
  scope: string,
  work: (current: unknown, store: IDBObjectStore) => T,
): Promise<T> {
  if (!/^account:(?:play100-online-48823b32|demo-play100):[A-Za-z0-9_-]{1,128}$/.test(scope))
    return Promise.reject(namedError('PersonalLibraryValidationError', 'The shared games selection scope is invalid.'));
  return transaction(work, `friends-shelf-selection:v1:${scope}`);
}

export function friendAllWorkStorageTransaction<T>(
  scope: string,
  work: (current: unknown, store: IDBObjectStore) => T,
): Promise<T> {
  if (!/^account:(?:play100-online-48823b32|demo-play100):[A-Za-z0-9_-]{1,128}$/.test(scope))
    return Promise.reject(namedError('PersonalLibraryValidationError', 'The automatic sharing scope is invalid.'));
  return transaction(work, `friends-all-work:v2:${scope}`);
}

export function saveOnlineLoadHint(requested: boolean): Promise<void> {
  return transaction((_, store) => {
    store.put({ version: 1, requested }, ONLINE_HINT_KEY);
  }, ONLINE_HINT_KEY);
}

export async function readOnlineLoadHint(project: string): Promise<boolean> {
  if (!/^(play100-online-48823b32|demo-play100)$/.test(project))
    throw namedError('PersonalLibraryValidationError', 'Unknown online account project.');
  const connection = await openDatabase();
  return new Promise<boolean>((resolve, reject) => {
    const tx = connection.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const hint = store.get(ONLINE_HINT_KEY);
    let result = false;
    let failure: unknown;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(storageError(failure ?? tx.error));
    hint.onsuccess = () => {
      const value: unknown = hint.result;
      if (value === undefined) {
        // Legacy releases had no marker. Only inspect our own account keys, never Firebase's private database.
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          result = keys.result.some((key) => typeof key === 'string' && key.startsWith(`account:${project}:`));
        };
        keys.onerror = () => {
          failure = keys.error;
        };
      } else if (
        value &&
        typeof value === 'object' &&
        'version' in value &&
        value.version === 1 &&
        'requested' in value &&
        typeof value.requested === 'boolean'
      ) {
        result = value.requested;
      } else {
        failure = namedError(
          'PersonalLibraryValidationError',
          'The remembered account marker is unreadable. Open Account to recover it.',
        );
        tx.abort();
      }
    };
    hint.onerror = () => {
      failure = hint.error;
    };
  });
}

export function closePersonalLibrary(): void {
  closed = true;
  generation += 1;
  cancelOpening?.();
  cancelOpening = null;
  opening = null;
  database?.close();
  database = null;
  channel?.close();
  channel = null;
  listeners.clear();
  legacyNotice = null;
}

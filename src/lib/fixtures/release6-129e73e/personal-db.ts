// Release 6 database implementation, selected verbatim; see provenance.json.
import { STORAGE_DENIED_MESSAGE } from '../../storage-notices';

export const DB_NAME = 'play100-personal';
export const DB_VERSION = 2;
export const STORE_NAME = 'library';
export const STATE_KEY = 'state';

let database: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;
let cancelOpening: (() => void) | null = null;
let generation = 0;
let closed = false;
let channel: BroadcastChannel | null = null;
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

export function subscribePersonalLibrary(listener: () => void, scope = 'guest'): () => void {
  closed = false;
  const entry = { scope, listener };
  listeners.add(entry);
  getChannel();
  return () => {
    listeners.delete(entry);
  };
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
}

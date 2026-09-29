import { DB_NAME, STORE_NAME } from '../../src/lib/personal-db';

// For tests and browser fixtures: direct access to the device database, past every account and journal check. It opens
// the database at whatever version it has. Abort creation if it does not exist.
function withStore(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let absent = false;
    let settled = false;
    const empty = () => {
      if (mode === 'readonly') resolve(undefined);
      else reject(new Error('The device library store does not exist. Open it before writing a fixture.'));
    };
    const open = indexedDB.open(DB_NAME);
    open.onupgradeneeded = () => {
      absent = true;
      open.transaction?.abort();
    };
    open.onerror = () => {
      if (absent) empty();
      else reject(open.error);
    };
    open.onblocked = () => {
      settled = true;
      reject(new Error('Device store inspection is blocked by another connection.'));
    };
    open.onsuccess = () => {
      const db = open.result;
      if (settled) {
        db.close();
        return;
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        empty();
        return;
      }
      let tx: IDBTransaction | undefined;
      try {
        tx = db.transaction(STORE_NAME, mode);
        const request = work(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => {
          db.close();
          resolve(request?.result);
        };
        tx.onabort = () => {
          db.close();
          reject(tx?.error);
        };
      } catch (cause) {
        tx?.abort();
        db.close();
        reject(cause);
      }
    };
  });
}

/** The value stored under a key of the device database. */
export function readStoredValue(key: string): Promise<unknown> {
  return withStore('readonly', (store) => store.get(key));
}

/** Stores a value under a key of the device database, as an earlier release or a corrupted store could have. */
export async function writeStoredValue(key: string, value: unknown): Promise<void> {
  await withStore('readwrite', (store) => {
    store.put(value, key);
  });
}

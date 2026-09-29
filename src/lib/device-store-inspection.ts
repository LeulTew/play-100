import { DB_NAME, STORE_NAME } from './personal-db';

// For tests and browser fixtures: direct access to the device database, past every account and journal check. It opens
// the database at whatever version it has, so it never upgrades it.
function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE_NAME, mode);
      const request = work(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => {
        db.close();
        resolve(request?.result as T);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

/** The value stored under a key of the device database. */
export function readStoredValue(key: string): Promise<unknown> {
  return withStore('readonly', (store) => store.get(key));
}

/** Stores a value under a key of the device database, as an earlier release or a corrupted store could have. */
export function writeStoredValue(key: string, value: unknown): Promise<void> {
  return withStore('readwrite', (store) => {
    store.put(value, key);
  });
}

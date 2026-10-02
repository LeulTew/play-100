import type { Page } from '@playwright/test';
import type { PersonalLibraryState } from '../src/lib/personal-types';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../src/lib/personal-db';

export async function holdLibraryWrite(page: Page, rejected = false) {
  return page.evaluateHandle((rejected) => {
    const put = IDBObjectStore.prototype.put;
    const state = { attempts: 0, held: false };
    let finish: (() => void) | null = null;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.transaction.db.name === 'play100-personal' && this.name === 'library' && args[1] === 'state') {
        state.attempts += 1;
        if (state.attempts === 1) {
          const transaction = this.transaction;
          const name = rejected ? 'onabort' : 'oncomplete';
          const callback = transaction[name];
          if (!callback) throw new Error('Missing native transaction completion.');
          transaction[name] = (event) => {
            state.held = true;
            finish = () => {
              state.held = false;
              transaction[name] = callback;
              callback.call(transaction, event);
            };
          };
        }
        if (rejected) throw new DOMException('Synthetic action refusal', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
    return {
      state,
      release() {
        if (!finish) throw new Error('No held action.');
        const complete = finish;
        finish = null;
        complete();
      },
      restore() {
        IDBObjectStore.prototype.put = put;
        finish?.();
        finish = null;
      },
    };
  }, rejected);
}

export async function readLibrary(page: Page): Promise<PersonalLibraryState> {
  return page.evaluate(
    ({ name, version, store, key }) =>
      new Promise<PersonalLibraryState>((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(store, 'readonly');
          const get = transaction.objectStore(store).get(key);
          get.onsuccess = () => resolve(get.result as PersonalLibraryState);
          get.onerror = () => reject(get.error ?? new Error('IndexedDB operation failed'));
          transaction.oncomplete = () => database.close();
        };
      }),
    { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, key: STATE_KEY },
  );
}

import type { Page } from '@playwright/test';
import type { PersonalLibraryState } from '../src/lib/personal-types';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../src/lib/personal-db';

export async function readLibrary(page: Page): Promise<PersonalLibraryState> {
  return page.evaluate(({ name, version, store, key }) => new Promise<PersonalLibraryState>((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(store, 'readonly');
      const get = transaction.objectStore(store).get(key);
      get.onsuccess = () => resolve(get.result as PersonalLibraryState);
      get.onerror = () => reject(get.error);
      transaction.oncomplete = () => database.close();
    };
  }), { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, key: STATE_KEY });
}

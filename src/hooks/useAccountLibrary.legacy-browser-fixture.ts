import * as release6 from '../lib/fixtures/release6-129e73e/scoped-library';
import * as legacyDatabase from '../lib/fixtures/release6-129e73e/personal-db';
import { accountScope } from '../lib/cloud-types';
import type { ScopedLibrary } from '../lib/cloud-types';
import type { LibraryRecord } from '../lib/personal-types';

export type LegacyAction = 'save' | 'restore' | 'delete' | 'checked-delete';
export interface LegacyWriterFixture {
  attempt(action: LegacyAction): Promise<{ ok: boolean; name?: string; message?: string }>;
  versionChanges(): number;
  blockedScore(): Promise<number | null>;
  releaseBlocker(): void;
}
declare global {
  interface Window { legacyWriterFixture: LegacyWriterFixture }
}

const scope = accountScope('two-tab-writer', 'demo-play100');
const game: LibraryRecord = {
  id: 'synthetic-canonical', source: 'collection', sourceId: 'synthetic-canonical',
  title: 'Synthetic canonical game', year: 2020, studio: null, genre: null, sourceUrl: null, collectionRank: 1,
};
let captured: ScopedLibrary | null = null;
let changes = 0;
let blocker: IDBDatabase | null = null;
const output = document.createElement('p');
output.setAttribute('role', 'status');
document.body.append(output);

window.legacyWriterFixture = {
  async attempt(action) {
    if (!captured) throw new Error('The old account writer is not ready.');
    try {
      if (action === 'save') await release6.commitScopedAction(scope, { type: 'rate-game', record: game, score: 9 });
      else if (action === 'restore') await release6.restoreScopedLibrary(scope, captured.state);
      else await release6.deleteScopedLibrary(scope, action === 'checked-delete' ? captured.state.revision : undefined);
      return { ok: true };
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause;
      return { ok: false, name: cause.name, message: cause.message };
    }
  },
  versionChanges: () => changes,
  blockedScore() {
    if (!blocker) throw new Error('No blocking connection is open.');
    return new Promise((resolve, reject) => {
      const tx = blocker!.transaction(legacyDatabase.STORE_NAME, 'readonly');
      const request = tx.objectStore(legacyDatabase.STORE_NAME).get(scope);
      tx.oncomplete = () => {
        const value = release6.parseScopedLibrary(request.result, scope);
        resolve(value.state.ranking[0]?.score ?? null);
      };
      tx.onabort = () => reject(tx.error);
    });
  },
  releaseBlocker() {
    blocker?.close();
    blocker = null;
  },
};

async function start() {
  captured = await release6.loadScopedLibrary(scope);
  if (location.search.includes('block')) {
    captured = await release6.commitScopedAction(scope, { type: 'rate-game', record: game, score: 6 });
    blocker = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(legacyDatabase.DB_NAME, legacyDatabase.DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    blocker.onversionchange = () => {};
  }
  legacyDatabase.subscribePersonalLibrary(() => { changes += 1; }, scope);
  output.textContent = 'Release 6 ready';
}
void start().catch((error: unknown) => {
  output.setAttribute('role', 'alert');
  output.textContent = error instanceof Error ? error.message : 'The Release 6 fixture could not open.';
});

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { accountScope } from '../src/lib/cloud-types';
import {
  accountWriterKey,
  closePersonalLibrary,
  commitPersonalAction,
  DB_NAME,
  DB_VERSION,
  loadPersonalLibrary,
  STATE_KEY,
  STORE_NAME,
} from '../src/lib/personal-db';
import {
  commitScopedAction,
  deleteScopedLibrary,
  loadScopedLibrary,
  openScopedLibrary,
  restoreScopedLibrary,
  scopedWriter,
} from '../src/lib/scoped-library';
import type { LibraryRecord } from '../src/lib/personal-types';

const game: LibraryRecord = {
  id: 'recovery-drill',
  title: 'Recovery drill',
  source: 'collection',
  sourceId: 'recovery-drill',
  year: 2020,
  genre: null,
  studio: null,
  sourceUrl: null,
  collectionRank: 1,
};
const account = accountScope('recovery-drill');
const connections: IDBDatabase[] = [];
beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal('window', undefined);
});
afterEach(() => {
  closePersonalLibrary();
  for (const connection of connections.splice(0)) connection.close();
  vi.unstubAllGlobals();
});

function open(version: number) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
    request.onsuccess = () => {
      connections.push(request.result);
      resolve(request.result);
    };
  });
}

function rows(db: IDBDatabase) {
  return new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly'),
      store = tx.objectStore(STORE_NAME);
    const keys = store.getAllKeys(),
      values = store.getAll();
    tx.oncomplete = () => resolve(keys.result.map((key, index) => [key, values.result[index]]));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB operation failed'));
  });
}

it('drills v2 -> v3 -> rejected legacy reopen -> compatible recovery without losing guest/account/recovery data', async () => {
  expect(DB_VERSION).toBe(3);
  await loadPersonalLibrary([game]);
  const guest = await commitPersonalAction({ type: 'rate-game', record: game, score: 8 });
  const original = await commitScopedAction(account, { type: 'rate-game', record: game, score: 7 });
  const withRecovery = await restoreScopedLibrary(account, { ...original.state, motion: 'lite' });
  closePersonalLibrary();
  // Seed the unchanged saved-record shapes into an isolated v2 database. No visitor storage is used.
  vi.stubGlobal('indexedDB', new IDBFactory());
  const legacy = await open(2);
  const legacyAccount = { ...withRecovery };
  delete legacyAccount.writerGeneration;
  await new Promise<void>((resolve, reject) => {
    const tx = legacy.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(guest, STATE_KEY);
    tx.objectStore(STORE_NAME).put(legacyAccount, account);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB operation failed'));
  });
  const savedBefore = await rows(legacy);
  let versionChanged = false;
  legacy.onversionchange = () => {
    versionChanged = true;
    legacy.close();
  };
  expect((await loadPersonalLibrary([game])).state).toEqual(guest);
  expect(versionChanged).toBe(true);
  expect(() => legacy.transaction(STORE_NAME, 'readwrite')).toThrow();
  await expect(open(2)).rejects.toMatchObject({ name: 'VersionError' });
  closePersonalLibrary();
  const v3 = await open(3);
  expect(await rows(v3)).toEqual(savedBefore);
  v3.close();
  // The approved compatible recovery keeps the schema and reads both copies before making new edits.
  expect((await loadPersonalLibrary([game])).state).toEqual(guest);
  const recovered = await loadScopedLibrary(account);
  expect(recovered.state).toEqual(withRecovery.state);
  expect(recovered.recovery).toEqual(withRecovery.recovery);
  await commitScopedAction(scopedWriter(recovered), { type: 'edit-ranking', id: game.id, note: 'Recovered safely' });
  closePersonalLibrary();
  expect((await loadScopedLibrary(account)).state.ranking[0]?.note).toBe('Recovered safely');
  expect((await loadPersonalLibrary([game])).state).toEqual(guest);
});

it('keeps retirement tombstones and rejects stale saves and deletes after compatible reopening', async () => {
  const existing = await commitScopedAction(account, { type: 'rate-game', record: game, score: 7 });
  const oldWriter = scopedWriter(existing);
  await deleteScopedLibrary(oldWriter);
  closePersonalLibrary();
  const retired = await open(3),
    before = await rows(retired);
  expect(before).toContainEqual([accountWriterKey(account), { version: 1, generation: 1, retired: true }]);
  retired.close();
  await expect(loadScopedLibrary(account)).rejects.toMatchObject({ name: 'PersonalLibraryWriterRetiredError' });
  await expect(commitScopedAction(oldWriter, { type: 'rate-game', record: game, score: 9 })).rejects.toMatchObject({
    name: 'PersonalLibraryWriterRetiredError',
  });
  const fresh = await openScopedLibrary(account);
  expect(scopedWriter(fresh).generation).toBe(1);
  await commitScopedAction(scopedWriter(fresh), { type: 'rate-game', record: game, score: 8 });
  await expect(deleteScopedLibrary(oldWriter)).rejects.toMatchObject({ name: 'PersonalLibraryWriterRetiredError' });
  closePersonalLibrary();
  expect((await loadScopedLibrary(account)).state.ranking[0]?.score).toBe(8);
});

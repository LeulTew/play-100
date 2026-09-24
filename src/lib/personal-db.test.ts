import { IDBFactory, IDBDatabase as FakeDatabase, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closePersonalLibrary, commitPersonalAction, DB_NAME, DB_VERSION, loadPersonalLibrary,
  readOnlineLoadHint, resetPersonalLibrary, restorePersonalLibrary, STATE_KEY, STORE_NAME, subscribePersonalLibrary,
} from './personal-db';
import { applyPersonalAction, emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from './personal-types';
import { STORAGE_KEY } from './storage';
import { motionHintKey } from './motion-hint';
import { STORAGE_DENIED_MESSAGE } from './storage-notices';

const a: LibraryRecord = {
  id: 'game-a', title: 'Game A', year: 2007, studio: null, genre: null,
  source: 'collection', sourceId: 'game-a', sourceUrl: null, collectionRank: 9,
};
const b: LibraryRecord = { ...a, id: 'game-b', title: 'Game B', sourceId: 'game-b', collectionRank: 2 };
const c: LibraryRecord = {
  ...a, id: 'steam:620', title: 'Portal 2', source: 'steam', sourceId: '620', collectionRank: null,
};
const canonical = [a, b];
const legacy = JSON.stringify({
  version: 1, motion: 'lite',
  progress: { [a.id]: { later: true, completed: true }, [b.id]: { later: true, completed: false } },
});
let storage: Storage;
const additionalClients: Array<{ closePersonalLibrary: () => void }> = [];

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => Array.from(values.keys())[index] ?? null,
  };
}

function openForTest(version = DB_VERSION): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function stored(write?: { value: unknown }): Promise<unknown> {
  const connection = await openForTest();
  return new Promise((resolve, reject) => {
    const tx = connection.transaction(STORE_NAME, write ? 'readwrite' : 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = write ? store.put(write.value, STATE_KEY) : store.get(STATE_KEY);
    let value: unknown;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => { connection.close(); resolve(value); };
    tx.onabort = () => { connection.close(); reject(tx.error); };
  });
}

async function secondClient(): Promise<typeof import('./personal-db')> {
  vi.resetModules();
  const client = await import('./personal-db');
  additionalClients.push(client);
  return client;
}

beforeEach(() => {
  closePersonalLibrary();
  storage = memoryStorage();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', undefined);
});

afterEach(() => {
  vi.useRealTimers();
  closePersonalLibrary();
  for (const client of additionalClients.splice(0)) client.closePersonalLibrary();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('atomic catalog ratings', () => {
  it('commits metadata and the personal rating together, then reads both after reopening', async () => {
    await loadPersonalLibrary(canonical);
    const state = await commitPersonalAction({ type: 'rate-game', record: c, score: 9.5 });
    expect(await stored()).toEqual(state);
    closePersonalLibrary();
    const reopened = await loadPersonalLibrary(canonical);
    expect(reopened.state.records[c.id]).toEqual(c);
    expect(reopened.state.ranking).toEqual([{ id: c.id, score: 9.5, note: '', manualPosition: null }]);
    expect(reopened.state.progress).toEqual({});
  });

  it('a failed catalog rating transaction writes neither a record nor a ranking', async () => {
    const before = (await loadPersonalLibrary(canonical)).state;
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await expect(commitPersonalAction({ type: 'rate-game', record: c, score: 8 })).rejects.toMatchObject({ name: 'PersonalLibraryQuotaError' });
    put.mockRestore();
    expect(await stored()).toEqual(before);
  });

  it('another tab can update progress while an external rating is imported without losing either', async () => {
    await loadPersonalLibrary(canonical);
    const peer = await secondClient();
    await Promise.all([
      commitPersonalAction({ type: 'rate-game', record: c, score: 8 }),
      peer.commitPersonalAction({ type: 'set-progress', records: [a], key: 'played', value: true }),
    ]);
    const state = parsePersonalLibrary(await stored());
    expect(state.records[c.id]).toEqual(c);
    expect(state.ranking[0]?.score).toBe(8);
    expect(state.progress[a.id]?.played).toBe(true);
  });
});

describe('atomic private library removal', () => {
  it('removes a game and all its private state in the committed snapshot, including after reopening', async () => {
    await loadPersonalLibrary(canonical);
    await commitPersonalAction({ type: 'set-progress', records: [a, c], key: 'later', value: true });
    await commitPersonalAction({ type: 'rate-game', record: c, score: 9 });
    const removed = await commitPersonalAction({ type: 'remove-records', ids: [c.id] });
    expect(await stored()).toEqual(removed);
    closePersonalLibrary();
    const reopened = (await loadPersonalLibrary(canonical)).state;
    expect(reopened.records[c.id]).toBeUndefined();
    expect(reopened.progress[c.id]).toBeUndefined();
    expect(reopened.ranking).toEqual([]);
    expect(reopened.queueOrder).toEqual([a.id]);
  });

  it('a failed removal retains metadata, ratings and progress without a partial deletion', async () => {
    await loadPersonalLibrary(canonical);
    await commitPersonalAction({ type: 'set-progress', records: [a, c], key: 'completed', value: true });
    const before = await commitPersonalAction({ type: 'rate-game', record: c, score: 8 });
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError');
    });
    await expect(commitPersonalAction({ type: 'remove-records', ids: [a.id, c.id] })).rejects.toMatchObject({ name: 'PersonalLibraryQuotaError' });
    put.mockRestore();
    expect(await stored()).toEqual(before);
  });

  it('does not discard another client addition while removing selected IDs', async () => {
    await loadPersonalLibrary(canonical);
    await commitPersonalAction({ type: 'set-progress', records: [a, b], key: 'later', value: true });
    const peer = await secondClient();
    await Promise.all([
      commitPersonalAction({ type: 'remove-records', ids: [a.id] }),
      peer.commitPersonalAction({ type: 'rate-game', record: c, score: 7 }),
    ]);
    const after = parsePersonalLibrary(await stored());
    expect(after.records[a.id]).toBeUndefined();
    expect(after.records[b.id]).toEqual(b);
    expect(after.records[c.id]).toEqual(c);
    expect(after.ranking[0]?.score).toBe(7);
    expect(after.queueOrder).toEqual([b.id]);
  });
});

describe('IndexedDB initialization and migration', () => {
  it('loads a 500-record v3 guest snapshot with one readonly get and no write or account-key read', async () => {
    const dense = emptyPersonalLibrary();
    dense.revision = 42;
    dense.motion = 'lite';
    for (let index = 0; index < 500; index += 1) {
      const id = `manual:dense-${index}`;
      dense.records[id] = { ...c, id, source: 'manual', sourceId: `dense-${index}`, title: `Game ${index}`, sourceUrl: null };
      dense.progress[id] = { later: index < 3, completed: index % 3 === 0, played: index % 3 === 0 };
      if (index < 3) dense.queueOrder.unshift(id);
      dense.ranking.push({ id, score: index % 11, note: `Private opinion ${index}`, manualPosition: index === 0 ? 1 : null });
    }
    const expected = parsePersonalLibrary(dense);
    await stored({ value: dense });
    const tx = vi.spyOn(FakeDatabase.prototype, 'transaction');
    const get = vi.spyOn(FakeObjectStore.prototype, 'get');
    const put = vi.spyOn(FakeObjectStore.prototype, 'put');
    const loaded = await loadPersonalLibrary([]);
    expect(loaded).toEqual({ state: expected, notice: null, migrated: false });
    expect(tx.mock.calls.map(call => call[1])).toEqual(['readonly']);
    expect(get.mock.calls.map(call => call[0])).toEqual([STATE_KEY]);
    expect(put).not.toHaveBeenCalled();
    tx.mockRestore(); get.mockRestore(); put.mockRestore();
    expect(await stored()).toEqual(dense);
    const firstRecord = loaded.state.records['manual:dense-0'];
    if (!firstRecord) throw new Error('The dense fixture must retain its first record.');
    firstRecord.title = 'Only the returned object';
    expect((await loadPersonalLibrary(canonical)).state).toEqual(expected);
  });

  it('rechecks the current key when simultaneous readers initialize the library', async () => {
    storage.setItem(STORAGE_KEY, legacy);
    const peer = await secondClient();
    const put = vi.spyOn(FakeObjectStore.prototype, 'put');
    const [first, second] = await Promise.all([loadPersonalLibrary(canonical), peer.loadPersonalLibrary(canonical)]);
    expect(first.state).toEqual(second.state);
    expect(first.state.queueOrder).toEqual([b.id, a.id]);
    expect(put.mock.calls.filter(call => call[1] === STATE_KEY)).toHaveLength(1);
    expect(await stored()).toEqual(first.state);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('upgrades a version-one database with version-two rankings without guessing prior drag intent', async () => {
    const connection = await openForTest(1);
    const old = {
      version: 2, revision: 8, records: { [a.id]: a, [b.id]: b },
      progress: { [a.id]: { later: true, completed: false, played: true } },
      queueOrder: [a.id], ranking: [
        { id: a.id, score: 1, note: 'Keep first' },
        { id: b.id, score: 9, note: '' },
      ], motion: 'lite',
    };
    await new Promise<void>((resolve, reject) => {
      const tx = connection.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(old, STATE_KEY);
      tx.oncomplete = () => { connection.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    });
    const loaded = await loadPersonalLibrary(canonical);
    expect(loaded.migrated).toBe(true);
    expect(loaded.state.version).toBe(3);
    expect(loaded.state.revision).toBe(9);
    expect(loaded.state.ranking.map((entry) => [entry.id, entry.manualPosition])).toEqual([[a.id, 1], [b.id, 2]]);
    expect(loaded.state.progress[a.id]?.played).toBe(true);
    expect(await stored()).toEqual(loaded.state);
    closePersonalLibrary();
    expect((await loadPersonalLibrary(canonical)).migrated).toBe(false);
    const automatic = await commitPersonalAction({ type: 'use-rating-order' });
    expect(automatic.ranking.map((entry) => entry.id)).toEqual([b.id, a.id]);
  });

  it('retains the complete old snapshot when a ranking-version migration cannot commit', async () => {
    const old = {
      ...emptyPersonalLibrary(), version: 2, revision: 5,
      records: { [a.id]: a }, ranking: [{ id: a.id, score: 7, note: 'Retain me' }],
    };
    await stored({ value: old });
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await expect(loadPersonalLibrary(canonical)).rejects.toMatchObject({ name: 'PersonalLibraryQuotaError' });
    put.mockRestore();
    expect(await stored()).toEqual(old);
  });

  it('uses only its declared database, store, and versioned state key', async () => {
    const result = await loadPersonalLibrary(canonical);
    expect([DB_NAME, DB_VERSION, STORE_NAME, STATE_KEY]).toEqual(['play100-personal', 2, 'library', 'state']);
    expect(result).toEqual({ state: emptyPersonalLibrary(), notice: null, migrated: false });
    expect(await stored()).toEqual(result.state);
    closePersonalLibrary();
    expect((await loadPersonalLibrary(canonical)).state).toEqual(result.state);
  });

  it('commits migration before removing the original localStorage key', async () => {
    storage.setItem(STORAGE_KEY, legacy);
    let savedWhenRemoved: unknown;
    const originalRemove = storage.removeItem;
    vi.spyOn(storage, 'removeItem').mockImplementation((key) => {
      savedWhenRemoved = stored();
      originalRemove(key);
    });
    const result = await loadPersonalLibrary(canonical);
    expect(result.migrated).toBe(true);
    expect(result.notice).toBeNull();
    expect(result.state.queueOrder).toEqual([b.id, a.id]);
    expect(result.state.ranking).toEqual([]);
    expect(result.state.progress[a.id]?.played).toBe(true);
    expect(await savedWhenRemoved).toEqual(result.state);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect((await loadPersonalLibrary(canonical)).migrated).toBe(false);
  });

  it.each(['not json', JSON.stringify({
    version: 1, motion: 'auto', progress: { unknown: { later: true, completed: false } },
  })])('preserves unreadable legacy data and never writes a partial migration', async (raw) => {
    storage.setItem(STORAGE_KEY, raw);
    await expect(loadPersonalLibrary(canonical)).rejects.toMatchObject({ name: 'PersonalLibraryMigrationError' });
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    expect(await stored()).toBeUndefined();
  });

  it('preserves legacy data if canonical metadata is not available yet', async () => {
    storage.setItem(STORAGE_KEY, legacy);
    await expect(loadPersonalLibrary([])).rejects.toThrow(/unknown game ID/);
    expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
    expect(await stored()).toBeUndefined();
    expect((await loadPersonalLibrary(canonical)).migrated).toBe(true);
  });

  it('returns a named recoverable error when legacy storage cannot be read', async () => {
    const get = vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    await expect(loadPersonalLibrary(canonical)).rejects.toMatchObject({
      name: 'PersonalLibraryMigrationError', message: expect.stringContaining('could not be accessed'),
    });
    expect(await stored()).toBeUndefined();
    get.mockRestore();
  });

  it('ignores legacy storage entirely once a valid IndexedDB state exists', async () => {
    await loadPersonalLibrary(canonical);
    const saved = await commitPersonalAction({ type: 'add-ranking', records: [c] });
    storage.setItem(STORAGE_KEY, 'not json');
    const originalGet = storage.getItem;
    const hintKey = motionHintKey('guest');
    const get = vi.spyOn(storage, 'getItem').mockImplementation(key => {
      if (key !== hintKey) throw new Error('Must not read unrelated storage');
      return originalGet(key);
    });
    expect((await loadPersonalLibrary([])).state).toEqual(saved);
    expect(get).not.toHaveBeenCalledWith(STORAGE_KEY);
    expect(get.mock.calls).toEqual([[hintKey]]);
  });

  it('keeps a visible warning and valid DB if legacy cleanup fails', async () => {
    storage.setItem(STORAGE_KEY, legacy);
    vi.spyOn(storage, 'removeItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    const result = await loadPersonalLibrary(canonical);
    expect(result.notice).toMatch(/could not be removed/);
    expect(result.migrated).toBe(true);
    expect(await stored()).toEqual(result.state);
    expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
    expect((await loadPersonalLibrary(canonical)).notice).toBe(result.notice);
  });

  it('retains a concurrently changed legacy copy rather than deleting it', async () => {
    storage.setItem(STORAGE_KEY, legacy);
    const originalGet = storage.getItem;
    let reads = 0;
    vi.spyOn(storage, 'getItem').mockImplementation((key) => {
      reads += 1;
      if (reads === 2) storage.setItem(STORAGE_KEY, 'newer legacy copy');
      return originalGet(key);
    });
    const result = await loadPersonalLibrary(canonical);
    expect(result.notice).toMatch(/changed during migration/);
    expect(storage.getItem(STORAGE_KEY)).toBe('newer legacy copy');
    expect(await stored()).toEqual(result.state);
  });

  it('rolls back an aborted migration and retains the old key', async () => {
    storage.setItem(STORAGE_KEY, legacy);
    const originalPut = FakeObjectStore.prototype.put;
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore, value: unknown, key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key);
      this.transaction.abort();
      return request;
    });
    await expect(loadPersonalLibrary(canonical)).rejects.toMatchObject({ name: 'PersonalLibraryStorageError' });
    put.mockRestore();
    expect(await stored()).toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
  });

  it('serializes simultaneous initialization across independent connections', async () => {
    storage.setItem(STORAGE_KEY, legacy);
    const other = await secondClient();
    const results = await Promise.all([loadPersonalLibrary(canonical), other.loadPersonalLibrary(canonical)]);
    expect(results[0]?.state).toEqual(results[1]?.state);
    expect(results.filter((result) => result.migrated)).toHaveLength(1);
    expect(await stored()).toEqual(results[0]?.state);
  });
});

describe('transactional actions and replacements', () => {
  it('refuses to commit before initialization can safely consider legacy data', async () => {
    storage.setItem(STORAGE_KEY, legacy);
    await expect(commitPersonalAction({ type: 'add-ranking', records: [c] })).rejects.toThrow(/Load your device library/);
    expect(await stored()).toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
  });

  it('resolves and notifies only after transaction completion', async () => {
    await loadPersonalLibrary(canonical);
    const originalPut = FakeObjectStore.prototype.put;
    let completed = false;
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore, value: unknown, key?: IDBValidKey,
    ) {
      this.transaction.addEventListener('complete', () => { completed = true; });
      return originalPut.call(this, value, key);
    });
    const listener = vi.fn(() => { expect(completed).toBe(true); });
    const unsubscribe = subscribePersonalLibrary(listener);
    const state = await commitPersonalAction({ type: 'set-progress', records: [a, b], key: 'completed', value: true });
    expect(completed).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    expect(state.revision).toBe(1);
    expect(await stored()).toEqual(state);
    unsubscribe();
    await commitPersonalAction({ type: 'set-motion', motion: 'full' });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('does not lose concurrent appends from separate tabs', async () => {
    await loadPersonalLibrary(canonical);
    const other = await secondClient();
    const records = Array.from({ length: 8 }, (_, index): LibraryRecord => ({
      ...c, id: `steam:${index + 1}`, sourceId: String(index + 1),
    }));
    const saved = await Promise.all(records.map((record, index) =>
      (index % 2 ? other.commitPersonalAction : commitPersonalAction)({
        type: 'set-progress', records: [record], key: 'later', value: true,
      })));
    const state = parsePersonalLibrary(await stored());
    expect(state.revision).toBe(8);
    expect(state.queueOrder).toHaveLength(8);
    expect(new Set(state.queueOrder)).toEqual(new Set(records.map((record) => record.id)));
    expect(new Set(saved.map((state) => state.revision)).size).toBe(8);
  });

  it.each(['queue', 'ranking'] as const)('preserves another tab append when applying a stale %s drag intent', async (list) => {
    await loadPersonalLibrary(canonical);
    await commitPersonalAction(list === 'queue'
      ? { type: 'set-progress', records: [a, b], key: 'later', value: true }
      : { type: 'add-ranking', records: [a, b] });
    const action: PersonalAction = { type: 'move-item', list, id: a.id, overId: b.id };
    const other = await secondClient();
    await other.commitPersonalAction(list === 'queue'
      ? { type: 'set-progress', records: [c], key: 'later', value: true }
      : { type: 'add-ranking', records: [c] });
    const state = await commitPersonalAction(action);
    expect(list === 'queue' ? state.queueOrder : state.ranking.map((item) => item.id)).toEqual([b.id, a.id, c.id]);
    expect(state.revision).toBe(3);
  });

  it('aborts an invalid action without saving or publishing', async () => {
    const before = (await loadPersonalLibrary(canonical)).state;
    const listener = vi.fn();
    subscribePersonalLibrary(listener);
    await expect(commitPersonalAction({ type: 'edit-ranking', id: a.id, score: NaN })).rejects.toThrow();
    expect(await stored()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('never reports success or publishes after an abort following put', async () => {
    const before = (await loadPersonalLibrary(canonical)).state;
    const listener = vi.fn();
    subscribePersonalLibrary(listener);
    const originalPut = FakeObjectStore.prototype.put;
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore, value: unknown, key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key);
      this.transaction.abort();
      return request;
    });
    await expect(commitPersonalAction({ type: 'add-ranking', records: [c] })).rejects.toThrow(/No pending changes were saved/);
    put.mockRestore();
    expect(await stored()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports quota failures clearly and preserves the previous snapshot', async () => {
    const before = (await loadPersonalLibrary(canonical)).state;
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await expect(commitPersonalAction({ type: 'add-ranking', records: [c] })).rejects.toMatchObject({
      name: 'PersonalLibraryQuotaError', message: expect.stringContaining('Device storage is full'),
    });
    put.mockRestore();
    expect(await stored()).toEqual(before);
  });

  it('validates a full restore before any write and increments the current revision, not the backup revision', async () => {
    await loadPersonalLibrary(canonical);
    const before = await commitPersonalAction({ type: 'add-ranking', records: [a] });
    const put = vi.spyOn(FakeObjectStore.prototype, 'put');
    const invalid: PersonalLibraryState = { ...before, ranking: [{ id: 'missing', score: null, note: '', manualPosition: null }] };
    await expect(restorePersonalLibrary(invalid)).rejects.toThrow(/missing game/);
    expect(put).not.toHaveBeenCalled();
    expect(await stored()).toEqual(before);
    const backup = { ...applyPersonalAction(emptyPersonalLibrary(), { type: 'add-ranking', records: [c] }), revision: 100 };
    const restored = await restorePersonalLibrary(backup);
    expect(restored.ranking.map((item) => item.id)).toEqual([c.id]);
    expect(restored.revision).toBe(2);
    expect(backup.revision).toBe(100);
    expect(await stored()).toEqual(restored);
  });

  it('rolls back a failed restore as a whole', async () => {
    await loadPersonalLibrary(canonical);
    const before = await commitPersonalAction({ type: 'add-ranking', records: [a] });
    const originalPut = FakeObjectStore.prototype.put;
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore, value: unknown, key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key);
      this.transaction.abort();
      return request;
    });
    await expect(restorePersonalLibrary(emptyPersonalLibrary())).rejects.toThrow();
    put.mockRestore();
    expect(await stored()).toEqual(before);
  });

  it('does not overwrite a corrupt stored snapshot merely by loading it', async () => {
    const corrupt = { version: 2, records: 'bad', revision: 7 };
    await stored({ value: corrupt });
    storage.setItem(STORAGE_KEY, legacy);
    await expect(loadPersonalLibrary(canonical)).rejects.toMatchObject({ name: 'PersonalLibraryValidationError' });
    expect(await stored()).toEqual(corrupt);
    expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
  });

  it('resets corrupt state without parsing it and removes only its own legacy key', async () => {
    await stored({ value: { version: 999, records: 'bad', revision: 7 } });
    storage.setItem(STORAGE_KEY, legacy);
    storage.setItem('unrelated-app', 'keep this');
    const result = await resetPersonalLibrary();
    expect(result.state).toEqual({ ...emptyPersonalLibrary(), revision: 8 });
    expect(result.notice).toBeNull();
    expect(result.migrated).toBe(false);
    expect(await stored()).toEqual(result.state);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.getItem('unrelated-app')).toBe('keep this');
  });

  it('reports reset cleanup failure while retaining a valid empty DB', async () => {
    await loadPersonalLibrary(canonical);
    await commitPersonalAction({ type: 'add-ranking', records: [c] });
    storage.setItem(STORAGE_KEY, legacy);
    vi.spyOn(storage, 'removeItem').mockImplementation(() => { throw new Error('Denied'); });
    const result = await resetPersonalLibrary();
    expect(result.state.records).toEqual({});
    expect(result.state.revision).toBe(2);
    expect(result.notice).toMatch(/could not be removed/);
    expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
    expect(await stored()).toEqual(result.state);
  });

  it('preserves both the DB and legacy key if reset cannot commit', async () => {
    const before = (await loadPersonalLibrary(canonical)).state;
    storage.setItem(STORAGE_KEY, legacy);
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota', 'QuotaExceededError');
    });
    await expect(resetPersonalLibrary()).rejects.toMatchObject({ name: 'PersonalLibraryQuotaError' });
    put.mockRestore();
    expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
    expect(await stored()).toEqual(before);
  });
});

describe('connection lifecycle and local notifications', () => {
  it.each(['SecurityError', 'NotAllowedError'])('reports the same %s denial for library and account hints without clearing legacy data', async name => {
    storage.setItem(STORAGE_KEY, legacy);
    const cause = new DOMException('Denied', name);
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw cause; });
    const results = await Promise.allSettled([loadPersonalLibrary(canonical), readOnlineLoadHint('demo-play100')]);
    for (const result of results) {
      expect(result).toMatchObject({
        status: 'rejected', reason: { name: 'PersonalLibraryStorageError', message: STORAGE_DENIED_MESSAGE, cause },
      });
    }
    expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
  });

  it('reports unavailable IndexedDB rather than silently falling back to memory', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(loadPersonalLibrary(canonical)).rejects.toThrow(/IndexedDB is unavailable/);
  });

  it('closes on versionchange and reports the incompatible version on the next access', async () => {
    await loadPersonalLibrary(canonical);
    const upgraded = await openForTest(DB_VERSION + 1);
    upgraded.close();
    await expect(loadPersonalLibrary(canonical)).rejects.toMatchObject({ name: 'PersonalLibraryVersionError' });
  });

  it('bounds a blocked open to five seconds instead of hanging indefinitely', async () => {
    const blocker = await openForTest();
    const deletion = indexedDB.deleteDatabase(DB_NAME);
    await new Promise<void>((resolve) => { deletion.onblocked = () => resolve(); });
    try {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const pending = loadPersonalLibrary(canonical);
      const assertion = expect(pending).rejects.toMatchObject({ name: 'PersonalLibraryBlockedError' });
      await vi.advanceTimersByTimeAsync(5_001);
      await assertion;
    } finally {
      vi.useRealTimers();
      const deleted = new Promise<void>((resolve, reject) => {
        deletion.onsuccess = () => resolve();
        deletion.onerror = () => reject(deletion.error);
      });
      closePersonalLibrary();
      blocker.close();
      await deleted;
    }
  });

  it('never opens a BroadcastChannel in Node and tolerates failing subscribers', async () => {
    const constructor = vi.fn();
    vi.stubGlobal('BroadcastChannel', constructor);
    await loadPersonalLibrary(canonical);
    subscribePersonalLibrary(() => { throw new Error('Subscriber failure'); });
    const state = await commitPersonalAction({ type: 'set-motion', motion: 'lite' });
    expect(state.motion).toBe('lite');
    expect(constructor).not.toHaveBeenCalled();
  });

  it('publishes only change signals, consumes remote signals, and closes the browser channel', async () => {
    vi.stubGlobal('window', {});
    const channel: {
      onmessage: ((event: MessageEvent<unknown>) => void) | null;
      postMessage: (value: unknown) => void;
      close: () => void;
    } = { onmessage: null, postMessage: vi.fn(), close: vi.fn() };
    vi.stubGlobal('BroadcastChannel', vi.fn(function () { return channel; }));
    await loadPersonalLibrary(canonical);
    const listener = vi.fn();
    subscribePersonalLibrary(listener);
    await commitPersonalAction({ type: 'add-ranking', records: [c] });
    expect(channel.postMessage).toHaveBeenLastCalledWith({ type: 'library-changed' });
    expect(listener).toHaveBeenCalledOnce();
    channel.onmessage?.(new MessageEvent('message', { data: { type: 'unrelated' } }));
    expect(listener).toHaveBeenCalledOnce();
    channel.onmessage?.(new MessageEvent('message', { data: { type: 'library-changed' } }));
    expect(listener).toHaveBeenCalledTimes(2);
    closePersonalLibrary();
    expect(channel.close).toHaveBeenCalledOnce();
  });
});

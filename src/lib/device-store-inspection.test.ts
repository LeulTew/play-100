import { IDBFactory, IDBDatabase, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredValue, writeStoredValue } from '../../tests/fixtures/device-store-inspection';
import { DB_NAME, DB_VERSION, STORE_NAME } from './personal-db';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function createStore(store = true) {
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      if (store) open.result.createObjectStore(STORE_NAME);
    };
    open.onsuccess = () => {
      open.result.close();
      resolve();
    };
    open.onerror = () => reject(open.error ?? new Error('IndexedDB operation failed'));
  });
}

describe('device store inspection fixture', () => {
  it('resolves empty without creating a database on a fresh origin', async () => {
    expect(await readStoredValue('missing')).toBeUndefined();
    expect(await indexedDB.databases()).toEqual([]);
    expect(await readStoredValue('missing')).toBeUndefined();
    expect(await indexedDB.databases()).toEqual([]);
  });

  it('refuses a fixture write to an absent database instead of claiming a save', async () => {
    await expect(writeStoredValue('key', { value: 1 })).rejects.toThrow(/does not exist/);
    expect(await indexedDB.databases()).toEqual([]);
  });

  it('settles safely when an existing database has no library store', async () => {
    await createStore(false);
    expect(await readStoredValue('key')).toBeUndefined();
    await expect(writeStoredValue('key', 1)).rejects.toThrow(/does not exist/);
    expect(await indexedDB.databases()).toEqual([{ name: DB_NAME, version: DB_VERSION }]);
  });

  it('reads and writes raw fixture data without upgrading the existing database', async () => {
    await createStore();
    const stored = { broken: 'intentional unreadable cache', nested: { count: 1 } };
    await writeStoredValue('account:test', stored);
    expect(await readStoredValue('account:test')).toEqual(stored);
    expect(await readStoredValue('missing')).toBeUndefined();
    expect(await indexedDB.databases()).toEqual([{ name: DB_NAME, version: DB_VERSION }]);
  });

  it('rejects a synchronous transaction failure rather than leaving the promise pending', async () => {
    await createStore();
    const failure = new DOMException('Database closed', 'InvalidStateError');
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw failure;
    });
    await expect(readStoredValue('key')).rejects.toBe(failure);
  });

  it('aborts and rejects a synchronous fixture write failure', async () => {
    await createStore();
    const failure = new DOMException('Storage full', 'QuotaExceededError');
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw failure;
    });
    await expect(writeStoredValue('key', 'value')).rejects.toBe(failure);
    put.mockRestore();
    expect(await readStoredValue('key')).toBeUndefined();
  });

  it('rejects a denied open explicitly', async () => {
    const failure = new DOMException('Denied', 'SecurityError');
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw failure;
    });
    await expect(readStoredValue('key')).rejects.toBe(failure);
  });
});

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closePersonalLibrary,
  commitPersonalAction,
  DB_NAME,
  DB_VERSION,
  loadPersonalLibrary,
  STATE_KEY,
  STORE_NAME,
} from './personal-db';
import { applyPersonalAction, parsePersonalLibrary } from './personal-library';
import type { LibraryRecord } from './personal-types';

// Count the exported boundaries while keeping their real behaviour. The reducer's own parse is internal, so
// an exported parsePersonalLibrary call during a commit would be a second, redundant validation pass.
vi.mock('./personal-library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./personal-library')>();
  return {
    ...actual,
    parsePersonalLibrary: vi.fn(actual.parsePersonalLibrary),
    applyPersonalAction: vi.fn(actual.applyPersonalAction),
  };
});

const record: LibraryRecord = {
  id: 'game-a',
  title: 'Game A',
  year: 2007,
  studio: null,
  genre: null,
  source: 'collection',
  sourceId: 'game-a',
  sourceUrl: null,
  collectionRank: 9,
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
    key: (index) => Array.from(values.keys())[index] ?? null,
  };
}

async function stored(write?: { value: unknown }): Promise<unknown> {
  const connection = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise((resolve, reject) => {
    const tx = connection.transaction(STORE_NAME, write ? 'readwrite' : 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = write ? store.put(write.value, STATE_KEY) : store.get(STATE_KEY);
    let value: unknown;
    request.onsuccess = () => {
      value = request.result;
    };
    tx.oncomplete = () => {
      connection.close();
      resolve(value);
    };
    tx.onabort = () => {
      connection.close();
      reject(tx.error);
    };
  });
}

beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('window', undefined);
});

afterEach(() => {
  closePersonalLibrary();
  vi.unstubAllGlobals();
});

describe('commit validation boundary', () => {
  it('parses the stored library once per commit, inside the reducer', async () => {
    await loadPersonalLibrary([record]);
    const before = await stored();
    vi.mocked(parsePersonalLibrary).mockClear();
    vi.mocked(applyPersonalAction).mockClear();
    const state = await commitPersonalAction({ type: 'set-progress', records: [record], key: 'later', value: true });
    expect(parsePersonalLibrary).not.toHaveBeenCalled();
    expect(applyPersonalAction).toHaveBeenCalledTimes(1);
    // The reducer receives the raw stored value, not a pre-parsed copy.
    expect(vi.mocked(applyPersonalAction).mock.calls[0]?.[0]).toEqual(before);
    expect(state.queueOrder).toEqual([record.id]);
    expect(await stored()).toEqual(state);
  });

  it('still rejects a corrupted stored library and writes nothing', async () => {
    await loadPersonalLibrary([record]);
    const corrupted = { ...((await stored()) as object), records: 'not a record map' };
    await stored({ value: corrupted });
    await expect(
      commitPersonalAction({ type: 'set-progress', records: [record], key: 'later', value: true }),
    ).rejects.toMatchObject({ name: 'PersonalLibraryValidationError' });
    expect(await stored()).toEqual(corrupted);
  });
});

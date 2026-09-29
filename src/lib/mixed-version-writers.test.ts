import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as release6 from './fixtures/release6-129e73e/scoped-library';
import * as oldDatabase from './fixtures/release6-129e73e/personal-db';
import {
  accountStorageTransaction,
  accountWriterKey,
  closePersonalLibrary,
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
} from './personal-db';
import {
  commitScopedAction,
  deleteScopedLibrary,
  loadScopedLibrary,
  openScopedLibrary,
  scopedWriter,
} from './scoped-library';
import { accountScope } from './cloud-types';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';
import { discoveryFixture } from './discovery-test-fixtures';
import { motionHintKey } from './motion-hint';
import { compareTrayStorageKey } from './compare-tray';
import { signOutTransition } from '../cloud/sign-out-transition';

const scope = accountScope('mixed-version', 'demo-play100');
const otherScope = accountScope('other-version', 'demo-play100');
const game = discoveryFixture.record;
const savedState = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 6 });
const operations = [
  ['save', () => release6.commitScopedAction(scope, { type: 'rate-game', record: game, score: 9 })],
  ['restore', () => release6.restoreScopedLibrary(scope, savedState)],
  ['unconditional delete', () => release6.deleteScopedLibrary(scope)],
  ['checked delete', () => release6.deleteScopedLibrary(scope, 0)],
] as const;
let storage: Map<string, string>;
beforeEach(() => {
  closePersonalLibrary();
  oldDatabase.closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', undefined);
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  });
});
afterEach(() => {
  closePersonalLibrary();
  oldDatabase.closePersonalLibrary();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Release 6 compatibility fixture controls', () => {
  it('recreates a missing scope despite a retirement marker when the database is still v2', async () => {
    await release6.loadScopedLibrary(scope);
    await oldDatabase.accountStorageTransaction(scope, (_value, store) => {
      store.put({ version: 1, generation: 1, retired: true }, accountWriterKey(scope));
      store.delete(scope);
    });
    const saved = await release6.commitScopedAction(scope, { type: 'rate-game', record: game, score: 9 });
    expect(saved.state.ranking[0]?.score).toBe(9);
    expect(saved.writerGeneration).toBeUndefined();
  });

  it('refuses save and restore on an unreadable sentinel, but its unconditional delete removes it', async () => {
    const sentinel = { retired: true };
    await oldDatabase.accountStorageTransaction(scope, (_value, store) => store.put(sentinel, scope));
    await expect(release6.commitScopedAction(scope, { type: 'rate-game', record: game, score: 9 })).rejects.toThrow();
    await expect(release6.restoreScopedLibrary(scope, savedState)).rejects.toThrow();
    expect(await oldDatabase.accountStorageTransaction(scope, (value) => value)).toEqual(sentinel);
    await release6.deleteScopedLibrary(scope);
    expect(await oldDatabase.accountStorageTransaction(scope, (value) => value)).toBeUndefined();
    expect(
      (await release6.commitScopedAction(scope, { type: 'rate-game', record: game, score: 9 })).state.ranking,
    ).toHaveLength(1);
  });
});

describe('v3 database writer barrier', () => {
  it.each(operations)(
    'blocks the real v2 %s after retirement and preserves a freshly opened generation',
    async (_, attempt) => {
      const old = await release6.loadScopedLibrary(scope);
      const other = await release6.commitScopedAction(otherScope, { type: 'rate-game', record: game, score: 4 });
      const versionChange = vi.fn();
      oldDatabase.subscribePersonalLibrary(versionChange, scope);
      const current = await openScopedLibrary(scope);
      expect(DB_VERSION).toBe(3);
      expect(oldDatabase.DB_VERSION).toBe(2);
      expect(versionChange).toHaveBeenCalledOnce();
      expect(current.state).toEqual(old.state);
      const writer = scopedWriter(current);
      storage.set(compareTrayStorageKey(scope), 'synthetic pins');
      expect(await deleteScopedLibrary(writer, current.state.revision)).toEqual({ complete: true });
      await expect(attempt()).rejects.toMatchObject({
        name: 'PersonalLibraryVersionError',
        cause: { name: 'VersionError' },
      });
      expect(await accountStorageTransaction(scope, (value) => value)).toBeUndefined();
      expect(storage.has(motionHintKey(scope))).toBe(false);
      expect(storage.has(compareTrayStorageKey(scope))).toBe(false);
      const reopened = await openScopedLibrary(scope);
      const next = await commitScopedAction(scopedWriter(reopened), { type: 'rate-game', record: game, score: 3 });
      const keysBefore = new Map(storage);
      await expect(attempt()).rejects.toMatchObject({ name: 'PersonalLibraryVersionError' });
      expect(await loadScopedLibrary(scopedWriter(next))).toEqual(next);
      expect(storage).toEqual(keysBefore);
      expect((await loadScopedLibrary(otherScope)).state).toEqual(other.state);
    },
  );

  it('upgrades in place without rewriting guest, account, recovery or unrelated store keys', async () => {
    const old = await release6.commitScopedAction(scope, { type: 'rate-game', record: game, score: 6 });
    const restored = await release6.restoreScopedLibrary(scope, old.state);
    await oldDatabase.accountStorageTransaction(scope, (_value, store) => {
      store.put(savedState, 'state');
      store.put({ selected: ['synthetic'] }, 'synthetic-extra');
    });
    expect(await accountStorageTransaction(scope, (value) => value)).toEqual(restored);
    const db = await rawConnection(DB_VERSION);
    try {
      expect(await rawRead(db, 'state')).toEqual(savedState);
      expect(await rawRead(db, 'synthetic-extra')).toEqual({ selected: ['synthetic'] });
    } finally {
      db.close();
    }
  });

  it.each(['release6', 'current'] as const)(
    'ordinary sign-out retains an unremoved %s account draft',
    async (client) => {
      const opened = client === 'release6' ? await release6.loadScopedLibrary(scope) : await openScopedLibrary(scope);
      const read = () =>
        client === 'release6' ? release6.loadScopedLibrary(scope) : loadScopedLibrary(scopedWriter(opened));
      const save = () =>
        client === 'release6'
          ? release6.commitScopedAction(scope, { type: 'rate-game', record: game, score: 8 })
          : commitScopedAction(scopedWriter(opened), { type: 'rate-game', record: game, score: 8 });
      const remove = vi.fn(() => deleteScopedLibrary(scopedWriter(opened)));
      expect(
        await signOutTransition(false, {
          current: () => true,
          waitForWrites: () => Promise.resolve(),
          readDeviceCopy: read,
          suspend: () => [],
          signOut: () => Promise.resolve(),
          removeDeviceCopy: remove,
        }),
      ).toEqual({ complete: true });
      expect((await save()).state.ranking[0]?.score).toBe(8);
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('reports a blocked upgrade without deleting data, aborts the abandoned upgrade, then retries', async () => {
    const old = await release6.commitScopedAction(scope, { type: 'rate-game', record: game, score: 6 });
    const blocker = await rawConnection(2);
    let changes = 0;
    blocker.onversionchange = () => {
      changes += 1;
    };
    try {
      await expect(openScopedLibrary(scope)).rejects.toMatchObject({
        name: 'PersonalLibraryBlockedError',
        message:
          'Close other Play 100 tabs to finish updating this device library, then retry. Your saved data has not been changed.',
      });
      expect(changes).toBe(1);
      expect(await rawRead(blocker, scope)).toEqual(old);
      expect(blocker.version).toBe(2);
    } finally {
      blocker.close();
    }
    // Queued after the rejected upgrade; its onupgradeneeded handler must abort, not migrate silently.
    const unchanged = await rawConnection(2);
    expect(unchanged.version).toBe(2);
    unchanged.close();
    const reopened = await openScopedLibrary(scope);
    expect(reopened.state).toEqual(old.state);
    expect(
      (await commitScopedAction(scopedWriter(reopened), { type: 'set-motion', motion: 'lite' })).state.motion,
    ).toBe('lite');
  });

  it('does not replace an unreadable account during an otherwise successful upgrade', async () => {
    const corrupt = { broken: 'synthetic old envelope' };
    await oldDatabase.accountStorageTransaction(scope, (_value, store) => store.put(corrupt, scope));
    await expect(openScopedLibrary(scope)).rejects.toThrow();
    expect(await accountStorageTransaction(scope, (value) => value)).toEqual(corrupt);
    await expect(release6.deleteScopedLibrary(scope)).rejects.toMatchObject({ name: 'PersonalLibraryVersionError' });
    expect(await accountStorageTransaction(scope, (value) => value)).toEqual(corrupt);
  });
});

function rawConnection(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
  });
}

function rawRead(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB operation failed'));
  });
}

import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import type { ScopedLibrary, SyncHead } from './cloud-types';
import { accountStorageTransaction, accountWriterKey, closePersonalLibrary, loadPersonalLibrary } from './personal-db';
import {
  acknowledgeScopedUpload, adoptScopedRemote, cacheScopedProfile, commitScopedAction, connectScopedLibrary,
  deleteScopedLibrary, loadScopedLibrary, openScopedLibrary, pauseScopedLibrary, rebaseScopedLibrary,
  restoreConsentedAccount, restoreScopedLibrary, scopedWriter,
} from './scoped-library';
import type { AccountWriter } from './scoped-library';
import { emptyPersonalLibrary } from './personal-library';
import { discoveryFixture } from './discovery-test-fixtures';
import { compareTrayStorageKey } from './compare-tray';
import { motionHintKey } from './motion-hint';
import { signOutTransition } from '../cloud/sign-out-transition';

const scope = accountScope('retired-writer');
const other = accountScope('other-writer');
const game = discoveryFixture.record;
const head: SyncHead = {
  format: 1, enabled: true, deleted: false, epoch: 1, revision: 1,
  current: { format: 1, generation: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', digest: 'a'.repeat(64), bytes: 1, chunks: ['one'] },
  previous: null, updatedAt: 1,
};
const member = {
  uid: 'retired-writer', displayName: 'Synthetic player',
  avatar: { version: 1 as const, seed: 'a'.repeat(32), palette: 'clay' as const },
  consentVersion: 1 as const, createdAt: 1, updatedAt: 1, gameCount: 0, rankCount: 0,
};
let storage: Map<string, string>;
beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', undefined);
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => {
  closePersonalLibrary();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mutations: [string, (writer: AccountWriter) => Promise<ScopedLibrary>][] = [
  ['direct rating', (writer) => commitScopedAction(writer, { type: 'rate-game', record: game, score: 9 })],
  ['restore', (writer) => restoreScopedLibrary(writer, emptyPersonalLibrary())],
  ['connect', (writer) => connectScopedLibrary(writer, emptyPersonalLibrary(), head, 'Player', false,
    { localRevision: 0, epoch: 0, enabled: false })],
  ['automatic restore', (writer) => restoreConsentedAccount(writer, emptyPersonalLibrary(), head, member, () => true)],
  ['upload acknowledgment', (writer) => acknowledgeScopedUpload(writer, 0, head)],
  ['remote adoption', (writer) => adoptScopedRemote(writer, emptyPersonalLibrary(), head, 0)],
  ['pause', (writer) => pauseScopedLibrary(writer)],
  ['rebase', (writer) => rebaseScopedLibrary(writer, head, 0)],
  ['profile cache', (writer) => cacheScopedProfile(writer, member)],
];

describe('account device-copy writer retirement', () => {
  it.each(mutations)('refuses an old %s writer after removal and after an explicit reopen', async (_, mutate) => {
    const opened = await openScopedLibrary(scope);
    const writer = scopedWriter(opened);
    storage.set(compareTrayStorageKey(scope), 'private pins');
    expect(await deleteScopedLibrary(writer, opened.state.revision)).toEqual({ complete: true });
    const put = vi.spyOn(FakeObjectStore.prototype, 'put');
    await expect(mutate(writer)).rejects.toMatchObject({ name: 'PersonalLibraryWriterRetiredError' });
    await expect(loadScopedLibrary(writer)).rejects.toMatchObject({ name: 'PersonalLibraryWriterRetiredError' });
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
    expect(await accountStorageTransaction(scope, (value) => value)).toBeUndefined();
    expect(storage.has(motionHintKey(scope))).toBe(false);
    expect(storage.has(compareTrayStorageKey(scope))).toBe(false);
    const fresh = await openScopedLibrary(scope);
    expect(fresh.writerGeneration).toBe(writer.generation + 1);
    await expect(mutate(writer)).rejects.toMatchObject({ name: 'PersonalLibraryWriterRetiredError' });
    await expect(commitScopedAction(scope, { type: 'rate-game', record: game, score: 9 }))
      .rejects.toMatchObject({ name: 'PersonalLibraryWriterRetiredError' });
    expect(await loadScopedLibrary(scopedWriter(fresh))).toEqual(fresh);
    const saved = await commitScopedAction(scopedWriter(fresh), { type: 'rate-game', record: game, score: 4 });
    expect(saved.state.ranking[0]?.score).toBe(4);
  });

  it('retains ordinary sign-out drafts in their account without modifying the guest', async () => {
    const guest = await loadPersonalLibrary([]);
    const opened = await openScopedLibrary(scope);
    const writer = scopedWriter(opened);
    const heldSave = () => commitScopedAction(writer, { type: 'rate-game', record: game, score: 8 });
    const remove = vi.fn(() => deleteScopedLibrary(writer));
    await signOutTransition(false, {
      current: () => true, waitForWrites: () => Promise.resolve(), readDeviceCopy: () => loadScopedLibrary(writer),
      suspend: () => [], signOut: () => Promise.resolve(), removeDeviceCopy: remove,
    });
    const saved = await heldSave();
    expect(remove).not.toHaveBeenCalled();
    expect(saved.state.ranking[0]?.score).toBe(8);
    expect(saved.writerGeneration).toBe(opened.writerGeneration);
    expect((await loadPersonalLibrary([])).state).toEqual(guest.state);
  });

  it('does not let a retired deletion remove a newly opened copy with a reused revision', async () => {
    const opened = await openScopedLibrary(scope);
    const oldWriter = scopedWriter(opened);
    await deleteScopedLibrary(oldWriter, opened.state.revision);
    const fresh = await openScopedLibrary(scope);
    expect(fresh.state.revision).toBe(opened.state.revision);
    await expect(deleteScopedLibrary(oldWriter, fresh.state.revision))
      .rejects.toMatchObject({ name: 'PersonalLibraryWriterRetiredError' });
    expect(await loadScopedLibrary(scopedWriter(fresh))).toEqual(fresh);
  });

  it('rolls the tombstone back with a failed removal and keeps that writer usable', async () => {
    const opened = await openScopedLibrary(scope);
    const writer = scopedWriter(opened);
    const remove = vi.spyOn(FakeObjectStore.prototype, 'delete').mockImplementation(() => {
      throw new DOMException('Synthetic removal refusal', 'QuotaExceededError');
    });
    await expect(deleteScopedLibrary(writer)).rejects.toThrow();
    remove.mockRestore();
    expect(await loadScopedLibrary(writer)).toEqual(opened);
    const status = await accountStorageTransaction(scope, (_value, _store, marker) => marker);
    expect(status).toEqual({ version: 1, generation: writer.generation, retired: false });
    expect((await commitScopedAction(writer, { type: 'set-motion', motion: 'lite' })).state.motion).toBe('lite');
  });

  it('never retires the writer when dirty/revision checks refuse removal', async () => {
    const opened = await openScopedLibrary(scope);
    const writer = scopedWriter(opened);
    const saved = await commitScopedAction(writer, { type: 'rate-game', record: game, score: 7 });
    await expect(deleteScopedLibrary(writer, saved.state.revision)).rejects.toThrow(/kept/);
    expect(await loadScopedLibrary(writer)).toEqual(saved);
    expect((await commitScopedAction(writer, { type: 'set-motion', motion: 'lite' })).state.motion).toBe('lite');
  });

  it('retirement survives database reconnects and does not affect other accounts', async () => {
    const opened = await openScopedLibrary(scope);
    const another = await openScopedLibrary(other);
    await deleteScopedLibrary(scopedWriter(opened));
    closePersonalLibrary();
    await expect(loadScopedLibrary(scope)).rejects.toMatchObject({ name: 'PersonalLibraryWriterRetiredError' });
    await expect(openScopedLibrary(scope, 'auto', () => false)).rejects.toThrow();
    expect(await accountStorageTransaction(scope, (value) => value)).toBeUndefined();
    expect(await loadScopedLibrary(scopedWriter(another))).toEqual(another);
  });

  it('rejects a corrupt writer marker rather than silently resetting its generation', async () => {
    const opened = await openScopedLibrary(scope);
    await accountStorageTransaction(scope, (_value, store) => {
      store.put({ version: 1, generation: -1, retired: false }, accountWriterKey(scope));
    });
    await expect(commitScopedAction(scopedWriter(opened), { type: 'set-motion', motion: 'lite' })).rejects.toThrow(/marker/);
    await expect(openScopedLibrary(scope)).rejects.toThrow(/marker/);
    expect(await accountStorageTransaction(scope, (value) => value)).toEqual(opened);
  });
});

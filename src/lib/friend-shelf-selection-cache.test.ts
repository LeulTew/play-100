import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import type { SyncHead } from './cloud-types';
import { accountStorageTransaction, closePersonalLibrary, friendShelfSelectionStorageTransaction } from './personal-db';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';
import {
  acknowledgeScopedUpload,
  commitScopedAction,
  connectScopedLibrary,
  deleteScopedLibrary,
  loadScopedLibrary,
  parseScopedLibrary,
  restoreScopedLibrary,
} from './scoped-library';
import { friendShelfJournal } from './friend-shelf-selection-cache';
import { friendShelfSelectionKey } from './friend-shelf-selection';
import { pendingFriendRemovals, updateFriendSelectionCache } from './friend-selection-cache';
import type { LibraryRecord, PersonalAction } from './personal-types';

const a = accountScope('shelf-a');
const b = accountScope('shelf-b');
const game: LibraryRecord = {
  id: 'manual:shelf-game',
  source: 'manual',
  sourceId: 'shelf-game',
  sourceUrl: null,
  title: 'Synthetic unranked game',
  year: null,
  studio: null,
  genre: null,
  collectionRank: null,
};
beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => undefined });
});
afterEach(() => {
  closePersonalLibrary();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('atomic independently selected library sharing', () => {
  it.each([true, false])(
    'requires explicit review when removal precedes first remote config (online=%s)',
    async (online) => {
      vi.stubGlobal('navigator', { onLine: online });
      const saved = await commitScopedAction(a, { type: 'add-records', records: [game] });
      const head: SyncHead = {
        format: 1,
        epoch: 1,
        revision: 1,
        enabled: true,
        deleted: false,
        current: null,
        previous: null,
        updatedAt: 1,
      };
      const initial = await connectScopedLibrary(a, saved.state, head, 'Synthetic player', true, {
        localRevision: saved.state.revision,
        epoch: 0,
        enabled: false,
      });
      const removed = await commitScopedAction(a, { type: 'remove-records', ids: [game.id] });
      const readded = await commitScopedAction(a, { type: 'add-records', records: [game] });
      const acknowledged = await acknowledgeScopedUpload(a, readded.sync.dataRevision, { ...head, revision: 2 });
      expect(acknowledged.sync.dirty).toBe(false);
      expect(readded.state.records[game.id]).toEqual(game);
      await expect(friendShelfJournal.update(a, 5, [game.id], undefined, readded.state.revision)).rejects.toThrow(
        /review/,
      );
      await expect(friendShelfJournal.pending(a, readded.state.revision)).rejects.toThrow(/review/);
      await expect(
        friendShelfJournal.update(a, 6, [game.id], initial.state.revision, readded.state.revision),
      ).rejects.toThrow(/review/);
      expect((await loadScopedLibrary(a)).state.records[game.id]).toEqual(game);
      const other = await commitScopedAction(b, { type: 'add-records', records: [game] });
      await friendShelfJournal.update(b, 1, [game.id], undefined, other.state.revision);
      expect((await friendShelfJournal.pending(b, other.state.revision)).size).toBe(0);
      await friendShelfJournal.update(a, 7, [game.id], removed.state.revision, readded.state.revision);
      expect((await friendShelfJournal.pending(a, readded.state.revision)).size).toBe(0);
    },
  );
  it('journals a saved unranked removal/re-add without creating a score, rank or progress', async () => {
    const before = await commitScopedAction(a, { type: 'add-records', records: [game] });
    await friendShelfJournal.update(a, 1, [game.id], undefined, before.state.revision);
    await commitScopedAction(a, { type: 'remove-records', ids: [game.id] });
    const restored = await commitScopedAction(a, { type: 'add-records', records: [game] });
    expect(restored.state.ranking).toEqual([]);
    expect(restored.state.queueOrder).toEqual([]);
    expect(restored.state.progress).toEqual({});
    expect([...(await friendShelfJournal.pending(a, restored.state.revision))]).toEqual([game.id]);
    closePersonalLibrary();
    expect((await friendShelfJournal.pending(a, restored.state.revision)).has(game.id)).toBe(true);
  });
  it('removing only a ranking suppresses ranked sharing but leaves library-shelf selection intact', async () => {
    const before = await commitScopedAction(a, { type: 'rate-game', record: game, score: 7 });
    await friendShelfJournal.update(a, 1, [game.id], undefined, before.state.revision);
    await updateFriendSelectionCache(a, 1, [game.id], undefined, before.state.revision);
    const removed = await commitScopedAction(a, { type: 'remove-ranking', ids: [game.id] });
    expect(removed.state.records[game.id]).toEqual(game);
    expect((await pendingFriendRemovals(a, removed.state.revision)).has(game.id)).toBe(true);
    expect((await friendShelfJournal.pending(a, removed.state.revision)).size).toBe(0);
  });
  it('advances the observation marker for unrelated state changes without clearing sticky removals', async () => {
    const before = await commitScopedAction(a, { type: 'add-records', records: [game] });
    await friendShelfJournal.update(a, 1, [game.id], undefined, before.state.revision);
    const changed = await commitScopedAction(a, { type: 'set-motion', motion: 'lite' });
    expect((await friendShelfJournal.pending(a, changed.state.revision)).size).toBe(0);
    await commitScopedAction(a, { type: 'remove-records', ids: [game.id] });
    const latest = await commitScopedAction(a, { type: 'set-motion', motion: 'auto' });
    expect((await friendShelfJournal.pending(a, latest.state.revision)).has(game.id)).toBe(true);
  });
  it('metadata-only upload ACK leaves the state-revision journal valid and unchanged', async () => {
    const initial = await loadScopedLibrary(a);
    const state = applyPersonalAction(initial.state, { type: 'add-records', records: [game] });
    const head: SyncHead = {
      format: 1,
      epoch: 1,
      revision: 1,
      enabled: true,
      deleted: false,
      current: null,
      previous: null,
      updatedAt: 1,
    };
    const connected = await connectScopedLibrary(a, state, head, 'Synthetic player', false, {
      localRevision: initial.state.revision,
      epoch: 0,
      enabled: false,
    });
    await friendShelfJournal.update(a, 1, [game.id], undefined, connected.state.revision);
    const prior = await friendShelfSelectionStorageTransaction(a, (value) => value);
    const acknowledged = await acknowledgeScopedUpload(a, connected.sync.dataRevision, { ...head, revision: 2 });
    expect(acknowledged.state.revision).toBe(connected.state.revision);
    expect(await friendShelfSelectionStorageTransaction(a, (value) => value)).toEqual(prior);
    expect((await friendShelfJournal.pending(a, acknowledged.state.revision)).size).toBe(0);
  });
  it('a failed account transaction rolls back both private content and its selection journal', async () => {
    const initial = await commitScopedAction(a, { type: 'add-records', records: [game] });
    await friendShelfJournal.update(a, 1, [game.id], undefined, initial.state.revision);
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Synthetic storage full', 'QuotaExceededError');
    });
    await expect(commitScopedAction(a, { type: 'remove-records', ids: [game.id] })).rejects.toThrow();
    put.mockRestore();
    expect((await loadScopedLibrary(a)).state).toEqual(initial.state);
    expect((await friendShelfJournal.pending(a, initial.state.revision)).size).toBe(0);
  });
  it('corrupt optional shelf state blocks only shelf updates and can be repaired by explicit review', async () => {
    await commitScopedAction(a, { type: 'add-records', records: [game] });
    await friendShelfSelectionStorageTransaction(a, (_, store) =>
      store.put({ invalid: true }, friendShelfSelectionKey(a)),
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const changed = await commitScopedAction(a, { type: 'remove-records', ids: [game.id] });
    expect(changed.state.records).toEqual({});
    await expect(friendShelfJournal.pending(a, changed.state.revision)).rejects.toThrow(/review/);
    expect(logged).toHaveBeenCalled();
    await friendShelfJournal.update(a, 2, [], changed.state.revision);
    expect((await friendShelfJournal.pending(a, changed.state.revision)).size).toBe(0);
  });
  it('requires explicit review after an old writer skipped removal journaling even when the game was re-added', async () => {
    const before = await commitScopedAction(a, { type: 'add-records', records: [game] });
    await friendShelfJournal.update(a, 1, [game.id], undefined, before.state.revision);
    const actions: PersonalAction[] = [
      { type: 'remove-records', ids: [game.id] },
      { type: 'add-records', records: [game] },
    ];
    for (const action of actions)
      await accountStorageTransaction(a, (value, store) => {
        const current = parseScopedLibrary(value, a);
        store.put(
          {
            ...current,
            state: applyPersonalAction(current.state, action),
            sync: { ...current.sync, dirty: true, dataRevision: current.sync.dataRevision + 1 },
          },
          a,
        );
      });
    const current = await commitScopedAction(a, { type: 'set-motion', motion: 'lite' });
    expect(current.state.records[game.id]).toEqual(game);
    await expect(friendShelfJournal.pending(a, current.state.revision)).rejects.toThrow(/older tab/);
    await friendShelfJournal.update(a, 2, [game.id], current.state.revision);
    expect((await friendShelfJournal.pending(a, current.state.revision)).size).toBe(0);
  });
  it('preserves newer removal stamps when an earlier explicit preview finally commits', async () => {
    const before = await commitScopedAction(a, { type: 'add-records', records: [game] });
    await friendShelfJournal.update(a, 1, [game.id], undefined, before.state.revision);
    await commitScopedAction(a, { type: 'remove-records', ids: [game.id] });
    const current = await commitScopedAction(a, { type: 'add-records', records: [game] });
    await friendShelfJournal.update(a, 2, [game.id], before.state.revision);
    expect((await friendShelfJournal.pending(a, current.state.revision)).has(game.id)).toBe(true);
    await friendShelfJournal.update(a, 3, [game.id], current.state.revision);
    expect((await friendShelfJournal.pending(a, current.state.revision)).size).toBe(0);
  });
  it('journals backup replacement and deletes only this account journal during full cleanup', async () => {
    const before = await commitScopedAction(a, { type: 'add-records', records: [game] });
    const other = await commitScopedAction(b, { type: 'add-records', records: [game] });
    await friendShelfJournal.update(a, 1, [game.id], undefined, before.state.revision);
    await friendShelfJournal.update(b, 1, [game.id], undefined, other.state.revision);
    const replaced = await restoreScopedLibrary(a, emptyPersonalLibrary());
    expect(replaced.recovery?.state.records[game.id]).toEqual(game);
    expect((await friendShelfJournal.pending(a, replaced.state.revision)).has(game.id)).toBe(true);
    await deleteScopedLibrary(a);
    expect(await friendShelfSelectionStorageTransaction(a, (value) => value)).toBeUndefined();
    expect((await friendShelfJournal.pending(b, other.state.revision)).size).toBe(0);
  });
});

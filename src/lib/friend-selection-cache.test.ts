import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import { accountStorageTransaction, closePersonalLibrary, friendSelectionStorageTransaction } from './personal-db';
import { commitScopedAction, loadScopedLibrary, parseScopedLibrary, restoreScopedLibrary } from './scoped-library';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';
import { pendingFriendRemovals, updateFriendSelectionCache } from './friend-selection-cache';
import type { LibraryRecord } from './personal-types';

const a = accountScope('selection-a');
const b = accountScope('selection-b');
const game: LibraryRecord = {
  id: 'test-game',
  title: 'Synthetic game',
  year: null,
  source: 'collection',
  sourceId: 'test-game',
  sourceUrl: null,
  studio: null,
  genre: null,
  collectionRank: 1,
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
it('removal followed by immediate re-add still requires explicit friends re-selection', async () => {
  await commitScopedAction(a, { type: 'rate-game', record: game, score: 7 });
  await updateFriendSelectionCache(a, 1, [game.id]);
  await commitScopedAction(a, { type: 'remove-ranking', ids: [game.id] });
  await commitScopedAction(a, { type: 'rate-game', record: game, score: 9 });
  expect((await loadScopedLibrary(a)).state.ranking[0]?.score).toBe(9);
  expect([...(await pendingFriendRemovals(a))]).toEqual([game.id]);
  closePersonalLibrary();
  expect([...(await pendingFriendRemovals(a))]).toEqual([game.id]);
});
it('only an explicit selection through the latest removal can clear the private suppression', async () => {
  const before = await commitScopedAction(a, { type: 'rate-game', record: game, score: 7 });
  await updateFriendSelectionCache(a, 1, [game.id]);
  const removed = await commitScopedAction(a, { type: 'remove-ranking', ids: [game.id] });
  await updateFriendSelectionCache(a, 2, [game.id]);
  expect((await pendingFriendRemovals(a)).has(game.id)).toBe(true);
  await updateFriendSelectionCache(a, 3, [game.id], before.state.revision);
  expect((await pendingFriendRemovals(a)).has(game.id)).toBe(true);
  await updateFriendSelectionCache(a, 4, [game.id], removed.state.revision);
  expect((await pendingFriendRemovals(a)).size).toBe(0);
});
it('a stale settings acknowledgement cannot overwrite a newer explicit selection', async () => {
  await updateFriendSelectionCache(a, 5, [game.id], 10);
  await updateFriendSelectionCache(a, 3, []);
  await commitScopedAction(a, { type: 'rate-game', record: game, score: 7 });
  await commitScopedAction(a, { type: 'remove-ranking', ids: [game.id] });
  expect((await pendingFriendRemovals(a)).has(game.id)).toBe(true);
});
it('marker and ranking removal roll back together if the device transaction fails', async () => {
  const before = await commitScopedAction(a, { type: 'rate-game', record: game, score: 7 });
  await updateFriendSelectionCache(a, 1, [game.id]);
  const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
    throw new DOMException('Synthetic storage full', 'QuotaExceededError');
  });
  await expect(commitScopedAction(a, { type: 'remove-ranking', ids: [game.id] })).rejects.toThrow();
  put.mockRestore();
  expect(await loadScopedLibrary(a)).toEqual(before);
  expect((await pendingFriendRemovals(a)).size).toBe(0);
});
it('an unreadable optional sharing marker blocks only friends sharing, not private library changes', async () => {
  await commitScopedAction(a, { type: 'rate-game', record: game, score: 7 });
  await friendSelectionStorageTransaction(a, (_, store) => store.put({ broken: true }, `friends-selection:v1:${a}`));
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  await commitScopedAction(a, { type: 'remove-ranking', ids: [game.id] });
  expect((await loadScopedLibrary(a)).state.ranking).toEqual([]);
  await expect(pendingFriendRemovals(a)).rejects.toThrow(/invalid/);
  expect(logged).toHaveBeenCalled();
  await updateFriendSelectionCache(a, 2, [], 100);
  expect((await pendingFriendRemovals(a)).size).toBe(0);
});
it('keeps selection suppression inside the correct account', async () => {
  await updateFriendSelectionCache(a, 1, [game.id]);
  await updateFriendSelectionCache(b, 1, [game.id]);
  await commitScopedAction(a, { type: 'rate-game', record: game, score: 7 });
  await commitScopedAction(a, { type: 'remove-ranking', ids: [game.id] });
  expect((await pendingFriendRemovals(a)).has(game.id)).toBe(true);
  expect((await pendingFriendRemovals(b)).size).toBe(0);
});
it('requires a fresh sharing review after an old writer skips the removal journal, without breaking private saving', async () => {
  const initial = await commitScopedAction(a, { type: 'rate-game', record: game, score: 7 });
  await updateFriendSelectionCache(a, 1, [game.id], undefined, initial.state.revision);
  for (const action of [
    { type: 'remove-ranking' as const, ids: [game.id] },
    { type: 'rate-game' as const, record: game, score: 9 },
  ]) {
    await accountStorageTransaction(a, (value, store) => {
      const current = parseScopedLibrary(value, a);
      const next = {
        ...current,
        state: applyPersonalAction(current.state, action),
        sync: { ...current.sync, dirty: true, dataRevision: current.sync.dataRevision + 1 },
      };
      store.put(next, a);
      return next;
    });
  }
  const legacy = await loadScopedLibrary(a);
  expect(legacy.state.ranking[0]?.score).toBe(9);
  await expect(pendingFriendRemovals(a, legacy.state.revision)).rejects.toThrow(/older tab/);
  const newer = await commitScopedAction(a, { type: 'set-motion', motion: 'lite' });
  await expect(pendingFriendRemovals(a, newer.state.revision)).rejects.toThrow(/older tab/);
  await updateFriendSelectionCache(a, 2, [game.id], newer.state.revision);
  expect((await pendingFriendRemovals(a, newer.state.revision)).size).toBe(0);
});
it('backup replacement journals removed selections in the same scoped transaction', async () => {
  const initial = await commitScopedAction(a, { type: 'rate-game', record: game, score: 7 });
  await updateFriendSelectionCache(a, 1, [game.id], undefined, initial.state.revision);
  const replaced = await restoreScopedLibrary(a, emptyPersonalLibrary());
  expect((await pendingFriendRemovals(a, replaced.state.revision)).has(game.id)).toBe(true);
  expect(replaced.recovery?.state.ranking[0]?.score).toBe(7);
});

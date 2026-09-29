import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import type { ScopedLibrary, SyncHead } from './cloud-types';
import {
  accountStorageTransaction,
  closePersonalLibrary,
  loadPersonalLibrary,
  commitPersonalAction,
  subscribePersonalLibrary,
} from './personal-db';
import {
  acknowledgeScopedUpload,
  adoptScopedRemote,
  cacheScopedProfile,
  commitScopedAction,
  connectScopedLibrary,
  deleteScopedLibrary,
  loadScopedLibrary,
  parseScopedLibrary,
  pauseScopedLibrary,
  rebaseScopedLibrary,
  restoreScopedLibrary,
  openScopedLibrary,
  scopedWriter,
} from './scoped-library';
import { emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import type { LibraryRecord, PersonalAction } from './personal-types';
import { compareTrayStorageKey, serializeCompareTray } from './compare-tray';
import { motionHintKey } from './motion-hint';

const alice = accountScope('alice');
const bob = accountScope('bob');
const game: LibraryRecord = {
  id: 'example-game',
  title: 'Example game',
  source: 'collection',
  sourceId: 'example-game',
  year: 2020,
  genre: null,
  studio: null,
  sourceUrl: null,
  collectionRank: 1,
};
const head: SyncHead = {
  format: 1,
  epoch: 1,
  revision: 0,
  enabled: true,
  deleted: false,
  current: null,
  previous: null,
  updatedAt: 0,
};
async function connect(nextHead = head, dirty = false) {
  const before = await loadScopedLibrary(alice);
  return connectScopedLibrary(alice, emptyPersonalLibrary(), nextHead, 'Alice', dirty, {
    localRevision: before.state.revision,
    epoch: before.sync.epoch,
    enabled: before.sync.enabled,
  });
}

beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => undefined });
  vi.stubGlobal('window', undefined);
});
afterEach(() => {
  closePersonalLibrary();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('explicit account scopes in the existing local database', () => {
  it.each<PersonalAction>([
    { type: 'edit-ranking', id: game.id, score: 8.5 },
    { type: 'edit-ranking', id: game.id, note: 'Updated opinion' },
    { type: 'set-motion', motion: 'lite' },
    { type: 'remove-ranking', ids: [game.id] },
    { type: 'remove-records', ids: [game.id] },
  ])('validates and copies the active library once per ordinary account edit ($type)', async (action) => {
    const before = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 7 });
    const descriptor = Object.getOwnPropertyDescriptor;
    const revisions: number[] = [];
    const validation = vi.spyOn(Object, 'getOwnPropertyDescriptor').mockImplementation((value, key) => {
      const revision = key === 'records' ? descriptor(value, 'revision')?.value : undefined;
      if (typeof revision === 'number') revisions.push(revision);
      return descriptor(value, key);
    });
    let after: ScopedLibrary;
    try {
      parsePersonalLibrary(before.state);
      expect(revisions).toEqual([before.state.revision]);
      revisions.length = 0;
      after = await commitScopedAction(alice, action);
      expect(revisions).toEqual([before.state.revision]);
    } finally {
      validation.mockRestore();
    }
    expect(after.state.revision).toBe(before.state.revision + 1);
    expect(after.state.records).not.toBe(before.state.records);
    expect(before.state.ranking).toEqual([{ id: game.id, score: 7, note: '', manualPosition: null }]);
    expect(after.sync.dataRevision).toBe(before.sync.dataRevision + (action.type === 'set-motion' ? 0 : 1));
    expect(after.sync.dirty).toBe(true);
    expect(await loadScopedLibrary(alice)).toEqual(after);
  });

  it('still validates a stored recovery library separately, without revalidating either trusted result', async () => {
    const original = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 7 });
    const before = await restoreScopedLibrary(alice, original.state);
    const descriptor = Object.getOwnPropertyDescriptor;
    const revisions: number[] = [];
    const validation = vi.spyOn(Object, 'getOwnPropertyDescriptor').mockImplementation((value, key) => {
      const revision = key === 'records' ? descriptor(value, 'revision')?.value : undefined;
      if (typeof revision === 'number') revisions.push(revision);
      return descriptor(value, key);
    });
    try {
      const after = await commitScopedAction(alice, { type: 'edit-ranking', id: game.id, score: 9 });
      expect(revisions).toEqual([original.state.revision, before.state.revision]);
      expect(after.recovery).toEqual(before.recovery);
      expect(after.recovery?.state).not.toBe(before.recovery?.state);
    } finally {
      validation.mockRestore();
    }
  });

  it.each<[string, (current: ScopedLibrary) => unknown]>([
    ['foreign scope', (current) => ({ ...current, scope: bob })],
    ['unknown envelope field', (current) => ({ ...current, unexpected: true })],
    ['invalid sync metadata', (current) => ({ ...current, sync: { ...current.sync, dirty: 'false' } })],
    ['invalid stored state', (current) => ({ ...current, state: { ...current.state, ranking: 'invalid' } })],
    ['unknown state field', (current) => ({ ...current, state: { ...current.state, unexpected: true } })],
    [
      'invalid recovery state',
      (current) => ({
        ...current,
        recovery: { state: { ...current.state, records: null }, savedAt: 1, reason: 'Previous copy' },
      }),
    ],
    ['invalid profile', (current) => ({ ...current, profile: { displayName: 'Account', avatar: 'invalid' } })],
  ])('rejects %s during an edit without overwriting the stored envelope', async (_, corrupt) => {
    const initial = await loadScopedLibrary(alice);
    const stored = corrupt(initial);
    await accountStorageTransaction(alice, (_value, store) => store.put(stored, alice));
    const put = vi.spyOn(FakeObjectStore.prototype, 'put');
    await expect(commitScopedAction(alice, { type: 'set-motion', motion: 'lite' })).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
    expect(await accountStorageTransaction(alice, (value) => value)).toEqual(stored);
  });

  it('rejects an overflowing sync revision after the reducer without writing state or journals', async () => {
    const initial = await loadScopedLibrary(alice);
    const stored = { ...initial, sync: { ...initial.sync, dataRevision: Number.MAX_SAFE_INTEGER } };
    await accountStorageTransaction(alice, (_value, store) => store.put(stored, alice));
    const put = vi.spyOn(FakeObjectStore.prototype, 'put');
    await expect(commitScopedAction(alice, { type: 'rate-game', record: game, score: 8 })).rejects.toMatchObject({
      name: 'PersonalLibraryStorageError',
      cause: { message: 'Account sync metadata is invalid. Existing local data is retained.' },
    });
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
    expect(await loadScopedLibrary(alice)).toEqual(stored);
  });

  it('continues to reject invalid restored data before replacing the saved account', async () => {
    const before = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 7 });
    expect(() =>
      restoreScopedLibrary(alice, {
        ...before.state,
        records: { [game.id]: { ...game, title: '' } },
      }),
    ).toThrow(/title/i);
    expect(await loadScopedLibrary(alice)).toEqual(before);
  });

  it('upgrades a validated v2 input while preserving removal bookkeeping inputs', async () => {
    const initial = await loadScopedLibrary(alice);
    await accountStorageTransaction(alice, (_value, store) =>
      store.put(
        {
          ...initial,
          state: {
            ...initial.state,
            version: 2,
            records: { [game.id]: game },
            ranking: [{ id: game.id, score: 7, note: 'Legacy opinion' }],
          },
        },
        alice,
      ),
    );
    const after = await commitScopedAction(alice, { type: 'edit-ranking', id: game.id, score: 8 });
    expect(after.state.version).toBe(3);
    expect(after.state.ranking).toEqual([{ id: game.id, score: 8, note: 'Legacy opinion', manualPosition: 1 }]);
    expect(await loadScopedLibrary(alice)).toEqual(after);
  });

  it('removes only the confirmed clean device copy and blocks dirty or concurrently changed revisions', async () => {
    await loadPersonalLibrary([game]);
    const guest = await commitPersonalAction({ type: 'rate-game', record: game, score: 9 });
    const clean = await connect();
    const other = await loadScopedLibrary(bob);
    await expect(deleteScopedLibrary(alice, clean.state.revision - 1)).rejects.toThrow(/kept/);
    const changed = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 6 });
    await expect(deleteScopedLibrary(alice, changed.state.revision)).rejects.toThrow(/unsynced/);
    expect(await loadScopedLibrary(alice)).toEqual(changed);
    await deleteScopedLibrary(alice);
    expect((await loadPersonalLibrary([game])).state).toEqual(guest);
    expect(await loadScopedLibrary(bob)).toEqual(other);
    await expect(loadScopedLibrary(alice)).rejects.toMatchObject({ name: 'PersonalLibraryWriterRetiredError' });
    const empty = await openScopedLibrary(alice);
    await deleteScopedLibrary(scopedWriter(empty), empty.state.revision);
    expect((await openScopedLibrary(alice)).state.ranking).toEqual([]);
  });
  it("removes the account's saved Compare tray pins with its device copy, and keeps them when removal is refused", async () => {
    // The tray's own key function names the keys, so deleteScopedLibrary's spelled-out key must match it.
    const trays = new Map(
      [alice, bob, 'guest'].map((scope) => [compareTrayStorageKey(scope), serializeCompareTray(scope, [game])]),
    );
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => trays.get(key) ?? null,
      removeItem: (key: string) => {
        trays.delete(key);
      },
    });
    const clean = await connect();
    await expect(deleteScopedLibrary(alice, clean.state.revision - 1)).rejects.toThrow(/kept/);
    expect(trays.has(compareTrayStorageKey(alice))).toBe(true);
    expect(await deleteScopedLibrary(alice)).toEqual({ complete: true });
    expect([...trays.keys()]).toEqual([compareTrayStorageKey(bob), compareTrayStorageKey('guest')]);
  });
  it.each([
    ['Compare tray pins', compareTrayStorageKey(alice), motionHintKey(alice)],
    ['motion hint', motionHintKey(alice), compareTrayStorageKey(alice)],
  ])(
    "reports the account's %s that localStorage refuses to remove, and its retry removes only that account's data",
    async (_, refused, other) => {
      const stored = new Map<string, string>();
      for (const scope of [alice, bob, 'guest'] as const) {
        stored.set(compareTrayStorageKey(scope), serializeCompareTray(scope, [game]));
        stored.set(motionHintKey(scope), 'full');
      }
      let refuse = false;
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => {
          stored.set(key, value);
        },
        removeItem: (key: string) => {
          if (refuse && key === refused) throw new DOMException('Synthetic storage refusal', 'SecurityError');
          stored.delete(key);
        },
      });
      await loadPersonalLibrary([game]);
      const guest = await commitPersonalAction({ type: 'rate-game', record: game, score: 9 });
      const bobCopy = await loadScopedLibrary(bob);
      const clean = await connect();
      const before = new Map(stored);
      refuse = true;
      const removal = await deleteScopedLibrary(alice, clean.state.revision);
      if (removal.complete) throw new Error('The refused removal must be reported.');
      // The transaction's part of the copy is gone, and so is the key localStorage did not refuse.
      expect(await accountStorageTransaction(alice, (value) => value)).toBeUndefined();
      expect(stored.get(refused)).toBe(before.get(refused));
      expect(stored.has(other)).toBe(false);
      expect(removal.retry().complete, 'a retry refused again is reported again').toBe(false);
      refuse = false;
      expect(removal.retry()).toEqual({ complete: true });
      expect(stored).toEqual(new Map([...before].filter(([key]) => key !== refused && key !== other)));
      expect((await loadPersonalLibrary([game])).state).toEqual(guest);
      expect(await loadScopedLibrary(bob)).toEqual(bobCopy);
    },
  );
  it.each([undefined, null])('finds nothing left behind where Web Storage is %s', async (storage) => {
    vi.stubGlobal('localStorage', storage);
    const clean = await connect();
    expect(await deleteScopedLibrary(alice, clean.state.revision)).toEqual({ complete: true });
  });
  it('retains the original guest record and separates every account namespace', async () => {
    await loadPersonalLibrary([game]);
    const guest = await commitPersonalAction({ type: 'rate-game', record: game, score: 9 });
    await loadScopedLibrary(alice);
    await loadScopedLibrary(bob);
    await commitScopedAction(alice, { type: 'set-progress', records: [game], key: 'later', value: true });
    expect((await loadPersonalLibrary([game])).state).toEqual(guest);
    expect((await loadScopedLibrary(alice)).state.queueOrder).toEqual([game.id]);
    expect((await loadScopedLibrary(bob)).state).toEqual(emptyPersonalLibrary());
    closePersonalLibrary();
    expect((await loadScopedLibrary(alice)).state.queueOrder).toEqual([game.id]);
    expect((await loadPersonalLibrary([game])).state.ranking[0]?.score).toBe(9);
  });

  it('commits state and its durable dirty marker in the same transaction', async () => {
    await connect();
    const saved = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 8 });
    expect(saved.sync.dirty).toBe(true);
    closePersonalLibrary();
    expect(await loadScopedLibrary(alice)).toEqual(saved);
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    await expect(commitScopedAction(alice, { type: 'rate-game', record: game, score: 10 })).rejects.toThrow();
    put.mockRestore();
    expect(await loadScopedLibrary(alice)).toEqual(saved);
  });

  it('does not clear edit N+1 when upload N finishes', async () => {
    await connect();
    const first = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 8 });
    const second = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 9 });
    const ack = await acknowledgeScopedUpload(alice, first.state.revision, { ...head, revision: 1 });
    expect(ack.state).toEqual(second.state);
    expect(ack.sync.dirty).toBe(true);
    expect(ack.sync.baseRemoteRevision).toBe(1);
    const latest = await acknowledgeScopedUpload(alice, second.state.revision, { ...head, revision: 2 });
    expect(latest.sync.dirty).toBe(false);
    expect(latest.sync.baseRemoteRevision).toBe(2);
  });

  it('does not reactivate a disconnected epoch through an older upload completion', async () => {
    await connect(head, true);
    const before = await pauseScopedLibrary(alice);
    expect(await acknowledgeScopedUpload(alice, before.state.revision, { ...head, revision: 1 })).toEqual(before);
    await connect({ ...head, epoch: 3 }, true);
    const stale = await acknowledgeScopedUpload(alice, before.state.revision, { ...head, epoch: 1, revision: 50 });
    expect(stale.sync.epoch).toBe(3);
    expect(stale.sync.dirty).toBe(true);
  });

  it('guards remote adoption against dirty data and a newer local revision, retaining a recovery copy', async () => {
    await connect();
    const dirty = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 8.5 });
    await expect(
      adoptScopedRemote(alice, emptyPersonalLibrary(), { ...head, revision: 2 }, dirty.state.revision),
    ).rejects.toThrow(/changed/);
    await expect(
      adoptScopedRemote(alice, emptyPersonalLibrary(), { ...head, revision: 2 }, dirty.state.revision - 1, true),
    ).rejects.toThrow(/changed/);
    const chosen = await adoptScopedRemote(
      alice,
      emptyPersonalLibrary(),
      { ...head, revision: 2 },
      dirty.state.revision,
      true,
    );
    expect(chosen.state.ranking).toEqual([]);
    expect(chosen.recovery?.state).toEqual(dirty.state);
    expect(chosen.sync.dirty).toBe(false);
  });

  it('notifies only consumers of the affected scope', async () => {
    const guestChange = vi.fn();
    const aliceChange = vi.fn();
    const bobChange = vi.fn();
    subscribePersonalLibrary(guestChange);
    subscribePersonalLibrary(aliceChange, alice);
    subscribePersonalLibrary(bobChange, bob);
    await commitScopedAction(alice, { type: 'add-records', records: [game] });
    expect(aliceChange).toHaveBeenCalledOnce();
    expect(guestChange).not.toHaveBeenCalled();
    expect(bobChange).not.toHaveBeenCalled();
  });

  it('rejects wrong-account or corrupt metadata without falling back to guest', async () => {
    const initial = await loadScopedLibrary(alice);
    expect(() => parseScopedLibrary(initial, bob)).toThrow(/different account/);
    expect(() => parseScopedLibrary({ ...initial, sync: { ...initial.sync, dirty: 'false' } }, alice)).toThrow(
      /metadata/,
    );
    expect(() => parseScopedLibrary(null, alice)).toThrow(
      "This account's copy on this device is unreadable. It has not been overwritten.",
    );
    expect(() => accountScope('../someone')).toThrow(/identity/);
  });

  it('rejects a stale connection preview inside the transaction without replacing peer-tab edits', async () => {
    const preview = await loadScopedLibrary(alice);
    const edited = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 9.4 });
    await expect(
      connectScopedLibrary(alice, preview.state, head, 'Alice', true, {
        localRevision: preview.state.revision,
        epoch: preview.sync.epoch,
        enabled: preview.sync.enabled,
      }),
    ).rejects.toThrow(/changed while the preview/);
    expect(await loadScopedLibrary(alice)).toEqual(edited);
  });

  it('rejects connecting a preview whose consent state changed without a domain edit', async () => {
    const preview = await connect();
    const paused = await pauseScopedLibrary(alice);
    await expect(
      connectScopedLibrary(alice, preview.state, head, 'Alice', true, {
        localRevision: preview.state.revision,
        epoch: preview.sync.epoch,
        enabled: preview.sync.enabled,
      }),
    ).rejects.toThrow(/connection changed/);
    expect(await loadScopedLibrary(alice)).toEqual(paused);
  });

  it('keeps receiving-device motion on connect and remote adoption without uploading presentation changes', async () => {
    const first = await loadScopedLibrary(alice, 'lite');
    const connected = await connectScopedLibrary(
      alice,
      { ...emptyPersonalLibrary(), motion: 'full' },
      head,
      'Alice',
      false,
      {
        localRevision: first.state.revision,
        epoch: first.sync.epoch,
        enabled: first.sync.enabled,
      },
    );
    expect(connected.state.motion).toBe('lite');
    const changed = await commitScopedAction(alice, { type: 'set-motion', motion: 'auto' });
    expect(changed.sync.dirty).toBe(false);
    expect(changed.sync.dataRevision).toBe(connected.sync.dataRevision);
    const adopted = await adoptScopedRemote(
      alice,
      { ...emptyPersonalLibrary(), motion: 'full' },
      { ...head, revision: 2 },
      changed.state.revision,
    );
    expect(adopted.state.motion).toBe('auto');
  });

  it('acknowledges user data while retaining a motion change that happened during upload', async () => {
    await connect();
    const edited = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 7.6 });
    await commitScopedAction(alice, { type: 'set-motion', motion: 'lite' });
    const ack = await acknowledgeScopedUpload(alice, edited.sync.dataRevision, { ...head, revision: 1 });
    expect(ack.state.motion).toBe('lite');
    expect(ack.state.ranking[0]?.score).toBe(7.6);
    expect(ack.sync.dirty).toBe(false);
  });

  it('persists a stable account creature/name for offline reload without dirtying the game snapshot', async () => {
    const before = await connect();
    const profile = {
      uid: 'alice',
      displayName: 'Alice chooses a creature',
      avatar: { version: 1 as const, seed: 'a'.repeat(32), palette: 'clay' as const },
      createdAt: 1,
      updatedAt: 2,
      consentVersion: 1 as const,
      gameCount: 0,
      rankCount: 0,
    };
    const updated = await cacheScopedProfile(alice, profile);
    expect(updated.sync).toEqual(before.sync);
    expect(updated.state).toEqual(before.state);
    closePersonalLibrary();
    expect((await loadScopedLibrary(alice)).profile).toEqual({
      displayName: profile.displayName,
      avatar: profile.avatar,
    });
    await expect(cacheScopedProfile(bob, profile)).rejects.toThrow(/another account/);
    expect((await loadScopedLibrary(bob)).profile).toBeNull();
  });

  it('checks for uncommitted editor drafts inside the final remote-adoption transaction', async () => {
    const initial = await connect();
    await expect(
      adoptScopedRemote(
        alice,
        emptyPersonalLibrary(),
        { ...head, revision: 2 },
        initial.state.revision,
        false,
        () => false,
      ),
    ).rejects.toThrow(/changed/);
    expect(await loadScopedLibrary(alice)).toEqual(initial);
  });

  it('does not apply an old session acknowledgement or profile callback to a later account lifetime', async () => {
    const before = await connect(head, true);
    await expect(
      acknowledgeScopedUpload(alice, before.sync.dataRevision, { ...head, revision: 1 }, () => false),
    ).rejects.toThrow(/session changed/);
    await expect(
      rebaseScopedLibrary(alice, { ...head, revision: 1 }, before.state.revision, () => false),
    ).rejects.toThrow(/permission changed/);
    expect(await loadScopedLibrary(alice)).toEqual(before);
    await expect(
      cacheScopedProfile(
        alice,
        {
          uid: 'alice',
          displayName: 'Old session',
          avatar: { version: 1, seed: 'a'.repeat(32), palette: 'lime' },
          createdAt: 1,
          updatedAt: 2,
          consentVersion: 1,
          gameCount: 0,
          rankCount: 0,
        },
        () => false,
      ),
    ).rejects.toThrow(/account changed/);
    expect(await loadScopedLibrary(alice)).toEqual(before);
  });

  it('keeps manual stop and a newer consent epoch protected from delayed adoption and pause', async () => {
    const connected = await connect();
    const stopped = await pauseScopedLibrary(alice);
    await expect(
      adoptScopedRemote(alice, emptyPersonalLibrary(), { ...head, revision: 2 }, connected.state.revision),
    ).rejects.toThrow(/permission changed/);
    expect(await loadScopedLibrary(alice)).toEqual(stopped);
    const reconnected = await connect({ ...head, epoch: 3 }, true);
    await expect(pauseScopedLibrary(alice, 1)).rejects.toThrow(/session changed/);
    expect(await loadScopedLibrary(alice)).toEqual(reconnected);
  });
});

import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import type { SyncHead } from './cloud-types';
import { closePersonalLibrary, loadPersonalLibrary, commitPersonalAction, subscribePersonalLibrary } from './personal-db';
import { acknowledgeScopedUpload, adoptScopedRemote, cacheScopedProfile, commitScopedAction, connectScopedLibrary, loadScopedLibrary, parseScopedLibrary, pauseScopedLibrary } from './scoped-library';
import { emptyPersonalLibrary } from './personal-library';
import type { LibraryRecord } from './personal-types';

const alice = accountScope('alice');
const bob = accountScope('bob');
const game: LibraryRecord = { id: 'example-game', title: 'Example game', source: 'collection', sourceId: 'example-game', year: 2020, genre: null, studio: null, sourceUrl: null, collectionRank: 1 };
const head: SyncHead = { format: 1, epoch: 1, revision: 0, enabled: true, deleted: false, current: null, previous: null, updatedAt: 0 };
async function connect(nextHead = head, dirty = false) {
  const before = await loadScopedLibrary(alice);
  return connectScopedLibrary(alice, emptyPersonalLibrary(), nextHead, 'Alice', dirty, { localRevision: before.state.revision, epoch: before.sync.epoch, enabled: before.sync.enabled });
}

beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => undefined });
  vi.stubGlobal('window', undefined);
});
afterEach(() => { closePersonalLibrary(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('explicit account scopes in the existing local database', () => {
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
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError'); });
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
    await expect(adoptScopedRemote(alice, emptyPersonalLibrary(), { ...head, revision: 2 }, dirty.state.revision)).rejects.toThrow(/changed/);
    await expect(adoptScopedRemote(alice, emptyPersonalLibrary(), { ...head, revision: 2 }, dirty.state.revision - 1, true)).rejects.toThrow(/changed/);
    const chosen = await adoptScopedRemote(alice, emptyPersonalLibrary(), { ...head, revision: 2 }, dirty.state.revision, true);
    expect(chosen.state.ranking).toEqual([]);
    expect(chosen.recovery?.state).toEqual(dirty.state);
    expect(chosen.sync.dirty).toBe(false);
  });

  it('notifies only consumers of the affected scope', async () => {
    const guestChange = vi.fn(); const aliceChange = vi.fn(); const bobChange = vi.fn();
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
    expect(() => parseScopedLibrary({ ...initial, sync: { ...initial.sync, dirty: 'false' } }, alice)).toThrow(/metadata/);
    expect(() => accountScope('../someone')).toThrow(/identity/);
  });

  it('rejects a stale connection preview inside the transaction without replacing peer-tab edits', async () => {
    const preview = await loadScopedLibrary(alice);
    const edited = await commitScopedAction(alice, { type: 'rate-game', record: game, score: 9.4 });
    await expect(connectScopedLibrary(alice, preview.state, head, 'Alice', true, {
      localRevision: preview.state.revision, epoch: preview.sync.epoch, enabled: preview.sync.enabled,
    })).rejects.toThrow(/changed while the preview/);
    expect(await loadScopedLibrary(alice)).toEqual(edited);
  });

  it('rejects connecting a preview whose consent state changed without a domain edit', async () => {
    const preview = await connect();
    const paused = await pauseScopedLibrary(alice);
    await expect(connectScopedLibrary(alice, preview.state, head, 'Alice', true, {
      localRevision: preview.state.revision, epoch: preview.sync.epoch, enabled: preview.sync.enabled,
    })).rejects.toThrow(/connection changed/);
    expect(await loadScopedLibrary(alice)).toEqual(paused);
  });

  it('keeps receiving-device motion on connect and remote adoption without uploading presentation changes', async () => {
    const first = await loadScopedLibrary(alice, 'lite');
    const connected = await connectScopedLibrary(alice, { ...emptyPersonalLibrary(), motion: 'full' }, head, 'Alice', false, {
      localRevision: first.state.revision, epoch: first.sync.epoch, enabled: first.sync.enabled,
    });
    expect(connected.state.motion).toBe('lite');
    const changed = await commitScopedAction(alice, { type: 'set-motion', motion: 'auto' });
    expect(changed.sync.dirty).toBe(false);
    expect(changed.sync.dataRevision).toBe(connected.sync.dataRevision);
    const adopted = await adoptScopedRemote(alice, { ...emptyPersonalLibrary(), motion: 'full' }, { ...head, revision: 2 }, changed.state.revision);
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
      uid: 'alice', displayName: 'Alice chooses a creature', avatar: { version: 1 as const, seed: 'a'.repeat(32), palette: 'clay' as const },
      createdAt: 1, updatedAt: 2, consentVersion: 1 as const, gameCount: 0, rankCount: 0,
    };
    const updated = await cacheScopedProfile(alice, profile);
    expect(updated.sync).toEqual(before.sync);
    expect(updated.state).toEqual(before.state);
    closePersonalLibrary();
    expect((await loadScopedLibrary(alice)).profile).toEqual({ displayName: profile.displayName, avatar: profile.avatar });
    await expect(cacheScopedProfile(bob, profile)).rejects.toThrow(/another account/);
    expect((await loadScopedLibrary(bob)).profile).toBeNull();
  });

  it('checks for uncommitted editor drafts inside the final remote-adoption transaction', async () => {
    const initial = await connect();
    await expect(adoptScopedRemote(alice, emptyPersonalLibrary(), { ...head, revision: 2 }, initial.state.revision, false, () => false)).rejects.toThrow(/changed/);
    expect(await loadScopedLibrary(alice)).toEqual(initial);
  });
});

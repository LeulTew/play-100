import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import * as firestore from 'firebase/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as lifecycle from '../cloud/account-lifecycle';
import { FriendStore } from '../cloud/friend-store';
import { FriendCommittedError } from './friend-types';
import type { FriendSettings, FriendShareHead } from './friend-types';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return { ...actual, runTransaction: vi.fn(), getDocFromServer: vi.fn() };
});

const apps: FirebaseApp[] = [];
const settings: FriendSettings = { format: 1, enabled: true, deleted: false, selectedIds: [], epoch: 1, revision: 1, updatedAt: 1000 };
const refreshError = new Error('The metadata stream disconnected after the server acknowledged the transaction.');
const avatar = { version: 1, seed: 'b'.repeat(32), palette: 'moss' } as const;

function client() {
  const app = initializeApp({ projectId: 'demo-play100' }, crypto.randomUUID());
  apps.push(app);
  return new FriendStore(firestore.getFirestore(app));
}
function mockServerReads(documents: Map<string, firestore.DocumentData | null>) {
  return vi.mocked(firestore.getDocFromServer).mockImplementation((async (ref: firestore.DocumentReference) => {
    const data = documents.get(ref.path);
    if (data === undefined) throw new Error(`Unexpected server read: ${ref.path}`);
    return { id: ref.id, ref, exists: () => data !== null, data: () => data ?? undefined };
  }) as unknown as typeof firestore.getDocFromServer);
}
afterEach(async () => {
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map(deleteApp));
});

describe('acknowledged friendship changes and independent metadata refresh', () => {
  it('rejects a failed server preflight before invoking any transaction', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockRejectedValue(refreshError);
    const transaction = vi.mocked(firestore.runTransaction).mockResolvedValue(1);
    await expect(store.sendRequest('alice', 'bob')).rejects.toBe(refreshError);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects explicit browser offline before the preflight or transaction', async () => {
    const store = client();
    vi.stubGlobal('navigator', { onLine: false });
    const preflight = vi.spyOn(store, 'settings').mockResolvedValue(settings);
    const transaction = vi.mocked(firestore.runTransaction).mockResolvedValue(1);
    await expect(store.sendRequest('alice', 'bob')).rejects.toMatchObject({ code: 'offline' });
    expect(preflight).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('reports a known commit only after acknowledgement, even when its readback fails', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    let acknowledge: ((epoch: number) => void) | undefined;
    const transaction = vi.mocked(firestore.runTransaction)
      .mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve; }))
      .mockRejectedValueOnce(refreshError);
    const result = store.sendRequest('alice', 'bob');
    const outcome = expect(result).rejects.toMatchObject({
      code: 'committed-refresh-failed', committed: true, phase: 'refresh',
      receipt: { operation: 'send-request', uid: 'alice', otherUid: 'bob', epoch: 2 }, cause: refreshError,
    });
    await vi.waitFor(() => expect(transaction).toHaveBeenCalledOnce());
    expect(transaction).toHaveBeenCalledTimes(1);
    acknowledge?.(2);
    await outcome;
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[1]?.[2]).toEqual({ maxAttempts: 3 });
  });
  it('preserves transaction failures as uncommitted and never reads a nonexistent acknowledgement', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    const denied = new Error('The server rejected this mutation.');
    vi.mocked(firestore.runTransaction).mockRejectedValue(denied);
    await expect(store.sendRequest('alice', 'bob')).rejects.toBe(denied);
    expect(firestore.runTransaction).toHaveBeenCalledOnce();
    expect(denied).not.toBeInstanceOf(FriendCommittedError);
  });
  it.each(['accept', 'decline', 'cancel', 'remove'] as const)('distinguishes a committed %s from its failed pair refresh', async (action) => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    vi.mocked(firestore.runTransaction).mockResolvedValueOnce(undefined).mockRejectedValueOnce(refreshError);
    await expect(store.respond('alice', 'bob', action, 2)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'respond', uid: 'alice', otherUid: 'bob', epoch: 3 },
    });
  });
  it('preserves consumed invitation acknowledgement without putting the capability in its receipt', async () => {
    const store = client();
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const serverReads = mockServerReads(new Map<string, firestore.DocumentData | null>([
      ['accountQuotas/alice/limits/pairs', null],
      [`friendInvites/${token}`, {
        format: 1, ownerUid: 'bob', slot: 0, displayName: 'Bob', avatar,
        createdAt: firestore.Timestamp.now(), state: 'active', acceptedBy: null,
      }],
    ]));
    const acceptance = vi.spyOn(store, 'acceptInvite');
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    vi.mocked(firestore.runTransaction).mockResolvedValueOnce({ ownerUid: 'bob', epoch: 1 }).mockRejectedValueOnce(refreshError);
    await expect(store.acceptInvite('alice', token)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'accept-invite', uid: 'alice', otherUid: 'bob', epoch: 1 }, cause: refreshError,
    });
    const result = acceptance.mock.results[0];
    if (!result || result.type !== 'return') throw new Error('The invitation did not return its acknowledged outcome.');
    try {
      await result.value;
      throw new Error('A failed refresh must expose its committed outcome.');
    } catch (cause) {
      expect(cause).toBeInstanceOf(FriendCommittedError);
      if (!(cause instanceof FriendCommittedError)) throw cause;
      expect(cause.receipt).toEqual({ operation: 'accept-invite', uid: 'alice', otherUid: 'bob', epoch: 1 });
      expect(JSON.stringify(cause.receipt)).not.toContain(token);
    }
    expect(firestore.runTransaction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(firestore.runTransaction).mock.calls[1]?.[2]).toEqual({ maxAttempts: 3 });
    expect(serverReads.mock.calls.map(([ref]) => ref.path)).toEqual([
      'accountQuotas/alice/limits/pairs', `friendInvites/${token}`,
    ]);
  });
  it('makes created invitations recoverable from the owner registry after a failed readback', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    vi.mocked(firestore.runTransaction).mockResolvedValueOnce(undefined).mockRejectedValueOnce(refreshError);
    try {
      await store.createInvite('alice');
      throw new Error('A failed refresh must expose its committed outcome.');
    } catch (cause) {
      expect(cause).toBeInstanceOf(FriendCommittedError);
      if (!(cause instanceof FriendCommittedError)) throw cause;
      expect(cause.receipt).toEqual({ operation: 'create-invite', uid: 'alice' });
      expect(cause.cause).toBe(refreshError);
    }
  });
  it('distinguishes initialization and sharing-settings acknowledgement from failed settings reads', async () => {
    const store = client();
    vi.spyOn(lifecycle, 'ensureAccountActivity').mockResolvedValue(undefined);
    vi.mocked(firestore.runTransaction).mockResolvedValueOnce(undefined).mockRejectedValueOnce(refreshError);
    await expect(store.initialize('alice')).rejects.toMatchObject({ committed: true, receipt: { operation: 'initialize', uid: 'alice' } });
    vi.mocked(firestore.runTransaction).mockResolvedValueOnce(undefined).mockRejectedValueOnce(refreshError);
    await expect(store.saveSettings('alice', { enabled: false, selectedIds: [] }, settings)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'save-settings', uid: 'alice' },
    });
  });
  it('distinguishes identity/group acknowledgement from failed metadata refreshes', async () => {
    const store = client();
    const id = crypto.randomUUID();
    const serverReads = mockServerReads(new Map<string, firestore.DocumentData | null>([
      ['accountQuotas/alice/limits/groups', null],
      [`friendGroups/alice/items/${id}`, null],
    ]));
    const listGroups = vi.spyOn(store, 'listGroups').mockResolvedValue({ items: [], cursor: undefined });
    vi.mocked(firestore.runTransaction).mockResolvedValueOnce(undefined).mockRejectedValueOnce(refreshError);
    await expect(store.saveIdentity('alice', { displayName: 'Alice', avatar }, 0)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'save-identity', uid: 'alice' },
    });
    expect(serverReads).not.toHaveBeenCalled();
    vi.mocked(firestore.runTransaction).mockResolvedValueOnce(undefined).mockRejectedValueOnce(refreshError);
    await expect(store.saveGroup('alice', { id, name: 'Friends', participantUids: ['alice', 'bob'] }, 0)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'save-group', uid: 'alice', groupId: id, revision: 1 },
    });
    expect(listGroups).toHaveBeenCalledOnce();
    expect(listGroups).toHaveBeenCalledWith('alice', undefined);
    expect(serverReads.mock.calls.map(([ref]) => ref.path)).toEqual([
      'accountQuotas/alice/limits/groups', `friendGroups/alice/items/${id}`,
    ]);
  });
  it.each(['refresh', 'cleanup'] as const)('keeps a committed ranking distinct from a later %s failure', async (phase) => {
    const store = client();
    const generation = crypto.randomUUID();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(generation);
    const transaction = vi.mocked(firestore.runTransaction).mockResolvedValueOnce(null).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const cleanup = vi.spyOn(store, 'cleanupSharing').mockResolvedValue(0);
    const head: FriendShareHead = { format: 1, epoch: 1, settingsRevision: 1, revision: 1, source: { syncEpoch: 1, remoteRevision: 0 },
      current: { generation, digest: '0'.repeat(64), count: 0 }, previous: null, updatedAt: 1000 };
    if (phase === 'refresh') transaction.mockRejectedValueOnce(refreshError);
    else {
      transaction.mockResolvedValueOnce(head);
      cleanup.mockResolvedValueOnce(0).mockRejectedValueOnce(refreshError);
    }
    await expect(store.publishRanking('alice', [], settings, head.source, 0)).rejects.toMatchObject({
      committed: true, phase, receipt: { operation: 'publish-ranking', uid: 'alice', generation, epoch: 1, revision: 1 }, cause: refreshError,
    });
  });
  it('reads acknowledged initialization through a bounded read-only transaction, not a stale missing listener', async () => {
    const store = client();
    vi.spyOn(lifecycle, 'ensureAccountActivity').mockResolvedValue(undefined);
    const listenerRead = vi.spyOn(store, 'settings').mockResolvedValue(null);
    vi.mocked(firestore.getDocFromServer).mockRejectedValue(refreshError);
    const transaction = vi.mocked(firestore.runTransaction).mockResolvedValueOnce(undefined).mockResolvedValueOnce(settings);
    expect(await store.initialize('alice')).toEqual(settings);
    expect(listenerRead).not.toHaveBeenCalled();
    expect(firestore.getDocFromServer).not.toHaveBeenCalled();
    const readback = transaction.mock.calls[1];
    if (!readback) throw new Error('The acknowledged initialization did not read back its document.');
    expect(readback[2]).toEqual({ maxAttempts: 3 });
    const tx = {
      get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ format: 1, enabled: true, deleted: false, selection: '', epoch: 1, revision: 1, updatedAt: firestore.Timestamp.fromMillis(1000) }) }),
      set: vi.fn(), update: vi.fn(), delete: vi.fn(),
    };
    expect(await Reflect.apply(readback[1], undefined, [tx])).toEqual(settings);
    expect(tx.get).toHaveBeenCalledOnce();
    expect(tx.set).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });
});

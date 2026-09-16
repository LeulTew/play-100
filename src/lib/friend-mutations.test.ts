import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import * as firestore from 'firebase/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as lifecycle from '../cloud/account-lifecycle';
import { FriendStore } from '../cloud/friend-store';
import { FriendCommittedError } from './friend-types';
import type { FriendSettings, FriendShareHead } from './friend-types';

const apps: FirebaseApp[] = [];
const settings: FriendSettings = { format: 1, enabled: true, deleted: false, selectedIds: [], epoch: 1, revision: 1, updatedAt: 1000 };
const refreshError = new Error('The metadata stream disconnected after the server acknowledged the transaction.');
const avatar = { version: 1, seed: 'b'.repeat(32), palette: 'moss' } as const;

function client() {
  const app = initializeApp({ projectId: 'demo-play100' }, crypto.randomUUID());
  apps.push(app);
  return new FriendStore(firestore.getFirestore(app));
}
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map(deleteApp));
});

describe('acknowledged friendship changes and independent metadata refresh', () => {
  it('rejects a failed server preflight before invoking any transaction', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockRejectedValue(refreshError);
    const transaction = vi.spyOn(firestore, 'runTransaction').mockResolvedValue(1);
    await expect(store.sendRequest('alice', 'bob')).rejects.toBe(refreshError);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects explicit browser offline before the preflight or transaction', async () => {
    const store = client();
    vi.stubGlobal('navigator', { onLine: false });
    const preflight = vi.spyOn(store, 'settings').mockResolvedValue(settings);
    const transaction = vi.spyOn(firestore, 'runTransaction').mockResolvedValue(1);
    await expect(store.sendRequest('alice', 'bob')).rejects.toMatchObject({ code: 'offline' });
    expect(preflight).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('reports a known commit only after acknowledgement, even when its readback fails', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    const readback = vi.spyOn(store, 'pair').mockRejectedValue(refreshError);
    let acknowledge: ((epoch: number) => void) | undefined;
    const transaction = vi.spyOn(firestore, 'runTransaction').mockImplementation(() => new Promise((resolve) => { acknowledge = resolve; }));
    const result = store.sendRequest('alice', 'bob');
    const outcome = expect(result).rejects.toMatchObject({
      code: 'committed-refresh-failed', committed: true, phase: 'refresh',
      receipt: { operation: 'send-request', uid: 'alice', otherUid: 'bob', epoch: 2 }, cause: refreshError,
    });
    await vi.waitFor(() => expect(transaction).toHaveBeenCalledOnce());
    expect(readback).not.toHaveBeenCalled();
    acknowledge?.(2);
    await outcome;
    expect(readback).toHaveBeenCalledOnce();
  });
  it('preserves transaction failures as uncommitted and never reads a nonexistent acknowledgement', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    const denied = new Error('The server rejected this mutation.');
    vi.spyOn(firestore, 'runTransaction').mockRejectedValue(denied);
    const readback = vi.spyOn(store, 'pair').mockRejectedValue(refreshError);
    await expect(store.sendRequest('alice', 'bob')).rejects.toBe(denied);
    expect(readback).not.toHaveBeenCalled();
    expect(denied).not.toBeInstanceOf(FriendCommittedError);
  });
  it.each(['accept', 'decline', 'cancel', 'remove'] as const)('distinguishes a committed %s from its failed pair refresh', async (action) => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    vi.spyOn(firestore, 'runTransaction').mockResolvedValue(undefined);
    vi.spyOn(store, 'pair').mockRejectedValue(refreshError);
    await expect(store.respond('alice', 'bob', action, 2)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'respond', uid: 'alice', otherUid: 'bob', epoch: 3 },
    });
  });
  it('preserves consumed invitation acknowledgement without putting the capability in its receipt', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    vi.spyOn(firestore, 'runTransaction').mockResolvedValue({ ownerUid: 'bob', epoch: 1 });
    vi.spyOn(store, 'pair').mockRejectedValue(refreshError);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    await expect(store.acceptInvite('alice', token)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'accept-invite', uid: 'alice', otherUid: 'bob', epoch: 1 }, cause: refreshError,
    });
  });
  it('makes created invitations recoverable from the owner registry after a failed readback', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    vi.spyOn(firestore, 'runTransaction').mockResolvedValue(undefined);
    vi.spyOn(firestore, 'getDocFromServer').mockRejectedValue(refreshError);
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
    vi.spyOn(firestore, 'runTransaction').mockResolvedValue(undefined);
    vi.spyOn(store, 'settings').mockRejectedValue(refreshError);
    await expect(store.initialize('alice')).rejects.toMatchObject({ committed: true, receipt: { operation: 'initialize', uid: 'alice' } });
    await expect(store.saveSettings('alice', { enabled: false, selectedIds: [] }, settings)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'save-settings', uid: 'alice' },
    });
  });
  it('distinguishes identity/group acknowledgement from failed metadata refreshes', async () => {
    const store = client();
    vi.spyOn(firestore, 'runTransaction').mockResolvedValue(undefined);
    vi.spyOn(store, 'identity').mockRejectedValue(refreshError);
    await expect(store.saveIdentity('alice', { displayName: 'Alice', avatar }, 0)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'save-identity', uid: 'alice' },
    });
    const id = crypto.randomUUID();
    vi.spyOn(store, 'getGroup').mockRejectedValue(refreshError);
    await expect(store.saveGroup('alice', { id, name: 'Friends', participantUids: ['alice', 'bob'] }, 0)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'save-group', uid: 'alice', groupId: id, revision: 1 },
    });
  });
  it.each(['refresh', 'cleanup'] as const)('keeps a committed ranking distinct from a later %s failure', async (phase) => {
    const store = client();
    const generation = crypto.randomUUID();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(generation);
    vi.spyOn(firestore, 'runTransaction').mockResolvedValueOnce(null).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const cleanup = vi.spyOn(store, 'cleanupSharing').mockResolvedValue(0);
    const head: FriendShareHead = { format: 1, epoch: 1, settingsRevision: 1, revision: 1, source: { syncEpoch: 1, remoteRevision: 0 },
      current: { generation, digest: '0'.repeat(64), count: 0 }, previous: null, updatedAt: 1000 };
    const read = vi.spyOn(store, 'shareHead').mockResolvedValue(head);
    if (phase === 'refresh') read.mockRejectedValue(refreshError);
    else cleanup.mockResolvedValueOnce(0).mockRejectedValueOnce(refreshError);
    await expect(store.publishRanking('alice', [], settings, head.source, 0)).rejects.toMatchObject({
      committed: true, phase, receipt: { operation: 'publish-ranking', uid: 'alice', generation, epoch: 1, revision: 1 }, cause: refreshError,
    });
  });
});

import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import * as firestore from 'firebase/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FriendStore } from '../cloud/friend-store';
import type { FriendSettings } from './friend-types';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return { ...actual, runTransaction: vi.fn(), getDocFromServer: vi.fn() };
});

const apps: FirebaseApp[] = [];
const token = 'a'.repeat(64);
const invitePath = `friendInvites/${token}`;
const avatar = { version: 1, seed: 'b'.repeat(32), palette: 'moss' } as const;
const denied = Object.assign(new Error('Denied.'), { code: 'permission-denied' });
const settings: FriendSettings = { format: 1, enabled: true, deleted: false, selectedIds: [], epoch: 1, revision: 1, updatedAt: 1000 };

function client() {
  const app = initializeApp({ projectId: 'demo-play100' }, crypto.randomUUID());
  apps.push(app);
  return new FriendStore(firestore.getFirestore(app));
}
function invitation() {
  return { format: 1, ownerUid: 'bob', slot: 0, displayName: 'Bob', avatar,
    createdAt: firestore.Timestamp.now(), state: 'active', acceptedBy: null };
}
function snapshot(data: firestore.DocumentData | null): firestore.DocumentSnapshot {
  return { exists: () => data !== null, data: () => data ?? undefined } as firestore.DocumentSnapshot;
}
function transactionDouble(data: firestore.DocumentData | null) {
  const get = vi.fn<firestore.Transaction['get']>().mockResolvedValue(snapshot(data));
  const set = vi.fn<firestore.Transaction['set']>();
  const update = vi.fn<firestore.Transaction['update']>();
  const remove = vi.fn<firestore.Transaction['delete']>();
  // Only the public transaction methods are needed by these callbacks.
  const tx = { get, set, update, delete: remove } as unknown as firestore.Transaction;
  return { tx, get, set, update, remove };
}

afterEach(async () => {
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map(deleteApp));
});

describe('bounded invitation read recovery', () => {
  it('retries a denied server read once with the same ref and returns the unchanged preview shape', async () => {
    const store = client();
    const data = invitation();
    const retry = transactionDouble(data);
    vi.mocked(firestore.getDocFromServer).mockRejectedValue(denied);
    vi.mocked(firestore.runTransaction).mockImplementation((_db, operation) => operation(retry.tx));
    const preview = await store.previewInvite(token);
    expect(preview).toEqual({
      ownerUid: 'bob', displayName: 'Bob', avatar, createdAt: data.createdAt.toMillis(),
      expiresAt: data.createdAt.toMillis() + 7 * 86400000, lifetimeDays: 7, singleUse: true,
    });
    expect(firestore.getDocFromServer).toHaveBeenCalledOnce();
    expect(firestore.runTransaction).toHaveBeenCalledExactlyOnceWith(store.db, expect.any(Function), { maxAttempts: 1 });
    expect(retry.get).toHaveBeenCalledExactlyOnceWith(vi.mocked(firestore.getDocFromServer).mock.calls[0]?.[0]);
    expect(retry.set).not.toHaveBeenCalled();
    expect(retry.update).not.toHaveBeenCalled();
    expect(retry.remove).not.toHaveBeenCalled();
  });
  it('surfaces a second denial as the existing unavailable error without another retry', async () => {
    const store = client();
    vi.mocked(firestore.getDocFromServer).mockRejectedValue(denied);
    vi.mocked(firestore.runTransaction).mockRejectedValue(denied);
    await expect(store.previewInvite(token)).rejects.toMatchObject({
      code: 'invite-unavailable', message: 'This invite is no longer available.',
    });
    expect(firestore.runTransaction).toHaveBeenCalledOnce();
  });
  it.each(['unavailable', 'deadline-exceeded', 'unauthenticated', 'offline'])('does not retry %s server-read errors', async code => {
    const store = client();
    const cause = Object.assign(new Error('Read failed.'), { code });
    vi.mocked(firestore.getDocFromServer).mockRejectedValue(cause);
    await expect(store.previewInvite(token)).rejects.toBe(cause);
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });
  it('does not retry when the browser goes offline after the denied read', async () => {
    const store = client();
    vi.stubGlobal('navigator', { onLine: false });
    vi.mocked(firestore.getDocFromServer).mockRejectedValue(denied);
    await expect(store.previewInvite(token)).rejects.toMatchObject({ code: 'offline' });
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });
  it.each(['consumed', 'expired', 'missing'])('does not accept a %s retry result', async state => {
    const store = client();
    const data = state === 'missing' ? null : { ...invitation(),
      ...(state === 'consumed' ? { state, acceptedBy: 'alice' } : { createdAt: firestore.Timestamp.fromMillis(1) }) };
    const retry = transactionDouble(data);
    vi.mocked(firestore.getDocFromServer).mockRejectedValue(denied);
    vi.mocked(firestore.runTransaction).mockImplementation((_db, operation) => operation(retry.tx));
    await expect(store.previewInvite(token)).rejects.toMatchObject({ code: 'invite-unavailable' });
    expect(firestore.runTransaction).toHaveBeenCalledOnce();
  });
  it('keeps the self-acceptance check after a successful read retry', async () => {
    const store = client();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    vi.mocked(firestore.getDocFromServer).mockResolvedValueOnce(snapshot(null)).mockRejectedValue(denied);
    const retry = transactionDouble(invitation());
    vi.mocked(firestore.runTransaction).mockImplementation((_db, operation) => operation(retry.tx));
    await expect(store.acceptInvite('bob', token)).rejects.toMatchObject({ code: 'invalid' });
    expect(firestore.runTransaction).toHaveBeenCalledOnce();
    expect(retry.set).not.toHaveBeenCalled();
    expect(retry.update).not.toHaveBeenCalled();
  });
  it('never retries acceptance writes and uses read-only recovery for the denial recheck', async () => {
    const store = client();
    const data = invitation();
    vi.spyOn(store, 'settings').mockResolvedValue(settings);
    vi.mocked(firestore.getDocFromServer)
      .mockResolvedValueOnce(snapshot(null))
      .mockResolvedValueOnce(snapshot(data))
      .mockRejectedValue(denied);
    const write = transactionDouble(null);
    const retry = transactionDouble(data);
    vi.mocked(firestore.runTransaction)
      .mockImplementationOnce(async (_db, operation) => { await operation(write.tx); throw denied; })
      .mockImplementationOnce((_db, operation) => operation(retry.tx));
    await expect(store.acceptInvite('alice', token)).rejects.toMatchObject({
      code: 'unavailable', message: 'The invitation could not be accepted. Refresh the page, then try again.',
    });
    expect(firestore.runTransaction).toHaveBeenCalledTimes(2);
    expect(write.set).toHaveBeenCalledTimes(2);
    expect(write.update).toHaveBeenCalledOnce();
    expect(retry.get.mock.calls[0]?.[0].path).toBe(invitePath);
    expect(retry.set).not.toHaveBeenCalled();
    expect(retry.update).not.toHaveBeenCalled();
    expect(retry.remove).not.toHaveBeenCalled();
    expect(vi.mocked(firestore.runTransaction).mock.calls[1]?.[2]).toEqual({ maxAttempts: 1 });
  });
});

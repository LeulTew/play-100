import { deleteApp, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { afterEach, expect, it, vi } from 'vitest';
import { FriendShelfStore } from '../cloud/friend-shelf-store';
import * as lifecycle from '../cloud/account-lifecycle';
import { FriendStoreError } from './friend-types';
import { FriendShelfConsentError, friendShelfFailure } from './friend-shelf-types';
import { SyncWorkQueue } from './sync-retry';
import { createFriendWorkGeneration } from './friend-read-guard';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([undefined, {}, { onLine: true }, { onLine: false }])(
  'requires an explicit browser offline signal: %j',
  async (navigator) => {
    vi.stubGlobal('navigator', navigator);
    const failure = new Error('Network boundary failed');
    const activity = vi.spyOn(lifecycle, 'ensureAccountActivity').mockRejectedValue(failure);
    const app = initializeApp({ projectId: 'demo-play100' }, crypto.randomUUID());
    try {
      const store = new FriendShelfStore(getFirestore(app));
      if (navigator?.onLine === false) {
        await expect(store.initialize('owner')).rejects.toMatchObject({ code: 'offline' });
        expect(activity).not.toHaveBeenCalled();
      } else {
        await expect(store.initialize('owner')).rejects.toBe(failure);
        expect(activity).toHaveBeenCalledOnce();
      }
    } finally {
      await deleteApp(app);
    }
  },
);
it('keeps ordinary CAS conflicts retryable but requires explicit consent after a saving restart', () => {
  expect(friendShelfFailure(new FriendStoreError('conflict', 'Source advanced'))).toBe('transient');
  expect(friendShelfFailure(new FriendStoreError('offline', 'Reconnect'))).toBe('transient');
  expect(friendShelfFailure(new FriendShelfConsentError())).toBe('blocked');
  expect(friendShelfFailure({ code: 'permission-denied' })).toBe('blocked');
  expect(friendShelfFailure({ code: 'resource-exhausted' })).toBe('quota');
  expect(friendShelfFailure(new FriendStoreError('limit', 'Three generations active'))).toBe('quota');
});
it('uses the shared jittered queue without letting edits or Retry shorten a quota cooldown', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const task = vi
    .fn()
    .mockRejectedValueOnce(new FriendStoreError('conflict', 'Source advanced'))
    .mockRejectedValueOnce({ code: 'resource-exhausted' })
    .mockResolvedValue(undefined);
  const queue = new SyncWorkQueue(task, (cause) => queue.failed(friendShelfFailure(cause)));
  queue.request();
  await vi.advanceTimersByTimeAsync(0);
  expect(task).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(task).toHaveBeenCalledTimes(2);
  const due = queue.nextAttemptAt;
  queue.request(0, true);
  await queue.retry();
  expect(queue.nextAttemptAt).toBe(due);
  await vi.advanceTimersByTimeAsync(59999);
  expect(task).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(task).toHaveBeenCalledTimes(3);
  queue.dispose();
});
it('invalidates an in-flight publication lease synchronously rather than waiting for effect cleanup', () => {
  const scope = createFriendWorkGeneration();
  const lease = scope.next();
  expect(scope.current(lease)).toBe(true);
  scope.cancel();
  expect(scope.current(lease)).toBe(false);
  const newOwner = scope.next();
  expect(scope.current(newOwner)).toBe(true);
  expect(scope.current(lease)).toBe(false);
});

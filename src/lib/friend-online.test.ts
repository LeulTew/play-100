import { deleteApp, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as lifecycle from '../cloud/account-lifecycle';
import { FriendStore } from '../cloud/friend-store';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('friend changes require an explicit offline signal', () => {
  it.each([
    ['absent navigator', undefined, false],
    ['navigator without onLine', {}, false],
    ['online browser', { onLine: true }, false],
    ['offline browser', { onLine: false }, true],
  ] as const)('%s', async (_label, navigatorValue, offline) => {
    vi.stubGlobal('navigator', navigatorValue);
    const networkError = new Error('The network boundary reports its own failure.');
    const activity = vi.spyOn(lifecycle, 'ensureAccountActivity').mockRejectedValue(networkError);
    const app = initializeApp({ projectId: 'demo-play100' }, crypto.randomUUID());
    try {
      const store = new FriendStore(getFirestore(app));
      if (offline) {
        await expect(store.initialize('test-user')).rejects.toMatchObject({ code: 'offline' });
        expect(activity).not.toHaveBeenCalled();
      } else {
        await expect(store.initialize('test-user')).rejects.toBe(networkError);
        expect(activity).toHaveBeenCalledOnce();
      }
    } finally {
      await deleteApp(app);
    }
  });
});

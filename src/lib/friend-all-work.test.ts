import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import { closePersonalLibrary } from './personal-db';
import { parseFriendAllCooldown, readFriendAllCooldown, saveFriendAllCooldown } from './friend-all-work';
import { deleteScopedLibrary } from './scoped-library';

beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => undefined });
});
afterEach(() => {
  closePersonalLibrary();
  vi.unstubAllGlobals();
});
describe('account-bound durable All retry state', () => {
  it('survives a connection reload, stays isolated and is removed with the account cache', async () => {
    const scope = accountScope('all-retry');
    const other = accountScope('other');
    const cooldown = { version: 2 as const, epoch: 3, nextAttemptAt: Date.now() + 120_000 };
    await saveFriendAllCooldown(scope, cooldown);
    closePersonalLibrary();
    expect(await readFriendAllCooldown(scope)).toEqual(cooldown);
    expect(await readFriendAllCooldown(other)).toBeNull();
    await deleteScopedLibrary(scope);
    expect(await readFriendAllCooldown(scope)).toBeNull();
  });
  it('rejects malformed or guest state instead of silently resetting quota protection', async () => {
    expect(() => parseFriendAllCooldown({ version: 2, epoch: 1, nextAttemptAt: 'later' })).toThrow();
    expect(() => parseFriendAllCooldown({ version: 2, epoch: 1, nextAttemptAt: 0, privateNote: 'wrong' })).toThrow();
    await expect(saveFriendAllCooldown('guest', { version: 2, epoch: 1, nextAttemptAt: 1 })).rejects.toThrow();
  });
});

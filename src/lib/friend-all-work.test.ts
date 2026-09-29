import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import { closePersonalLibrary } from './personal-db';
import { readStoredValue as stored } from '../../tests/fixtures/device-store-inspection';
import { parseFriendAllCooldown, readFriendAllCooldown, saveFriendAllCooldown } from './friend-all-work';
import { accountJournal, deleteScopedLibrary, loadScopedLibrary, scopedWriter } from './scoped-library';

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
    const opened = await loadScopedLibrary(scope);
    await loadScopedLibrary(other);
    const journal = accountJournal(scopedWriter(opened));
    const cooldown = { version: 2 as const, epoch: 3, nextAttemptAt: Date.now() + 120_000 };
    await saveFriendAllCooldown(journal, cooldown);
    closePersonalLibrary();
    expect(await readFriendAllCooldown(journal)).toEqual(cooldown);
    expect(await readFriendAllCooldown(accountJournal(other))).toBeNull();
    await deleteScopedLibrary(scopedWriter(opened));
    expect(await stored(`friends-all-work:v2:${scope}`)).toBeUndefined();
    // The removed copy's writer can no longer read or save retry state, but clearing it stays harmless.
    await expect(readFriendAllCooldown(journal)).rejects.toThrow(/removed in another tab/);
    await expect(saveFriendAllCooldown(journal, cooldown)).rejects.toThrow(/removed in another tab/);
    await saveFriendAllCooldown(journal, null);
    expect(await stored(`friends-all-work:v2:${scope}`)).toBeUndefined();
  });
  it('rejects malformed or guest state instead of silently resetting quota protection', async () => {
    expect(() => parseFriendAllCooldown({ version: 2, epoch: 1, nextAttemptAt: 'later' })).toThrow();
    expect(() => parseFriendAllCooldown({ version: 2, epoch: 1, nextAttemptAt: 0, privateNote: 'wrong' })).toThrow();
    // Even a journal whose check allows everything cannot name the guest library.
    const guest = { scope: 'guest' as const, check: () => {} };
    await expect(saveFriendAllCooldown(guest, { version: 2, epoch: 1, nextAttemptAt: 1 })).rejects.toThrow(
      /automatic sharing scope is invalid/,
    );
  });
});

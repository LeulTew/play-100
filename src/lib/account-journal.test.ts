import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import type { LibraryScope } from './cloud-types';
import { accountWriterKey, closePersonalLibrary } from './personal-db';
import {
  accountJournal,
  deleteAccountCopy,
  deleteScopedLibrary,
  loadScopedLibrary,
  openScopedLibrary,
  removeDeletedAccountCopy,
  scopedWriter,
} from './scoped-library';
import type { AccountWriter } from './scoped-library';
import { updateFriendSelectionCache } from './friend-selection-cache';
import { friendShelfJournal } from './friend-shelf-selection-cache';
import { friendShelfSelectionKey } from './friend-shelf-selection';
import { readFriendAllCooldown, saveFriendAllCooldown } from './friend-all-work';
import { readStoredValue, writeStoredValue } from '../../tests/fixtures/device-store-inspection';

const scope = accountScope('journal-owner');
const selected = 'manual:journal-game';

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

const keys = (target: LibraryScope) => [
  `friends-selection:v1:${target}`,
  friendShelfSelectionKey(target),
  `friends-all-work:v2:${target}`,
];
/** Which of the account's three sharing journals the device database holds. */
async function journals(target: LibraryScope = scope) {
  const [selection, shelf, cooldown] = await Promise.all(keys(target).map((key) => readStoredValue(key)));
  return { selection: selection !== undefined, shelf: shelf !== undefined, cooldown: cooldown !== undefined };
}
const none = { selection: false, shelf: false, cooldown: false };
const all = { selection: true, shelf: true, cooldown: true };

/**
 * One tab's three journal writes for the copy it opened, as that tab starts them. Each runs only when released, so a
 * test can release them after another tab removes or reopens the copy: its transaction is then built after that change.
 */
function hold(writer: AccountWriter, stateRevision: number) {
  const journal = accountJournal(writer);
  return [
    () => updateFriendSelectionCache(journal, 1, [selected], undefined, stateRevision),
    () => friendShelfJournal.update(journal, 1, [selected], undefined, stateRevision),
    () => saveFriendAllCooldown(journal, { version: 2, epoch: 1, nextAttemptAt: 1 }),
  ];
}
const release = (writes: ReturnType<typeof hold>) =>
  Promise.all(
    writes.map((write) =>
      write().then(
        () => 'saved' as const,
        (error: Error) => error.name,
      ),
    ),
  );

describe("sharing journals follow their device copy's writer", () => {
  it('lets the writer of an opened copy start and use all three journals', async () => {
    const opened = await loadScopedLibrary(scope);
    expect(await release(hold(scopedWriter(opened), opened.state.revision))).toEqual(['saved', 'saved', 'saved']);
    expect(await journals()).toEqual(all);
    expect(await readFriendAllCooldown(accountJournal(scopedWriter(opened)))).toEqual({
      version: 2,
      epoch: 1,
      nextAttemptAt: 1,
    });
  });

  it('refuses writes another tab started, released after it removed the copy, and keeps no journal', async () => {
    const opened = await loadScopedLibrary(scope);
    const writer = scopedWriter(opened);
    await release(hold(writer, opened.state.revision));
    // Another tab started these with the same copy open; the removal completes before their transactions are built.
    const held = hold(writer, opened.state.revision);
    expect(await deleteScopedLibrary(writer)).toEqual({ complete: true });
    expect(await journals()).toEqual(none);
    expect(await release(held)).toEqual([
      'PersonalLibraryWriterRetiredError',
      'PersonalLibraryWriterRetiredError',
      'PersonalLibraryWriterRetiredError',
    ]);
    expect(await journals()).toEqual(none);
    // Clearing the retry state is only cleanup, which a removed copy still allows.
    await saveFriendAllCooldown(accountJournal(writer), null);
    expect(await journals()).toEqual(none);
  });

  it('keeps no journal whichever of a removal and a journal write starts its transaction first', async () => {
    const opened = await loadScopedLibrary(scope);
    const writer = scopedWriter(opened);
    const removal = deleteScopedLibrary(writer);
    const writes = release(hold(writer, opened.state.revision));
    expect(await removal).toEqual({ complete: true });
    await writes;
    expect(await journals()).toEqual(none);
  });

  it('keeps an older writer out of a copy explicitly reopened after its removal', async () => {
    const opened = await loadScopedLibrary(scope);
    const old = scopedWriter(opened);
    const held = hold(old, opened.state.revision);
    await deleteScopedLibrary(old);
    const reopened = await openScopedLibrary(scope);
    expect(reopened.writerGeneration).toBe(1);
    expect(await release(held)).toEqual([
      'PersonalLibraryWriterRetiredError',
      'PersonalLibraryWriterRetiredError',
      'PersonalLibraryWriterRetiredError',
    ]);
    expect(await journals()).toEqual(none);
    // The reopened copy's own writer starts its journals, and the older one can't even clear their retry state.
    expect(await release(hold(scopedWriter(reopened), reopened.state.revision))).toEqual(['saved', 'saved', 'saved']);
    await expect(saveFriendAllCooldown(accountJournal(old), null)).rejects.toThrow(/removed in another tab/);
    expect(await journals()).toEqual(all);
  });

  it('never starts a journal for a copy that was never opened', async () => {
    const never = accountScope('journal-never-opened');
    expect(await release(hold({ scope: never, generation: 0 }, 0))).toEqual([
      'PersonalLibraryWriterRetiredError',
      'PersonalLibraryWriterRetiredError',
      'PersonalLibraryWriterRetiredError',
    ]);
    expect(await journals(never)).toEqual(none);
  });

  it('removes journals an earlier release left behind when a removed copy is removed again', async () => {
    const opened = await loadScopedLibrary(scope);
    await deleteScopedLibrary(scopedWriter(opened));
    for (const key of keys(scope)) await writeStoredValue(key, { version: 1, leftover: true });
    expect(await journals()).toEqual(all);
    expect(await deleteScopedLibrary(scopedWriter(opened))).toEqual({ complete: true });
    expect(await journals()).toEqual(none);
    expect(await readStoredValue(accountWriterKey(scope))).toEqual({ version: 1, generation: 1, retired: true });
  });

  it('keeps journals, and lets held writes land, while the copy stays open', async () => {
    const opened = await loadScopedLibrary(scope);
    const held = hold(scopedWriter(opened), opened.state.revision);
    // Ordinary sign-out keeps the copy; its writer is not retired.
    expect(await release(held)).toEqual(['saved', 'saved', 'saved']);
    expect(await journals()).toEqual(all);
  });
});

// G10 SEC2 item 8: account deletion falls back to generation 0 when the copy did not open.
describe("a deleted account's device copy", () => {
  it('goes at the generation an earlier removal left, even when the reopened copy is unreadable', async () => {
    const opened = await loadScopedLibrary(scope);
    await deleteScopedLibrary(scopedWriter(opened));
    const reopened = await openScopedLibrary(scope);
    await release(hold(scopedWriter(reopened), reopened.state.revision));
    await writeStoredValue(scope, { broken: 'deliberately unreadable device copy' });
    // What account deletion used to do with no opened copy: the removal refuses the reopened generation.
    await expect(deleteScopedLibrary({ scope, generation: 0 })).rejects.toThrow(/removed in another tab/);
    expect(await deleteAccountCopy(scope)).toEqual({ complete: true });
    expect(await readStoredValue(scope)).toBeUndefined();
    expect(await journals()).toEqual(none);
    expect(await readStoredValue(accountWriterKey(scope))).toEqual({ version: 1, generation: 2, retired: true });
    // Again, as a retry would: nothing is left to remove, and nothing is reopened.
    expect(await deleteAccountCopy(scope)).toEqual({ complete: true });
    expect(await readStoredValue(accountWriterKey(scope))).toEqual({ version: 1, generation: 2, retired: true });
  });

  it('is reported with a retry when the device database refuses it, and the retry removes it', async () => {
    const opened = await loadScopedLibrary(scope);
    await release(hold(scopedWriter(opened), opened.state.revision));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Synthetic storage full', 'QuotaExceededError');
    });
    const removal = await removeDeletedAccountCopy(scope);
    put.mockRestore();
    if (removal.complete) throw new Error('The refused removal was reported as complete.');
    expect(logged).toHaveBeenCalledOnce();
    expect(await readStoredValue(scope)).toBeDefined();
    expect(await journals()).toEqual(all);
    expect(await removal.retry()).toEqual({ complete: true });
    expect(await readStoredValue(scope)).toBeUndefined();
    expect(await journals()).toEqual(none);
  });
  it('goes even when it was never opened on this device', async () => {
    expect(await deleteAccountCopy(scope)).toEqual({ complete: true });
    expect(await readStoredValue(scope)).toBeUndefined();
    expect(await readStoredValue(accountWriterKey(scope))).toEqual({ version: 1, generation: 1, retired: true });
  });
});

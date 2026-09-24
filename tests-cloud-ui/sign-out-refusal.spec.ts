import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { createAccount, emailFor, enableSync, readAccount, uidFor, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';

const unsynced = 'This device has unsynced changes. Save or export them before removing its copy. Ordinary Sign out keeps them.';
const unreadable = 'Your device library could not be opened or saved.';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

// Commits an unsynced account edit exactly as another open tab would.
async function otherTabEdit(page: Page, uid: string, id: string) {
  await page.evaluate(async ({ uid, id }) => {
    const path = '/src/lib/scoped-library.ts';
    const scoped: typeof import('../src/lib/scoped-library') = await import(path);
    await scoped.commitScopedAction(`account:demo-play100:${uid}`, { type: 'rate-game', score: 7, record: {
      id: `manual:${id}`, title: `Removal refusal ${id}`, year: null, source: 'manual', sourceId: id, sourceUrl: null, genre: null, studio: null, collectionRank: null,
    } });
  }, { uid, id });
}

// Intercepts a later read of this account copy: it either fails, or another tab's edit commits right after it.
async function interceptCopyRead(page: Page, uid: string, skip: number, outcome: 'fail' | 'change', id = 'intercepted') {
  await page.evaluate(async ({ uid, skip, outcome, id }) => {
    const path = '/src/lib/scoped-library.ts';
    const scoped: typeof import('../src/lib/scoped-library') = await import(path);
    const key = `account:demo-play100:${uid}`;
    const original = IDBObjectStore.prototype.get;
    let seen = 0;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      if (query !== key || seen++ < skip) return original.call(this, query);
      IDBObjectStore.prototype.get = original;
      if (outcome === 'fail') throw new DOMException('Synthetic account copy read failure', 'UnknownError');
      const request = original.call(this, query);
      // IndexedDB orders this write after the intercepted read and before any later read of the copy.
      void scoped.commitScopedAction(`account:demo-play100:${uid}`, { type: 'rate-game', score: 6, record: {
        id: `manual:${id}`, title: `Removal refusal ${id}`, year: null, source: 'manual', sourceId: id, sourceUrl: null, genre: null, studio: null, collectionRank: null,
      } });
      return request;
    };
  }, { uid, skip, outcome, id });
}

async function sharedRankingCount(page: Page) {
  return page.evaluate(async () => {
    const clientPath = '/src/cloud/firebase-client.ts';
    const storePath = '/src/cloud/friend-all-store.ts';
    const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
    const all: typeof import('../src/cloud/friend-all-store') = await import(storePath);
    const uid = client.cloudAuth.currentUser?.uid;
    if (!uid) throw new Error('The synthetic account is not signed in.');
    return (await new all.FriendAllStore(client.cloudDb).head(uid, 'ranking'))?.count ?? null;
  });
}

async function openRemoval(page: Page) {
  await page.getByRole('button', { name: "Sign out and remove this device's copy", exact: true }).click();
  const dialog = page.getByRole('dialog', { name: "Remove this device's account copy?", exact: true });
  await expect(dialog.getByRole('button', { name: 'Sign out and remove copy', exact: true })).toBeEnabled();
}

async function expectRefused(page: Page, email: string, uid: string, message: string, ids: string[]) {
  const dialog = page.getByRole('dialog', { name: "Remove this device's account copy?", exact: true });
  await expect(dialog.getByRole('alert')).toContainText(message);
  await dialog.getByRole('button', { name: 'Keep my data', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.account-heading')).toContainText(email);
  const kept = await readAccount(page, uid);
  for (const id of ids) expect(kept.state.records[`manual:${id}`]).toBeTruthy();
}

// No Retry is pressed: the still-signed-in lifetime must upload the unsynced edit and republish All sharing by itself.
async function expectLive(page: Page, uid: string, ranked: number) {
  await expect.poll(async () => (await readAccount(page, uid)).sync.dirty, { timeout: 30000 }).toBe(false);
  await expect(page.locator('.sync-panel .sync-state')).toHaveText('Saved online', { timeout: 30000 });
  await expect.poll(() => sharedRankingCount(page), { timeout: 30000 }).toBe(ranked);
}

async function connectedAccount(page: Page, request: APIRequestContext, prefix: string) {
  const email = emailFor(prefix);
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  expect(await sharedRankingCount(page)).toBe(0);
  return { email, uid };
}

test('a copy changed during or after the removal check is kept while sync and sharing continue, then a clean copy is removed', async ({ page, request }) => {
  test.setTimeout(150000);
  const { email, uid } = await connectedAccount(page, request, 'removal-changed');
  const guest = await readLibrary(page);

  await openRemoval(page);
  await page.evaluate(async () => { const path = '/src/lib/scoped-library.ts'; await import(path); });
  try {
    await page.context().setOffline(true);
    await otherTabEdit(page, uid, 'during');
    expect((await readAccount(page, uid)).sync.dirty).toBe(true);
    await page.getByRole('button', { name: 'Sign out and remove copy', exact: true }).click();
    await expectRefused(page, email, uid, unsynced, ['during']);
    expect((await readAccount(page, uid)).sync.dirty).toBe(true);
  } finally { await page.context().setOffline(false); }
  await expectLive(page, uid, 1);

  await openRemoval(page);
  await interceptCopyRead(page, uid, 0, 'change', 'after');
  await page.getByRole('button', { name: 'Sign out and remove copy', exact: true }).click();
  await expectRefused(page, email, uid, unsynced, ['during', 'after']);
  await expectLive(page, uid, 2);

  await openRemoval(page);
  await page.getByRole('button', { name: 'Sign out and remove copy', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4187/');
  await expect(readAccount(page, uid)).rejects.toThrow('missing');
  expect(await readLibrary(page)).toEqual(guest);
});

test('a copy that cannot be read before or after suspension is kept while sync and sharing continue', async ({ page, request }) => {
  test.setTimeout(150000);
  const { email, uid } = await connectedAccount(page, request, 'removal-unreadable');

  await openRemoval(page);
  await interceptCopyRead(page, uid, 0, 'fail');
  await page.getByRole('button', { name: 'Sign out and remove copy', exact: true }).click();
  await expectRefused(page, email, uid, unreadable, []);
  await otherTabEdit(page, uid, 'first');
  await expectLive(page, uid, 1);

  await openRemoval(page);
  await interceptCopyRead(page, uid, 1, 'fail');
  await page.getByRole('button', { name: 'Sign out and remove copy', exact: true }).click();
  await expectRefused(page, email, uid, unreadable, ['first']);
  await otherTabEdit(page, uid, 'second');
  await expectLive(page, uid, 2);
});

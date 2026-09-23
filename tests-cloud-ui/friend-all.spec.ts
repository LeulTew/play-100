import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createAccount, emailFor, enableSync, password, readAccount, signIn, uidFor, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

declare global {
  interface Window {
    allReadCounts?: { pages: number; exact: number; maxPage: number; maxExact: number; legacyFull: number };
    allDeleteCalls?: { ranking: number; shelf: number };
  }
}

async function sdk(page: Page, action: 'controls' | 'heads' | 'legacy-off' | 'old-stop') {
  return page.evaluate(async action => {
    const clientPath = '/src/cloud/firebase-client.ts';
    const storePath = '/src/cloud/friend-all-store.ts';
    const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
    const module: typeof import('../src/cloud/friend-all-store') = await import(storePath);
    const uid = client.cloudAuth.currentUser?.uid;
    if (!uid) throw new Error('Synthetic fixture is not signed in.');
    const store = new module.FriendAllStore(client.cloudDb);
    if (action === 'controls') return store.controls(uid);
    if (action === 'heads') return { games: await store.head(uid, 'games'), ranking: await store.head(uid, 'ranking') };
    const friendPath = '/src/cloud/friend-store.ts';
    const friends: typeof import('../src/cloud/friend-store') = await import(friendPath);
    const legacy = new friends.FriendStore(client.cloudDb);
    const settings = await legacy.settings(uid) ?? await legacy.initialize(uid);
    if (action === 'old-stop') await legacy.saveSettings(uid, { enabled: false, selectedIds: [] }, settings);
    return store.controls(uid);
  }, action);
}
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('fresh mounted account defaults All without a sharing click or guest adoption, then follows new saved games and Stop', async ({ page, request }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?game=red-dead-redemption-2');
  await page.getByRole('dialog').getByRole('button', { name: 'Play later', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const guest = await readLibrary(page);
  expect(guest.records['red-dead-redemption-2']).toBeTruthy();
  const email = emailFor('all-default');
  await createAccount(page, email); await verifyEmail(page, request, email);
  await expect(page.getByRole('button', { name: 'Share all with friends', exact: true })).toHaveCount(0);
  await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  await expect(page.locator('.friend-sharing-summary')).toContainText('Sharing all saved games and rankings with friends.');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  expect((await readAccount(page, uid)).state.records).toEqual({});
  expect((await readLibrary(page)).records).toEqual(guest.records);
  const controls = await sdk(page, 'controls');
  expect(controls).toMatchObject({ policy: { enabled: true, origin: 'default' }, ranking: { enabled: true, selectedIds: [] }, shelf: { enabled: true, selectedIds: [] } });
  await page.goto('/discover?q=Kingdomcome&catalogs=off');
  const card = page.locator('[data-catalog-id="wikidata:Q15408545"]');
  await card.getByRole('button', { name: 'Save Kingdom Come: Deliverance', exact: true }).click();
  await page.goto('/my-games');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  expect(await sdk(page, 'heads')).toMatchObject({ games: { status: 'ready', count: 1 }, ranking: { status: 'ready', count: 0 } });
  expect((await readAccount(page, uid)).state.ranking).toEqual([]);
  await page.screenshot({ path: info.outputPath('all-summary.png') });
  await page.getByRole('button', { name: 'Stop friend sharing', exact: true }).click();
  await expect(page.locator('.friend-sharing-summary')).toContainText('Automatic friend sharing is off.');
  await page.reload();
  await expect(page.locator('.friend-sharing-summary')).toContainText('Automatic friend sharing is off.');
  expect(await sdk(page, 'controls')).toMatchObject({ policy: { enabled: false, origin: 'explicit' } });
  expect((await readAccount(page, uid)).state.records['wikidata:Q15408545']).toBeTruthy();
  expect(errors).toEqual([]);
});

test('legacy off stays off until one inline Share all action and old-client Stop stays authoritative', async ({ page, request }) => {
  const email = emailFor('all-legacy');
  await createAccount(page, email); await verifyEmail(page, request, email);
  await sdk(page, 'legacy-off');
  await enableSync(page, 'empty');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Your previous sharing choice is unchanged.');
  expect(await sdk(page, 'controls')).toMatchObject({ policy: null, ranking: { enabled: false } });
  await page.locator('#page-main').getByRole('button', { name: 'Friends', exact: true }).click();
  await page.getByRole('button', { name: 'Share all with friends', exact: true }).click();
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  expect(await sdk(page, 'controls')).toMatchObject({ policy: { enabled: true, origin: 'explicit' }, ranking: { enabled: true }, shelf: { enabled: true } });
  await sdk(page, 'old-stop');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Your previous sharing choice is unchanged.');
  await page.reload();
  await expect(page.locator('.friend-sharing-summary')).toContainText('Your previous sharing choice is unchanged.');
  expect(await sdk(page, 'controls')).toMatchObject({ ranking: { enabled: false } });
});

test('quota progress survives reload across both scopes without claiming all sharing is Saved', async ({ page, request }) => {
  const email = emailFor('all-quota');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  const uid = await uidFor(request, email);
  await page.evaluate(async uid => {
    const url = performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname === '/src/cloud/friend-all-store.ts');
    if (!url) throw new Error('Loaded All store missing.');
    const module: typeof import('../src/cloud/friend-all-store') = await import(url);
    const original = module.FriendAllStore.prototype.publish;
    let fail = true;
    module.FriendAllStore.prototype.publish = function(owner, kind, input, policy, source, isCurrent, progress) {
      return original.call(this, owner, kind, input, policy, source, isCurrent, value => {
        progress?.(value);
        if (kind === 'ranking' && fail && value.applied === 50 && !value.ready) {
          fail = false; throw Object.assign(new Error('Synthetic quota after50 confirmed changes'), { code: 'resource-exhausted' });
        }
      });
    };
    const path = '/src/lib/scoped-library.ts'; const source: typeof import('../src/lib/scoped-library') = await import(path);
    await source.commitScopedAction(`account:demo-play100:${uid}`, { type: 'add-ranking', records: Array.from({ length: 52 }, (_, index) => ({
      id: `manual:quota-${index + 1}`, title: `Quota fixture ${index + 1}`, source: 'manual' as const, sourceId: `quota-${index + 1}`, sourceUrl: null,
      year: null, studio: null, genre: null, collectionRank: null,
    })) });
  }, uid);
  await expect(page.locator('.friend-sharing-summary')).toContainText('Continuing later', { timeout: 30000 });
  await expect(page.locator('.friend-sharing-summary')).toContainText('Saved games: 52 ready');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Rankings: 50 / 52 changes confirmed');
  await expect(page.locator('.friend-sharing-summary')).not.toContainText('Up to date');
  expect((await readAccount(page, uid)).sync.dirty).toBe(false);
  await page.clock.install();
  await page.reload();
  await expect(page.locator('.friend-sharing-summary')).toContainText('Continuing later');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Rankings: 50 / 52 changes confirmed');
  expect(await sdk(page, 'heads')).toMatchObject({ games: { status: 'ready', count: 52 }, ranking: { status: 'updating' } });
  await page.clock.fastForward(65_000);
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  expect(await sdk(page, 'heads')).toMatchObject({ games: { status: 'ready', count: 52 }, ranking: { status: 'ready', count: 52 } });
  expect((await readAccount(page, uid)).state.ranking).toHaveLength(52);
});

test('friends read paginated All data, compare exact tray games, receive score updates and revoke an unsaved preview on old-client Stop', async ({ page, request, browser, viewport, isMobile }, info) => {
  test.setTimeout(120000);
  const ownerEmail = emailFor('all-owner');
  await createAccount(page, ownerEmail); await verifyEmail(page, request, ownerEmail); await enableSync(page, 'empty');
  await page.getByLabel('Name', { exact: true }).fill('All owner');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  const ownerUid = await uidFor(request, ownerEmail);
  await page.evaluate(async uid => {
    const libraryPath = '/src/lib/scoped-library.ts';
    const source: typeof import('../src/lib/scoped-library') = await import(libraryPath);
    const records = Array.from({ length: 205 }, (_, index) => ({ id: `manual:all-${index + 1}`, title: `All fixture ${String(index + 1).padStart(3, '0')}`, year: 2020,
      source: 'manual' as const, sourceId: `all-${index + 1}`, sourceUrl: null, collectionRank: null, genre: null, studio: null }));
    const scope = `account:demo-play100:${uid}` as const;
    await source.commitScopedAction(scope, { type: 'add-ranking', records });
    await source.commitScopedAction(scope, { type: 'edit-ranking', id: records[0]!.id, score: 8.2, note: 'Owner-only note must never be shared.' });
  }, ownerUid);
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  expect(await sdk(page, 'heads')).toMatchObject({ games: { count: 205 }, ranking: { count: 205 } });
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
  try {
    const friend = await context.newPage(); const friendEmail = emailFor('all-viewer');
    const pageErrors: string[] = []; friend.on('pageerror', error => pageErrors.push(error.message));
    await createAccount(friend, friendEmail); await verifyEmail(friend, request, friendEmail); await enableSync(friend, 'empty');
    await expect(friend.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
    const friendUid = await uidFor(request, friendEmail);
    await page.goto('/friends'); await page.getByRole('button', { name: 'Invite someone', exact: true }).click();
    const link = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await friend.goto(link); await friend.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(friend.getByRole('heading', { name: "You're connected", exact: true })).toBeVisible();
    await friend.goto(`/friends/${ownerUid}`);
    await expect(friend.locator('.friend-shelf-grid > li')).toHaveCount(25);
    await expect(friend.locator('.friend-ranking-list > li')).toHaveCount(25);
    expect(await friend.locator('#page-main').innerText()).not.toContain('Owner-only note');
    await friend.getByRole('button', { name: 'Load next 25 shared games', exact: true }).click();
    await expect(friend.locator('.friend-shelf-grid > li')).toHaveCount(50);
    const first = friend.locator('.friend-shelf-grid > li').filter({ hasText: 'All fixture 001' });
    await first.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(first.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
    await first.getByRole('button', { name: 'Pin All fixture 001', exact: true }).click();
    await friend.getByRole('button', { name: 'Compare rankings', exact: true }).click();
    await expect(friend.locator('.compare-freshness')).toContainText('25 / 205 rankings loaded');
    await expect(friend.locator('.friend-compare-page')).toContainText('Unknown games in common.');
    await friend.evaluate(async () => {
      const resources = performance.getEntriesByType('resource').map(entry => entry.name);
      const url = resources.find(value => new URL(value).pathname === '/src/cloud/friend-all-store.ts');
      const legacyUrl = resources.find(value => new URL(value).pathname === '/src/cloud/friend-store.ts');
      if (!url || !legacyUrl) throw new Error('Loaded comparison stores are missing.');
      const module: typeof import('../src/cloud/friend-all-store') = await import(url);
      const legacy: typeof import('../src/cloud/friend-store') = await import(legacyUrl);
      const counts = { pages: 0, exact: 0, maxPage: 0, maxExact: 0, legacyFull: 0 }; window.allReadCounts = counts;
      const exact = module.FriendAllStore.prototype.exact; const page = module.FriendAllStore.prototype.page; const full = legacy.FriendStore.prototype.ranking;
      module.FriendAllStore.prototype.exact = async function(uid, kind, ids) { counts.exact += 1; counts.maxExact = Math.max(counts.maxExact, ids.length); return exact.call(this, uid, kind, ids); };
      module.FriendAllStore.prototype.page = async function(uid, kind, cursor, revision) { counts.pages += 1; const result = await page.call(this, uid, kind, cursor, revision); counts.maxPage = Math.max(counts.maxPage, result.entries.length); return result; };
      legacy.FriendStore.prototype.ranking = async function(uid) { counts.legacyFull += 1; return full.call(this, uid); };
    });
    await friend.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true }).click();
    await friend.getByRole('dialog').getByRole('button', { name: 'Choose friends', exact: true }).click();
    await expect(friend.locator('.compare-freshness')).toContainText('1 chosen game checked');
    await expect(friend.locator('.friend-matrix tbody tr')).toHaveCount(1);
    await expect(friend.locator('.friend-matrix tbody')).toContainText('8.2');
    const counts = await friend.evaluate(() => window.allReadCounts);
    expect(counts?.exact).toBeGreaterThan(0); expect(counts?.maxExact).toBe(1); expect(counts?.legacyFull).toBe(0);
    expect(counts?.maxPage).toBeLessThanOrEqual(25);
    await page.evaluate(async uid => {
      const path = '/src/lib/scoped-library.ts'; const source: typeof import('../src/lib/scoped-library') = await import(path);
      await source.commitScopedAction(`account:demo-play100:${uid}`, { type: 'edit-ranking', id: 'manual:all-1', score: 7.4 });
    }, ownerUid);
    await expect(friend.locator('.friend-matrix tbody')).toContainText('7.4', { timeout: 30000 });
    await expect(friend.locator('.friend-matrix tbody')).not.toContainText('8.2');
    expect((await new AxeBuilder({ page: friend }).include('.friend-compare-page').analyze()).violations).toEqual([]);
    expect(await friend.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await friend.screenshot({ path: info.outputPath('all-comparison.png') });
    await friend.goto(`/friends/${ownerUid}`);
    await friend.locator('.friend-shelf-grid > li').filter({ hasText: 'All fixture 002' }).getByRole('button', { name: 'All fixture 002', exact: true }).click();
    await expect(friend.getByRole('dialog')).toContainText('All fixture 002');
    await sdk(page, 'old-stop');
    await expect(friend.getByRole('dialog')).toHaveCount(0);
    await expect(friend.locator('.friend-shelf-grid > li')).toHaveCount(0);
    await expect(friend.locator('.friend-ranking-list > li')).toHaveCount(0);
    await expect(friend.getByRole('heading', { name: 'All owner', exact: true })).toBeVisible();
    expect((await readAccount(friend, friendUid)).state.records['manual:all-1']).toBeTruthy();
    expect((await readAccount(friend, friendUid)).state.records['manual:all-2']).toBeUndefined();
    expect(pageErrors).toEqual([]);
  } finally { await context.close(); }
});

test('an old private write is denied atomically while durable local edits survive and the refreshed current client resumes', async ({ page, request }) => {
  const email = emailFor('all-old-writer');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  const uid = await uidFor(request, email);
  const before = await sdk(page, 'heads');
  let stripped = 0;
  await page.route('**/*:commit?*', async route => {
    const value: unknown = route.request().postDataJSON();
    if (!value || typeof value !== 'object' || !('writes' in value) || !Array.isArray(value.writes)) { await route.continue(); return; }
    const documentName = (write: unknown) => {
      if (!write || typeof write !== 'object' || !('update' in write) || !write.update || typeof write.update !== 'object' || !('name' in write.update)) return '';
      return typeof write.update.name === 'string' ? write.update.name : '';
    };
    if (value.writes.some(write => documentName(write).includes('/syncHeads/')) && value.writes.some(write => documentName(write).includes('/friendAllHeads/'))) {
      stripped += 1;
      await route.continue({ postData: JSON.stringify({ ...value, writes: value.writes.filter(write => !documentName(write).includes('/friendAllHeads/')) }) });
    } else await route.continue();
  });
  await page.evaluate(async uid => {
    const path = '/src/lib/scoped-library.ts'; const source: typeof import('../src/lib/scoped-library') = await import(path);
    await source.commitScopedAction(`account:demo-play100:${uid}`, { type: 'rate-game', record: { id: 'manual:pending-old', title: 'Durable old-writer edit', year: null, source: 'manual', sourceId: 'pending-old', sourceUrl: null, genre: null, studio: null, collectionRank: null }, score: 8.5 });
  }, uid);
  await expect(page.locator('.sync-panel [role="alert"]')).toContainText('did not authorize', { timeout: 30000 });
  expect(stripped).toBeGreaterThan(0);
  expect((await readAccount(page, uid)).sync.dirty).toBe(true);
  expect((await readAccount(page, uid)).state.ranking[0]?.score).toBe(8.5);
  expect(await sdk(page, 'heads')).toEqual(before);
  await expect(page.locator('.sync-panel .sync-state')).not.toHaveText('Saved online');
  await page.unroute('**/*:commit?*');
  await page.reload();
  await expect(page.locator('.sync-panel .sync-state')).toHaveText('Saved online', { timeout: 30000 });
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  expect((await readAccount(page, uid)).sync.dirty).toBe(false);
  expect((await readAccount(page, uid)).state.ranking[0]?.score).toBe(8.5);
  expect(await sdk(page, 'heads')).toMatchObject({ games: { count: 1 }, ranking: { count: 1 } });
});

test('All export and reversible then full deletion retain the device copy and require fresh Auth before re-enabling', async ({ page, request }) => {
  test.setTimeout(120000);
  const email = emailFor('all-delete');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  await page.evaluate(async uid => {
    const path = '/src/lib/scoped-library.ts'; const source: typeof import('../src/lib/scoped-library') = await import(path);
    await source.commitScopedAction(`account:demo-play100:${uid}`, { type: 'rate-game', record: { id: 'manual:all-delete', title: 'Retained account copy', year: null, source: 'manual', sourceId: 'all-delete', sourceUrl: null, genre: null, studio: null, collectionRank: null }, score: 7.5 });
  }, uid);
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  await page.locator('.account-backups > summary').click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export account data', exact: true }).click();
  const file = await (await waiting).path();
  if (!file) throw new Error('Actual All account export missing.');
  const exported = JSON.parse(await readFile(file, 'utf8'));
  expect(exported.friends.automaticSharing.policy.enabled).toBe(true);
  expect(exported.friends.automaticSharing.views).toHaveLength(2);
  expect(exported.friends.automaticSharing.views.every((view: { head: { count: number; status: string } }) => view.head.count === 1 && view.head.status === 'ready')).toBe(true);
  await page.evaluate(async () => {
    const loaded = (pathname: string) => {
      const value = performance.getEntriesByType('resource').map(entry => entry.name).findLast(value => new URL(value).pathname === pathname);
      if (!value) throw new Error('Loaded cleanup fixture dependency is missing.');
      return value;
    };
    const friendsPath = loaded('/src/cloud/friend-store.ts'); const shelfPath = loaded('/src/cloud/friend-shelf-store.ts');
    const friends: typeof import('../src/cloud/friend-store') = await import(friendsPath);
    const shelf: typeof import('../src/cloud/friend-shelf-store') = await import(shelfPath);
    const rankSave = friends.FriendStore.prototype.saveSettings; const shelfSave = shelf.FriendShelfStore.prototype.saveConfig;
    const counts = { ranking: 0, shelf: 0 }; window.allDeleteCalls = counts;
    friends.FriendStore.prototype.saveSettings = function(...args) { counts.ranking += 1; return rankSave.apply(this, args); };
    shelf.FriendShelfStore.prototype.saveConfig = function(...args) { counts.shelf += 1; return shelfSave.apply(this, args); };
  });
  await page.locator('.account-danger > summary').click();
  await page.getByRole('button', { name: 'Delete online copy', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.allDeleteCalls)).toEqual({ ranking: 0, shelf: 0 });
  await expect(page.getByRole('status').filter({ hasText: 'Your online copy was deleted. The copy on this device is still here.' })).toBeVisible();
  expect(await sdk(page, 'heads')).toEqual({ games: null, ranking: null });
  expect((await readAccount(page, uid)).state.records['manual:all-delete']).toBeTruthy();
  await page.locator('input[name="connection-copy"][value="cached"]').check();
  await page.getByRole('button', { name: 'Agree & enable', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Sign out and sign in again' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, email);
  await expect(page.locator('input[name="connection-copy"][value="cached"]')).toBeVisible();
  await enableSync(page, 'cached');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Automatic friend sharing is off.');
  await page.getByRole('button', { name: 'Share all with friends', exact: true }).click();
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  expect(await sdk(page, 'heads')).toMatchObject({ games: { count: 1 }, ranking: { count: 1 } });
  await page.locator('.account-danger > summary').click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4187/');
  await expect(readAccount(page, uid)).rejects.toThrow('missing');
  expect((await readLibrary(page)).records).toEqual({});
});

test('interrupted online-copy cleanup resumes after private deletion without dropping the retained account copy', async ({ page, request }) => {
  const email = emailFor('all-cleanup-retry');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  await page.evaluate(async uid => {
    const path = '/src/lib/scoped-library.ts'; const source: typeof import('../src/lib/scoped-library') = await import(path);
    await source.commitScopedAction(`account:demo-play100:${uid}`, { type: 'rate-game', record: { id: 'manual:cleanup', title: 'Cleanup recovery fixture', year: null, source: 'manual', sourceId: 'cleanup', sourceUrl: null, genre: null, studio: null, collectionRank: null }, score: 7.5 });
  }, uid);
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).findLast(value => new URL(value).pathname === '/src/cloud/friend-all-store.ts');
    if (!path) throw new Error('Loaded All store is missing.');
    const all: typeof import('../src/cloud/friend-all-store') = await import(path);
    const cleanup = all.FriendAllStore.prototype.cleanupPage; let fail = true;
    all.FriendAllStore.prototype.cleanupPage = function(...args) {
      if (fail) { fail = false; return Promise.reject(new Error('Synthetic resumable All cleanup interruption')); }
      return cleanup.apply(this, args);
    };
  });
  await page.locator('.account-danger > summary').click();
  await page.getByRole('button', { name: 'Delete online copy', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.locator('.sync-panel [role="alert"]')).toContainText('Synthetic resumable All cleanup interruption');
  await expect(page.getByRole('status').filter({ hasText: 'Your online copy was deleted. The copy on this device is still here.' })).toHaveCount(0);
  expect((await readAccount(page, uid)).state.records['manual:cleanup']).toBeTruthy();
  await page.locator('.account-danger > summary').click();
  await page.getByRole('button', { name: 'Delete online copy', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Your online copy was deleted. The copy on this device is still here.' })).toBeVisible();
  expect(await sdk(page, 'heads')).toEqual({ games: null, ranking: null });
  expect((await readAccount(page, uid)).state.records['manual:cleanup']).toBeTruthy();
});

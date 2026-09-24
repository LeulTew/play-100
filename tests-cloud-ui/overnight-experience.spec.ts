import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, emailFor, enableSync, password, readAccount, signIn, uidFor, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';

const kcd = 'wikidata:Q15408545';
const title = 'Kingdom Come: Deliverance';
const card = (page: Page, id = kcd) => page.locator(`[data-catalog-id="${id}"]`);
const workspace = (page: Page) => page.locator('.my-games-editor:visible');
const tab = (page: Page, label: string) => page.getByRole('navigation', { name: 'My games views', exact: true }).getByRole('button', { name: new RegExp(`^${label}\\b`) });
const row = (page: Page, id = kcd) => workspace(page).locator(`[data-record-id="${id}"]`);
declare global {
  interface Window { shelfReadGate?: { calls: number; fail: () => void } }
}
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function saveCatalogGame(page: Page) {
  await page.goto('/discover?q=Kingdomcome&catalogs=off');
  await expect(card(page).getByRole('button', { name: title, exact: true })).toBeVisible();
  await card(page).getByRole('button', { name: `Add to My games: ${title}`, exact: true }).click();
  await expect(card(page).getByRole('button', { name: `In My games: ${title}`, exact: true })).toBeDisabled();
}
async function account(page: Page, request: APIRequestContext, prefix: string, name: string, choice: 'guest' | 'empty' = 'empty') {
  const email = emailFor(prefix);
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, choice);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Name saved.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shared games: off', exact: true })).toBeVisible();
  return { email, uid: await uidFor(request, email) };
}
async function connect(owner: Page, friend: Page) {
  await owner.goto('/friends');
  await owner.getByRole('button', { name: 'Invite someone', exact: true }).click();
  const link = await owner.getByLabel('Invitation link', { exact: true }).inputValue();
  await owner.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await friend.goto(link);
  await friend.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(friend.getByRole('heading', { name: "You're connected", exact: true })).toBeVisible();
}
async function shareShelf(owner: Page, names: string[]) {
  await owner.goto('/friends/sharing/games');
  for (const name of names) await owner.locator('.friend-shelf-selection > li').filter({ hasText: name }).locator('input').check();
  await owner.getByRole('button', { name: 'Preview shared games', exact: true }).click();
  const preview = owner.getByRole('dialog');
  for (const name of names) await expect(preview).toContainText(name);
  await preview.getByRole('button', { name: /^(Share these games|Update shared games)$/ }).click();
  await expect(preview).toHaveCount(0);
  await expect(owner.locator('.friend-shelf-editor .friend-shelf-heading [role="status"]')).toHaveText('saved', { timeout: 30000 });
}
async function refreshShelf(page: Page) {
  const button = page.getByRole('button', { name: 'Refresh shared games', exact: true });
  if (await button.count()) await button.click();
}
async function compareFromTray(page: Page) {
  // Away from The 100 the tray is a compact chip; its sheet's Choose friends action starts Compare.
  await page.getByRole('complementary', { name: 'Pinned games for comparison', exact: true }).locator('.compare-tray-expand').click();
  await page.getByRole('dialog', { name: 'Compare tray', exact: true }).getByRole('button', { name: 'Choose friends', exact: true }).click();
}
async function geometryAndAxe(page: Page, selector: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const violations = (await new AxeBuilder({ page }).include(selector).analyze()).violations;
  expect(violations).toEqual([]);
}

test('the real cold catalog is image-led, finds compact aliases without providers, and retains public detail URLs', async ({ page }, testInfo) => {
  const api: string[] = []; const images: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/catalog')) api.push(request.url());
    if (request.url().includes('/images/discovery/')) images.push(request.url());
  });
  await page.route('**/api/catalog?**', route => route.fulfill({ status: 503, json: { error: 'Synthetic provider outage.' }, headers: { 'Cache-Control': 'no-store' } }));
  await page.goto('/discover?catalogs=off');
  await expect(page.locator('[data-catalog-id]')).toHaveCount(24);
  // 810 snapshot records; the 65 that resolve to The 100 open their original entries only with Include The 100.
  await expect(page.locator('.discovery-results-heading')).toContainText('1–24 of 745 catalog games');
  await expect(page.locator('.discovery-card-art img')).toHaveCount(24);
  await expect.poll(() => page.locator('.discovery-card-art img').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(new Set(images).size).toBeLessThanOrEqual(24);
  expect(api).toEqual([]);
  expect((await readLibrary(page)).records).toEqual({});
  await geometryAndAxe(page, '.discovery-page');
  await page.screenshot({ path: testInfo.outputPath('discovery-real-catalog.png') });
  await page.getByLabel('Find a game', { exact: true }).fill('Kingdomcome');
  await expect(card(page).getByRole('button', { name: title, exact: true })).toBeVisible();
  await expect(page.locator('[data-catalog-id]').first()).toHaveAttribute('data-catalog-id', kcd);
  await card(page).locator('summary').click();
  await expect(card(page).getByRole('link', { name: 'Image source', exact: true })).toHaveAttribute('href', /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  await expect(card(page).getByRole('link', { name: 'Public domain', exact: true })).toHaveAttribute('href', 'https://creativecommons.org/publicdomain/mark/1.0/');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption('wikidata');
  const original = page.url();
  await card(page).getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(title);
  expect(new URL(page.url()).searchParams.get('source')).toBe('wikidata');
  expect(new URL(page.url()).searchParams.get('view')).toBe('list');
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText(title);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page).toHaveURL(original);
  expect(api).toEqual([]);
  await page.getByLabel('Find a game', { exact: true }).fill('KCD1');
  await expect(card(page)).toBeVisible();
  await page.reload(); await expect(card(page)).toBeVisible();
  expect((await readLibrary(page)).ranking).toEqual([]);
});

test('restricted storage and a failed online fallback never hide valid seeded matches', async ({ page, browser, viewport, isMobile }) => {
  const restricted = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
  try {
    await restricted.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Synthetic denied storage', 'SecurityError'); } });
      IDBFactory.prototype.open = () => { throw new DOMException('Synthetic denied database', 'SecurityError'); };
    });
    const fresh = await restricted.newPage();
    await fresh.route('**/api/catalog?**', route => route.abort('internetdisconnected'));
    await fresh.goto('/discover?catalogs=off&q=Kingdomcome');
    await expect(card(fresh).getByRole('button', { name: title, exact: true })).toBeVisible();
    await expect(fresh.locator('.discovery-results-heading')).toContainText('catalog match');
    await fresh.getByLabel('Find a game', { exact: true }).fill('KCD');
    await expect(card(fresh)).toBeVisible();
    // Also match the emulator Firestore endpoint and the development-server module, not only production names.
    expect(await fresh.evaluate(() => performance.getEntriesByType('resource').some(entry => /identitytoolkit|firestore\.googleapis|:8188\/|OnlineController(?:-[^/]+\.js|\.tsx)/.test(entry.name)))).toBe(false);
  } finally { await restricted.close(); }
  await page.route('**/api/catalog?**', route => route.fulfill({
    status: new URL(route.request().url()).searchParams.get('source') === 'wikidata' ? 429 : 503,
    json: { error: 'Synthetic temporary provider failure.' }, headers: { 'Retry-After': '3', 'Cache-Control': 'no-store' },
  }));
  await page.goto('/discover?q=Kingdomcome');
  await expect(card(page)).toBeVisible();
  await expect(page.locator('.discovery-source-error').first()).toBeVisible();
  await expect(card(page).getByRole('button', { name: `Add to My games: ${title}`, exact: true })).toBeEnabled();
  await card(page).getByRole('button', { name: `Add to My games: ${title}`, exact: true }).click();
  await expect(card(page).getByRole('button', { name: `In My games: ${title}`, exact: true })).toBeDisabled();
  expect((await readLibrary(page)).records[kcd]?.title).toBe(title);
  await page.reload(); await expect(card(page)).toBeVisible();
});

test('pinning and deliberate drag are UI-only, capped at six, persistent and safe above mobile navigation', async ({ page, isMobile }, testInfo) => {
  await page.goto('/discover?catalogs=off');
  await expect(page.locator('[data-catalog-id]')).toHaveCount(24);
  const ids = await page.locator('[data-catalog-id]').evaluateAll(elements => elements.slice(0, 7).map(element => element.getAttribute('data-catalog-id')!));
  if (!isMobile) {
    const handle = card(page, ids[0]!).locator('.compare-drag-handle');
    await handle.scrollIntoViewIfNeeded();
    const start = await handle.boundingBox(); if (!start) throw new Error('The real drag handle is not laid out.');
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 14, start.y + start.height / 2 + 8, { steps: 6 });
    const dock = page.getByRole('complementary', { name: 'Pinned games for comparison', exact: true });
    await expect(dock).toContainText('Drop to pin');
    const target = await dock.boundingBox(); if (!target) throw new Error('The real tray drop target is not laid out.');
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(card(page, ids[0]!).getByRole('button', { name: /^Pinned for comparison: / })).toBeDisabled();
  } else {
    // 92187ea removed the redundant drag grip from coarse-pointer layout and focus; touch pins with the toggle.
    await expect(card(page, ids[0]!).locator('.compare-drag-handle')).toBeHidden();
    await card(page, ids[0]!).getByRole('button', { name: /^Pin for comparison: / }).click();
  }
  for (const id of ids.slice(1, 6)) {
    const button = card(page, id).getByRole('button', { name: /^Pin for comparison: / });
    await button.focus(); await button.press('Enter');
  }
  await card(page, ids[6]!).getByRole('button', { name: /^Pin for comparison: / }).click();
  // The closed tray sheet also renders the dismissible message; assert the visible dock copy.
  await expect(page.getByRole('complementary', { name: 'Pinned games for comparison', exact: true }).locator('.compare-tray-error')).toContainText('six games');
  expect((await readLibrary(page)).records).toEqual({});
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Compare tray, 6 games', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Compare tray, 6 games', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.compare-tray-games > li')).toHaveCount(6);
  await page.getByRole('dialog').getByRole('button', { name: /^Unpin / }).first().click();
  await expect(page.getByRole('dialog').locator('.compare-tray-games > li')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open Compare tray, 5 games', exact: true })).toBeFocused();
  if (isMobile) {
    const rectangles = await page.evaluate(() => ({
      tray: document.querySelector('.compare-tray-dock')!.getBoundingClientRect().bottom,
      nav: document.querySelector('.mobile-nav')!.getBoundingClientRect().top,
    }));
    expect(rectangles.tray).toBeLessThanOrEqual(rectangles.nav);
  }
  await geometryAndAxe(page, '.compare-tray-dock');
  await page.screenshot({ path: testInfo.outputPath('real-floating-tray.png') });
  await page.getByRole('button', { name: 'Open Compare tray, 5 games', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
  expect((await readLibrary(page)).ranking).toEqual([]);
});

test('My games keeps old links, unranked additions, manual drafts, valid exit saves and independent completed queue filtering', async ({ page }, testInfo) => {
  await saveCatalogGame(page);
  expect((await readLibrary(page)).ranking).toEqual([]);
  await page.goto('/my-library');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await workspace(page).locator('.manual-add > summary').click();
  await workspace(page).getByLabel('Game title', { exact: true }).fill('Unsubmitted manual draft');
  await tab(page, 'Ranking').click();
  await expect(page).toHaveURL(/\/my-games\?tab=ranking$/);
  await tab(page, 'Library').click();
  await expect(workspace(page).getByLabel('Game title', { exact: true })).toHaveValue('Unsubmitted manual draft');
  await workspace(page).getByLabel('Game title', { exact: true }).fill('QA added without ranking');
  await workspace(page).locator('.manual-add').getByRole('button', { name: 'Add to my library', exact: true }).click();
  await expect(row(page)).toBeVisible();
  await row(page).getByRole('button', { name: `Play later: ${title}`, exact: true }).click();
  await row(page).getByRole('button', { name: `Completed: ${title}`, exact: true }).click();
  await tab(page, 'Queue').click();
  const progress = page.getByRole('combobox', { name: 'Progress', exact: true });
  await progress.selectOption('completed');
  await expect(tab(page, 'Queue')).toHaveAttribute('aria-current', 'page');
  await expect(row(page)).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=queue(?:&|$)/);
  await expect(page).toHaveURL(/[?&]progress=completed(?:&|$)/);
  await progress.selectOption('all');
  await page.goto('/discover?q=Kingdomcome&catalogs=off');
  await card(page).locator('summary').click();
  await card(page).getByRole('button', { name: 'Add to ranking', exact: true }).click();
  await page.goto('/my-rankings');
  await expect(tab(page, 'Ranking')).toHaveAttribute('aria-current', 'page');
  await row(page).getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true }).fill('8.4');
  await tab(page, 'Library').click();
  await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === kcd)?.score).toBe(8.4);
  await tab(page, 'Ranking').click();
  await row(page).locator('.ranking-note > summary').click();
  await row(page).getByRole('textbox').fill('Keep this note through view changes.');
  await tab(page, 'Queue').click();
  await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === kcd)?.note).toBe('Keep this note through view changes.');
  await tab(page, 'Ranking').click();
  await row(page).getByRole('spinbutton').fill('11');
  await tab(page, 'Library').click();
  await expect(tab(page, 'Ranking')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('alert').filter({ hasText: /edit has not saved|0.*10/ }).first()).toBeVisible();
  await row(page).getByRole('spinbutton').fill('7');
  await tab(page, 'Library').click();
  await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === kcd)?.score).toBe(7);
  expect((await readLibrary(page)).records[kcd]?.title).toBe(title);
  await geometryAndAxe(page, '.my-games-workspace');
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: testInfo.outputPath('my-games-workspace.png') });
});

test('an explicit unranked shelf stays independent, updates after removal, stops in an open viewer and hands pinned games to private comparisons', async ({ page, browser, request, viewport, isMobile }, testInfo) => {
  test.setTimeout(180000);
  await saveCatalogGame(page);
  await card(page).getByRole('button', { name: `Pin for comparison: ${title}`, exact: true }).click();
  const owner = await account(page, request, 'shelf-ui-owner', 'QA Shelf Owner', 'guest');
  await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'))).toContain(kcd);
  expect((await readAccount(page, owner.uid)).state.ranking).toEqual([]);
  const peerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', reducedMotion: 'reduce', viewport, isMobile, hasTouch: isMobile });
  try {
    const peer = await peerContext.newPage();
    await peer.emulateMedia({ reducedMotion: 'reduce' });
    const viewer = await account(peer, request, 'shelf-ui-viewer', 'QA Shelf Viewer');
    await connect(page, peer);
    await peer.goto(`/friends/${owner.uid}`);
    await expect(peer.locator('.friend-shelf-cards')).toContainText('unavailable');
    await shareShelf(page, [title]);
    await refreshShelf(peer);
    await expect(peer.locator('.friend-shelf-cards')).toContainText(title);
    await expect(peer.locator('.friend-ranking-list')).toBeEmpty();
    await expect(peer.locator('.friend-shelf-cards')).not.toContainText('8.4');
    await peer.locator('.friend-shelf-cards').getByRole('button', { name: `Pin ${title}`, exact: true }).click();
    expect((await readAccount(peer, viewer.uid)).state.records).toEqual({});
    await compareFromTray(peer);
    await expect(peer).toHaveURL(/\/compare$/);
    await expect(peer.locator('.compare-game-filter')).toContainText(title);
    await peer.getByLabel('QA Shelf Owner', { exact: true }).check();
    await expect(peer).toHaveURL(/\/compare$/);
    await expect(peer.locator('.friend-matrix tbody tr')).toHaveCount(0);
    await expect(peer.locator('body')).toContainText('Unshared rankings cannot contribute scores');
    await peer.reload();
    await expect(peer.locator('.compare-game-filter')).toContainText(title);
    await expect(peer.getByLabel('QA Shelf Owner', { exact: true })).toBeChecked();
    await peer.goto(`/friends/${owner.uid}`);
    await expect(peer.locator('.friend-shelf-cards')).toContainText(title);
    await peer.locator('.friend-shelf-cards').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(peer.locator('.friend-shelf-cards').getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
    const copied = (await readAccount(peer, viewer.uid)).state;
    expect(copied.records[kcd]?.title).toBe(title);
    expect(copied.ranking).toEqual([]); expect(copied.queueOrder).toEqual([]); expect(copied.progress).toEqual({});
    await geometryAndAxe(peer, '.friend-shelf-cards');
    await peer.screenshot({ path: testInfo.outputPath('shared-unranked-game.png') });
    await page.getByRole('button', { name: 'Stop sharing', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Shared games stopped.' })).toBeVisible();
    await expect(peer.locator('.friend-shelf-cards [role="button"], .friend-shelf-cards h3')).toHaveCount(0);
    await expect(peer.locator('.friend-shelf-cards')).toContainText('unavailable');
    await shareShelf(page, [title]); await refreshShelf(peer);
    await expect(peer.locator('.friend-shelf-cards')).toContainText(title);
    await page.evaluate(async ({ uid, id }) => {
      const modulePath = '/src/lib/scoped-library.ts';
      const source: typeof import('../src/lib/scoped-library') = await import(modulePath);
      const scope = `account:demo-play100:${uid}` as const;
      const current = await source.loadScopedLibrary(scope);
      const record = current.state.records[id]; if (!record) throw new Error('Owned fixture record missing.');
      await source.commitScopedAction(scope, { type: 'remove-records', ids: [id] });
      await source.commitScopedAction(scope, { type: 'add-records', records: [record] });
    }, { uid: owner.uid, id: kcd });
    await expect.poll(async () => (await readAccount(page, owner.uid)).sync.dirty).toBe(false);
    await expect(peer.locator('.friend-shelf-cards h3')).toHaveCount(0);
    await page.goto('/friends/sharing/games');
    await expect(page.locator('.friend-shelf-selection > li').filter({ hasText: title }).locator('input')).not.toBeChecked();
    expect((await readAccount(page, owner.uid)).state.records[kcd]?.title).toBe(title);
    expect((await readAccount(page, owner.uid)).state.ranking).toEqual([]);
    await page.goto('/account');
    await expect(page.getByRole('button', { name: 'Friends sharing: off', exact: true })).toBeVisible();
  } finally { await peerContext.close(); }
});

test('account export and reversible/full deletion include the independent shelf without losing the device original', async ({ page, request }) => {
  test.setTimeout(150000);
  await saveCatalogGame(page);
  const owner = await account(page, request, 'shelf-delete', 'QA Shelf Cleanup', 'guest');
  await shareShelf(page, [title]);
  await page.goto('/account');
  await page.locator('.account-backups > summary').click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export account data', exact: true }).click();
  const download = await waiting;
  const file = await download.path(); if (!file) throw new Error('The actual account export was not produced.');
  const exported = JSON.parse(await readFile(file, 'utf8'));
  expect(exported.friends.sharedGames.config.enabled).toBe(true);
  expect(exported.friends.sharedGames.shelf.entries).toHaveLength(1);
  expect(Object.keys(exported.friends.sharedGames.shelf.entries[0]).sort()).toEqual(['id', 'source', 'sourceId', 'sourceUrl', 'title', 'year']);
  await page.locator('.account-danger > summary').click();
  await page.getByRole('button', { name: 'Delete online copy', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Your online copy was deleted. The copy on this device is still here.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shared games: off', exact: true })).toBeVisible();
  expect((await readAccount(page, owner.uid)).state.records[kcd]?.title).toBe(title);
  await page.locator('input[name="connection-copy"][value="cached"]').check();
  await page.getByRole('button', { name: 'Agree & enable', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Sign out and sign in again' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4187/');
  await signIn(page, owner.email);
  await expect(page.locator('input[name="connection-copy"][value="cached"]')).toBeVisible();
  await enableSync(page, 'cached');
  await expect(page.getByRole('button', { name: 'Shared games: off', exact: true })).toBeVisible();
  await page.locator('.account-danger > summary').click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4187/');
  expect((await readLibrary(page)).records[kcd]?.title).toBe(title);
  const remaining = await page.evaluate(async (uid) => {
    const modulePath = '/src/lib/personal-db.ts';
    const source: typeof import('../src/lib/personal-db') = await import(modulePath);
    return source.friendShelfSelectionStorageTransaction(`account:demo-play100:${uid}`, value => value !== undefined);
  }, owner.uid);
  expect(remaining).toBe(false);
});

test('revoked unsaved manual shelf previews close on Stop and block without deleting independent saved games', async ({ page, browser, request, viewport, isMobile }) => {
  test.setTimeout(150000);
  const owner = await account(page, request, 'preview-owner', 'QA Preview Owner');
  await page.goto('/my-games');
  await workspace(page).locator('.manual-add > summary').click();
  for (const name of ['QA transient manual preview', 'QA independent saved copy']) {
    await workspace(page).getByLabel('Game title', { exact: true }).fill(name);
    await workspace(page).locator('.manual-add').getByRole('button', { name: 'Add to my library', exact: true }).click();
    await expect(workspace(page).getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect.poll(async () => (await readAccount(page, owner.uid)).sync.dirty).toBe(false);
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
  try {
    const peer = await other.newPage();
    const viewer = await account(peer, request, 'preview-viewer', 'QA Preview Viewer');
    await connect(page, peer);
    await shareShelf(page, ['QA transient manual preview', 'QA independent saved copy']);
    await peer.goto(`/friends/${owner.uid}`);
    const kept = peer.locator('.friend-shelf-grid > li').filter({ hasText: 'QA independent saved copy' });
    await kept.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(kept.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
    await peer.locator('.friend-shelf-cards').getByRole('button', { name: 'QA transient manual preview', exact: true }).click();
    await expect(peer.getByRole('dialog')).toContainText('QA transient manual preview');
    await page.getByRole('button', { name: 'Stop sharing', exact: true }).click();
    await expect(peer.getByRole('dialog')).toHaveCount(0);
    await expect(peer.locator('.friend-shelf-grid')).toHaveCount(0);
    const afterStop = (await readAccount(peer, viewer.uid)).state;
    expect(Object.values(afterStop.records).map(record => record.title)).toEqual(['QA independent saved copy']);
    expect(afterStop.ranking).toEqual([]);
    await shareShelf(page, ['QA transient manual preview', 'QA independent saved copy']);
    await refreshShelf(peer);
    await peer.locator('.friend-shelf-cards').getByRole('button', { name: 'QA transient manual preview', exact: true }).click();
    await expect(peer.getByRole('dialog')).toContainText('QA transient manual preview');
    await page.goto('/friends');
    await page.getByRole('button', { name: 'More actions for QA Preview Viewer', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Block player', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Block player', exact: true }).click();
    await expect(peer.getByRole('dialog')).toHaveCount(0);
    await expect(peer.locator('.friend-shelf-grid')).toHaveCount(0);
    expect(Object.values((await readAccount(peer, viewer.uid)).state.records).map(record => record.title)).toEqual(['QA independent saved copy']);
    await peer.goto('/my-games');
    await workspace(peer).getByRole('button', { name: 'QA independent saved copy', exact: true }).click();
    await expect(peer.getByRole('dialog')).toContainText('QA independent saved copy');
  } finally { await other.close(); }
});

test('tray Compare resets the mounted comparison filters and page without changing the people or sign-in runtime', async ({ page, browser, request, viewport, isMobile }, testInfo) => {
  test.setTimeout(120000);
  const owner = await account(page, request, 'comparison-owner', 'QA Comparison Owner');
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
  try {
    const peer = await other.newPage();
    const viewer = await account(peer, request, 'comparison-viewer', 'QA Comparison Viewer');
    await connect(page, peer);
    await peer.evaluate(async (uid) => {
      const libraryPath = '/src/lib/scoped-library.ts';
      const recordsPath = '/src/lib/personal-types.ts';
      const collectionPath = '/src/lib/collection.ts';
      const library: typeof import('../src/lib/scoped-library') = await import(libraryPath);
      const records: typeof import('../src/lib/personal-types') = await import(recordsPath);
      const collection: typeof import('../src/lib/collection') = await import(collectionPath);
      const data = collection.parseCollection(await (await fetch('/data/collection.json')).json());
      for (const game of data.games.slice(0, 30)) await library.commitScopedAction(`account:demo-play100:${uid}`, { type: 'rate-game', record: records.recordFromGame(game), score: 7 });
    }, viewer.uid);
    await peer.goto('/my-games');
    await workspace(peer).getByRole('button', { name: 'Pin for comparison: Red Dead Redemption 2', exact: true }).click();
    await compareFromTray(peer);
    await peer.getByLabel('QA Comparison Owner', { exact: true }).check();
    await peer.getByLabel('Games', { exact: true }).selectOption('common-ranked');
    await peer.getByLabel('Search games', { exact: true }).fill('Impossible previous filter');
    const before = await peer.locator('.account-nav').getAttribute('aria-label');
    await compareFromTray(peer);
    await expect(peer.getByLabel('Search games', { exact: true })).toHaveValue('');
    await expect(peer.getByLabel('Games', { exact: true })).toHaveValue('all-shared');
    await expect(peer.getByLabel('QA Comparison Owner', { exact: true })).toBeChecked();
    await expect(peer.locator('.friend-matrix tbody')).toContainText('Red Dead Redemption 2');
    await expect(peer).toHaveURL(/\/compare$/);
    await expect(peer.locator('.account-nav')).not.toHaveAccessibleName(/Opening account/);
    expect(before).toContain('QA Comparison Viewer');
    await peer.getByRole('button', { name: 'Clear game filter', exact: true }).click();
    await peer.getByRole('button', { name: 'Next 25', exact: true }).click();
    await expect(peer.locator('.friend-compare-page')).toContainText('2 / 2');
    await compareFromTray(peer);
    await expect(peer.locator('.friend-matrix tbody')).toContainText('Red Dead Redemption 2');
    await expect(peer.locator('.friend-compare-page')).toContainText('1 / 1');
    await expect(peer.getByLabel('QA Comparison Owner', { exact: true })).toBeChecked();
    expect(new URL(peer.url()).search).toBe('');
    await geometryAndAxe(peer, '.friend-compare-page');
    await peer.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await peer.screenshot({ path: testInfo.outputPath('filtered-comparison.png') });
    expect(owner.uid).not.toBe(viewer.uid);
  } finally { await other.close(); }
});

test('initial shared-games consent stays checking or error until an enabled or absent configuration is actually confirmed', async ({ page, browser, request, viewport, isMobile }) => {
  test.setTimeout(120000);
  await saveCatalogGame(page);
  const owner = await account(page, request, 'consent-owner', 'QA Consent Owner', 'guest');
  await shareShelf(page, [title]);
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
  try {
    const returning = await other.newPage();
    await returning.goto('/account');
    await returning.getByRole('button', { name: 'Use email', exact: true }).click();
    await returning.evaluate(async (uid) => {
      const sourcePath = '/src/cloud/friend-shelf-store.ts';
      const source: typeof import('../src/cloud/friend-shelf-store') = await import(sourcePath);
      const watch = source.FriendShelfStore.prototype.watchConfig;
      let gated = true;
      const gate: NonNullable<Window['shelfReadGate']> = { calls: 0, fail: () => { throw new Error('The initial watch is not attached yet.'); } };
      window.shelfReadGate = gate;
      source.FriendShelfStore.prototype.watchConfig = function(owner, next, error) {
        if (owner !== uid || !gated) return watch.call(this, owner, next, error);
        gate.calls += 1;
        gate.fail = () => { gated = false; error(Object.assign(new Error('Synthetic initial consent failure'), { code: 'unavailable' })); };
        return () => {};
      };
    }, owner.uid);
    await returning.getByLabel('Email', { exact: true }).fill(owner.email);
    await returning.locator('.auth-panel input[name="password"]').fill(password);
    await returning.getByRole('button', { name: 'Sign in with email', exact: true }).click();
    await expect(returning.getByRole('button', { name: 'Shared games: checking', exact: true })).toBeVisible();
    await returning.getByRole('button', { name: 'Shared games: checking', exact: true }).click();
    await expect(returning.locator('.friend-shelf-heading [role="status"]')).toHaveText('checking');
    await returning.evaluate(() => { if (!window.shelfReadGate) throw new Error('Missing consent gate.'); window.shelfReadGate.fail(); });
    await expect(returning.locator('.friend-shelf-heading [role="status"]')).toHaveText('error');
    await expect(returning.locator('.friend-shelf-heading [role="status"]')).not.toHaveText('Off');
    await returning.getByRole('button', { name: 'Refresh shared games', exact: true }).click();
    await expect(returning.locator('.friend-shelf-heading [role="status"]')).toHaveText('saved', { timeout: 30000 });
    await expect(returning.locator('.friend-shelf-selection input:checked')).toHaveCount(1);
  } finally { await other.close(); }
});

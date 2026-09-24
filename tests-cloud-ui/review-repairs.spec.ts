import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createAccount, emailFor, enableSync, googleRedirect, password, readAccount, seedGuestRating, signIn, uidFor, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('verified unused email registration can delete without first enabling sync or creating a profile', async ({ page, request }) => {
  const email = emailFor('unused-verified');
  await createAccount(page, email); await verifyEmail(page, request, email);
  await page.locator('.account-danger summary').click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await readLibrary(page)).records).toEqual({});
});

test('verified unused Google registration returns from reauthentication without deleting until explicitly confirmed', async ({ page, request }) => {
  const email = emailFor('unused-google');
  await page.goto('/account');
  await googleRedirect(page, () => page.getByRole('button', { name: 'Continue with Google', exact: true }).click(), email, true);
  await expect(page.locator('.account-heading')).toContainText(email);
  const uid = await uidFor(request, email);
  await page.locator('.account-danger summary').click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await googleRedirect(page, () => page.getByRole('dialog').getByRole('button', { name: 'Continue in this tab', exact: true }).click(), email);
  await expect(page.getByRole('dialog')).toContainText('Google confirmed this account. Confirm below to delete.');
  expect(await uidFor(request, email)).toBe(uid);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('corrupt account cache does not trap sign-out or prevent a network-only account export', async ({ page, request }) => {
  const email = emailFor('cache-failure');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  await page.evaluate((key) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('play100-personal', 2);
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction('library', 'readwrite');
      tx.objectStore('library').put({ broken: 'deliberate scoped cache fixture' }, key);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  }), `account:demo-play100:${uid}`);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export account data', exact: true }).click();
  const backup = await downloaded;
  expect(backup.suggestedFilename()).toBe('Play-100-account-export.json');
  const exportFile = await backup.path(); if (!exportFile) throw new Error('The account export was not produced.');
  const exported = await readFile(exportFile, 'utf8');
  // Every account download is compact JSON; the account-data export is a reference file, not an importable backup.
  expect(exported).not.toContain('\n');
  expect(JSON.parse(exported)).toMatchObject({ app: 'Play 100', formatVersion: 1, deviceCacheError: expect.any(String) });
  await expect(page.getByRole('status').filter({ hasText: 'unreadable device cache' })).toBeVisible();
  const backups = page.locator('.account-backups');
  if (await backups.getAttribute('open') === null) await backups.locator('summary').click();
  const guestDownloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export device-only library', exact: true }).click();
  const guestBackup = await guestDownloaded;
  expect(guestBackup.suggestedFilename()).toBe('Play-100-guest-backup.json');
  const guestFile = await guestBackup.path(); if (!guestFile) throw new Error('The device-only backup was not produced.');
  const guestText = await readFile(guestFile, 'utf8');
  expect(guestText).not.toContain('\n');
  expect(JSON.parse(guestText)).toMatchObject({ app: 'Play 100', formatVersion: 3, library: { version: 3 } });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await readLibrary(page)).records).toEqual({});
});

test('a guest inline rating keeps its original save target while another tab restores an account', async ({ page, context, request }) => {
  const email = emailFor('inline-scope');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/$/);
  await page.locator('.account-nav').click();
  await page.getByRole('button', { name: 'Keep using this device', exact: true }).click();
  // 98e77e5 merged My library into My games; both navigations link to it, and only the visible editor is active.
  await page.locator('.desktop-nav:visible, .mobile-nav:visible').getByRole('link', { name: 'My games', exact: true }).click();
  const title = `Guest draft ${crypto.randomUUID().slice(0, 8)}`;
  const editor = page.locator('.my-games-editor:visible');
  await editor.locator('.manual-add summary').click();
  await editor.getByLabel('Game title', { exact: true }).fill(title);
  await editor.locator('.manual-add form').getByRole('button').click();
  await expect.poll(async () => Object.values((await readLibrary(page)).records).some((record) => record.title === title)).toBe(true);
  await page.locator('.wordmark').first().click();
  // 819618a shows saved additions beyond The 100 as catalog cards whose rating sits under Actions & source.
  await page.getByLabel(`Actions & source for ${title}`, { exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true })).toBeVisible();
  const peer = await context.newPage();
  try {
    // Playwright's clock is context-wide, so pausing it also froze the peer tab's sign-in. Hold only this tab's
    // 650 ms rating debounce instead: the edit stays pending until the account restore makes its field exit and save.
    await page.evaluate(() => {
      const schedule = window.setTimeout.bind(window);
      const held = { count: 0 };
      Object.assign(window, { heldRatingSaves: held });
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...rest: unknown[]) => {
        if (timeout !== 650) return schedule(handler, timeout, ...rest);
        held.count += 1;
        return 0;
      }) as typeof window.setTimeout;
    });
    await page.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true }).fill('7.2');
    await expect.poll(() => page.evaluate(() => (window as unknown as { heldRatingSaves: { count: number } }).heldRatingSaves.count)).toBeGreaterThan(0);
    expect((await readLibrary(page)).ranking).toEqual([]);
    await signIn(peer, email);
    await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(7.2);
    expect((await readAccount(peer, uid)).state.records).toEqual({});
    await expect(page.locator('#collection')).not.toContainText(title);
  } finally { await peer.close(); }
});

test('an interrupted upload recovers automatically after reconnect without a manual sync click', async ({ page, context, request }) => {
  const email = emailFor('upload-interruption');
  await page.goto('/?game=red-dead-redemption-2');
  await seedGuestRating(page, '5');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page);
  const uid = await uidFor(request, email);
  await page.goto('/my-rankings');
  await expect(page.getByRole('spinbutton')).toBeEnabled();
  await page.route('**/documents:commit*', async (route) => {
    const body = route.request().postDataJSON() as { writes?: Array<{ update?: { name?: string } }> };
    if (body.writes?.some((write) => write.update?.name?.endsWith(`/syncHeads/${uid}`))) {
      await route.fulfill({ status: 503, json: { error: { code: 503, status: 'UNAVAILABLE', message: 'Isolated upload interruption fixture' } } });
    } else await route.continue();
  });
  await page.getByRole('spinbutton').fill('6.9'); await page.getByRole('spinbutton').press('Tab');
  await expect(page.locator('.account-nav')).toHaveAccessibleName(/Retrying automatically/, { timeout: 45000 });
  expect((await readAccount(page, uid)).sync.dirty).toBe(true);
  await page.unroute('**/documents:commit*');
  await context.setOffline(true); await context.setOffline(false);
  await expect(page.locator('.account-nav')).toHaveAccessibleName(/Saved online/, { timeout: 30000 });
  expect((await readAccount(page, uid)).sync.dirty).toBe(false);
  expect((await readAccount(page, uid)).state.ranking[0]?.score).toBe(6.9);
  expect((await readLibrary(page)).ranking[0]?.score).toBe(5);
});

test('the creator can inspect and hide a reported public profile even without a members document', async ({ page, browser, request, isMobile, viewport }) => {
  const publisherEmail = emailFor('public-only');
  const creatorEmail = emailFor('moderator');
  const handle = `qa_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await page.goto('/?game=red-dead-redemption-2');
  await seedGuestRating(page, '8');
  await createAccount(page, publisherEmail); await verifyEmail(page, request, publisherEmail);
  const publisherUid = await uidFor(request, publisherEmail);
  await page.goto('/publish');
  await page.getByLabel('Public name', { exact: true }).fill('Public-only publisher');
  await page.locator('input[name="public-handle"]').fill(handle);
  await page.getByRole('button', { name: 'Preview public snapshot', exact: true }).click();
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish this ranking', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${handle}$`));
  const removed = await request.delete(`http://127.0.0.1:8188/v1/projects/demo-play100/databases/(default)/documents/members/${publisherUid}`, { headers: { Authorization: 'Bearer owner' } });
  expect(removed.ok()).toBe(true);
  const moderator = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
  const ownerConfig = 'http://127.0.0.1:8188/v1/projects/demo-play100/databases/(default)/documents/_owner/config';
  const owner = { Authorization: 'Bearer owner' };
  const originalOwner = await request.get(ownerConfig, { headers: owner });
  const originalFields = originalOwner.ok() ? ((await originalOwner.json()) as { fields?: Record<string, unknown> }).fields ?? {} : null;
  try {
    const admin = await moderator.newPage();
    await createAccount(admin, creatorEmail); await verifyEmail(admin, request, creatorEmail);
    const creatorUid = await uidFor(request, creatorEmail);
    await admin.goto(`/u/${handle}`);
    await admin.getByRole('button', { name: 'Report profile', exact: true }).click();
    await admin.getByLabel('What needs attention?', { exact: true }).fill(`Review member-less profile ${handle}`);
    await admin.getByRole('button', { name: 'Submit report', exact: true }).click();
    await expect(admin.getByRole('dialog')).toHaveCount(0);
    const bootstrapped = await request.patch(ownerConfig, { headers: { Authorization: 'Bearer owner' }, data: { fields: { uid: { stringValue: creatorUid }, email: { stringValue: creatorEmail } } } });
    expect(bootstrapped.ok()).toBe(true);
    await admin.goto('/creator');
    await expect(admin.getByRole('heading', { name: 'Creator desk', exact: true })).toBeVisible();
    await admin.getByRole('button', { name: 'Reports', exact: true }).click();
    const report = admin.locator('.creator-reports > li').filter({ hasText: handle });
    await report.getByRole('button', { name: 'Inspect profile', exact: true }).click();
    await expect(admin.getByRole('dialog').getByRole('heading', { name: 'Public-only publisher', exact: true })).toBeVisible();
    await expect(admin.getByRole('dialog')).toContainText('Red Dead Redemption 2');
    await admin.getByRole('dialog').getByRole('button', { name: 'Hide public profile', exact: true }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Hide and pause publishing', exact: true }).click();
    await expect(admin.getByRole('dialog')).toContainText('Publishing is paused');
    await admin.keyboard.press('Escape');
    await report.getByRole('button', { name: 'Resolve and remove', exact: true }).click();
    await expect(report).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'This ranking is not available.', exact: true })).toBeVisible();
  } finally {
    // Restore the seeded owner document exactly; no creator@play100.test identity exists to look up.
    if (originalFields) await request.patch(ownerConfig, { headers: owner, data: { fields: originalFields } });
    else await request.delete(ownerConfig, { headers: owner });
    await moderator.close();
  }
});

test('a clean failed online check stays paused after a fresh unchanged head and a later edit until manual retry', async ({ page, request, isMobile }) => {
  const email = emailFor('clean-check');
  await page.goto('/?game=red-dead-redemption-2');
  await seedGuestRating(page, '5');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page);
  const uid = await uidFor(request, email);
  const url = `http://127.0.0.1:8188/v1/projects/demo-play100/databases/(default)/documents/syncHeads/${uid}`;
  const headers = { Authorization: 'Bearer owner' };
  const saved = await (await request.get(url, { headers })).json() as { fields: Record<string, unknown> };
  let needsRestore = false;
  try {
    const invalid = await request.patch(url, { headers, data: { fields: { ...saved.fields, format: { integerValue: '99' } } } });
    expect(invalid.ok()).toBe(true);
    needsRestore = true;
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(page.locator('.sync-state')).toHaveText('Online saving paused');
    expect((await readAccount(page, uid)).sync.dirty).toBe(false);
    const restored = await request.patch(url, { headers, data: { fields: saved.fields } });
    expect(restored.ok()).toBe(true);
    needsRestore = false;
    await expect(page.locator('.sync-state')).toHaveText('Online saving paused');
    // 98e77e5 moved rankings into the My games Ranking view; navigate in-app to keep the paused session.
    await page.locator(isMobile ? '.mobile-nav' : '.desktop-nav').getByRole('link', { name: 'My games', exact: true }).click();
    await page.getByRole('navigation', { name: 'My games views', exact: true }).getByRole('button', { name: /^Ranking\b/ }).click();
    await page.getByRole('spinbutton').fill('7.4'); await page.getByRole('spinbutton').press('Tab');
    await expect.poll(async () => (await readAccount(page, uid)).state.ranking[0]?.score).toBe(7.4);
    await expect(page.locator('.account-nav')).toHaveAccessibleName(/Online saving paused/);
    expect((await readAccount(page, uid)).sync.dirty).toBe(true);
    await page.locator('.account-nav').click();
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(page.locator('.sync-state')).toHaveText('Saved online', { timeout: 30000 });
    expect((await readAccount(page, uid)).sync.dirty).toBe(false);
  } finally { if (needsRestore) await request.patch(url, { headers, data: { fields: saved.fields } }); }
});

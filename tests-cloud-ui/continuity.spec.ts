import { expect, test } from '@playwright/test';
import { createAccount, emailFor, enableSync, expectRestoredSync, readAccount, seedGuestRating, signIn, uidFor, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('own active saved copy restores into an empty local wrapper without uploading guest data or requiring another consent', async ({ page, browser, request }) => {
  const email = emailFor('restore-initial');
  await page.goto('/?game=red-dead-redemption-2');
  await seedGuestRating(page, '8.1');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'guest');
  const uid = await uidFor(request, email);
  await page.getByLabel('Name', { exact: true }).fill('Remembered synthetic player');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Name saved.' })).toBeVisible();
  await page.getByRole('button', { name: 'Change icon', exact: true }).click();
  await page.getByRole('radio', { name: 'Sky', exact: true }).check();
  await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const savedCreature = await page.locator('.account-nav img').getAttribute('src');
  expect(savedCreature).toBeTruthy();
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', reducedMotion: 'reduce' });
  try {
    const peer = await second.newPage();
    await peer.goto('/?game=red-dead-redemption-2'); await seedGuestRating(peer, '3.5');
    const guest = await readLibrary(peer);
    await signIn(peer, email);
    await expectRestoredSync(peer);
    await expect(peer.getByLabel('Name', { exact: true })).toHaveValue('Remembered synthetic player');
    await expect(peer.locator('.account-nav img')).toHaveAttribute('src', savedCreature!);
    expect((await readAccount(peer, uid)).state.ranking[0]?.score).toBe(8.1);
    expect(await readLibrary(peer)).toEqual(guest);
    await peer.reload(); await expectRestoredSync(peer);
    await expect(peer.getByLabel('Name', { exact: true })).toHaveValue('Remembered synthetic player');
    await expect(peer.locator('.account-nav img')).toHaveAttribute('src', savedCreature!);
    expect((await readAccount(peer, uid)).state.ranking[0]?.score).toBe(8.1);
  } finally { await second.close(); }
});

test('stopped cloud copies are not enabled by sign-in and the explicit consent action has one name editor', async ({ page, browser, request }) => {
  const email = emailFor('stopped-copy');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  await page.getByRole('button', { name: 'Stop online saving', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm this choice', exact: true }).click();
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', reducedMotion: 'reduce' });
  try {
    const peer = await second.newPage();
    await signIn(peer, email);
    await expect(peer.locator('.sync-panel')).toContainText('Online saving was stopped');
    await expect(peer.locator('input[autocomplete="nickname"]')).toHaveCount(1);
    await expect(peer.getByRole('button', { name: 'Agree & enable', exact: true })).toBeEnabled();
    const uid = await uidFor(request, email);
    expect((await readAccount(peer, uid)).sync.enabled).toBe(false);
    await peer.getByLabel('Name', { exact: true }).fill('');
    await peer.getByRole('button', { name: 'Agree & enable', exact: true }).click();
    await expect(peer.getByRole('alert')).toContainText('Enter a name');
    expect((await readAccount(peer, uid)).sync.enabled).toBe(false);
  } finally { await second.close(); }
});

test('Data use opens separately without starting private storage or losing the current name draft', async ({ page, context, request }) => {
  const email = emailFor('data-use');
  await createAccount(page, email); await verifyEmail(page, request, email);
  await page.getByLabel('Name', { exact: true }).fill('Unsaved chosen name');
  await context.addInitScript(() => {
    if (location.pathname !== '/data-use') return;
    const opened: string[] = [];
    Object.defineProperty(window, '__policyDbOpens', { value: opened });
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) { opened.push(args[0]); return original.apply(this, args); };
  });
  const popup = context.waitForEvent('page');
  await page.locator('.consent-summary').getByRole('link', { name: /Data use/ }).click();
  const policy = await popup;
  try {
    await expect(policy).toHaveURL(/\/data-use$/);
    await expect(policy.getByRole('heading', { name: 'Data use', exact: true })).toBeVisible();
    const result = await policy.evaluate(() => ({
      databaseOpens: Object.getOwnPropertyDescriptor(window, '__policyDbOpens')?.value,
      onlineResources: performance.getEntriesByType('resource').map((row) => row.name).filter((url) => /OnlineController|googleapis|:9199|:8188/.test(url)),
    }));
    expect(result.onlineResources).toEqual([]);
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Unsaved chosen name');
    expect(result.databaseOpens).toEqual([]);
  } finally { await policy.close(); }
});

test('the owned IndexedDB boot marker restores identity on home when localStorage is blocked', async ({ page, request }) => {
  const email = emailFor('blocked-local');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Fixture denied localStorage', 'SecurityError'); } });
  });

  await page.goto('/');
  await expect(page.locator('.account-nav img')).toBeVisible();
  await expect(page.locator('.account-nav')).toHaveAccessibleName(/Saved online/);
  await page.locator('.account-nav').click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('SDK localStorage persistence retains sign-in when only the Firebase auth IndexedDB is unavailable', async ({ page, request }) => {
  await page.addInitScript(() => {
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      if (args[0] === 'firebaseLocalStorageDb') throw new DOMException('Synthetic auth DB denial', 'SecurityError');
      return original.apply(this, args);
    };
  });
  const email = emailFor('auth-storage-fallback');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expect(page.locator('.auth-panel')).toHaveCount(0);
  await expectRestoredSync(page);
  await expect(page.locator('body')).not.toContainText('Persistence across refresh has not yet been confirmed');
});

test('Change icon cancellation keeps the committed header image', async ({ page, request }) => {
  const email = emailFor('icon-cancel');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  const before = await page.locator('.account-nav img').getAttribute('src');
  await page.getByRole('button', { name: 'Change icon', exact: true }).click();
  await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.account-nav img')).toHaveAttribute('src', before!);
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

const compare = (page: Page) => page.getByRole('button', { name: 'Compare rankings with friends', exact: true });
const chip = (page: Page) => page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true });
const signIn = (page: Page) => page.getByRole('dialog', { name: 'Sign in', exact: true });
const account = (page: Page) => page.locator('.account-nav');
const comparePurpose = (page: Page) => signIn(page).getByRole('region', { name: "Compare friends' rankings", exact: true });

async function expectComparePurpose(page: Page) {
  await expect(comparePurpose(page).getByRole('heading', { name: "Compare friends' rankings", exact: true })).toBeVisible();
  await expect(comparePurpose(page)).toContainText('Sign in to compare rankings shared by your friends. Pins select games for comparison; they do not share your library.');
}

async function expectOrdinarySignIn(page: Page) {
  await expect(signIn(page).getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await expect(signIn(page).getByRole('heading', { name: "Compare friends' rankings", exact: true })).toHaveCount(0);
  await expect(signIn(page).locator('.auth-purpose')).toHaveCount(0);
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Compare focus fixtures require the owned local app.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname === '/api/catalog') return route.abort('blockedbyclient');
    return route.continue();
  });
  await installGuestLibrary(page, libraryFixture(3));
  test.skip(await account(page).count() === 0,
    'Requires the centrally configured online build; remote account requests remain blocked.');
  const pin = page.locator(`.personal-row-static[data-record-id="${libraryRecords[0].id}"]`)
    .getByRole('button', { name: `Pin for comparison: ${libraryRecords[0].title}`, exact: true })
    .and(page.locator('button[aria-pressed]'));
  await pin.focus();
  await page.keyboard.press('Space');
  await expect(chip(page)).toBeVisible();
});

async function fullDock(page: Page) {
  await page.goto('/?catalogs=off');
  await expect(compare(page)).toBeVisible();
}

async function compareFromChip(page: Page) {
  await expect(compare(page)).toHaveCount(0);
  await chip(page).focus();
  await page.keyboard.press('Enter');
  const tray = page.getByRole('dialog', { name: 'Compare tray', exact: true });
  await expect(tray.getByRole('heading', { name: 'Compare tray', exact: true })).toBeFocused();
  await tray.getByRole('button', { name: 'Choose friends', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(tray).not.toBeVisible();
}

async function readyAccount(page: Page) {
  await account(page).focus();
  await page.keyboard.press('Enter');
  await expectOrdinarySignIn(page);
  await expect(signIn(page).locator('#account-signin-title')).toBeFocused();
  await expect(account(page)).toHaveAccessibleName('Account Device only');
  await page.keyboard.press('Escape');
  await expect(signIn(page)).toHaveCount(0);
  await expect(account(page)).toBeFocused();
}

async function nativeDeviceExit(page: Page) {
  const exit = signIn(page).getByRole('button', { name: 'Keep using this device', exact: true });
  for (let step = 0; step < 8; step++) {
    if (await exit.evaluate(node => node === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(exit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(signIn(page)).toHaveCount(0);
}

async function returnSnapshot(page: Page) {
  return compare(page).evaluate(node => {
    const box = node.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      focused: node === document.activeElement, connected: node.isConnected,
      activeTag: document.activeElement?.tagName, activeClass: document.activeElement?.className,
      compareHit: Boolean(hit && node.contains(hit)), hitTag: hit?.tagName, hitClass: hit?.getAttribute('class'),
      toastActive: Boolean(document.querySelector('.toast.toast-visible')), bodyOverflow: document.body.style.overflow,
      dialogs: document.querySelectorAll('dialog[open]').length,
    };
  });
}

test('ready Compare keyboard device exit restores the remounted action while its toast is active, then ordinary Account returns normally', async ({ page }, info) => {
  await fullDock(page);
  await readyAccount(page);
  const before = await readLibrary(page);
  await compare(page).focus();
  const began = Date.now();
  await page.keyboard.press('Enter');
  await expect(signIn(page).locator('#account-signin-title')).toBeFocused();
  await expectComparePurpose(page);
  await nativeDeviceExit(page);
  const actual = await returnSnapshot(page);
  await info.attach('compare-keyboard-return', { contentType: 'application/json', body: JSON.stringify({ elapsedMs: Date.now() - began, ...actual }) });
  expect(Date.now() - began).toBeLessThan(4000);
  expect(actual.toastActive).toBe(true);
  expect(actual.focused).toBe(true);
  expect(actual.compareHit).toBe(true);
  expect(actual.dialogs).toBe(0);
  expect(actual.bodyOverflow).not.toBe('hidden');
  expect(await readLibrary(page)).toEqual(before);
  await account(page).focus();
  await page.keyboard.press('Enter');
  await expect(signIn(page).locator('#account-signin-title')).toBeFocused();
  await expectOrdinarySignIn(page);
  await nativeDeviceExit(page);
  await expect(account(page)).toBeFocused();
  expect(await readLibrary(page)).toEqual(before);
});

async function holdAccountModule(page: Page) {
  let release: () => void = () => { throw new Error('Module hold was not initialized.'); };
  let requested: () => void = () => { throw new Error('Module signal was not initialized.'); };
  const gate = new Promise<void>(resolve => { release = resolve; });
  const began = new Promise<void>(resolve => { requested = resolve; });
  await page.route(/\/(?:assets\/OnlineController-[^/]+\.js|src\/cloud\/OnlineController\.tsx)(?:\?|$)/, async route => {
    requested(); await gate; await route.continue();
  });
  return { release, began };
}

test('cold loading to ready Sign in keeps the Compare origin until the final native close', async ({ page }) => {
  await fullDock(page);
  const held = await holdAccountModule(page);
  try {
    await compare(page).focus();
    await page.keyboard.press('Enter');
    await held.began;
    await expect(page.locator('#loading-account-title')).toBeFocused();
    held.release();
    await expectComparePurpose(page);
    await expect(signIn(page).locator('#account-signin-title')).toBeFocused();
    await expect(account(page)).toHaveAccessibleName('Account Device only');
    await nativeDeviceExit(page);
    await expect(compare(page)).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  } finally { held.release(); }
});

test('cold cancellation uses the current Account fallback without stealing focus when the module later arrives', async ({ page }) => {
  await fullDock(page);
  const held = await holdAccountModule(page);
  try {
    await compare(page).focus();
    await page.keyboard.press('Enter');
    await held.began;
    await expect(page.locator('#loading-account-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(account(page)).toBeFocused();
    held.release();
    await expect(account(page)).toHaveAccessibleName('Account Device only');
    await expect(compare(page)).toBeVisible();
    await expect(account(page)).toBeFocused();
  } finally { held.release(); }
});

test('native Back invalidates a Compare return ticket even when that action exists on the new page', async ({ page, isMobile }) => {
  await readyAccount(page);
  const navigation = page.getByRole('navigation', { name: isMobile ? 'Mobile navigation' : 'Main navigation', exact: true });
  await navigation.getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/discover');
  await navigation.getByRole('link', { name: 'My games', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/my-games');
  await compareFromChip(page);
  await expect(signIn(page).locator('#account-signin-title')).toBeFocused();
  await expectComparePurpose(page);
  await page.goBack();
  await expect(page).toHaveURL(url => url.pathname === '/discover');
  await expectOrdinarySignIn(page);
  await nativeDeviceExit(page);
  await expect(account(page)).toBeFocused();
  await expect(chip(page)).toBeVisible();
  await expect(chip(page)).not.toBeFocused();
});

test('a failed rating edit keeps its exact field and never captures or opens a Compare sign-in origin', async ({ page }) => {
  await readyAccount(page);
  await page.getByRole('navigation', { name: 'My games views', exact: true }).getByRole('button', { name: /^Ranking/ }).click();
  const rating = page.locator('.my-games-editor:visible').getByRole('spinbutton').first();
  await rating.fill('11');
  const before = await readLibrary(page);
  await compareFromChip(page);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(rating).toBeFocused();
  await expect(rating).toHaveValue('11');
  expect(await readLibrary(page)).toEqual(before);
});

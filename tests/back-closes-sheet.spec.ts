import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';

// UX-039: dismissing a sheet must not consume the page's own Back/Forward entry.
type Sheet = { name: string; open: (page: Page) => Promise<Locator> };

async function fromMenu(page: Page, item: string, dialog: string) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'All navigation', exact: true })
    .getByRole('button', { name: item, exact: true })
    .click();
  return page.getByRole('dialog', { name: dialog, exact: true });
}

const sheets: Sheet[] = [
  {
    name: 'Menu',
    open: async (page) => {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      return page.getByRole('dialog', { name: 'Menu', exact: true });
    },
  },
  { name: 'About', open: (page) => fromMenu(page, 'About & credits', 'About & credits') },
  { name: 'Settings', open: (page) => fromMenu(page, 'Settings & backups', 'Settings & backups') },
  {
    name: 'Compare tray',
    open: async (page) => {
      if ((await page.locator('.compare-tray-expand').count()) === 0)
        await page
          .getByRole('button', { name: /^Pin for comparison:/ })
          .first()
          .click();
      await page.getByRole('button', { name: '1 game in Compare tray', exact: true }).click();
      return page.getByRole('dialog', { name: 'Compare tray', exact: true });
    },
  },
  {
    name: 'Sign in',
    open: async (page) => {
      test.skip((await page.locator('.account-nav').count()) === 0, 'Sign in needs the configured online build.');
      await page.locator('.account-nav').click();
      return page.getByRole('dialog', { name: 'Sign in', exact: true });
    },
  },
];

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installGuestLibrary(page, libraryFixture(3));
});

for (const sheet of sheets) {
  test(`Back closes ${sheet.name} without consuming its page history or opener`, async ({ page, isMobile }) => {
    const navigation = page.getByRole('navigation', {
      name: isMobile ? 'Mobile navigation' : 'Main navigation',
      exact: true,
    });
    // In-app navigations, so Back is a same-document popstate rather than a reload.
    await expect(page).toHaveURL((url) => url.pathname === '/my-games');
    const previous = page.url();
    await navigation.getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/discover');
    const current = page.url();
    const historyLength = await page.evaluate(() => history.length);
    for (const dismiss of ['Back', 'Escape', 'Close button'] as const) {
      const dialog = await sheet.open(page);
      await expect(dialog).toBeVisible();
      const opener =
        sheet.name === 'Sign in'
          ? page.locator('.account-nav')
          : sheet.name === 'Compare tray'
            ? page.locator('.compare-tray-expand')
            : page.getByRole('button', { name: 'Menu', exact: true });
      const openedLength = await page.evaluate(() => history.length);
      if (dismiss === 'Back') await page.goBack();
      else if (dismiss === 'Escape') await page.keyboard.press('Escape');
      else await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect(page).toHaveURL(current);
      await expect(opener).toBeFocused();
      expect(await page.evaluate(() => history.length)).toBe(openedLength);
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    }
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    // No disposable sheet entry is left behind: one Back reaches the actual previous route.
    await page.goBack();
    await expect(page).toHaveURL(previous);
    await page.goForward();
    await expect(page).toHaveURL(current);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  });
}

test('a detail consumes only its own URL entry and remains reachable through Forward', async ({ page }) => {
  await page.goto('/?catalogs=off');
  const current = page.url();
  const opener = page.locator(`[data-game="${libraryRecords[0]!.id}"] .game-link`);
  await opener.click();
  const detail = page.getByRole('dialog', { name: libraryRecords[0]!.title, exact: true });
  await expect(detail).toBeVisible();
  const opened = page.url();
  const length = await page.evaluate(() => history.length);
  await page.goBack();
  await expect(detail).toHaveCount(0);
  await expect(page).toHaveURL(current);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goForward();
  await expect(page).toHaveURL(opened);
  await expect(detail).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(page).toHaveURL(current);
  await expect(opener).toBeFocused();
});

test('Forward closes Menu without consuming the forward page or creating a duplicate entry', async ({
  page,
  isMobile,
}) => {
  const navigation = page.getByRole('navigation', {
    name: isMobile ? 'Mobile navigation' : 'Main navigation',
    exact: true,
  });
  const previous = page.url();
  await navigation.getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/discover');
  const next = page.url();
  await page.goBack();
  await expect(page).toHaveURL(previous);
  const length = await page.evaluate(() => history.length);
  const opener = page.getByRole('button', { name: 'Menu', exact: true });
  await opener.click();
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
  await expect(menu).toBeVisible();
  await page.goForward();
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL(previous);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goForward();
  await expect(page).toHaveURL(next);
  await page.goBack();
  await expect(page).toHaveURL(previous);
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('a Settings deep link still opens', async ({ page }) => {
  await page.goto('/?catalogs=off&info=settings');
  await expect(page.getByRole('dialog', { name: 'Settings & backups', exact: true })).toBeVisible();
});

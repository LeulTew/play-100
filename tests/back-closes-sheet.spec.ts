import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';

// UX-027: browser Back must not leave a sheet open over the page it navigated to.
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
  { name: 'About', open: (page) => fromMenu(page, 'About & credits', 'About & credits') },
  { name: 'Settings', open: (page) => fromMenu(page, 'Settings & backups', 'Settings & backups') },
  {
    name: 'Compare tray',
    open: async (page) => {
      await page
        .getByRole('button', { name: `Pin for comparison: ${libraryRecords[0]!.title}`, exact: true })
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
  test(`Back closes ${sheet.name} instead of leaving it over the previous page`, async ({ page, isMobile }) => {
    const navigation = page.getByRole('navigation', {
      name: isMobile ? 'Mobile navigation' : 'Main navigation',
      exact: true,
    });
    // In-app navigations, so Back is a same-document popstate rather than a reload.
    await navigation.getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/discover');
    const previous = page.url();
    await navigation.getByRole('link', { name: 'My games', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/my-games');
    const dialog = await sheet.open(page);
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(previous);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await page.goForward();
    await expect(page).toHaveURL((url) => url.pathname === '/my-games');
    await expect(dialog).toHaveCount(0);
  });
}

test('a Settings deep link still opens', async ({ page }) => {
  await page.goto('/?catalogs=off&info=settings');
  await expect(page.getByRole('dialog', { name: 'Settings & backups', exact: true })).toBeVisible();
});

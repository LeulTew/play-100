import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { libraryRecords } from './library-pagination-helpers';

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const view of ['grid', 'list', 'table'] as const) {
  test(`keyboard Show more continues into the first new ${view} game`, async ({ page }) => {
    await page.goto(`/?catalogs=off&view=${view}`);
    const rows = page.locator(view === 'table' ? '.ratings-table tbody > tr' : '#collection .game-card');
    await expect(rows).toHaveCount(24);
    const more = page.getByRole('button', { name: 'Show 24 more', exact: true });
    await more.focus();
    await more.press('Enter');
    await expect(rows).toHaveCount(48);
    const appended = rows.nth(24);
    await expect(appended).toHaveAttribute('data-game', libraryRecords[24].id);
    const title = appended.locator(view === 'table' ? '.table-game a' : '.game-link');
    await expect(title).toBeFocused();
    await expect(title).toBeInViewport();
    if (view === 'table') {
      expect(await page.locator('.ratings-scroll').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    }
    await page.keyboard.press('Tab');
    expect(await appended.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await expect(more).not.toBeFocused();
  });

  test(`pointer Show more does not redirect focus into the new ${view} batch`, async ({ page }) => {
    await page.goto(`/?catalogs=off&view=${view}`);
    const rows = page.locator(view === 'table' ? '.ratings-table tbody > tr' : '#collection .game-card');
    await expect(rows).toHaveCount(24);
    const more = page.getByRole('button', { name: 'Show 24 more', exact: true });
    await more.click();
    await expect(rows).toHaveCount(48);
    await expect(more).toBeFocused();
    await expect(rows.nth(24).locator(view === 'table' ? '.table-game a' : '.game-link')).not.toBeFocused();
  });
}

import { expect, test } from '@playwright/test';
import type { LibraryRecord } from '../src/lib/personal-types';
import { installGuestLibrary, libraryFixture } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

const additions: LibraryRecord[] = Array.from({ length: 4 }, (_, index) => ({
  id: `manual:copy-${index}`, source: 'manual', sourceId: `copy-${index}`,
  title: `Red Dead Redemption 2 custom entry ${index + 1}`,
  year: null, studio: null, genre: null, collectionRank: null, sourceUrl: null,
}));

for (const width of [320, 393, 768, 1440]) {
  test(`collection scope, native filter names and list semantics at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/catalog?**', route => route.abort('blockedbyclient'));
    await installGuestLibrary(page, {
      ...libraryFixture(0),
      records: Object.fromEntries(additions.map(record => [record.id, record])),
    });
    const before = await readLibrary(page);
    for (const view of ['grid', 'list', 'table']) {
      await page.goto(`/?catalogs=off&view=${view}&q=Red%20Dead%20Redemption%202`);
      await expect(page.locator('.result-summary [role="status"]')).toHaveText('1 in The 100 · 4 beyond The 100');
      await expect(page.getByRole('heading', { name: 'The collection, 100', exact: true })).toBeVisible();
      const summary = page.locator('.collection-filters > summary');
      if (width <= 760) {
        await expect(summary).toBeVisible();
        await expect(summary).toHaveAccessibleName('Filters & sort');
        await expect(summary).toHaveAccessibleDescription('1 active');
        await summary.focus();
        await summary.press('Enter');
      } else {
        await expect(summary).toBeHidden();
      }
      await expect(page.locator('.collection-filters')).toHaveAttribute('open', '');
      await expect(page.locator('.collection-filters .browse-filters-content')).toBeVisible();
      await expect(page.getByRole('button', { name: 'All games, 104', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play later, 0', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Completed, 0', exact: true })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Genre', exact: true })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Sort', exact: true })).toBeVisible();
      if (view !== 'table') {
        const list = page.getByRole('list', { name: 'Games in this view', exact: true });
        await expect(list.getByRole('listitem')).toHaveCount(1);
        await expect(list.getByRole('link', { name: /Red Dead Redemption 2/ })).toBeVisible();
      } else {
        await expect(page.locator('.ratings-table tbody tr')).toHaveCount(1);
      }
      await expect(page.getByRole('heading', { name: 'Beyond The 100', exact: true })).toBeVisible();
      await expect(page.locator('.extended-heading')).toContainText('4 matches');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('searchbox', { name: 'Search games, studios or genres', exact: true }).fill('custom');
      await expect(page.locator('.result-summary [role="status"]')).toHaveText('0 in The 100 · 4 beyond The 100');
      await expect(page.locator('.curated-empty')).toContainText('No matches');
      await expect(page.locator('[data-unranked-id]')).toHaveCount(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(await readLibrary(page)).toEqual(before);
  });
}

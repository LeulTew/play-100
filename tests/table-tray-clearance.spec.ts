import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { libraryRecords } from './library-pagination-helpers';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 320, height: 568 },
  { width: 851, height: 393 },
]) {
  test(`table pin keeps tray and next action clear at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await emptyCatalogs(page);
    await page.goto('/?view=table&catalogs=off');
    const rows = page.locator('.ratings-table tbody > tr');
    await expect(rows).toHaveCount(24);
    await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
    const first = rows.nth(0).getByRole('button', { name: /^(Pin for|Unpin from) comparison:/ });
    const second = rows.nth(1).getByRole('button', { name: /^(Pin for|Unpin from) comparison:/ });
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    const tray = page.locator('.ratings-tray-strip .compare-tray-dock');
    await expect(page.locator('.compare-tray-dock')).toHaveCount(1);
    await expect(tray).toHaveAttribute('data-layout', 'inline');
    await expect
      .poll(() =>
        tray.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const header = document.querySelector('.site-header')?.getBoundingClientRect();
          const navigation = document.querySelector('.mobile-nav')?.getBoundingClientRect();
          const table = element.closest('.ratings-mode')?.querySelector('.ratings-scroll')?.getBoundingClientRect();
          return {
            inside:
              bounds.top >= (header?.bottom ?? 0) &&
              bounds.left >= 0 &&
              bounds.right <= innerWidth &&
              bounds.bottom <= (navigation?.height ? navigation.top : innerHeight),
            belowTable: table !== undefined && table.bottom <= bounds.top,
          };
        }),
      )
      .toEqual({ inside: true, belowTable: true });
    // This must succeed before Playwright can scroll or wait for an obscuring dock to move.
    expect(
      await second.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return element.contains(hit);
      }),
    ).toBe(true);
    await second.click();
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect(tray.locator('.compare-tray-expand')).toContainText('2 games');
    const pins = await page.evaluate(() => {
      const raw = localStorage.getItem('play100:compare-tray:v1:guest');
      if (!raw) throw new Error('Accepted table pins must be stored in the guest tray.');
      return JSON.parse(raw).items.map((record: { id: string }) => record.id);
    });
    expect(pins).toEqual(libraryRecords.slice(0, 2).map((record) => record.id));
  });
}

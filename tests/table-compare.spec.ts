import { expect, test } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

test('table rows expose the same bounded metadata-only comparison path', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installGuestLibrary(page, libraryFixture(0));
  await page.goto('/?view=table&catalogs=off');
  await expect(page.locator('.ratings-table tbody tr')).toHaveCount(24);
  await expect(page.locator('.table-progress button[aria-label^="Pin "]')).toHaveCount(24);
  const before = await readLibrary(page);
  for (const record of libraryRecords.slice(0, 7)) {
    const pin = page.locator('.ratings-table').getByRole('button', { name: `Pin ${record.title} for comparison`, exact: true });
    await pin.click();
  }
  await expect(page.locator('.compare-tray-dock')).toContainText('6 games');
  await expect(page.locator('.compare-tray-dock .compare-tray-error')).toContainText('six games');
  const remove = page.locator('.ratings-table').getByRole('button', { name: `Unpin ${libraryRecords[0].title} from comparison`, exact: true });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await remove.focus();
  await remove.press('Enter');
  await expect(page.locator('.compare-tray-error')).toHaveCount(0);
  await expect(page.locator('.compare-tray-dock')).toContainText('5 games');
  await page.locator('.ratings-table').getByRole('button', { name: `Pin ${libraryRecords[6].title} for comparison`, exact: true }).click();
  await expect(page.locator('.compare-tray-dock')).toContainText('6 games');
  expect(await readLibrary(page)).toEqual(before);
});

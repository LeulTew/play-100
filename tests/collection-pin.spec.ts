import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { readLibrary } from './library-helpers';

for (const view of ['grid', 'list', 'table'] as const) {
  test(`${view} pins and unpins inline without changing the private library`, async ({ page }) => {
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?view=${view}&catalogs=off`);
    const row = page.locator(
      `${view === 'table' ? '.ratings-table tr' : '.game-card'}[data-game="red-dead-redemption-2"]`,
    );
    await expect(row).toBeVisible();
    const before = await readLibrary(page);
    const pin = row.getByRole('button', { name: 'Pin for comparison: Red Dead Redemption 2', exact: true });
    await pin.focus();
    const element = await pin.elementHandle();
    if (!element) throw new Error('The inline comparison toggle must be mounted.');
    await pin.press('Enter');
    const unpin = row.getByRole('button', { name: 'Unpin from comparison: Red Dead Redemption 2', exact: true });
    await expect(unpin).toHaveAttribute('aria-pressed', 'true');
    await expect(unpin).toBeEnabled();
    await expect(unpin).not.toHaveAttribute('aria-disabled');
    expect(await element.evaluate((node) => node.isConnected && node === document.activeElement)).toBe(true);
    await expect(page.locator('.compare-tray-expand')).toContainText('1 game');
    await unpin.press('Enter');
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await expect(pin).toBeFocused();
    await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
    expect(await readLibrary(page)).toEqual(before);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await element.dispose();
  });
}

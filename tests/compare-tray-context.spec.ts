import { expect, test } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';
import { closeDialog } from './readability-helpers';

for (const width of [320, 393, 768, 1440]) {
  test(`tray feedback and contextual chip leave page-end actions clear at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installGuestLibrary(page, libraryFixture(0));
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    for (const record of libraryRecords.slice(0, 7)) {
      await page.getByRole('button', { name: `Pin ${record.title} for comparison`, exact: true }).click();
    }
    const dock = page.locator('.compare-tray-dock');
    await expect(dock.locator('.compare-tray-error')).toContainText('six games');
    const failedPin = page.getByRole('button', { name: `Pin ${libraryRecords[6].title} for comparison`, exact: true });
    await expect(failedPin).toBeFocused();
    const failedHit = await failedPin.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    });
    expect(failedHit).toBe(true);
    const errorBounds = await dock.evaluate(element => {
      const dock = element.getBoundingClientRect();
      const error = element.querySelector('.compare-tray-error')!.getBoundingClientRect();
      const reserve = document.querySelector('.compare-tray-reserve')!.getBoundingClientRect();
      return { errorTop: error.top, errorBottom: error.bottom, dockTop: dock.top, dockBottom: dock.bottom, reserve: reserve.height, occupied: innerHeight - dock.top };
    });
    expect(errorBounds.errorTop).toBeGreaterThanOrEqual(errorBounds.dockTop);
    expect(errorBounds.errorBottom).toBeLessThanOrEqual(errorBounds.dockBottom);
    expect(errorBounds.reserve).toBeGreaterThanOrEqual(errorBounds.occupied);
    const completed = page.locator('.game-card').nth(6).getByRole('button', { name: /completed/i });
    await completed.focus();
    const hit = await completed.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    });
    expect(hit).toBe(true);
    await completed.press('Enter');
    await expect(completed).toHaveAttribute('aria-pressed', 'true');
    await dock.getByRole('button', { name: 'Dismiss Compare tray message', exact: true }).click();
    await expect(dock.locator('.compare-tray-error')).toHaveCount(0);
    await expect(dock.locator('.compare-tray-expand')).toBeFocused();
    const pins = await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'));
    const before = await readLibrary(page);
    for (const route of ['/my-games?tab=queue&catalogs=off', '/my-games?tab=library&catalogs=off', '/?q=NoMatchContextFixture&catalogs=off']) {
      await page.goto(route);
      await expect(page.locator('.compare-tray-expand')).toBeVisible();
      await expect(page.locator('.compare-tray-action')).toBeHidden();
      await expect(page.locator('.compare-tray-stack')).toBeHidden();
      await expect(page.locator('.compare-tray-expand')).toContainText('Compare tray');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const geometry = await page.evaluate(() => {
        const dock = document.querySelector('.compare-tray-dock')!.getBoundingClientRect();
        const footer = document.querySelector('.site-footer')!.getBoundingClientRect();
        const button = document.querySelector('.compare-tray-expand')!.getBoundingClientRect();
        const manual = document.querySelector('.manual-add summary')?.getBoundingClientRect();
        return {
          dockTop: dock.top, footerBottom: footer.bottom, manualBottom: manual?.bottom,
          buttonWidth: button.width, buttonHeight: button.height,
          width: document.documentElement.scrollWidth, viewport: innerWidth,
        };
      });
      expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.dockTop);
      if (geometry.manualBottom !== undefined) expect(geometry.manualBottom).toBeLessThanOrEqual(geometry.dockTop);
      expect(geometry.buttonWidth).toBeGreaterThanOrEqual(44);
      expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44);
      expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
      await page.locator('.compare-tray-expand').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Compare tray', exact: true })).toBeVisible();
      await expect(page.locator('.compare-tray-games > li')).toHaveCount(6);
      await closeDialog(page);
      await expect(page.locator('.compare-tray-expand')).toBeFocused();
    }
    expect(await readLibrary(page)).toEqual(before);
    expect(await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'))).toBe(pins);
  });
}

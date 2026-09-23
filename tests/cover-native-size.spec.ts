import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

async function expectNativeLayout(page: Page, selector: string) {
  const images = page.locator(selector);
  expect(await images.count(), `No workbook images found in ${selector}`).toBeGreaterThan(0);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0)).toBe(true);
    const size = await image.evaluate(node => {
      if (!(node instanceof HTMLImageElement)) throw new Error('Expected a workbook image.');
      return {
        src: node.currentSrc, width: node.offsetWidth, height: node.offsetHeight,
        naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight,
      };
    });
    // Rotation enlarges getBoundingClientRect's envelope, not the image's layout or pixels.
    expect(size.width, JSON.stringify(size)).toBeGreaterThan(0);
    expect(size.height, JSON.stringify(size)).toBeGreaterThan(0);
    expect(size.width, JSON.stringify(size)).toBeLessThanOrEqual(size.naturalWidth);
    expect(size.height, JSON.stringify(size)).toBeLessThanOrEqual(size.naturalHeight);
  }
}

test.beforeEach(async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 393 : 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emptyCatalogs(page);
});

test('every rendered grid/list cover and original detail uses native layout pixels', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expectNativeLayout(page, '.games-grid .game-cover img');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expectNativeLayout(page, '.games-list .game-cover img');
  for (const slug of ['red-dead-redemption-2', 'grand-theft-auto-iv', 'mass-effect']) {
    await page.locator(`.game-card[data-game="${slug}"] .game-link`).click();
    await expect(page.locator('.game-dialog[open]')).toBeVisible();
    await expectNativeLayout(page, '.detail-cover .game-cover img');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  }
});

test('canonical Discover covers and comparison thumbnails never enlarge workbook art', async ({ page }) => {
  await page.goto('/discover?catalogs=off&source=collection&include100=on');
  await expect(page.locator('.discovery-card')).toHaveCount(24);
  await expectNativeLayout(page, '.discovery-card .game-cover img');
  const cards = page.locator('.discovery-card');
  for (const index of [0, 1, 2]) {
    await cards.nth(index).getByRole('button', { name: /^Pin .* for comparison$/, exact: false }).click();
  }
  await expectNativeLayout(page, '.compare-tray-dock img[src^="/covers/"]');
  await page.locator('.compare-tray-expand').click();
  await expect(page.locator('.compare-tray-sheet[open]')).toBeVisible();
  await expectNativeLayout(page, '.compare-tray-sheet img[src^="/covers/"]');
});

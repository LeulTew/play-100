import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function geometry(page: Page, anchor: Locator) {
  return {
    scroll: await page.evaluate(() => ({ x: scrollX, y: scrollY })),
    box: await anchor.boundingBox(),
  };
}

async function expectUnshifted(page: Page, anchor: Locator, before: Awaited<ReturnType<typeof geometry>>) {
  const after = await geometry(page, anchor);
  expect(before.box).not.toBeNull();
  expect(after.box).not.toBeNull();
  expect(Math.abs(after.scroll.y - before.scroll.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.scroll.x - before.scroll.x)).toBeLessThanOrEqual(1);
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(after.box![key] - before.box![key]), `Background ${key}`).toBeLessThanOrEqual(1);
  }
}

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const view of ['grid', 'list'] as const) {
  test(`${view}: scrolled native Menu and detail preserve background geometry and exact focus return`, async ({ page, isMobile }) => {
    await page.goto(`/?catalogs=off&view=${view}`);
    const cards = page.locator('.game-card');
    await expect(cards).toHaveCount(24);
    await page.evaluate(() => document.fonts.ready);
    const source = cards.nth(12);
    const title = source.locator('.game-copy h3');
    await source.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await settle(page);
    const beforeMenu = await geometry(page, title);
    const menuTrigger = page.getByRole('button', { name: 'Menu', exact: true });
    const point = await menuTrigger.evaluate(node => {
      const box = node.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight || !node.contains(document.elementFromPoint(x, y))) {
        throw new Error('The visible Menu trigger must be unobstructed before native activation.');
      }
      return { x, y };
    });
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
    await expect(menu.locator('[data-autofocus]')).toBeFocused();
    expect(await menu.evaluate(node => node.matches(':modal'))).toBe(true);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await expectUnshifted(page, title, beforeMenu);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(menuTrigger).toBeFocused();
    await expectUnshifted(page, title, beforeMenu);
    const link = source.locator('.game-link');
    await link.focus();
    await settle(page);
    const beforeDetail = await geometry(page, title);
    await link.press('Enter');
    const detail = page.locator('.game-dialog');
    await expect(detail.locator('[data-autofocus]')).toBeFocused();
    expect(await detail.evaluate(node => node.matches(':modal'))).toBe(true);
    await expectUnshifted(page, title, beforeDetail);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(link).toBeFocused();
    await expectUnshifted(page, title, beforeDetail);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
}

test('offscreen content remains findable, focusable and printable without containing modal or motion hosts', async ({ page }) => {
  await page.goto('/?catalogs=off');
  const cards = page.locator('.game-card');
  await expect(cards).toHaveCount(24);
  expect(await cards.nth(20).evaluate(node => getComputedStyle(node).contentVisibility)).toBe('auto');
  expect(await cards.first().evaluate(node => getComputedStyle(node).contentVisibility)).toBe('visible');
  const link = cards.nth(20).locator('.game-link');
  await link.focus();
  await expect(link).toBeFocused();
  await expect(link).toBeInViewport();
  await page.evaluate(() => { scrollTo(0, 0); window.getSelection()?.removeAllRanges(); });
  const title = await cards.nth(22).locator('h3').innerText();
  // Chromium's native find uses auto-visible content, unlike hidden virtualization.
  expect(await page.evaluate(text => {
    if (!('find' in window) || typeof window.find !== 'function') {
      throw new Error('This proof requires the native Chromium find implementation.');
    }
    return window.find(text);
  }, title)).toBe(true);
  await page.evaluate(() => document.getElementById('collection-films')?.scrollIntoView({ behavior: 'instant' }));
  await expect(page.getByRole('heading', { name: 'Watch films', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: /^Watch .* seconds$/ }).first().click();
  const film = page.locator('.film-dialog');
  await expect(film).toBeVisible();
  expect(await film.evaluate(node => getComputedStyle(node.closest('.collection-films')!).contentVisibility)).toBe('visible');
  await page.keyboard.press('Escape');
  await page.emulateMedia({ media: 'print' });
  for (const target of [cards.nth(20), page.locator('.workbook-section'), page.locator('.site-footer')]) {
    expect(await target.evaluate(node => getComputedStyle(node).contentVisibility)).toBe('visible');
  }
});

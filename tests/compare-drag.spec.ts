import { expect, test } from '@playwright/test';
import { parseCompareTray } from '../src/lib/compare-tray';
import { readLibrary } from './library-helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/catalog?**', route => route.fulfill({ status: 503, json: { error: 'Controlled offline provider.' } }));
});

for (const scenario of [
  { name: 'collection card artwork', url: '/?catalogs=off', card: '.game-card', source: '.game-link .game-cover', identity: 'data-game' },
  { name: 'collection title', url: '/?catalogs=off', card: '.game-card', source: '.game-link h3', identity: 'data-game' },
  { name: 'Discover title', url: '/discover?catalogs=off', card: '.discovery-card', source: 'h3 button', identity: 'data-catalog-id' },
]) {
  test(`actual native ${scenario.name} drag pins metadata without opening or changing the library`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'Native mouse contract; the touch experiment has a separate owned fixture.');
    await page.goto(scenario.url);
    const card = page.locator(scenario.card).first();
    await expect(card.locator('.compare-drag-handle')).toBeEnabled();
    const id = await card.getAttribute(scenario.identity);
    if (!id) throw new Error('The current Compare source has no exact identity.');
    const before = await readLibrary(page);
    const source = card.locator(scenario.source);
    await source.scrollIntoViewIfNeeded();
    const box = await source.boundingBox();
    if (!box) throw new Error('The real Compare source is not laid out.');
    const x = box.x + Math.min(20, box.width / 2);
    const y = box.y + Math.min(20, box.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 26, y + 18, { steps: 8 });
    const dock = page.getByRole('complementary', { name: 'Pinned games for comparison', exact: true });
    await expect(dock).toContainText('Drop to pin');
    await expect(page.locator('.compare-drag-ghost')).toHaveCount(1);
    await expect(page.locator('.compare-drag-ghost')).toHaveText('Pin to Compare');
    const target = await dock.boundingBox();
    if (!target) throw new Error('The actual Compare target is not laid out.');
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true })).toBeVisible();
    await expect(page.locator('dialog[open],.compare-drag-ghost')).toHaveCount(0);
    const raw = await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'));
    if (!raw) throw new Error('The accepted pin was not persisted in the guest tray.');
    expect(parseCompareTray(raw, 'guest').map(record => record.id)).toEqual([id]);
    expect(await readLibrary(page)).toEqual(before);
    const title = card.locator(scenario.card === '.game-card' ? '.game-link' : 'h3 button');
    await title.focus();
    await title.press('Enter');
    await expect(page.locator('dialog[open]')).toHaveCount(1);
  });
}

test('coarse Compare grip remains a 44px Pin alternative with native scrolling and dock clearance at 320px', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The narrow coarse-pointer layout is a separate required path.');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/discover?q=0%20A.D.&catalogs=off');
  const card = page.locator('[data-catalog-id="wikidata:Q161234"]');
  const grip = card.locator('.compare-drag-handle');
  await expect(grip).toBeVisible();
  await expect(grip).toBeEnabled();
  await grip.scrollIntoViewIfNeeded();
  const bounds = await grip.boundingBox();
  if (!bounds) throw new Error('The coarse Compare grip has no hit target.');
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  const before = await readLibrary(page);
  await grip.tap();
  await expect(page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true })).toBeVisible();
  await expect(page.locator('dialog[open],.compare-drag-ghost')).toHaveCount(0);
  const geometry = await page.evaluate(() => ({
    dock: document.querySelector('.compare-tray-dock')!.getBoundingClientRect().toJSON(),
    nav: document.querySelector('.mobile-nav')!.getBoundingClientRect().toJSON(),
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    coarse: matchMedia('(pointer: coarse)').matches,
  }));
  expect(geometry.coarse).toBe(true);
  expect(geometry.dock.bottom).toBeLessThanOrEqual(geometry.nav.top);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);
  expect(await readLibrary(page)).toEqual(before);
});

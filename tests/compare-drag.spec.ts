import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { compareTrayStorageKey, parseCompareTray } from '../src/lib/compare-tray';
import { applyPersonalAction } from '../src/lib/personal-library';
import { readLibrary } from './library-helpers';
import { installGuestLibrary, libraryFixture } from './library-pagination-helpers';

const guestTrayKey = compareTrayStorageKey('guest');
const trayRaw = (page: Page) => page.evaluate(key => localStorage.getItem(key), guestTrayKey);
const publicSources = [
  { name: 'collection card artwork', url: '/?catalogs=off', card: '.game-card', source: '.game-link .game-cover', identity: 'data-game' },
  { name: 'collection title', url: '/?catalogs=off', card: '.game-card', source: '.game-link h3', identity: 'data-game' },
  { name: 'Discover title', url: '/discover?catalogs=off', card: '.discovery-card', source: 'h3 button', identity: 'data-catalog-id' },
];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/catalog?**', route => route.fulfill({ status: 503, json: { error: 'Controlled offline provider.' } }));
});

async function dropIntoFirstEmptyTray(page: Page, context: BrowserContext, source: Locator, touch: boolean) {
  const url = page.url();
  await expect(page.locator('.compare-tray-dock,.compare-drag-ghost,.drag-preview,dialog[open]')).toHaveCount(0);
  expect(await trayRaw(page)).toBeNull();
  await page.evaluate(() => document.fonts.ready);
  await source.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = await source.boundingBox();
  if (!box) throw new Error('The actual broad Compare source is not laid out.');
  const start = { x: box.x + Math.min(24, box.width / 2), y: box.y + Math.min(22, box.height / 2) };
  expect(await source.evaluate((element, point) => {
    const hit = document.elementFromPoint(point.x, point.y);
    return Boolean(hit && element.contains(hit) && !hit.closest('.compare-drag-handle,.drag-handle'));
  }, start)).toBe(true);
  expect(await source.evaluate(element => getComputedStyle(element).touchAction)).not.toBe('none');
  const cdp = touch ? await context.newCDPSession(page) : null;
  let held = false;
  try {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      held = true;
      await page.waitForTimeout(310);
      await expect(page.locator('.compare-tray-dock,.compare-drag-ghost')).toHaveCount(0);
      // The 8px tolerance is pre-hold; this deliberate move reaches the UA's touchmove delivery threshold.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 24, y: start.y + 24 }] });
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      held = true;
      await page.mouse.move(start.x + 24, start.y + 24, { steps: 8 });
    }
    const dock = page.getByRole('complementary', { name: 'Pinned games for comparison', exact: true });
    await expect(dock).toHaveAttribute('data-dragging', 'true');
    await expect(dock).toContainText('Drop to pin');
    await expect(page.locator('.compare-drag-ghost')).toHaveCount(1);
    await expect(page.locator('.compare-drag-ghost')).toHaveText('Pin for comparison');
    await expect(page.locator('.drag-preview,dialog[open]')).toHaveCount(0);
    expect(await trayRaw(page)).toBeNull();
    const target = await dock.boundingBox();
    if (!target) throw new Error('The first empty Compare dock did not produce a real drop target.');
    const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    expect(await dock.evaluate((element, point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return Boolean(hit && element.contains(hit));
    }, end)).toBe(true);
    if (cdp) {
      const nav = await page.locator('.mobile-nav').boundingBox();
      if (!nav) throw new Error('The coarse app navigation is not laid out.');
      expect(target.y + target.height).toBeLessThanOrEqual(nav.y);
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{
            x: start.x + 24 + (end.x - start.x - 24) * step / 8,
            y: start.y + 24 + (end.y - start.y - 24) * step / 8,
          }],
        });
      }
      await expect(dock).toHaveAttribute('data-compare-drop-ready', 'true');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(end.x, end.y, { steps: 12 });
      await page.mouse.up();
    }
    held = false;
    await expect(page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true })).toBeVisible();
    await expect(page.locator('.compare-drag-ghost,.drag-preview,dialog[open]')).toHaveCount(0);
    expect(page.url()).toBe(url);
  } finally {
    try {
      if (held) {
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        else await page.mouse.up();
      }
    } finally { await cdp?.detach(); }
  }
}

async function reorderWithDedicatedGrip(page: Page, context: BrowserContext, row: Locator, nextRow: Locator, touch: boolean) {
  await row.evaluate(element => {
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - headerBottom - 16, behavior: 'instant' });
  });
  const grip = row.locator('.record-order > .drag-handle');
  await expect(grip).toBeEnabled();
  expect(await grip.evaluate(element => element.closest('[data-compare-drag-source]') === null)).toBe(true);
  const startBox = await grip.boundingBox();
  const targetBox = await nextRow.boundingBox();
  if (!startBox || !targetBox) throw new Error('The dedicated private reorder targets are not laid out.');
  const start = { x: startBox.x + startBox.width / 2, y: startBox.y + startBox.height / 2 };
  const endY = targetBox.y + targetBox.height / 2;
  expect(endY).toBeLessThan(await page.evaluate(() => innerHeight));
  const cdp = touch ? await context.newCDPSession(page) : null;
  let held = false;
  try {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      held = true;
      await page.waitForTimeout(220);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y + 4 }] });
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      held = true;
      await page.mouse.move(start.x, start.y + 10, { steps: 4 });
    }
    await expect(page.locator('.drag-preview')).toBeVisible();
    await expect(page.locator('.drag-preview')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.compare-drag-ghost')).toHaveCount(0);
    await expect(page.locator('.compare-tray-dock')).toHaveAttribute('data-dragging', 'false');
    if (cdp) {
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: start.x, y: start.y + 4 + (endY - start.y - 4) * step / 8 }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(start.x, endY, { steps: 12 });
      await page.mouse.up();
    }
    held = false;
    await expect(page.locator('.drag-preview,.compare-drag-ghost,dialog[open]')).toHaveCount(0);
  } finally {
    try {
      if (held) {
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        else await page.mouse.up();
      }
    } finally { await cdp?.detach(); }
  }
}

for (const scenario of publicSources) {
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
    await expect(page.locator('.compare-drag-ghost')).toHaveText('Pin for comparison');
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

  test(`actual coarse 320px ${scenario.name} hold reaches the first empty dock and preserves the fresh next tap`, async ({ page, context, isMobile }) => {
    test.skip(!isMobile, 'This proves the actual coarse 320px broad surface, not the grip alternative.');
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(scenario.url);
    const card = page.locator(scenario.card).first();
    await expect(card.locator('.compare-drag-handle')).toBeEnabled();
    const capabilities = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight,
      coarse: matchMedia('(pointer: coarse)').matches, touchPoints: navigator.maxTouchPoints,
    }));
    expect(capabilities.width).toBe(320);
    expect(capabilities.height).toBe(740);
    expect(capabilities.coarse).toBe(true);
    expect(capabilities.touchPoints).toBeGreaterThan(0);
    const id = await card.getAttribute(scenario.identity);
    if (!id) throw new Error('The actual coarse card has no exact action identity.');
    const before = await readLibrary(page);
    await dropIntoFirstEmptyTray(page, context, card.locator(scenario.source), true);
    const title = card.locator(scenario.card === '.game-card' ? '.game-link h3' : 'h3 button');
    await title.tap();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect.poll(() => new URL(page.url()).searchParams.get('game')).toBe(id);
    const raw = await trayRaw(page);
    if (!raw) throw new Error('The broad touch drop did not persist a validated guest tray.');
    expect(parseCompareTray(raw, 'guest').map(record => record.id)).toEqual([id]);
    expect(await readLibrary(page)).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const kind of ['queue', 'ranking'] as const) {
  test(`private ${kind} Compare title drag preserves all data while its separate reorder grip still works`, async ({ page, context, isMobile }) => {
    const fixture = libraryFixture(3);
    await installGuestLibrary(page, fixture, '/my-games?tab=queue&catalogs=off');
    if (kind === 'ranking') await page.getByRole('navigation', { name: 'My games views' }).getByRole('button', { name: /^Ranking/ }).click();
    const editor = page.locator('.my-games-editor:visible');
    await expect(editor).toHaveCount(1);
    const list = editor.getByRole('list', { name: kind === 'queue' ? 'Your play order' : 'Your ranked games', exact: true });
    await expect(list.locator('.personal-row')).toHaveCount(3);
    const before = await readLibrary(page);
    const ids = kind === 'queue' ? before.queueOrder : before.ranking.map(entry => entry.id);
    const [firstId, secondId] = ids;
    if (!firstId || !secondId) throw new Error('The private order fixture requires two exact records.');
    const row = list.locator(`[data-record-id="${firstId}"]`);
    const nextRow = list.locator(`[data-record-id="${secondId}"]`);
    await expect(row.locator('.compare-drag-handle')).toBeEnabled();
    expect(await row.getAttribute('data-compare-drag-source')).toBeNull();
    if (isMobile) {
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0)).toBe(true);
    }
    await dropIntoFirstEmptyTray(page, context, row.locator('.record-title'), isMobile);
    expect(await readLibrary(page)).toEqual(before);
    const pinned = await trayRaw(page);
    if (!pinned) throw new Error('The private title was not pinned through the Compare tray.');
    expect(parseCompareTray(pinned, 'guest')).toEqual([before.records[firstId]]);
    expect(await list.locator('.personal-row').evaluateAll(rows => rows.map(element => element.getAttribute('data-record-id')))).toEqual(ids);
    await reorderWithDedicatedGrip(page, context, row, nextRow, isMobile);
    const expected = applyPersonalAction(before, { type: 'move-item', list: kind, id: firstId, overId: secondId });
    await expect.poll(() => readLibrary(page)).toEqual(expected);
    expect(await trayRaw(page)).toBe(pinned);
    await expect(list.locator('.personal-row').first()).toHaveAttribute('data-record-id', secondId);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
}

test('coarse cards expose one 44px Pin path without a focusable drag handle at 320px', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The narrow coarse-pointer layout is a separate required path.');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/discover?q=0%20A.D.&catalogs=off');
  const card = page.locator('[data-catalog-id="wikidata:Q161234"]');
  const grip = card.locator('.compare-drag-handle');
  await expect(grip).toBeHidden();
  await expect(grip).toHaveAttribute('aria-hidden', 'true');
  await expect(grip).toHaveAttribute('tabindex', '-1');
  const pin = card.getByRole('button', { name: 'Pin for comparison: 0 A.D.', exact: true });
  await pin.scrollIntoViewIfNeeded();
  const bounds = await pin.boundingBox();
  if (!bounds) throw new Error('The coarse Compare Pin has no hit target.');
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  const before = await readLibrary(page);
  await pin.tap();
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

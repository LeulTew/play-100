import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { canonicalCatalogId } from '../src/lib/catalog-identity';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { emptyPersonalLibrary } from '../src/lib/personal-library';
import type { MotionPreference } from '../src/lib/types';
import { installGuestLibrary, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

const originals = libraryRecords.slice(0, 100);
const catalog = parseDiscoveryCatalog(JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')));
const additions = catalog.items.map(item => item.record).filter(record => canonicalCatalogId(record.id) === record.id && record.collectionRank === null);
const modes = [
  { name: 'full', preference: 'full', reducedMotion: 'no-preference' },
  { name: 'lite', preference: 'lite', reducedMotion: 'no-preference' },
  { name: 'reduced', preference: 'full', reducedMotion: 'reduce' },
] as const;

test.beforeEach(async ({ page, baseURL }) => {
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname);
  await page.route('**/api/catalog?**', route => route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }));
});

async function prepare(page: Page, total: number, motion: MotionPreference) {
  const records = [...originals, ...additions.slice(0, total - 100)];
  expect(new Set(records.map(record => record.id)).size).toBe(total);
  await installGuestLibrary(page, {
    ...emptyPersonalLibrary(), motion,
    records: Object.fromEntries(records.map(record => [record.id, record])),
  });
  await page.evaluate(items => {
    localStorage.setItem('play100:compare-tray:v1:guest', JSON.stringify({ version: 1, scope: 'guest', items }));
  }, originals.slice(0, 5));
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expect(page.locator('.result-summary [role="status"]')).toContainText('100 in The 100');
  await expect(page.getByRole('button', { name: 'Open Compare tray, 5 games', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function settleNativeScroll(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => {
    let previous = scrollY;
    let still = 0;
    const sample = () => {
      if (Math.abs(scrollY - previous) < 0.5) still += 1;
      else still = 0;
      previous = scrollY;
      if (still >= 6) resolve();
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
}

async function assertClearIdentity(page: Page, identity: Locator) {
  const bounds = await identity.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const target = element.closest('a') ?? element;
    const dock = document.querySelector('.compare-tray-dock')!.getBoundingClientRect();
    const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
    const header = document.querySelector('.site-header')!.getBoundingClientRect();
    return {
      top: rect.top, bottom: rect.bottom, dockTop: dock.top, navTop: nav.top, headerBottom: header.bottom,
      hits: [0.15, 0.5, 0.85].map(fraction => target.contains(document.elementFromPoint(rect.left + rect.width * fraction, rect.bottom - 2))),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.headerBottom);
  expect(bounds.bottom).toBeLessThanOrEqual(Math.min(bounds.dockTop, bounds.navTop) - 8);
  expect(bounds.hits).toEqual([true, true, true]);
  expect(bounds.overflow).toBe(false);
}

for (const width of [320, 393]) {
  for (const total of [100, 117, 500]) {
    for (const mode of modes) {
      test(`Explore clearance ${width}px ${total} games ${mode.name} uses the committed grid, list and table`, async ({ page, isMobile }) => {
        test.skip(!isMobile, 'Native coarse-pointer landing regression.');
        await page.setViewportSize({ width, height: width === 320 ? 740 : 852 });
        await page.emulateMedia({ reducedMotion: mode.reducedMotion });
        await prepare(page, total, mode.preference);
        await expect(page.locator('html')).toHaveAttribute('data-motion', mode.name === 'full' ? 'on' : 'off');
        const before = await readLibrary(page);
        const targets = await page.locator('.compare-tray-dock button').evaluateAll(buttons =>
          buttons.map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
        expect(targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
        await page.getByRole('link', { name: 'Explore all 100', exact: true }).tap();
        await settleNativeScroll(page);
        await assertClearIdentity(page, page.locator('.game-card h3').first());
        if (total > 100) await expect(page.locator('.result-summary [role="status"]')).toHaveText(`100 in The 100 · ${total - 100} beyond The 100`);
        await page.getByRole('button', { name: 'List view', exact: true }).tap();
        await expect(page.locator('.games-list')).toBeVisible();
        // Reset a real query on Explore; measuring the old filtered layout would be incorrect.
        await page.getByRole('searchbox', { name: 'Search games, studios or genres', exact: true }).fill('Mass Effect 2');
        await expect(page.locator('.game-card')).toHaveCount(1);
        await page.getByRole('link', { name: 'Explore all 100', exact: true }).tap();
        await expect(page.locator('.game-card')).toHaveCount(24);
        await settleNativeScroll(page);
        await assertClearIdentity(page, page.locator('.game-card h3').first());
        await expect(page.getByRole('button', { name: 'List view', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await page.getByRole('button', { name: 'Ratings table view', exact: true }).tap();
        await expect(page.locator('.ratings-table')).toBeVisible();
        await page.locator('.mobile-nav').getByRole('link', { name: 'The 100', exact: true }).tap();
        await settleNativeScroll(page);
        await assertClearIdentity(page, page.locator('tbody .table-game').first());
        expect(await readLibrary(page)).toEqual(before);
      });
    }
  }
}

for (const mode of modes) {
  for (const width of [320, 393]) {
    test(`live toast clearance ${width}px ${mode.name} keeps Compare and dismissal hittable`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'Native touch reproduction of Settings feedback over the dock.');
      await page.setViewportSize({ width, height: width === 320 ? 740 : 852 });
      await page.emulateMedia({ reducedMotion: mode.reducedMotion });
      await prepare(page, 117, mode.preference === 'lite' ? 'full' : 'lite');
      const account = page.locator('.account-nav');
      if (await account.count()) {
        await account.tap();
        const ready = page.getByRole('dialog', { name: 'Sign in', exact: true });
        await expect(ready.locator('#account-signin-title')).toBeFocused();
        await expect(account).toHaveAccessibleName('Account Device only');
        await ready.getByRole('button', { name: 'Close dialog', exact: true }).tap();
        await expect(ready).toHaveCount(0);
      }
      const before = await readLibrary(page);
      if (width === 320) {
        for (const record of originals.slice(5, 7)) {
          await page.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true }).tap();
        }
        await expect(page.locator('.compare-tray-dock .compare-tray-error')).toBeVisible();
      }
      const pins = await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'));
      await page.locator('.mobile-nav').getByRole('button', { name: 'Menu', exact: true }).tap();
      await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Settings & backups', exact: true }).tap();
      const settings = page.locator('.settings-dialog');
      await expect(settings.locator('#settings-title')).toBeFocused();
      const preference = settings.getByRole('radio', { name: mode.preference === 'lite' ? /^Lite/ : /^Full/ });
      await preference.tap();
      await expect(preference).toBeChecked();
      await expect(page.locator('html')).toHaveAttribute('data-motion', mode.name === 'full' ? 'on' : 'off');
      const toast = page.locator('.toast-visible');
      await expect(toast).toContainText('Visual preference saved.');
      const began = Date.now();
      await settings.getByRole('button', { name: 'Close dialog', exact: true }).tap();
      await expect(settings).toHaveCount(0);
      // Measure before attempting Compare: locator auto-wait must not hide a 6.5s obstruction.
      const live = await page.locator('.compare-tray-action').evaluate(element => {
        const action = element.getBoundingClientRect();
        const dock = document.querySelector('.compare-tray-dock')!.getBoundingClientRect();
        const error = document.querySelector('.compare-tray-dock .compare-tray-error')?.getBoundingClientRect();
        const notice = document.querySelector('.toast')!;
        const toast = notice.getBoundingClientRect();
        const dismiss = notice.querySelector('button')!;
        const close = dismiss.getBoundingClientRect();
        return {
          visible: notice.classList.contains('toast-visible'), text: notice.textContent,
          toastBottom: toast.bottom, dockTop: Math.min(dock.top, error?.top ?? dock.top),
          actionHit: element.contains(document.elementFromPoint(action.x + action.width / 2, action.y + action.height / 2)),
          dismissHit: dismiss.contains(document.elementFromPoint(close.x + close.width / 2, close.y + close.height / 2)),
          action: { x: action.x + action.width / 2, y: action.y + action.height / 2 },
          dismissal: { x: close.x + close.width / 2, y: close.y + close.height / 2 },
          announcement: notice.getAttribute('aria-live'), role: notice.getAttribute('role'),
        };
      });
      expect(Date.now() - began).toBeLessThan(4000);
      expect(live.visible).toBe(true);
      expect(live.text).toContain('Visual preference saved.');
      expect(live.toastBottom).toBeLessThanOrEqual(live.dockTop - 8);
      expect(live.actionHit).toBe(true);
      expect(live.dismissHit).toBe(true);
      expect(live.announcement).toBe('polite');
      expect(live.role).toBe('status');
      await page.touchscreen.tap(live.action.x, live.action.y);
      await expect(page.locator('.toast')).toContainText('Sign in to compare with friends.');
      if (await page.locator('.account-nav').count()) {
        const signIn = page.getByRole('dialog', { name: 'Sign in', exact: true });
        await expect(signIn).toBeVisible();
        await signIn.getByRole('button', { name: 'Keep using this device', exact: true }).tap();
        await expect(signIn).toHaveCount(0);
        await expect(page.locator('.compare-tray-action')).toBeFocused();
      }
      await expect(page.locator('.toast-visible')).toContainText('Sign in to compare with friends.');
      const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
      const dismissal = await dismiss.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
          hit: element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
        };
      });
      expect(dismissal.hit).toBe(true);
      if (mode.name === 'reduced') {
        await dismiss.focus();
        await expect(dismiss).toBeFocused();
        await dismiss.press('Enter');
      } else {
        await page.touchscreen.tap(dismissal.x, dismissal.y);
      }
      await expect(page.locator('.toast-visible')).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'))).toBe(pins);
      const after = await readLibrary(page);
      expect(after.records).toEqual(before.records);
      expect(after.ranking).toEqual(before.ranking);
      expect(after.queueOrder).toEqual(before.queueOrder);
    });
  }
}

test('an empty transient native drag does not reflow collection controls or reserve page space', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The coarse handle intentionally Pins; desktop uses native drag.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  const cards = page.locator('.game-card');
  await expect(cards).toHaveCount(24);
  await page.evaluate(() => document.fonts.ready);
  const settleLayout = () => page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  // Auto-visible cards start with estimated offscreen heights. Render every row
  // before measuring so scrolling/decoding cannot be mistaken for drag reflow.
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    await settleLayout();
    await card.locator('img').evaluateAll(images => Promise.all(images.map(image => {
      if (!(image instanceof HTMLImageElement)) throw new Error('Expected a collection cover image.');
      return image.decode();
    })));
  }
  const handle = cards.first().locator('.compare-drag-handle');
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  await settleLayout();
  const measure = () => page.evaluate(() => ({
    controls: [...document.querySelectorAll('.collection-title-line, .collection-search, .collection-utilities, .collection-extra-actions')].map(element => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top + scrollY, height: rect.height };
    }),
    height: document.documentElement.scrollHeight,
  }));
  const before = await measure();
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error('The native drag handle must have visible bounds.');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(bounds.x + bounds.width / 2 + 14, bounds.y + bounds.height / 2 + 8, { steps: 5 });
    await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2 + 12);
    await expect(page.locator('.compare-tray-dock')).toHaveAttribute('data-has-content', 'false');
    await expect(page.locator('.compare-tray-reserve')).toHaveCount(0);
    expect(await measure()).toEqual(before);
  } finally {
    await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
  await expect(page.locator('.compare-tray-reserve')).toHaveCount(0);
  expect(await measure()).toEqual(before);
});

test('operational status uses the utility scale and the header fits desktop and 200 percent reflow', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop account copy and its existing narrow-header fallback.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  await expect(page.locator('.artifact-status')).toBeVisible();
  expect(await page.locator('.artifact-status').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  const account = page.locator('.account-nav');
  test.skip(await account.count() === 0, 'Account copy requires the centrally configured online build.');
  const copy = account.locator('small');
  await expect(copy).toBeVisible();
  expect(await copy.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  const label = await account.getAttribute('aria-label');
  for (const width of [1440, 1101, 720]) {
    // 720 CSS px is 1440px at 200% reflow, not a claim of physical browser-zoom coverage.
    await page.setViewportSize({ width, height: width === 720 ? 500 : 1000 });
    await expect(account).toHaveAttribute('aria-label', label!);
    const layout = await account.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const header = document.querySelector('.site-header')!.getBoundingClientRect();
      return {
        fits: rect.right <= header.right && rect.left >= header.left && rect.bottom <= header.bottom,
        width: rect.width, height: rect.height, overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(layout.fits).toBe(true);
    expect(layout.overflow).toBe(false);
    expect(layout.width).toBeGreaterThanOrEqual(44);
    expect(layout.height).toBeGreaterThanOrEqual(44);
    if (width <= 1100) await expect(copy).toBeHidden();
  }
});

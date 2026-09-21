import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { canonicalCatalogId } from '../src/lib/catalog-identity';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import type { DiscoveryItem } from '../src/lib/discovery-catalog';

const catalog = parseDiscoveryCatalog(JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')));
const illustrated = catalog.items.find(item => item.artwork && canonicalCatalogId(item.record.id) === item.record.id);
const withoutArt = catalog.items.find(item => !item.artwork && canonicalCatalogId(item.record.id) === item.record.id);
if (!illustrated?.artwork || !withoutArt) throw new Error('Discover continuity requires existing illustrated and unillustrated noncanonical fixtures.');
const illustratedItem = illustrated;
const artwork = illustrated.artwork;
const withoutArtItem = withoutArt;
const developmentBuild = process.env.PLAY100_TEST_BUILD === 'development';

interface ContinuityReceipt {
  sourceReads: number;
  targetReads: number;
  nativeOpens: number;
  nativeCloses: number;
  animatedControlAncestor: boolean;
  animationDurations: (number | string | null)[];
}

declare global {
  interface Window {
    discoverContinuityReceipt?: ContinuityReceipt;
  }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/catalog?**', route => route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }));
});

function catalogUrl(item: DiscoveryItem) {
  const search = new URLSearchParams({ q: item.record.title.slice(0, 80), catalogs: 'off' });
  return `/discover?${search}`;
}

async function recordContinuity(page: Page) {
  await page.evaluate(() => {
    const receipt: ContinuityReceipt = { sourceReads: 0, targetReads: 0, nativeOpens: 0, nativeCloses: 0, animatedControlAncestor: false, animationDurations: [] };
    window.discoverContinuityReceipt = receipt;
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      const wasOpen = this.open;
      showModal.call(this);
      if (!wasOpen && this.matches('.catalog-detail-dialog')) receipt.nativeOpens += 1;
    };
    const close = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.close = function (returnValue) {
      const wasOpen = this.open;
      close.call(this, returnValue);
      if (wasOpen && this.matches('.catalog-detail-dialog')) receipt.nativeCloses += 1;
    };
    const measure = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this.matches('.discovery-card-art')) receipt.sourceReads += 1;
      if (this.matches('.catalog-detail-sleeve')) receipt.targetReads += 1;
      return measure.call(this);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.closest('.catalog-detail-dialog')) {
        const controls = 'button, input, select, textarea, a[href], summary, [contenteditable="true"]';
        receipt.animatedControlAncestor ||= this.matches(controls) || Boolean(this.querySelector(controls));
        const duration = typeof options === 'number' ? options : options?.duration;
        receipt.animationDurations.push(typeof duration === 'number' ? duration : String(duration));
      }
      return animate.call(this, frames, options);
    };
  });
}

async function openCatalogDetail(page: Page, item: DiscoveryItem, beforeOpen?: () => Promise<void>) {
  await page.goto(catalogUrl(item));
  const card = page.locator(`[data-catalog-id="${item.record.id}"]`);
  const opener = card.getByRole('button', { name: item.record.title, exact: true });
  await expect(opener).toBeVisible();
  const before = page.url();
  await beforeOpen?.();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: item.record.title, exact: true });
  await expect(dialog).toBeVisible();
  return { card, opener, before, dialog };
}

test('catalog detail reuses exact licensed artwork, complete credits and native return focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { card, dialog, opener, before } = await openCatalogDetail(page, illustratedItem);
  await expect(dialog).toHaveClass(/catalog-detail-dialog/);
  await expect(dialog).not.toHaveClass(/game-dialog/);
  const image = dialog.locator('.catalog-detail-sleeve img');
  await expect(image).toHaveAttribute('src', artwork.src);
  await expect(card.locator('.discovery-card-art > img')).toHaveAttribute('src', artwork.src);
  await expect(image).toHaveAttribute('width', String(artwork.width));
  await expect(image).toHaveAttribute('height', String(artwork.height));
  await expect(dialog.getByRole('heading', { name: illustratedItem.record.title, exact: true })).toBeFocused();
  await expect.poll(() => image.evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0)).toBe(true);
  const dimensions = await image.evaluate(node => {
    if (!(node instanceof HTMLImageElement)) throw new Error('Expected catalog artwork.');
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight };
  });
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.naturalWidth);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.naturalHeight);
  expect(dimensions.width / dimensions.height).toBeCloseTo(dimensions.naturalWidth / dimensions.naturalHeight, 1);
  const credits = dialog.locator('.game-artwork-disclosure');
  await credits.getByText('Artwork credits', { exact: true }).click();
  await expect(credits).toContainText(artwork.credit);
  await expect(credits.getByRole('link').first()).toHaveAttribute('href', artwork.sourceUrl);
  await expect(credits.getByRole('link', { name: artwork.license, exact: true })).toHaveAttribute('href', artwork.licenseUrl);
  await expect(credits.getByRole('link').first()).toHaveAttribute('target', '_blank');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(before);
  expect(errors).toEqual([]);
});

test('catalog detail keeps a bounded readable artwork frame and credits at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { dialog } = await openCatalogDetail(page, illustratedItem);
  const frame = await dialog.locator('.catalog-detail-sleeve').boundingBox();
  expect(frame).not.toBeNull();
  expect(frame?.width).toBeCloseTo(128, 0);
  expect(frame?.height).toBeCloseTo(96, 0);
  const summary = dialog.locator('.game-artwork-disclosure > summary');
  const summaryBox = await summary.boundingBox();
  expect(summaryBox?.height).toBeGreaterThanOrEqual(44);
  await summary.click();
  await expect(dialog.locator('.game-artwork-credit')).toContainText(artwork.credit);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('missing art preserves the public metadata, working controls and honest fallback', async ({ page }) => {
  const { dialog, opener } = await openCatalogDetail(page, withoutArtItem);
  await expect(dialog.locator('.catalog-detail-sleeve img')).toHaveCount(0);
  await expect(dialog.getByText('Artwork unavailable', { exact: true })).toBeVisible();
  await expect(dialog.locator('.game-artwork-disclosure')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('spinbutton', { name: `Your rating for ${withoutArtItem.record.title}`, exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('failed existing artwork uses the shared fallback without losing credits or dialog controls', async ({ page }) => {
  await page.route(`**${artwork.src}`, route => route.abort());
  const { dialog, opener } = await openCatalogDetail(page, illustratedItem);
  await expect(dialog.locator('.game-artwork-fallback')).toBeVisible();
  await expect(dialog.locator('.catalog-detail-sleeve img')).toHaveCount(0);
  const credits = dialog.locator('.game-artwork-disclosure');
  await credits.getByText('Artwork credits', { exact: true }).click();
  await expect(credits).toContainText(artwork.credit);
  await expect(dialog.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('reduced motion skips endpoint measurement and optional animation setup', async ({ page }) => {
  const { dialog } = await openCatalogDetail(page, illustratedItem, () => recordContinuity(page));
  const receipt = await page.evaluate(() => window.discoverContinuityReceipt);
  const noMotion = { sourceReads: 0, targetReads: 0, animatedControlAncestor: false, animationDurations: [] };
  expect(receipt).toMatchObject(noMotion);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.discoverContinuityReceipt)).toMatchObject(noMotion);
});

test('motion-enabled pointer and keyboard previews retain immediate native close and rapid reopen', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(catalogUrl(illustratedItem));
  const card = page.locator(`[data-catalog-id="${illustratedItem.record.id}"]`);
  const opener = card.getByRole('button', { name: illustratedItem.record.title, exact: true });
  await expect(opener).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const full = page.getByRole('radio', { name: /Full/ });
  await full.check();
  await expect(full).toBeChecked();
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await expect.poll(() => card.locator('.discovery-card-art > img').evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0)).toBe(true);
  await recordContinuity(page);

  const dialog = page.getByRole('dialog', { name: illustratedItem.record.title, exact: true });
  if (isMobile) await opener.tap();
  else await opener.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: illustratedItem.record.title, exact: true })).toBeFocused();
  await expect(dialog.getByRole('spinbutton')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.discoverContinuityReceipt?.animationDurations.length ?? 0)).toBeGreaterThan(0);
  const opening = await page.evaluate(() => window.discoverContinuityReceipt);
  const expectedOpens = developmentBuild ? 2 : 1;
  expect(opening?.sourceReads).toBe(1);
  expect(opening?.targetReads).toBe(expectedOpens);
  expect(opening?.nativeOpens).toBe(expectedOpens);
  expect(opening?.nativeCloses).toBe(developmentBuild ? 1 : 0);
  expect(opening?.animatedControlAncestor).toBe(false);
  for (const duration of opening?.animationDurations ?? []) {
    expect(typeof duration).toBe('number');
    expect(duration).toBeLessThanOrEqual(isMobile ? 180 : 240);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  for (const key of ['Enter', 'Space']) {
    await opener.press(key);
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(dialog.getByRole('spinbutton')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
  expect(errors).toEqual([]);
});

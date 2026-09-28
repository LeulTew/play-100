import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { canonicalCatalogId } from '../src/lib/catalog-identity';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import type { DiscoveryItem } from '../src/lib/discovery-catalog';
import { readLibrary } from './library-helpers';

const catalog = parseDiscoveryCatalog(
  JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')),
);
const illustrated = catalog.items.find((item) => item.artwork && canonicalCatalogId(item.record.id) === item.record.id);
const withoutArt = catalog.items.find((item) => !item.artwork && canonicalCatalogId(item.record.id) === item.record.id);
if (!illustrated?.artwork || !withoutArt)
  throw new Error('Discover continuity requires existing illustrated and unillustrated noncanonical fixtures.');
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
  await page.route('**/api/catalog?**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }),
  );
});

function catalogUrl(item: DiscoveryItem) {
  const search = new URLSearchParams({ q: item.record.title.slice(0, 80), catalogs: 'off' });
  return `/discover?${search}`;
}

async function recordContinuity(page: Page) {
  await page.evaluate(() => {
    const receipt: ContinuityReceipt = {
      sourceReads: 0,
      targetReads: 0,
      nativeOpens: 0,
      nativeCloses: 0,
      animatedControlAncestor: false,
      animationDurations: [],
    };
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
  page.on('pageerror', (error) => errors.push(error.message));
  const { card, dialog, opener, before } = await openCatalogDetail(page, illustratedItem);
  await expect(dialog).toHaveClass(/catalog-detail-dialog/);
  await expect(dialog).not.toHaveClass(/game-dialog/);
  const image = dialog.locator('.catalog-detail-sleeve img');
  await expect(image).toHaveAttribute('src', artwork.src);
  await expect(card.locator('.discovery-card-art > img')).toHaveAttribute('src', artwork.src);
  await expect(image).toHaveAttribute('width', String(artwork.width));
  await expect(image).toHaveAttribute('height', String(artwork.height));
  await expect(dialog.getByRole('heading', { name: illustratedItem.record.title, exact: true })).toBeFocused();
  await expect
    .poll(() => image.evaluate((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0))
    .toBe(true);
  const dimensions = await image.evaluate((node) => {
    if (!(node instanceof HTMLImageElement)) throw new Error('Expected catalog artwork.');
    const rect = node.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight,
    };
  });
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.naturalWidth);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.naturalHeight);
  expect(dimensions.width / dimensions.height).toBeCloseTo(dimensions.naturalWidth / dimensions.naturalHeight, 1);
  const cardImage = await card.locator('.discovery-card-art > img').boundingBox();
  if (!cardImage) throw new Error('The originating card image must have its reserved size.');
  expect(dimensions.width).toBeGreaterThanOrEqual(Math.min(cardImage.width, 360));
  const credits = dialog.locator('.game-artwork-disclosure');
  await credits.getByText('Artwork credits', { exact: true }).click();
  await expect(credits).toContainText(artwork.credit);
  await expect(credits.getByRole('link', { name: 'Source image', exact: true })).toHaveAttribute(
    'href',
    artwork.sourceUrl,
  );
  await expect(credits.getByRole('link', { name: artwork.license, exact: true })).toHaveAttribute(
    'href',
    artwork.licenseUrl,
  );
  await expect(credits.getByRole('link', { name: 'Source image', exact: true })).toHaveAttribute('target', '_blank');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(before);
  expect(errors).toEqual([]);
});

for (const [width, height] of [
  [320, 568],
  [393, 851],
] as const) {
  test(`catalog detail keeps a bounded readable artwork frame and credits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const { dialog } = await openCatalogDetail(page, illustratedItem);
    const frame = await dialog.locator('.catalog-detail-sleeve').boundingBox();
    expect(frame).not.toBeNull();
    const visual = dialog.locator('.catalog-detail-visual');
    const available = await visual.evaluate((element) => element.clientWidth);
    const bounds = await visual.boundingBox();
    expect(bounds).not.toBeNull();
    const tiny = artwork.width < 144 && artwork.height < 108;
    expect(frame?.width).toBeCloseTo(Math.min(available, tiny ? 144 : Math.min(360, artwork.width)), 0);
    expect(frame!.width / frame!.height).toBeCloseTo(tiny ? 4 / 3 : artwork.width / artwork.height, 2);
    expect(frame!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(frame!.x + frame!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    const summary = dialog.locator('.game-artwork-disclosure > summary');
    const summaryBox = await summary.boundingBox();
    expect(summaryBox?.height).toBeGreaterThanOrEqual(44);
    await summary.click();
    await expect(dialog.locator('.game-artwork-credit')).toContainText(artwork.credit);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

test('missing art preserves the public metadata, working controls and honest fallback', async ({ page }) => {
  const { dialog, opener } = await openCatalogDetail(page, withoutArtItem);
  await expect(dialog.locator('.catalog-detail-sleeve img')).toHaveCount(0);
  await expect(dialog.getByText('Artwork unavailable', { exact: true })).toBeVisible();
  await expect(dialog.locator('.game-artwork-disclosure')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
  await expect(
    dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${withoutArtItem.record.title}`, exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('failed existing artwork uses the shared fallback without losing credits or dialog controls', async ({ page }) => {
  await page.route(`**${artwork.src}`, (route) => route.abort());
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
  await expect(page.locator('[data-motion-visual]')).toHaveCount(0);
  await expect(dialog.locator('.catalog-detail-sleeve')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.discoverContinuityReceipt)).toMatchObject(noMotion);
});

async function readyMotionCatalog(page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(catalogUrl(illustratedItem));
  const card = page.locator(`[data-catalog-id="${illustratedItem.record.id}"]`);
  const opener = card.getByRole('button', { name: illustratedItem.record.title, exact: true });
  await expect(opener).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('button', { name: 'Settings & backups', exact: true })
    .click();
  const full = page.getByRole('radio', { name: /Full/ });
  await full.click();
  await expect(full).toBeChecked();
  await expect.poll(async () => (await readLibrary(page)).motion).toBe('full');
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await expect
    .poll(() =>
      card
        .locator('.discovery-card-art > img')
        .evaluate((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0),
    )
    .toBe(true);
  return { card, opener };
}

test('a canonical Discover flight retains its authored sleeve instead of catalog bitmap treatment', async ({
  page,
}) => {
  await readyMotionCatalog(page);
  await page.goto('/discover?q=mass%20effect%202&include100=on&catalogs=off');
  const card = page.locator('[data-catalog-id="mass-effect-2"]');
  const source = card.locator('.game-cover');
  await expect(source).toBeVisible();
  const background = await source.evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      if (this.matches('[data-motion-visual="jacket"][data-motion-phase="enter"]')) {
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
  });
  await card.getByRole('button', { name: 'Mass Effect 2', exact: true }).click();
  const sprite = page.locator('[data-motion-visual="jacket"][data-motion-phase="enter"]');
  await expect(sprite).toHaveCount(1);
  await expect(sprite).toHaveClass(/\bjacket-2\b/);
  await expect(sprite).toHaveCSS('background-color', background);
  await expect(sprite.locator('.jacket-drawing')).toHaveCount(1);
  await expect(sprite.locator('.cover-rank')).toHaveText('02');
  await expect(sprite.locator('img, image')).toHaveCount(0);
  const scale = await sprite.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: matrix.a, y: matrix.d };
  });
  expect(scale.x).toBeCloseTo(scale.y, 5);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(sprite).toHaveCount(0);
  await expect(page.locator('#game-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('motion-enabled pointer and keyboard previews retain immediate native close and rapid reopen', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { opener } = await readyMotionCatalog(page);
  await recordContinuity(page);

  const dialog = page.getByRole('dialog', { name: illustratedItem.record.title, exact: true });
  if (isMobile) await opener.tap();
  else await opener.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: illustratedItem.record.title, exact: true })).toBeFocused();
  await expect(dialog.getByRole('spinbutton')).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => window.discoverContinuityReceipt?.animationDurations.length ?? 0))
    .toBeGreaterThan(0);
  const opening = await page.evaluate(() => window.discoverContinuityReceipt);
  const expectedOpens = developmentBuild ? 2 : 1;
  expect(opening?.sourceReads).toBe(1);
  expect(opening?.targetReads).toBe(expectedOpens);
  expect(opening?.nativeOpens).toBe(expectedOpens);
  expect(opening?.nativeCloses).toBe(developmentBuild ? 1 : 0);
  expect(opening?.animatedControlAncestor).toBe(false);
  for (const duration of opening?.animationDurations ?? []) {
    expect(typeof duration).toBe('number');
    expect(duration).toBeLessThanOrEqual(isMobile ? 220 : 240);
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

async function pauseArtworkEntry(page: Page, isMobile: boolean, failMovement = false) {
  const { opener } = await readyMotionCatalog(page);
  const dialog = page.getByRole('dialog', { name: illustratedItem.record.title, exact: true });
  // Warm only the code and image; this proof measures a flight, not the separate cold-loading timeout.
  await opener.click();
  await expect(dialog.locator('#catalog-game-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('[data-motion-visual]')).toHaveCount(0);
  const probe = await page.evaluateHandle((failMovement) => {
    const animate = Element.prototype.animate;
    const effects: { element: Element; animation: Animation }[] = [];
    let failed = false;
    const movement = '[data-motion-visual="catalog-art"][data-motion-phase="enter"]';
    Element.prototype.animate = function (frames, options) {
      if (failMovement && this.matches(movement)) {
        failed = true;
        throw new Error('Synthetic provider artwork animation failure.');
      }
      const animation = animate.call(this, frames, options);
      if (this.matches(movement) || this.matches('.catalog-detail-sleeve')) {
        animation.pause();
        animation.currentTime = 0;
        effects.push({ element: this, animation });
      }
      return animation;
    };
    return {
      ready: () => effects.some(({ element }) => element.matches(movement)),
      failed: () => failed,
      sample(progress: number) {
        for (const { animation } of effects) {
          const duration = animation.effect?.getTiming().duration;
          if (typeof duration !== 'number') throw new Error('The artwork handoff must have a numeric duration.');
          animation.currentTime = duration * progress;
        }
        const sprite = document.querySelector(movement);
        const destination = document.querySelector('.catalog-detail-sleeve');
        if (!sprite || !destination) throw new Error('Both decorative surfaces must be present during the handoff.');
        const style = getComputedStyle(sprite);
        const matrix = new DOMMatrixReadOnly(style.transform);
        return {
          sprite: Number(style.opacity),
          destination: Number(getComputedStyle(destination).opacity),
          scaleX: matrix.a,
          scaleY: matrix.d,
          clip: style.clipPath,
        };
      },
      async finish() {
        const finished = effects.map(({ animation }) => animation.finished);
        for (const { animation } of effects) animation.finish();
        await Promise.all(finished);
      },
      cancelMovement() {
        const flight = effects.find(({ element }) => element.matches(movement));
        if (!flight) throw new Error('The travelling artwork must be active before cancellation.');
        flight.animation.cancel();
      },
      restore() {
        Element.prototype.animate = animate;
        for (const { animation } of effects) animation.cancel();
      },
    };
  }, failMovement);
  try {
    if (isMobile) await opener.tap();
    else await opener.click();
    await expect(dialog.locator('#catalog-game-title')).toBeFocused();
    await expect.poll(() => probe.evaluate((proof) => proof.ready() || proof.failed())).toBe(true);
    return { dialog, opener, probe };
  } catch (cause) {
    await probe.evaluate((proof) => proof.restore());
    await probe.dispose();
    throw cause;
  }
}

test('provider entry hands off opacity without changing the settled artwork', async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1920, height: 1080 });
  const { dialog, probe } = await pauseArtworkEntry(page, isMobile);
  try {
    const before = await readLibrary(page);
    const samples = await probe.evaluate((proof) =>
      Array.from({ length: 100 }, (_, index) => proof.sample(index / 100)),
    );
    expect(samples.some((sample) => sample.sprite > 0.5)).toBe(true);
    expect(samples.some((sample) => sample.destination > 0.5)).toBe(true);
    expect(samples.every((sample) => sample.sprite <= 0.5 || sample.destination <= 0.5)).toBe(true);
    expect(samples.every((sample) => sample.sprite + sample.destination >= 0.95)).toBe(true);
    for (const sample of samples) {
      expect(sample.scaleX).toBeCloseTo(sample.scaleY, 5);
      expect(sample.clip).toBe('none');
    }
    await expect(dialog.locator('.dialog-inner')).toHaveCSS('opacity', '1');
    await expect(dialog.locator('.detail-actions')).toHaveCSS('opacity', '1');
    await expect(dialog.locator('.catalog-detail-art-credits')).toHaveCSS('opacity', '1');
    await expect(dialog.locator('#catalog-game-title')).toBeFocused();
    await expect(dialog.getByRole('spinbutton')).toBeEnabled();
    // The paused 99% sample is already in the transform-free opacity handoff.
    const destination = await page
      .locator('[data-motion-visual="catalog-art"][data-motion-phase="enter"]')
      .boundingBox();
    const settled = await dialog.locator('.catalog-detail-sleeve img').boundingBox();
    expect(destination).not.toBeNull();
    expect(settled).not.toBeNull();
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(destination![dimension]).toBeCloseTo(settled![dimension], 0);
    }
    await probe.evaluate((proof) => proof.finish());
    await expect(page.locator('[data-motion-visual]')).toHaveCount(0);
    await expect(dialog.locator('.catalog-detail-sleeve')).toHaveCSS('opacity', '1');
    expect(await dialog.locator('.catalog-detail-sleeve').evaluate((element) => element.getAnimations().length)).toBe(
      0,
    );
    await expect(dialog.locator('.catalog-detail-sleeve img')).toHaveAttribute('src', artwork.src);
    expect(await readLibrary(page)).toEqual(before);
  } finally {
    await probe.evaluate((proof) => proof.restore());
    await probe.dispose();
  }
});

for (const interruption of ['resize', 'reduced motion', 'cancelled sprite'] as const) {
  test(`provider entry restores its real artwork after mid-flight ${interruption}`, async ({ page, isMobile }) => {
    const { dialog, opener, probe } = await pauseArtworkEntry(page, isMobile);
    try {
      const currentUrl = page.url();
      const sample = await probe.evaluate((proof) => proof.sample(0.1));
      expect(sample.sprite).toBeGreaterThan(0.5);
      expect(sample.destination).toBeLessThanOrEqual(0.5);
      if (interruption === 'resize') {
        const viewport = page.viewportSize();
        if (!viewport) throw new Error('The native resize check needs a known viewport.');
        await page.setViewportSize({ width: viewport.width - 1, height: viewport.height });
      } else if (interruption === 'reduced motion') {
        await page.emulateMedia({ reducedMotion: 'reduce' });
      } else {
        await probe.evaluate((proof) => proof.cancelMovement());
      }
      await expect(page.locator('[data-motion-visual]')).toHaveCount(0);
      await expect(dialog.locator('.catalog-detail-sleeve')).toHaveCSS('opacity', '1');
      expect(await dialog.locator('.catalog-detail-sleeve').evaluate((element) => element.getAnimations().length)).toBe(
        0,
      );
      await expect(dialog.locator('#catalog-game-title')).toBeFocused();
      await expect(dialog.getByRole('spinbutton')).toBeEnabled();
      await expect(page).toHaveURL(currentUrl);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    } finally {
      await probe.evaluate((proof) => proof.restore());
      await probe.dispose();
    }
  });
}

test('failed provider flight setup leaves the real artwork and native controls visible', async ({ page, isMobile }) => {
  const { dialog, probe } = await pauseArtworkEntry(page, isMobile, true);
  try {
    expect(await probe.evaluate((proof) => proof.failed())).toBe(true);
    await expect(page.locator('[data-motion-visual]')).toHaveCount(0);
    await expect(dialog.locator('.catalog-detail-sleeve')).toHaveCSS('opacity', '1');
    await expect(dialog.locator('.catalog-detail-sleeve img')).toHaveAttribute('src', artwork.src);
    await expect(dialog.locator('#catalog-game-title')).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
  } finally {
    await probe.evaluate((proof) => proof.restore());
    await probe.dispose();
  }
});

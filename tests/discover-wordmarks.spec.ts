import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';

const catalog = parseDiscoveryCatalog(
  JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')),
);
const wide = catalog.items.find((item) => item.record.title === 'Black Mesa');
const normal = catalog.items.find((item) => item.record.title === '0 A.D.');
if (!wide?.artwork || wide.artwork.width <= wide.artwork.height * 3 || !normal?.artwork) {
  throw new Error('The shipped wordmark artwork fixtures changed.');
}
const wideItem = wide;
const wideArtwork = wide.artwork;
const normalItem = normal;

declare global {
  interface Window {
    wordmarkLayoutShifts: number[];
  }
}

test('extreme-ratio artwork has a stable native-size title plate without changing normal tiles or controls', async ({
  page,
  baseURL,
  isMobile,
}) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Wordmark fixtures require the owned local preview.');
  }
  await page.setViewportSize({ width: isMobile ? 393 : 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${wideArtwork.src}`, async (route) => {
    await waiting;
    await route.continue();
  });
  try {
    await page.goto('/discover?catalogs=off', { waitUntil: 'domcontentloaded' });
    const card = page.locator(`[data-catalog-id="${wideItem.record.id}"]`);
    const art = card.locator('.discovery-card-art');
    await expect(art).toHaveAttribute('data-wordmark', '');
    await expect(art.locator('strong')).toHaveText(wideItem.record.title);
    await expect(art.locator('strong')).toHaveAttribute('aria-hidden', 'true');
    await expect(
      page.locator(`[data-catalog-id="${normalItem.record.id}"] .discovery-card-art`),
    ).not.toHaveAttribute('data-wordmark');
    await art.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const before = await art.boundingBox();
    if (!before) throw new Error('The wordmark plate must be visible before the image loads.');
    expect(before.width / before.height).toBeCloseTo(4 / 3, 2);
    await page.evaluate(() => {
      window.wordmarkLayoutShifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if ('value' in entry && typeof entry.value === 'number') window.wordmarkLayoutShifts.push(entry.value);
        }
      }).observe({ type: 'layout-shift' });
    });
    release();
    const image = art.locator('img');
    await expect(image).toHaveJSProperty('complete', true);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(480);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    expect(await art.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => window.wordmarkLayoutShifts.reduce((sum, value) => sum + value, 0))).toBe(0);
    const imageBox = await image.boundingBox();
    const titleBox = await art.locator('strong').boundingBox();
    if (!imageBox || !titleBox) throw new Error('The wordmark and its title must both be visible.');
    expect(imageBox.width).toBeLessThanOrEqual(wideArtwork.width);
    expect(imageBox.height).toBeLessThanOrEqual(wideArtwork.height);
    expect(imageBox.width / imageBox.height).toBeCloseTo(wideArtwork.width / wideArtwork.height, 1);
    expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(titleBox.y);
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(before.y + before.height);
    await expect(
      card.getByRole('button', { name: `Add to My games: ${wideItem.record.title}`, exact: true }),
    ).toBeEnabled();
    await expect(
      card.getByRole('button', { name: `Pin for comparison: ${wideItem.record.title}`, exact: true }),
    ).toBeEnabled();
    await card.locator('.discovery-card-details > summary').click();
    await expect(card.locator('.discovery-card-source')).toContainText(wideArtwork.credit);
    await expect(card.getByRole('link', { name: 'Image source', exact: true })).toHaveAttribute(
      'href',
      wideArtwork.sourceUrl,
    );
    await expect(card.getByRole('link', { name: wideArtwork.license, exact: true })).toHaveAttribute(
      'href',
      wideArtwork.licenseUrl,
    );
  } finally {
    release();
  }
});

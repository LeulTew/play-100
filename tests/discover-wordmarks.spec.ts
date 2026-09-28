import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
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

async function wordmarkGeometry(art: Locator) {
  return art.evaluate((element) => {
    const card = element.closest('.discovery-card');
    const grid = card?.closest('.discovery-cards');
    const image = element.querySelector('img');
    const title = element.querySelector('strong');
    if (!card || !grid || !image || !title) throw new Error('The complete wordmark plate must be mounted.');
    const frame = element.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const gridBox = grid.getBoundingClientRect();
    const relative = (box: DOMRect, origin: DOMRect) => ({
      x: box.x - origin.x,
      y: box.y - origin.y,
      width: box.width,
      height: box.height,
    });
    return {
      relativeToCard: relative(frame, cardBox),
      image: relative(image.getBoundingClientRect(), frame),
      title: relative(title.getBoundingClientRect(), frame),
      viewport: { x: frame.x, y: frame.y },
      scroll: { x: scrollX, y: scrollY },
      document: { x: frame.x + scrollX, y: frame.y + scrollY },
      cardTopInGrid: cardBox.top - gridBox.top,
      gridDocumentTop: gridBox.top + scrollY,
    };
  });
}

test('extreme-ratio artwork has a stable native-size title plate without changing normal tiles or controls', async ({
  page,
  baseURL,
  isMobile,
}, info) => {
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
    await expect(page.locator(`[data-catalog-id="${normalItem.record.id}"] .discovery-card-art`)).not.toHaveAttribute(
      'data-wordmark',
    );
    await art.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const before = await wordmarkGeometry(art);
    expect(before.relativeToCard.width / before.relativeToCard.height).toBeCloseTo(4 / 3, 2);
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
    const after = await wordmarkGeometry(art);
    await info.attach('wordmark-geometry', {
      contentType: 'application/json',
      body: JSON.stringify({
        before,
        after,
        delta: {
          viewportY: after.viewport.y - before.viewport.y,
          scrollY: after.scroll.y - before.scroll.y,
          documentY: after.document.y - before.document.y,
          cardTopInGrid: after.cardTopInGrid - before.cardTopInGrid,
          gridDocumentTop: after.gridDocumentTop - before.gridDocumentTop,
        },
        layoutShifts: await page.evaluate(() => window.wordmarkLayoutShifts),
      }),
    });
    // Offscreen row estimates can resolve and trigger scroll anchoring; the plate must not shift within its card.
    expect(after.relativeToCard).toEqual(before.relativeToCard);
    expect(await page.evaluate(() => window.wordmarkLayoutShifts.reduce((sum, value) => sum + value, 0))).toBe(0);
    const { image: imageBox, title: titleBox } = after;
    expect(imageBox.width).toBeLessThanOrEqual(wideArtwork.width);
    expect(imageBox.height).toBeLessThanOrEqual(wideArtwork.height);
    expect(imageBox.width / imageBox.height).toBeCloseTo(wideArtwork.width / wideArtwork.height, 1);
    expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(titleBox.y);
    expect(imageBox.width).toBeGreaterThan(0);
    expect(imageBox.height).toBeGreaterThan(0);
    expect(titleBox.height).toBeGreaterThan(0);
    expect(imageBox.y).toBeGreaterThanOrEqual(0);
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(after.relativeToCard.height);
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

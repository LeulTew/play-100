import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import thumbnails from '../src/generated/film-thumbnails.json' with { type: 'json' };
import { collectionFilms } from '../src/lib/films';

test.use({ deviceScaleFactor: 2, serviceWorkers: 'block' });

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Cold film-transfer fixtures require the owned local preview.');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin !== new URL(baseURL).origin || url.pathname.startsWith('/api/')
      ? route.abort('blockedbyclient')
      : route.continue();
  });
});

function gate() {
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { waiting, release };
}

async function posterBoxes(page: Page) {
  return page.locator('.film-poster').evaluateAll((frames) =>
    frames.map((frame) => {
      const box = frame.getBoundingClientRect();
      return { width: box.width, height: box.height, top: box.top, left: box.left };
    }),
  );
}

async function loadedPosters(page: Page) {
  await expect
    .poll(() =>
      page.locator('.film-poster img').evaluateAll((images) => {
        return (
          images.length === 2 &&
          images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)
        );
      }),
    )
    .toBe(true);
}

for (const delayed of [false, true]) {
  const entry = delayed ? 'delayed data and keyboard entry' : 'pointer scrolling';
  test(`cold landing film-transfer budget: ${entry}`, async ({ page, isMobile }, info) => {
    await page.setViewportSize({ width: isMobile ? 393 : 1440, height: isMobile ? 851 : 1000 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const requested: Request[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/videos/')) requested.push(request);
    });
    const collectionGate = gate();
    const thumbnailGate = gate();
    if (delayed) {
      await page.route('**/data/collection.json', async (route) => {
        await collectionGate.waiting;
        await route.continue();
      });
    }
    await page.route('**/videos/thumbnails/*.webp', async (route) => {
      await thumbnailGate.waiting;
      await route.continue();
    });
    try {
      await page.goto('/?catalogs=off', { waitUntil: 'domcontentloaded' });
      if (delayed) {
        await expect(page.locator('.collection-loading')).toBeVisible();
        await expect(page.locator('#collection-films')).toBeAttached();
        await page.waitForTimeout(800);
        expect(requested).toHaveLength(0);
        await expect(page.locator('.film-poster img')).toHaveCount(0);
        collectionGate.release();
      }
      await expect(page.locator('.game-card')).toHaveCount(24);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);
      expect(requested).toHaveLength(0);
      await expect(page.locator('video')).toHaveCount(0);
      await expect(page.locator('.film-poster img')).toHaveCount(0);
      if (delayed) {
        await page.locator('#collection-films-title').focus();
        await page.keyboard.press('Tab');
        await expect(page.locator('.film-watch').first()).toBeFocused();
      } else {
        const section = await page.locator('#collection-films').boundingBox();
        if (!section) throw new Error('The films section is missing.');
        await page.mouse.wheel(0, section.y - 120);
      }
      await expect(page.getByRole('heading', { name: 'Watch films', exact: true })).toBeInViewport();
      await expect(page.locator('.film-poster img')).toHaveCount(2);
      await expect.poll(() => requested.length).toBe(2);
      const before = await posterBoxes(page);
      thumbnailGate.release();
      await loadedPosters(page);
      expect(await posterBoxes(page)).toEqual(before);
      const selections = await page.locator('.film-poster img').evaluateAll((images) =>
        images.map((element) => {
          const image = element as HTMLImageElement;
          return { src: new URL(image.currentSrc).pathname, width: image.getBoundingClientRect().width };
        }),
      );
      const candidates = Object.values(thumbnails.films).flatMap((film) => film.candidates);
      for (const selection of selections) {
        const asset = candidates.find((candidate) => candidate.src === selection.src);
        expect(asset).toBeDefined();
        expect(asset!.width).toBeGreaterThanOrEqual(Math.floor(selection.width * 2));
        expect(asset!.width).toBeLessThanOrEqual(640);
      }
      let bodyBytes = 0;
      let transferredBytes = 0;
      for (const request of requested) {
        expect(new URL(request.url()).pathname).toMatch(/^\/videos\/thumbnails\/[a-f0-9]{64}\.webp$/);
        const response = await request.response();
        if (!response) throw new Error('A listing thumbnail did not produce a response.');
        expect(response.ok()).toBe(true);
        expect(await response.finished()).toBeNull();
        const size = await request.sizes();
        bodyBytes += size.responseBodySize;
        transferredBytes += size.responseBodySize + size.responseHeadersSize;
      }
      expect(bodyBytes).toBeGreaterThan(0);
      expect(bodyBytes).toBeLessThanOrEqual(48 * 1024);
      expect(transferredBytes).toBeLessThanOrEqual(52 * 1024);
      await info.attach('cold-film-transfer', {
        contentType: 'application/json',
        body: JSON.stringify({
          viewport: page.viewportSize(),
          dpr: 2,
          delayedCollection: delayed,
          beforeScrollBytes: 0,
          listingBodyBytes: bodyBytes,
          listingTransferBytes: transferredBytes,
          selectedCandidates: selections,
          originalPostersBeforeWatch: 0,
          moviesBeforeWatch: 0,
        }),
      });
      const film = collectionFilms[0]!;
      const posterRequest = page.waitForRequest((request) => new URL(request.url()).pathname === film.poster.src);
      const movieRequest = page.waitForRequest((request) => new URL(request.url()).pathname === film.video.src);
      if (delayed) await page.keyboard.press('Enter');
      else await page.locator('.film-watch').first().click();
      await Promise.all([posterRequest, movieRequest]);
      await expect(page.locator('video')).toHaveAttribute('poster', film.poster.src);
      await expect(page.locator('video')).toHaveAttribute('src', film.video.src);
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    } finally {
      collectionGate.release();
      thumbnailGate.release();
      await cdp.detach();
    }
  });
}

test('responsive sizes follow actual poster slots from 320 to 1920 without a frame shift', async ({ page }) => {
  await page.goto('/?catalogs=off#collection-films');
  await loadedPosters(page);
  for (const width of [320, 380, 393, 760, 761, 1024, 1440, 1600, 1800, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const sizes = await page.locator('.film-poster img').evaluateAll((images) =>
      images.map((element) => {
        const image = element as HTMLImageElement;
        const option = image.sizes.split(', ').find((entry) => {
          const media = /^\([^)]+\)/.exec(entry)?.[0];
          return !media || matchMedia(media).matches;
        });
        if (!option) throw new Error('No matching responsive image size.');
        const measure = document.createElement('span');
        measure.style.cssText = `position:fixed;display:block;width:${option.replace(/^\([^)]+\)\s*/, '')}`;
        document.body.append(measure);
        const declared = measure.getBoundingClientRect().width;
        measure.remove();
        const actual = image.getBoundingClientRect();
        return { declared, actual: actual.width, aspect: actual.width / actual.height };
      }),
    );
    for (const size of sizes) {
      expect(Math.abs(size.declared - size.actual)).toBeLessThan(1);
      expect(size.aspect).toBeCloseTo(16 / 9, 2);
      expect(size.actual * 2).toBeLessThanOrEqual(640);
    }
  }
});

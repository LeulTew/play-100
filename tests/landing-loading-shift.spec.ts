import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

/** Holds the collection data until the returned function releases it. */
async function holdCollection(page: Page): Promise<() => void> {
  let open = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  await page.route('**/data/collection.json', async (route: Route) => {
    await gate;
    await route.continue().catch(() => undefined);
  });
  return () => open();
}

// Whatever replaces the loading collection, a taller grid or a shorter result, would move anything after it that is
// on screen without any input, so the collection keeps what follows it below the fold at any window size.
for (const { path, games, width, height, mobile } of [
  { path: '/', games: 24, width: 1440, height: 1000, mobile: false },
  { path: '/', games: 24, width: 2560, height: 1440, mobile: false },
  { path: '/?q=NoSuchGameShiftFixture&catalogs=off', games: 0, width: 2560, height: 1440, mobile: false },
  { path: '/', games: 24, width: 393, height: 851, mobile: true },
]) {
  test(`the loading collection keeps what follows off screen and still: ${path} at ${width}×${height}`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile !== mobile, `The ${mobile ? 'mobile' : 'desktop'} project measures this window size.`);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await emptyCatalogs(page);
    const release = await holdCollection(page);
    try {
      await page.goto(path, { waitUntil: 'commit' });
      // Only React's first commit renders the sections after the collection; the static shell, if any, ends with it.
      await expect(page.locator('#collection-films')).toBeAttached();
      await expect(page.locator('.first-paint-shell')).toHaveCount(0);
      await expect(page.locator('.collection-loading')).toBeVisible();
      // The web fonts arrive first, so only the collection itself changes the page from here on.
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const fold = await page.evaluate(() => {
        const top = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().top ?? Number.NaN;
        return {
          height: innerHeight,
          scroll: scrollY,
          films: top('#collection-films'),
          workbook: top('.workbook-section'),
          footer: top('.site-footer'),
        };
      });
      expect(fold.scroll).toBe(0);
      for (const section of ['films', 'workbook', 'footer'] as const) {
        expect(fold[section], `the ${section} starts below the fold`).toBeGreaterThanOrEqual(fold.height);
      }
      await page.evaluate(() => {
        let total = 0;
        document.documentElement.dataset.collectionLoadShift = '0';
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (
              'hadRecentInput' in entry &&
              entry.hadRecentInput === false &&
              'value' in entry &&
              typeof entry.value === 'number'
            )
              total += entry.value;
          }
          document.documentElement.dataset.collectionLoadShift = String(total);
        }).observe({ type: 'layout-shift' });
      });
      release();
      await expect(page.locator('.collection-loading')).toHaveCount(0);
      await expect(page.locator('.game-card')).toHaveCount(games);
      await expect(page.locator('#collection')).toHaveAttribute('data-empty', String(games === 0));
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      );
      expect(
        await page.evaluate(() => Number(document.documentElement.dataset.collectionLoadShift)),
        'layout shift while the collection replaces its loading state',
      ).toBe(0);
    } finally {
      release();
    }
    expect(errors).toEqual([]);
  });
}

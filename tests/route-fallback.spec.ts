import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

for (const destination of [
  {
    path: '/discover?catalogs=off',
    chunk: 'DiscoverPage',
    title: 'Discover',
    heading: '#discover-title',
    // The cards start where the page's results do. At 393px the status takes one line where the search note wraps.
    reserved: { fallback: '.route-skeleton', page: '[role="region"][aria-labelledby="discovery-results-title"]' },
    edge: 'top',
    slack: { desktop: 1, mobile: 24 },
  },
  {
    path: '/my-games?catalogs=off',
    chunk: 'MyGamesPage',
    title: 'My games',
    heading: '#my-games-title',
    reserved: { fallback: '.route-fallback-tabs', page: '.my-games-navigation' },
    edge: 'bottom',
    slack: { desktop: 1, mobile: 1 },
  },
] as const) {
  test(`cold ${destination.title} keeps its header footprint before the lazy module and styles`, async ({
    page,
    isMobile,
  }) => {
    await page.setViewportSize({ width: isMobile ? 393 : 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await emptyCatalogs(page);
    let release!: () => void;
    let requested!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await page.route(
      (url) => url.pathname.includes(destination.chunk) && /\.(js|tsx|css)$/.test(url.pathname),
      async (route) => {
        requested();
        await held;
        await route.continue();
      },
    );
    try {
      await page.goto(destination.path, { waitUntil: 'domcontentloaded' });
      await began;
      const fallback = page.locator('.route-fallback:visible');
      await expect(fallback).toHaveCount(1);
      await expect(fallback).toBeVisible();
      await expect(fallback).toHaveAttribute('aria-busy', 'true');
      await expect(fallback.getByRole('heading', { level: 1 })).toHaveText(destination.title);
      await expect(fallback.getByRole('status')).toHaveText(`Loading ${destination.title}…`);
      await expect(fallback.locator('button, input, a, [tabindex]')).toHaveCount(0);
      await expect(page.locator(destination.heading)).toHaveCount(0);
      await expect(fallback.locator('.route-skeleton')).toHaveAttribute('aria-hidden', 'true');
      await expect(fallback.locator('.route-skeleton')).toHaveAttribute('inert', '');
      await page.evaluate(() => document.fonts.ready);
      expect(await fallback.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
      const before = await fallback.locator('h1').boundingBox();
      if (!before) throw new Error('The destination loading heading is not laid out.');
      // The skeleton reserves the controls above the results, and the footer stays below the first view (UI-004).
      const reserved = await fallback.locator(destination.reserved.fallback).boundingBox();
      if (!reserved) throw new Error('The reserved destination controls are not laid out.');
      const footer = await page.locator('#site-credits').boundingBox();
      expect(footer?.y ?? Number.POSITIVE_INFINITY, 'footer during loading').toBeGreaterThanOrEqual(1000);
      release();
      await expect(fallback).toHaveCount(0);
      await expect(page.locator(destination.heading)).toHaveText(destination.title);
      await page.evaluate(() => document.fonts.ready);
      const after = await page.locator(destination.heading).boundingBox();
      if (!after) throw new Error('The resolved destination heading is not laid out.');
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(after[key] - before[key]), `${destination.title} heading ${key}`).toBeLessThanOrEqual(0.5);
      }
      const settled = await page.locator(destination.reserved.page).boundingBox();
      if (!settled) throw new Error('The settled destination controls are not laid out.');
      const edge = (box: { y: number; height: number }) => (destination.edge === 'top' ? box.y : box.y + box.height);
      expect(
        Math.abs(edge(settled) - edge(reserved)),
        `${destination.title} results start where the skeleton reserved them`,
      ).toBeLessThanOrEqual(destination.slack[isMobile ? 'mobile' : 'desktop']);
    } finally {
      release();
    }
  });
}

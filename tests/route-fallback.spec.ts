import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

for (const destination of [
  { path: '/discover?catalogs=off', chunk: 'DiscoverPage', title: 'Discover', heading: '#discover-title' },
  { path: '/my-games?catalogs=off', chunk: 'MyGamesPage', title: 'My games', heading: '#my-games-title' },
]) {
  test(`cold ${destination.title} keeps its header footprint before the lazy module and styles`, async ({ page, isMobile }) => {
    await page.setViewportSize({ width: isMobile ? 393 : 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await emptyCatalogs(page);
    let release!: () => void;
    let requested!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const began = new Promise<void>(resolve => { requested = resolve; });
    await page.route(url => url.pathname.includes(destination.chunk) && /\.(js|tsx|css)$/.test(url.pathname), async route => {
      requested();
      await held;
      await route.continue();
    });
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
      expect(await fallback.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      const before = await fallback.locator('h1').boundingBox();
      if (!before) throw new Error('The destination loading heading is not laid out.');
      release();
      await expect(fallback).toHaveCount(0);
      await expect(page.locator(destination.heading)).toHaveText(destination.title);
      await page.evaluate(() => document.fonts.ready);
      const after = await page.locator(destination.heading).boundingBox();
      if (!after) throw new Error('The resolved destination heading is not laid out.');
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(after[key] - before[key]), `${destination.title} heading ${key}`).toBeLessThanOrEqual(.5);
      }
    } finally {
      release();
    }
  });
}

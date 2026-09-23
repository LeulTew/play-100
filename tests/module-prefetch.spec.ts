import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

const isCatalogDetailModule = (url: string) => /(?:\/assets\/CatalogDetail-[^/]+\.js|\/src\/components\/personal\/CatalogDetail\.tsx)(?:\?|$)/.test(url);

for (const policy of [
  { name: 'capable Full', motion: 'full', saveData: false, effectiveType: '4g', reducedMotion: false, prefetch: true },
  { name: 'Lite', motion: 'lite', saveData: false, effectiveType: '4g', reducedMotion: false, prefetch: false },
  { name: 'reduced motion', motion: 'full', saveData: false, effectiveType: '4g', reducedMotion: true, prefetch: false },
  { name: 'Save-Data even in Full', motion: 'full', saveData: true, effectiveType: '4g', reducedMotion: false, prefetch: false },
  { name: '2G even in Full', motion: 'full', saveData: false, effectiveType: '2g', reducedMotion: false, prefetch: false },
] as const) {
  test(`CatalogDetail stays lazy and background loading respects ${policy.name}`, async ({ page }) => {
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: policy.reducedMotion ? 'reduce' : 'no-preference' });
    const modules: string[] = [];
    const catalogRequests: string[] = [];
    page.on('request', request => {
      if (isCatalogDetailModule(request.url())) modules.push(request.url());
      if (/\/(?:api\/catalog|data\/discovery\/catalog)/.test(request.url())) catalogRequests.push(request.url());
    });
    await page.addInitScript(value => {
      localStorage.setItem('play100.library.v1', JSON.stringify({ version: 1, motion: value.motion, progress: {} }));
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: Object.assign(new EventTarget(), { saveData: value.saveData, effectiveType: value.effectiveType }),
      });
    }, policy);
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    await expect(page.locator('.game-card .save-game').first()).toBeEnabled();
    const hero = page.locator('#hero-title');
    expect(await hero.evaluate(node => getComputedStyle(node).opacity)).toBe('1');
    await page.evaluate(() => new Promise<void>(resolve => requestIdleCallback(() => resolve())));
    if (policy.prefetch) await expect.poll(() => modules.length).toBe(1);
    else expect(modules).toEqual([]);
    expect(catalogRequests).toEqual([]);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
}

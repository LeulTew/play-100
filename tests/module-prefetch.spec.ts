import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

const moduleUrl = (asset: string, source: string) =>
  new RegExp(`(?:/assets/${asset}-[^/]+\\.js|/${source.replaceAll('.', '\\.')})(?:\\?|$)`);
// The 100's game detail ships in the catalog detail's chunk, which warms at idle (DialogHost).
const catalogDetail = moduleUrl('CatalogDetail', 'src/components/personal/CatalogDetail.tsx');
// Background loads that stay motion-gated: the catalog parser (app tools) and the 3D scene.
const motionGated = [
  moduleUrl('discovery-catalog', 'src/lib/discovery-catalog.ts'),
  moduleUrl('CollectionScene', 'src/components/scene/CollectionScene.tsx'),
];

// The game detail is a primary action and loading it moves nothing, so its idle warm-up follows only the data-saving
// signals, Save-Data and 2G: Lite and reduced motion warm it too (docs/performance.md, "Dialogs").
for (const policy of [
  { name: 'capable Full', motion: 'full', saveData: false, effectiveType: '4g', reducedMotion: false, prefetch: true },
  { name: 'Lite', motion: 'lite', saveData: false, effectiveType: '4g', reducedMotion: false, prefetch: true },
  {
    name: 'reduced motion',
    motion: 'full',
    saveData: false,
    effectiveType: '4g',
    reducedMotion: true,
    prefetch: true,
  },
  {
    name: 'Save-Data even in Full',
    motion: 'full',
    saveData: true,
    effectiveType: '4g',
    reducedMotion: false,
    prefetch: false,
  },
  {
    name: '2G even in Full',
    motion: 'full',
    saveData: false,
    effectiveType: '2g',
    reducedMotion: false,
    prefetch: false,
  },
] as const) {
  test(`CatalogDetail stays lazy and background loading respects the data-saving signals: ${policy.name}`, async ({
    page,
  }) => {
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: policy.reducedMotion ? 'reduce' : 'no-preference' });
    const modules: string[] = [];
    const gated: string[] = [];
    const catalogRequests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (catalogDetail.test(pathname)) modules.push(request.url());
      if (motionGated.some((pattern) => pattern.test(pathname))) gated.push(request.url());
      if (/\/(?:api\/catalog|data\/discovery\/catalog)/.test(request.url())) catalogRequests.push(request.url());
    });
    await page.addInitScript((value) => {
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
    expect(await hero.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
    await page.evaluate(() => new Promise<void>((resolve) => requestIdleCallback(() => resolve())));
    if (policy.prefetch) await expect.poll(() => modules.length).toBe(1);
    else expect(modules).toEqual([]);
    // Lite and reduced motion change only the game detail's warm-up: the motion-gated loads stay off.
    if (policy.motion === 'lite' || policy.reducedMotion) expect(gated).toEqual([]);
    expect(catalogRequests).toEqual([]);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
}

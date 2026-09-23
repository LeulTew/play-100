import path from 'node:path';
import { expect, test } from '@playwright/test';
import { readBuildManifest } from '../scripts/build-metadata';
import { emptyCatalogs } from './catalog-helpers';

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true, value: Object.assign(new EventTarget(), { saveData: true, effectiveType: '4g' }),
    });
  });
});

for (const [route, root] of [
  ['/games?catalogs=off', 'src/components/personal/MyGamesPage.tsx'],
  ['/discover?catalogs=off', 'src/components/catalog/DiscoverPage.tsx'],
  ['/data-use', 'src/components/DataUseContent.tsx'],
] as const) {
  test(`${route} module failure retains the shell and only recovers after explicit reload`, async ({ page }) => {
    const manifest = await readBuildManifest(path.join(process.cwd(), 'dist'));
    const asset = manifest[root]?.file;
    if (!asset) throw new Error(`Missing explicit root: ${root}`);
    let requests = 0;
    await page.route(`**/${asset}`, request => ++requests === 1 ? request.abort('failed') : request.continue());
    await page.goto(route);
    const alert = page.getByRole('alert').filter({ hasText: "This page didn't load." });
    await expect(alert).toBeVisible();
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(page.locator('.app-error')).toHaveCount(0);
    expect(requests).toBe(1);
    const original = page.url();
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }));
    await alert.getByRole('button', { name: 'Reload this page', exact: true }).click();
    await expect(alert).toContainText("You're offline. Reconnect, then try again.");
    expect(page.url()).toBe(original);
    expect(requests).toBe(1);
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));
    await page.route('**/*', request => request.request().method() === 'HEAD'
      ? request.fulfill({ status: 200 }) : request.fallback());
    await Promise.all([
      page.waitForEvent('framenavigated', frame => frame === page.mainFrame()),
      alert.getByRole('button', { name: 'Reload this page', exact: true }).click(),
    ]);
    await expect(page.getByRole('alert').filter({ hasText: "This page didn't load." })).toHaveCount(0);
    await expect(page.locator('.site-header')).toBeVisible();
    await expect.poll(() => requests).toBe(2);
  });
}

test('catalog parser failure offers guarded reload rather than a cached-import data retry', async ({ page }) => {
  const manifest = await readBuildManifest(path.join(process.cwd(), 'dist'));
  const asset = manifest['src/lib/discovery-catalog.ts']?.file;
  if (!asset) throw new Error('Missing discovery parser root.');
  let requests = 0;
  await page.route(`**/${asset}`, route => { requests++; return route.abort('failed'); });
  await page.goto('/discover?catalogs=off');
  await expect(page.getByRole('alert').filter({ hasText: "The catalog tools didn't load." })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload local catalog', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload this page', exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

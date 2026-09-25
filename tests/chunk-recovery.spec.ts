import path from 'node:path';
import { expect, test } from '@playwright/test';
import { readBuildManifest } from '../scripts/build-metadata';
import { emptyCatalogs } from './catalog-helpers';

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: Object.assign(new EventTarget(), { saveData: true, effectiveType: '4g' }),
    });
  });
});

for (const [route, root] of [
  ['/my-games?catalogs=off', 'src/components/personal/MyGamesPage.tsx'],
  ['/discover?catalogs=off', 'src/components/catalog/DiscoverPage.tsx'],
  ['/data-use', 'src/components/DataUseContent.tsx'],
] as const) {
  test(`${route} module failure retains the shell and only recovers after explicit reload`, async ({ page }) => {
    const manifest = await readBuildManifest(path.join(process.cwd(), 'dist'));
    const asset = manifest[root]?.file;
    if (!asset) throw new Error(`Missing explicit root: ${root}`);
    let requests = 0;
    await page.route(`**/${asset}`, (request) => (++requests === 1 ? request.abort('failed') : request.continue()));
    await page.goto(route);
    const alert = page.locator('.inline-error').filter({ hasText: "This page didn't load." });
    await expect(alert.getByRole('alert')).toBeVisible();
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
    await page.route('**/*', (request) =>
      request.request().method() === 'HEAD' ? request.fulfill({ status: 200 }) : request.fallback(),
    );
    await Promise.all([
      page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame()),
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
  await page.route(`**/${asset}`, (route) => {
    requests++;
    return route.abort('failed');
  });
  await page.goto('/discover?catalogs=off');
  await expect(page.getByRole('alert').filter({ hasText: "The catalog tools didn't load." })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload local catalog', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload this page', exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

for (const timing of ['before reload', 'during HEAD'] as const) {
  test(`failed Settings recovery preserves a manual draft typed ${timing}`, async ({ page, baseURL }) => {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname);
    const manifest = await readBuildManifest(path.join(process.cwd(), 'dist'));
    const asset = manifest['src/components/app/SettingsPanel.tsx']?.file;
    if (!asset) throw new Error('Missing separately emitted Settings root.');
    await page.route(`**/${asset}`, (route) => route.abort('failed'));
    let release!: () => void;
    let probes = 0;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/*', async (route) => {
      if (route.request().method() !== 'HEAD') return route.fallback();
      probes++;
      await held;
      return route.fulfill({ status: 200 });
    });
    try {
      await page.goto('/my-games?catalogs=off');
      await expect(page.locator('#my-games-title')).toBeVisible();
      const form = page.locator('.manual-add:visible');
      await expect(form).toHaveCount(1);
      await form.locator('summary').click();
      const title = form.getByRole('textbox', { name: 'Game title', exact: true });
      if (timing === 'before reload') await title.fill('Unsubmitted game stays here');
      await page.locator('.site-footer').getByRole('button', { name: /^Effects:/ }).click();
      const recovery = page.locator('.toast .inline-error');
      await expect(recovery.getByRole('alert')).toContainText("Settings didn't load.");
      const document = await page.evaluateHandle(() => window.document.documentElement);
      const original = page.url();
      await recovery.getByRole('button', { name: 'Reload and open Settings', exact: true }).click();
      if (timing === 'during HEAD') {
        await expect.poll(() => probes).toBe(1);
        await title.fill('Unsubmitted game stays here');
        release();
      }
      await expect(recovery.getByRole('status')).toContainText('Nothing was reloaded.');
      await recovery.getByRole('button', { name: 'Keep editing', exact: true }).click();
      await expect(title).toHaveValue('Unsubmitted game stays here');
      expect(page.url()).toBe(original);
      expect(await document.evaluate((element) => element.isConnected)).toBe(true);
      if (timing === 'before reload') expect(probes).toBe(0);
      await document.dispose();
    } finally {
      release();
    }
  });
}

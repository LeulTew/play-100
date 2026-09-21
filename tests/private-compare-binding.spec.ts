import { expect, test } from '@playwright/test';
import { readLibrary } from './library-helpers';
import { mountMotionFixture } from './route-motion-helpers';

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Use an owned loopback server for private source fixtures.');
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort('blockedbyclient'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => { window.routeArrivalHarness?.destroy(); });
});

test('private Compare bindings fail closed without a gate and preserve exact title and nested-control actions', async ({ page }) => {
  await mountMotionFixture(page, true);
  const workspace = page.locator('#route-motion-fixture');
  await expect(workspace.locator('[data-compare-drag-source], [data-compare-drag-title]')).toHaveCount(0);
  const first = workspace.locator('ul.personal-records > .personal-row-static').first();
  const id = await first.getAttribute('data-record-id');
  await first.locator('.record-title').click();
  expect(await page.evaluate(() => window.routeArrivalHarness.opened)).toEqual([id]);
  await first.getByRole('checkbox', { name: /^Played:/ }).check();
  await expect.poll(async () => (await readLibrary(page)).progress[id!]?.played).toBe(true);
  expect(await page.evaluate(() => window.routeArrivalHarness.opened)).toEqual([id]);
  await workspace.getByRole('navigation', { name: 'My games views' }).getByRole('button', { name: 'Ranking 3', exact: true }).click();
  await expect(workspace.locator('.personal-score input')).toHaveCount(3);
  await expect(workspace.locator('.ranking-row-content')).toHaveCount(3);
  await expect(workspace.locator('li[data-compare-drag-source]')).toHaveCount(0);
});

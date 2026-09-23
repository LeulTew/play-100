import { expect, test } from '@playwright/test';
import { applyPersonalAction } from '../src/lib/personal-library';
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
  const before = await readLibrary(page);
  const record = id ? before.records[id] : undefined;
  const completedRecord = before.records['mass-effect-2'];
  if (!record || !completedRecord) throw new Error('The private binding fixture records are missing.');
  await first.locator('.record-title').click();
  expect(await page.evaluate(() => window.routeArrivalHarness.opened)).toEqual([id]);
  const played = first.getByRole('checkbox', { name: /^Played:/ });
  await expect(played).not.toBeChecked();
  await played.click();
  const markedPlayed = applyPersonalAction(before, { type: 'set-progress', records: [record], key: 'played', value: true });
  await expect.poll(() => readLibrary(page)).toEqual(markedPlayed);
  await expect(played).toBeChecked();
  expect(await page.evaluate(() => window.routeArrivalHarness.opened)).toEqual([id]);

  expect(before.progress[completedRecord.id]).toMatchObject({ played: true, completed: true });
  await workspace.getByRole('searchbox', { name: 'Search your library', exact: true }).fill(completedRecord.title);
  const completedPlayed = workspace.locator(`ul.personal-records > [data-record-id="${completedRecord.id}"]`)
    .getByRole('checkbox', { name: `Played: ${completedRecord.title}`, exact: true });
  await expect(completedPlayed).toBeChecked();
  await completedPlayed.click();
  const confirmation = page.getByRole('dialog', { name: `Mark ${completedRecord.title} not played?`, exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('This also clears Completed.');
  await expect(confirmation.getByRole('button', { name: 'Keep completed', exact: true })).toBeFocused();
  await expect(completedPlayed).toBeChecked();
  expect(await readLibrary(page)).toEqual(markedPlayed);
  await confirmation.getByRole('button', { name: 'Mark not played', exact: true }).click();
  const clearedPlayed = applyPersonalAction(markedPlayed, { type: 'set-progress', records: [completedRecord], key: 'played', value: false });
  await expect.poll(() => readLibrary(page)).toEqual(clearedPlayed);
  await expect(confirmation).toHaveCount(0);
  await expect(completedPlayed).not.toBeChecked();
  expect(await page.evaluate(() => window.routeArrivalHarness.opened)).toEqual([id]);
  await workspace.getByRole('navigation', { name: 'My games views' }).getByRole('button', { name: 'Ranking, 3', exact: true }).click();
  await expect(workspace.locator('.personal-score input')).toHaveCount(3);
  await expect(workspace.locator('.ranking-row-content')).toHaveCount(3);
  await expect(workspace.locator('li[data-compare-drag-source]')).toHaveCount(0);
});

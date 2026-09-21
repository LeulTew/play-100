import { expect, test } from '@playwright/test';
import type { MotionPolicy } from '../src/motion';
import { readLibrary } from './library-helpers';
import { arrivalEvents, mountMotionFixture, patchRoute } from './route-motion-helpers';

const fixture = '#route-motion-fixture';

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Use an owned loopback dev server for mounted motion fixtures.');
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort('blockedbyclient'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => { window.routeArrivalHarness?.destroy(); });
});

test('mounted route bridge adds one bounded heading arrival after commit, never remounting its editor', async ({ page, isMobile }) => {
  await mountMotionFixture(page);
  expect(await arrivalEvents(page)).toEqual([]);
  const input = page.locator(fixture).getByRole('textbox', { name: 'Uncontrolled draft', exact: true });
  await input.fill('Keep this exact editor');
  await input.evaluate(element => { element.dataset.sameEditor = 'yes'; });
  await page.evaluate(() => window.routeArrivalHarness.requestRoute('discover'));
  await expect(page.locator(`${fixture} h1`)).toHaveText('discover');
  await expect.poll(async () => (await arrivalEvents(page, 'heading')).length).toBe(1);
  expect((await arrivalEvents(page, 'heading'))[0]).toMatchObject({
    duration: isMobile ? 120 : 160,
    transforms: [`translateY(${isMobile ? 2 : 4}px)`, 'translateY(0px)'],
  });
  await expect(input).toHaveValue('Keep this exact editor');
  await expect(input).toHaveAttribute('data-same-editor', 'yes');
  await expect(input).toBeEnabled();
  expect(await arrivalEvents(page, 'other')).toEqual([]);
});

test('same-family detail/query epochs, blocked readiness and initial loading never replay a root arrival', async ({ page }) => {
  await mountMotionFixture(page);
  await patchRoute(page, { family: 'collection', navigationEpoch: 1 });
  expect(await arrivalEvents(page)).toEqual([]);
  await page.evaluate(() => window.routeArrivalHarness.patch({
    route: { family: 'my-games', scopeEpoch: 0, navigationEpoch: 2, blocked: true }, loading: true,
  }));
  await expect(page.locator(`${fixture} h1`)).toHaveText('Loading...');
  await page.evaluate(() => window.routeArrivalHarness.patch({
    route: { family: 'my-games', scopeEpoch: 0, navigationEpoch: 2, blocked: false }, loading: false,
  }));
  await expect(page.locator(`${fixture} h1`)).toHaveText('my-games');
  expect(await arrivalEvents(page)).toEqual([]);
  await patchRoute(page, { family: 'my-games', scopeEpoch: 0, navigationEpoch: 3 });
  expect(await arrivalEvents(page)).toEqual([]);
});

test('controlled pending editor gates the committed route cue and stale A-B-A cannot start it', async ({ page }) => {
  await mountMotionFixture(page);
  await page.evaluate(() => {
    window.routeArrivalHarness.holdEdit();
    void window.routeArrivalHarness.requestRoute('discover');
  });
  expect(await arrivalEvents(page)).toEqual([]);
  await expect(page.locator(`${fixture} h1`)).toHaveText('collection');
  await page.evaluate(() => window.routeArrivalHarness.finishEdit(false));
  expect(await arrivalEvents(page)).toEqual([]);
  await page.evaluate(() => {
    window.routeArrivalHarness.holdEdit();
    void window.routeArrivalHarness.requestRoute('discover');
  });
  await patchRoute(page, { family: 'my-games', scopeEpoch: 1, navigationEpoch: 2 });
  await patchRoute(page, { family: 'collection', scopeEpoch: 2, navigationEpoch: 3 });
  await page.evaluate(() => window.routeArrivalHarness.finishEdit(true));
  await expect(page.locator(`${fixture} h1`)).toHaveText('collection');
  expect(await arrivalEvents(page)).toEqual([]);
});

test('rapid committed routes cancel only the old owned effect and same-family interruption starts nothing new', async ({ page }) => {
  await mountMotionFixture(page);
  await page.evaluate(() => { window.routeArrivalLog.pause = true; });
  await patchRoute(page, { family: 'discover', navigationEpoch: 1 });
  await expect.poll(async () => (await arrivalEvents(page)).length).toBe(1);
  await patchRoute(page, { family: 'friends', navigationEpoch: 2 });
  await expect.poll(async () => (await arrivalEvents(page)).length).toBe(2);
  expect((await arrivalEvents(page))[0]?.ended).toBe(true);
  expect((await arrivalEvents(page))[1]?.ended).toBe(false);
  await patchRoute(page, { family: 'friends', navigationEpoch: 3 });
  await expect.poll(async () => (await arrivalEvents(page)).every(event => event.ended)).toBe(true);
  expect(await arrivalEvents(page)).toHaveLength(2);
});

test('the real OS reduced-motion preference disables a Full-mode arrival', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mountMotionFixture(page);
  await patchRoute(page, { family: 'discover', navigationEpoch: 1 });
  await expect(page.locator(`${fixture} h1`)).toHaveText('discover');
  expect(await arrivalEvents(page)).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await arrivalEvents(page)).toEqual([]);
});

for (const policy of [
  { animate: false },
  { animate: false, reducedMotion: true },
  { animate: false, hidden: true },
  { animate: false, constrained: true },
] satisfies Array<Partial<MotionPolicy>>) {
  test(`policy ${JSON.stringify(policy)} skips optional setup and cancels active effects without replay`, async ({ page }) => {
    await mountMotionFixture(page);
    await page.evaluate(() => { window.routeArrivalLog.pause = true; });
    await patchRoute(page, { family: 'discover', navigationEpoch: 1 });
    await expect.poll(async () => (await arrivalEvents(page)).length).toBe(1);
    await page.evaluate(policy => window.routeArrivalHarness.patch({ policy }), policy);
    await expect.poll(async () => (await arrivalEvents(page)).every(event => event.ended)).toBe(true);
    await patchRoute(page, { family: 'friends', navigationEpoch: 2 });
    expect(await arrivalEvents(page)).toHaveLength(1);
    await page.evaluate(() => window.routeArrivalHarness.patch({ policy: {} }));
    expect(await arrivalEvents(page)).toHaveLength(1);
    await expect(page.locator(`${fixture} h1`)).toHaveText('friends');
  });
}

test('real My games tabs and range animate bounded noninteractive targets with 25+3 retained rows and no paging writes', async ({ page, isMobile }, info) => {
  await mountMotionFixture(page, true);
  const workspace = page.locator(fixture);
  const before = await readLibrary(page);
  const marker = workspace.locator('.my-games-tab-marker:not([hidden])');
  expect(await arrivalEvents(page)).toEqual([]);
  await workspace.getByRole('navigation', { name: 'My games views' }).getByRole('button', { name: 'Ranking 3', exact: true }).click();
  await expect.poll(async () => (await arrivalEvents(page, 'tab')).length).toBe(1);
  expect((await arrivalEvents(page, 'tab'))[0]?.duration).toBe(isMobile ? 100 : 120);
  await expect(marker).toHaveCSS('background-color', 'rgb(32, 35, 30)');
  await expect(workspace.locator('[hidden] ul.personal-records > .personal-row-static')).toHaveCount(25);
  await expect(workspace.locator('.ranking-row-content')).toHaveCount(3);
  await workspace.getByRole('navigation', { name: 'My games views' }).getByRole('button', { name: 'Library 500', exact: true }).click();
  const pages = workspace.getByRole('navigation', { name: 'Library pages', exact: true });
  await pages.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(pages.getByRole('combobox')).toHaveValue('2');
  await expect(workspace.getByRole('heading', { name: 'Your library results', exact: true })).toBeFocused();
  await expect.poll(async () => (await arrivalEvents(page, 'range')).length).toBe(1);
  expect((await arrivalEvents(page, 'range'))[0]?.duration).toBe(isMobile ? 100 : 120);
  await expect(workspace.locator('ul.personal-records > .personal-row-static')).toHaveCount(25);
  expect(await readLibrary(page)).toEqual(before);
  expect(await arrivalEvents(page, 'heading')).toEqual([]);
  expect(await arrivalEvents(page, 'other')).toEqual([]);
  await page.screenshot({ path: info.outputPath('committed-library-range.png') });
});

test('a real invalid Ranking draft stays in place and cannot trigger a tab arrival', async ({ page }) => {
  await mountMotionFixture(page, true);
  const workspace = page.locator(fixture);
  const tabs = workspace.getByRole('navigation', { name: 'My games views' });
  await tabs.getByRole('button', { name: 'Ranking 3', exact: true }).click();
  const input = workspace.getByRole('spinbutton', { name: 'Your rating for Red Dead Redemption 2', exact: true });
  await input.fill('11');
  const arrivals = await arrivalEvents(page, 'tab');
  await tabs.getByRole('button', { name: 'Library 500', exact: true }).click();
  await expect(tabs.getByRole('button', { name: 'Ranking 3', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(input).toHaveValue('11');
  await expect(workspace.getByRole('alert').filter({ hasText: 'Your edit has not saved' })).toBeVisible();
  expect(await arrivalEvents(page, 'tab')).toHaveLength(arrivals.length);
  expect((await readLibrary(page)).ranking[0]?.score).toBe(8.5);
});

test('typing, passive changes and full-match selection do not animate list rows or interpolate counts', async ({ page }) => {
  await mountMotionFixture(page, true);
  const workspace = page.locator(fixture);
  await workspace.getByRole('searchbox', { name: 'Search your library', exact: true }).fill('Mass Effect');
  await workspace.getByRole('searchbox', { name: 'Search your library', exact: true }).fill('');
  await workspace.getByRole('button', { name: 'Select games', exact: true }).click();
  await workspace.getByRole('button', { name: 'Select all 500 matching games (all 20 pages)', exact: true }).click();
  await expect(workspace.getByRole('region', { name: 'Bulk game actions' }).getByRole('status')).toHaveText('500 selected');
  expect(await arrivalEvents(page)).toEqual([]);
});

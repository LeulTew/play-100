import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readLibrary } from './library-helpers';
import { expectStorageDenial } from './storage-banner-helpers';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import AxeBuilder from '@axe-core/playwright';

const id = 'red-dead-redemption-2';
const title = 'Red Dead Redemption 2';

async function prepareRanking(page: Page) {
  await page.goto('/my-rankings');
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  await page.getByRole('button', { name: `Add ${title} to ranking`, exact: true }).click();
  await expect(page.locator('.my-games-editor:visible .personal-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close game picker', exact: true }).click();
  const score = page.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true });
  await score.fill('7');
  await score.press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(7);
  await page.locator('.ranking-note summary').click();
  const note = page.getByRole('textbox', { name: `Your note for ${title}`, exact: true });
  await note.fill('Original note');
  await note.press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.note).toBe('Original note');
}

for (const field of ['score', 'note'] as const) {
  test(`untouched focused ${field} follows another tab instead of overwriting its update`, async ({
    page,
    context,
  }) => {
    await prepareRanking(page);
    const peer = await context.newPage();
    await peer.goto('/my-rankings');
    await expect(peer.locator('.my-games-editor:visible .personal-row')).toHaveCount(1);
    const currentInput =
      field === 'score'
        ? page.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true })
        : page.getByRole('textbox', { name: `Your note for ${title}`, exact: true });
    const otherInput =
      field === 'score'
        ? peer.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true })
        : peer.getByRole('textbox', { name: `Your note for ${title}`, exact: true });
    if (field === 'note') await peer.locator('.ranking-note summary').click();
    await currentInput.focus();
    await otherInput.fill(field === 'score' ? '9' : 'New note from another tab');
    await otherInput.press('Tab');
    await expect
      .poll(async () => (await readLibrary(peer)).ranking[0]?.[field])
      .toBe(field === 'score' ? 9 : 'New note from another tab');
    await peer.getByRole('checkbox', { name: `I have played it: ${title}`, exact: true }).click();
    await expect(page.getByRole('checkbox', { name: `I have played it: ${title}`, exact: true })).toBeChecked();
    await expect(currentInput).toHaveValue(field === 'score' ? '9' : 'New note from another tab');
    await currentInput.press('Tab');
    expect((await readLibrary(page)).ranking[0]?.[field]).toBe(field === 'score' ? 9 : 'New note from another tab');
    await peer.close();
  });
}

test('an actual dirty draft is preserved through another-tab updates and saves intentionally', async ({
  page,
  context,
}) => {
  await prepareRanking(page);
  const peer = await context.newPage();
  await peer.goto('/my-rankings');
  await expect(peer.locator('.my-games-editor:visible .personal-row')).toHaveCount(1);
  const current = page.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true });
  await current.fill('8.5');
  const remote = peer.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true });
  await remote.fill('9');
  await remote.press('Tab');
  await expect.poll(async () => (await readLibrary(peer)).ranking[0]?.score).toBe(9);
  await peer.getByRole('checkbox', { name: `I have played it: ${title}`, exact: true }).click();
  await expect(page.getByRole('checkbox', { name: `I have played it: ${title}`, exact: true })).toBeChecked();
  await expect(current).toHaveValue('8.5');
  await current.press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(8.5);
  await peer.close();
});

test('invalid native number input never clears a previously saved personal score', async ({ page }) => {
  await prepareRanking(page);
  const score = page.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true });
  await score.focus();
  await score.press('ControlOrMeta+A');
  await score.press('e');
  await score.press('Tab');
  await expect(page.locator('.ranking-row-content .inline-error')).toHaveText(
    'Enter a rating from 0 to 10, or clear the field to remove your rating. Your saved rating is unchanged.',
  );
  expect((await readLibrary(page)).ranking.find((entry) => entry.id === id)?.score).toBe(7);
});

test('temporary user edits survive a later successful author-data retry', async ({ page }) => {
  await page.addInitScript(() => {
    const factory = window.indexedDB;
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get: () => {
        if (document.documentElement.dataset.reviewStorageAllowed === 'yes') return factory;
        throw new DOMException('Storage temporarily unavailable', 'SecurityError');
      },
    });
  });
  await page.route('**/data/collection.json', (route) =>
    route.fulfill({ status: 503, body: 'Temporarily unavailable' }),
  );
  await page.goto('/discover');
  const { banner, configured } = await expectStorageDenial(page);
  if (configured) {
    await banner.getByRole('button', { name: 'Use this device only', exact: true }).click();
    await expect(banner.getByRole('button', { name: 'Use this device only', exact: true })).toHaveCount(0);
    await expect(banner).toHaveCount(1);
  }
  await page.getByText('Add a game manually', { exact: true }).click();
  await page.getByLabel('Game title', { exact: true }).fill('Temporary game to retain');
  await page.getByRole('button', { name: 'Add to my library', exact: true }).click();
  await page.locator('.discovery-heading').getByRole('button', { name: 'My games', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Temporary game to retain', exact: true })).toBeVisible();
  await page.locator('.wordmark').first().click();
  await page.evaluate(() => {
    document.documentElement.dataset.reviewStorageAllowed = 'yes';
  });
  await page.unroute('**/data/collection.json');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.locator('.saved-nav').click();
  await page
    .getByRole('navigation', { name: 'My games views', exact: true })
    .getByRole('button', { name: /^Library, \d+$/ })
    .click();
  await expect(page.getByRole('button', { name: 'Temporary game to retain', exact: true })).toBeVisible();
  await expect(banner).toHaveCount(1);
  await expect(banner).toHaveAttribute('role', 'alert');
  await expect(banner).toContainText('this tab only');
  expect((await banner.innerText()).match(/has not been overwritten/g)).toHaveLength(1);
});

test('visible game and navigation labels match their accessible names', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  const result = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
  expect(result.violations).toEqual([]);
  const queueButton = page.locator('.saved-nav');
  await expect(queueButton).toHaveAccessibleName(/Play later/);
  for (const width of [320, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(queueButton).toHaveAccessibleName(/Play later/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

// WCAG 2.0 A/AA plus the experimental Label in Name rule (2.5.3), which the wcag2a/wcag2aa tags leave off.
async function expectLabelInName(page: Page, surface: string, include?: string) {
  const builder = new AxeBuilder({ page }).options({
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    rules: { 'label-content-name-mismatch': { enabled: true } },
  });
  if (include) builder.include(include);
  const result = await builder.analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({ surface, id, targets: nodes.map((node) => node.target.join(' ')) })),
  ).toEqual([]);
}

test('every primary surface keeps visible labels inside accessible names', async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
    throw new Error('Label-in-name fixtures require the owned local app.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname.startsWith('/api/'))
      return route.abort('blockedbyclient');
    return route.continue();
  });
  await installGuestLibrary(page, libraryFixture(3));

  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.getByRole('button', { name: `Pin for comparison: ${libraryRecords[0].title}`, exact: true }).click();
  const opener = page.locator('.compare-tray-expand');
  await expect(opener).toHaveAccessibleName('Open Compare tray, 1 game');
  await expectLabelInName(page, 'collection grid');
  await page.goto('/?view=list&catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expectLabelInName(page, 'collection list');
  await page.goto('/?view=table&catalogs=off');
  await expect(page.locator('.ratings-table tbody tr')).toHaveCount(24);
  // At least one critic column has no score, so the unavailable-score markup is part of the scan.
  await expect(page.locator('.ratings-table td.numeric-score .sr-only').first()).toHaveText(/unavailable/i);
  await expectLabelInName(page, 'collection table');

  await page.goto('/discover?catalogs=off');
  await expect(page.locator('.discovery-card').first()).toBeVisible();
  await expectLabelInName(page, 'discover');
  await page.locator('.discovery-card h3 button').first().click();
  const detail = page.locator('dialog[open]');
  await expect(detail).toBeVisible();
  await expectLabelInName(page, 'catalog detail', 'dialog[open]');
  await detail.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(detail).toHaveCount(0);

  for (const [tab, name] of [
    ['library', /^Library, \d+$/],
    ['queue', /^Queue, \d+$/],
    ['ranking', /^Ranking, \d+$/],
  ] as const) {
    await page.goto(`/my-games?tab=${tab}&catalogs=off`);
    const views = page.getByRole('navigation', { name: 'My games views', exact: true });
    await expect(views.getByRole('button', { name })).toHaveAttribute('aria-current', 'page');
    await expect(opener).toHaveAccessibleName('Open Compare tray, 1 game');
    await expectLabelInName(page, `my games ${tab}`);
  }

  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const settings = page.locator('.settings-dialog[open]');
  await expect(settings).toBeVisible();
  await expectLabelInName(page, 'settings', '.settings-dialog[open]');
  await settings.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(settings).toHaveCount(0);

  // The signed-out account sheet exists only in the centrally configured online build.
  if ((await page.locator('.account-nav').count()) === 0) return;
  await expect(page.locator('.account-nav')).toHaveAccessibleName('Account Device only');
  await page.locator('.account-nav').click();
  const signIn = page.getByRole('dialog', { name: 'Sign in', exact: true });
  await expect(signIn).toBeVisible();
  await expectLabelInName(page, 'signed-out account sheet', 'dialog[open]');
});
test('Auto defers touch-screen WebGL until requested while Full remains automatic', async ({ page, isMobile }) => {
  const sceneRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/assets\/CollectionScene-/.test(request.url())) sceneRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expect(page.locator('.save-game').first()).toBeEnabled();
  const scene = page.locator('.collection-artifact');
  if (isMobile) {
    await expect(scene).toHaveAttribute('data-activation', 'on-demand');
    await expect(scene).toHaveAttribute('data-render-mode', 'static');
    expect(sceneRequests).toEqual([]);
    await page.getByRole('button', { name: 'Fan out the collection sleeves', exact: true }).click();
    await expect(scene).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
    await expect(scene).toHaveAttribute('data-render-mode', 'webgl');
    await expect(scene).toHaveAttribute('data-fanned', 'true');
  } else {
    await expect(scene).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
    await expect(scene).toHaveAttribute('data-render-mode', 'webgl');
  }
  await page
    .locator('.footer-tools')
    .getByRole('button', { name: /Effects:/ })
    .click();
  await page.getByRole('radio', { name: /Full/ }).click();
  await expect(page.getByRole('radio', { name: /Full/ })).toBeChecked();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.wordmark').first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(scene).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
  await expect(scene).toHaveAttribute('data-render-mode', 'webgl');
  await expect(scene).toHaveAttribute('data-activation', 'automatic');
});

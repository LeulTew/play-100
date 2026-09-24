import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readLibrary } from './library-helpers';
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
  test(`untouched focused ${field} follows another tab instead of overwriting its update`, async ({ page, context }) => {
    await prepareRanking(page);
    const peer = await context.newPage();
    await peer.goto('/my-rankings');
    await expect(peer.locator('.my-games-editor:visible .personal-row')).toHaveCount(1);
    const currentInput = field === 'score'
      ? page.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true })
      : page.getByRole('textbox', { name: `Your note for ${title}`, exact: true });
    const otherInput = field === 'score'
      ? peer.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true })
      : peer.getByRole('textbox', { name: `Your note for ${title}`, exact: true });
    if (field === 'note') await peer.locator('.ranking-note summary').click();
    await currentInput.focus();
    await otherInput.fill(field === 'score' ? '9' : 'New note from another tab');
    await otherInput.press('Tab');
    await expect.poll(async () => (await readLibrary(peer)).ranking[0]?.[field]).toBe(field === 'score' ? 9 : 'New note from another tab');
    await peer.getByRole('checkbox', { name: `I have played it: ${title}`, exact: true }).click();
    await expect(page.getByRole('checkbox', { name: `I have played it: ${title}`, exact: true })).toBeChecked();
    await expect(currentInput).toHaveValue(field === 'score' ? '9' : 'New note from another tab');
    await currentInput.press('Tab');
    expect((await readLibrary(page)).ranking[0]?.[field]).toBe(field === 'score' ? 9 : 'New note from another tab');
    await peer.close();
  });
}

test('an actual dirty draft is preserved through another-tab updates and saves intentionally', async ({ page, context }) => {
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
  await expect(page.locator('.ranking-row-content .inline-error')).toContainText('valid');
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
  await page.route('**/data/collection.json', (route) => route.fulfill({ status: 503, body: 'Temporarily unavailable' }));
  await page.goto('/discover');
  await expect(page.locator('.storage-banner')).toContainText('this tab only');
  await page.getByText('Add a game manually', { exact: true }).click();
  await page.getByLabel('Game title', { exact: true }).fill('Temporary game to retain');
  await page.getByRole('button', { name: 'Add to my library', exact: true }).click();
  await page.getByRole('button', { name: 'Open my library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Temporary game to retain', exact: true })).toBeVisible();
  await page.locator('.wordmark').first().click();
  await page.evaluate(() => { document.documentElement.dataset.reviewStorageAllowed = 'yes'; });
  await page.unroute('**/data/collection.json');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.locator('.saved-nav').click();
  await page.getByRole('button', { name: /All my games/ }).click();
  await expect(page.getByRole('button', { name: 'Temporary game to retain', exact: true })).toBeVisible();
  await expect(page.locator('.storage-banner')).toContainText('this tab only');
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

test('Auto defers touch-screen WebGL until requested while Full remains automatic', async ({ page, isMobile }) => {
  const sceneRequests: string[] = [];
  page.on('request', (request) => { if (/\/assets\/CollectionScene-/.test(request.url())) sceneRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expect(page.locator('.save-game').first()).toBeEnabled();
  const scene = page.locator('.collection-artifact');
  if (isMobile) {
    await expect(scene).toHaveAttribute('data-activation', 'on-demand');
    await expect(scene).toHaveAttribute('data-render-mode', 'static');
    expect(sceneRequests).toEqual([]);
    await page.getByRole('button', { name: 'Fan out the collection sleeves', exact: true }).click();
    await expect(scene).toHaveAttribute('data-render-mode', 'webgl');
    await expect(scene).toHaveAttribute('data-fanned', 'true');
  } else {
    await expect(scene).toHaveAttribute('data-render-mode', 'webgl');
  }
  await page.locator('.footer-bottom').getByRole('button', { name: /Experience:/ }).click();
  await page.getByRole('radio', { name: /Full/ }).click();
  await expect(page.getByRole('radio', { name: /Full/ })).toBeChecked();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.wordmark').first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(scene).toHaveAttribute('data-render-mode', 'webgl');
  await expect(scene).toHaveAttribute('data-activation', 'automatic');
});

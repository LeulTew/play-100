import { expect, test } from '@playwright/test';
import { readLibrary } from './library-helpers';

test('queue badge stays exact and its header action never waits for the visual count', async ({ page, context, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Use the owned local preview.');
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) return route.abort('blockedbyclient');
    if (url.pathname === '/api/catalog') return route.fulfill({ status: 503, json: { error: 'Controlled offline provider.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('play100.library.v1', JSON.stringify({ version: 1, motion: 'full', progress: {} })));
  await page.goto('/?catalogs=off');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  const accessible = page.locator('.saved-count .sr-only');
  const visual = page.locator('.saved-count [aria-hidden="true"]');
  await expect(accessible).toHaveText('0');
  await expect(visual).toHaveText('0');
  await page.locator('.game-card[data-game="red-dead-redemption-2"] .save-game').click();
  await expect(accessible).toHaveText('1');
  await page.locator('.saved-nav').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('queue');
  const queue = page.locator('.my-games-editor:visible');
  await expect(queue.getByRole('list', { name: 'Your play order', exact: true }).locator('.personal-row')).toHaveCount(1);
  expect((await readLibrary(page)).queueOrder).toEqual(['red-dead-redemption-2']);
  await expect(visual).toHaveText('1');
  await queue.getByRole('button', { name: 'Play later: Red Dead Redemption 2', exact: true }).click();
  await expect(accessible).toHaveText('0');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expect(visual).toHaveText('0');
  expect((await readLibrary(page)).queueOrder).toEqual([]);
});

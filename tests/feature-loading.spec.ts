import { expect, test } from '@playwright/test';
import { readLibrary } from './library-helpers';

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Feature loading proof requires the owned local preview.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'Synthetic unavailable provider.' } }));
});

test('cold Settings opens and closes natively without loading update execution or preparing offline data', async ({ page }) => {
  const deferredRequests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path === '/sw.js' || path.includes('/apply-update-')) deferredRequests.push(path);
  });
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Install & offline access', exact: true }).click();
  await expect(page.locator('#settings-title')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Enable offline access', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.settings-dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect(deferredRequests).toEqual([]);
});

test('native Back before the cold detail/parser module arrives cannot reopen a closed preview', async ({ page }) => {
  let release = () => {};
  let requested = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { requested = resolve; });
  await page.route(/\/assets\/CatalogDetail-[^/]+\.js(?:\?|$)/, async route => {
    requested(); await gate; await route.continue();
  });
  try {
    await page.goto('/discover?q=Kingdomcome&catalogs=off');
    const opener = page.locator('[data-catalog-id="wikidata:Q15408545"]').getByRole('button', { name: 'Kingdom Come: Deliverance', exact: true });
    await opener.click();
    await started;
    await expect(page).toHaveURL(url => url.searchParams.has('game'));
    await page.goBack();
    await expect(page).not.toHaveURL(url => url.searchParams.has('game'));
    release();
    await expect(opener).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await opener.click();
    await expect(page.locator('#catalog-game-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  } finally { release(); }
});

test('a failed cold detail module surfaces recovery without deleting saved device data', async ({ page }) => {
  await page.route(/\/assets\/CatalogDetail-[^/]+\.js(?:\?|$)/, route => route.abort('failed'));
  await page.goto('/discover?q=Kingdomcome&catalogs=off');
  const before = await readLibrary(page);
  await page.locator('[data-catalog-id="wikidata:Q15408545"]').getByRole('button', { name: 'Kingdom Come: Deliverance', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Let's get you back to the games.", exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload the collection', exact: true })).toBeVisible();
  expect(await readLibrary(page)).toEqual(before);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

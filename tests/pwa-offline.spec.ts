import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readLibrary } from './library-helpers';
import { openBrowsingFilters } from './browsing-helpers';

test.use({ serviceWorkers: 'allow' });

async function openOfflineSettings(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('button', { name: 'Install & offline access', exact: true }).click();
  const settings = page.locator('dialog[aria-labelledby="settings-title"]');
  await expect(settings.locator('.pwa-settings')).toHaveAttribute('open', '');
  return settings;
}

async function cacheInventory(page: Page) {
  return page.evaluate(async () => {
    const result: Array<{ name: string; urls: string[] }> = [];
    for (const name of await caches.keys()) {
      result.push({ name, urls: (await (await caches.open(name)).keys()).map(request => request.url) });
    }
    return result;
  });
}

test('explicit offline preparation preserves guest data and serves fresh local routes without caching APIs or auth', async ({ page, context, browserName, baseURL }, info) => {
  test.setTimeout(120000);
  expect(browserName).toBe('chromium');
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('The PWA proof requires the owned local production preview, never a deployed account.');
  }
  const origin = new URL(baseURL).origin;
  const workerRequests: Array<{ url: string; method: string }> = [];
  const preparationRequests: string[] = [];
  context.on('request', request => {
    if (request.serviceWorker()) workerRequests.push({ url: request.url(), method: request.method() });
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/sw.js' || pathname === '/pwa/offline.html') preparationRequests.push(pathname);
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/my-games?catalogs=off');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(values => values.length))).toBe(0);
  expect(await cacheInventory(page)).toEqual([]);

  const title = 'CI offline guest game';
  const manual = page.locator('.my-games-editor:visible .manual-add');
  await manual.locator('summary').click();
  await manual.getByLabel('Game title', { exact: true }).fill(title);
  await manual.getByRole('button', { name: 'Add to my library', exact: true }).click();
  await expect.poll(async () => Object.values((await readLibrary(page)).records).some(record => record.title === title)).toBe(true);
  const record = Object.values((await readLibrary(page)).records).find(value => value.title === title);
  if (!record) throw new Error('The UI-created guest fixture did not persist.');
  const row = page.locator(`.my-games-editor:visible [data-record-id="${record.id}"]`);
  await row.getByRole('button', { name: `Play later: ${title}`, exact: true }).click();
  await row.getByRole('button', { name: `Add ${title} to my ranking`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.some(entry => entry.id === record.id)).toBe(true);
  const beforeOffline = await readLibrary(page);
  expect(beforeOffline.queueOrder).toContain(record.id);

  const settings = await openOfflineSettings(page);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(values => values.length))).toBe(0);
  expect(context.serviceWorkers()).toHaveLength(0);
  expect(workerRequests).toEqual([]);
  expect(preparationRequests).toEqual([]);
  expect(await cacheInventory(page)).toEqual([]);
  const firstDocument = await page.evaluate(() => performance.timeOrigin);
  await settings.getByRole('button', { name: 'Enable offline access', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Offline files ready', exact: true })).toBeDisabled({ timeout: 45000 });
  await expect.poll(() => page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.length === 1 && registrations[0]?.active?.state === 'activated';
  })).toBe(true);
  expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(firstDocument);
  await expect(settings.getByText('Running as an installed app.', { exact: true })).toHaveCount(0);
  const prepared = await cacheInventory(page);
  const core = prepared.find(cache => /^play100-pwa-v1-core-[a-f0-9]{64}$/.test(cache.name));
  expect(core?.urls.map(url => new URL(url).pathname)).toEqual(expect.arrayContaining([
    '/index.html', '/data/collection.json', '/data/discovery/catalog.v1.json', '/pwa/__ready__',
  ]));
  expect(workerRequests.length).toBeGreaterThan(0);
  expect(preparationRequests).toContain('/sw.js');
  expect(preparationRequests).toContain('/pwa/offline.html');
  expect(workerRequests.every(request => request.method === 'GET' && new URL(request.url).origin === origin)).toBe(true);
  await page.keyboard.press('Escape');

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await expect(page.locator('.my-games-editor:visible')).toContainText(title);
    await expect(page.getByRole('navigation', { name: 'My games views' }).getByRole('button', { name: /^Library/ })).toHaveAttribute('aria-current', 'page');
    for (const [tab, label] of [['queue', 'Queue'], ['ranking', 'Ranking']] as const) {
      await page.goto(`/my-games?tab=${tab}&catalogs=off`);
      await expect(page.getByRole('navigation', { name: 'My games views' })
        .getByRole('button', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.my-games-editor:visible')).toContainText(title);
    }
    expect(await readLibrary(page)).toEqual(beforeOffline);

    await page.goto('/discover?catalogs=off');
    await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
    await expect(page.locator('.discovery-cards > li').first()).toBeVisible();
    await openBrowsingFilters(page);
    await page.getByRole('checkbox', { name: 'Include The 100', exact: true }).check();
    await page.getByRole('combobox', { name: 'Genre family', exact: true }).selectOption('action-adventure');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
    await expect(page.locator('.discovery-cards > li').first()).toBeVisible();
    await openBrowsingFilters(page);
    await expect(page.getByRole('checkbox', { name: 'Include The 100', exact: true })).toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Genre family', exact: true })).toHaveValue('action-adventure');
    const offlineSettings = await openOfflineSettings(page);
    await expect(offlineSettings.getByRole('button', { name: 'Offline files ready', exact: true })).toBeDisabled();
    await expect(offlineSettings.getByRole('button', { name: 'Check for an app update', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    expect(await readLibrary(page)).toEqual(beforeOffline);

    const denied = await page.evaluate(async () => {
      const results: boolean[] = [];
      for (const url of ['/api/catalog?source=wikidata&q=offline-fixture', '/__/auth/iframe?offline-fixture=1']) {
        try { await fetch(url, { cache: 'no-store' }); results.push(false); }
        catch { results.push(true); }
      }
      return results;
    });
    expect(denied).toEqual([true, true]);
    const cached = await cacheInventory(page);
    for (const cache of cached) for (const value of cache.urls) {
      const url = new URL(value);
      expect(url.origin).toBe(origin);
      expect(url.search).toBe('');
      expect(url.username || url.password).toBe('');
      expect(url.pathname).not.toMatch(/^\/(?:api|__|account|friends|publish|creator|compare)(?:\/|$)/);
    }
    await info.attach('pwa-offline-cache-boundary', {
      contentType: 'application/json',
      body: JSON.stringify({ workerRequests, caches: cached.map(cache => ({ name: cache.name, paths: cache.urls.map(url => new URL(url).pathname) })) }),
    });
  } finally {
    // Playwright owns and disposes this test's isolated context, including its worker and data.
    await context.setOffline(false);
  }
  await page.goto('/my-games?catalogs=off');
  await expect(page.locator('.my-games-editor:visible')).toContainText(title);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
  expect(await readLibrary(page)).toEqual(beforeOffline);
});

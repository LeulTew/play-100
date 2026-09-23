import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

declare global {
  interface Window {
    dataUseDatabaseOpens: string[];
    dataUseLayoutShift: number;
    dataUseShiftObserver: PerformanceObserver;
  }
}

const bodyModule = /(?:\/assets\/DataUseContent-[^/]+\.js|\/src\/components\/DataUseContent\.tsx)(?:\?|$)/;

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('Data-use loading proof requires the owned local preview.');
  }
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.dataUseDatabaseOpens = [];
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args: Parameters<IDBFactory['open']>) {
      window.dataUseDatabaseOpens.push(args[0]);
      return open.apply(this, args);
    };
  });
});

test('landing does not request the disclosure body; direct data-use keeps its shell and focus while it loads', async ({ page }) => {
  const modules: string[] = [];
  const dataRequests: string[] = [];
  page.on('request', request => {
    if (bodyModule.test(request.url())) modules.push(request.url());
  });
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.evaluate(() => new Promise<void>(resolve => requestIdleCallback(() => resolve())));
  expect(modules).toEqual([]);

  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(bodyModule, async route => { await gate; await route.continue(); });
  page.on('request', request => {
    if (/\/(?:api\/|data\/)|googleapis\.com|firebaseio\.com/.test(request.url())) dataRequests.push(request.url());
  });
  try {
    await page.goto('/data-use', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle('Data use | Play 100');
    await expect(page.getByRole('heading', { name: 'Data use', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Loading data-use details...');
    await expect(page.getByText('Device storage, account saving and public sharing are separate choices.', { exact: false })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to data use', exact: true })).toBeFocused();
    const home = page.locator('.wordmark');
    await home.focus();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.dataUseLayoutShift = 0;
      window.dataUseShiftObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if ('value' in entry && typeof entry.value === 'number') window.dataUseLayoutShift += entry.value;
        }
      });
      window.dataUseShiftObserver.observe({ type: 'layout-shift' });
    });
    const heading = page.getByRole('heading', { name: 'Data use', exact: true });
    const before = await heading.boundingBox();
    release();
    await expect(page.locator('#data-use h2')).toHaveCount(9);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(home).toBeFocused();
    expect(await heading.boundingBox()).toEqual(before);
    const shift = await page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      window.dataUseShiftObserver.disconnect();
      resolve(window.dataUseLayoutShift);
    }))));
    expect(shift).toBe(0);
    await expect(page.getByRole('heading', { name: 'Services and essential storage', exact: true })).toBeAttached();
    expect(modules).toHaveLength(1);
    expect(dataRequests).toEqual([]);
    expect(await page.evaluate(() => window.dataUseDatabaseOpens)).toEqual([]);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0);
  } finally { release(); }
});

test('failed disclosure code shows the existing recovery path instead of silently omitting the details', async ({ page }) => {
  await page.route(bodyModule, route => route.abort('failed'));
  await page.goto('/data-use');
  await expect(page.getByRole('heading', { name: "Let's get you back to the games.", exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload the collection', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.dataUseDatabaseOpens)).toEqual([]);
});

test('explicit offline preparation retains the unvisited disclosure body in the public core', async ({ page, context }) => {
  test.setTimeout(90000);
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Install & offline access', exact: true }).click();
  await page.getByRole('button', { name: 'Enable offline access', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Offline files ready', exact: true })).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await context.setOffline(true);
  try {
    const cached = await page.evaluate(async () => {
      const contents: string[] = [];
      for (const name of await caches.keys()) {
        if (!/^play100-pwa-v1-core-[a-f0-9]{64}$/.test(name)) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (!/\/assets\/DataUseContent-[^/]+\.js$/.test(new URL(request.url).pathname)) continue;
          const response = await cache.match(request);
          if (response) contents.push(await response.text());
        }
      }
      return contents;
    });
    expect(cached).toHaveLength(1);
    expect(cached[0]).toContain('Device-only libraries');
    expect(cached[0]).toContain('Services and essential storage');
  } finally { await context.setOffline(false); }
});

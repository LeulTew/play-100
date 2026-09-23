import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEnv } from 'vite';
import { readFirebaseConfiguration } from '../src/lib/online-config';

const mode = process.env.PLAY100_TEST_BUILD === 'development' ? 'development' : 'production';
const environment = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
const online = readFirebaseConfiguration(environment);
if (online.error || (environment.VITE_FIREBASE_REQUIRED === 'true' && !online.config)) {
  throw new Error(online.error ?? 'The declared navigation build requires complete public Firebase configuration.');
}
const onlineAvailable = online.config !== null;
const labels = ['The 100', 'Discover', 'My games', onlineAvailable ? 'Friends' : 'Ranking', 'Menu'];

async function readNavigation(page: Page) {
  return page.locator('.mobile-nav').evaluate(nav => {
    const bounds = nav.getBoundingClientRect();
    const dock = document.querySelector('.compare-tray-dock')?.getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scale: visualViewport?.scale,
      overflow: document.documentElement.scrollWidth > innerWidth,
      nav: bounds.toJSON(), dockBottom: dock?.bottom ?? null,
      items: [...nav.children].map(item => {
        const rect = item.getBoundingClientRect();
        const label = item.querySelector('span')!;
        const text = label.getBoundingClientRect();
        return {
          label: label.textContent, font: Number.parseFloat(getComputedStyle(label).fontSize),
          width: rect.width, height: rect.height, labelWidth: text.width, labelHeight: text.height,
          hit: item.contains(document.elementFromPoint(text.x + text.width / 2, text.y + text.height / 2)),
          inside: rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom,
        };
      }),
    };
  });
}

async function assertNavigation(page: Page) {
  const actual = await readNavigation(page);
  expect(actual.items.map(item => item.label)).toEqual(labels);
  expect(actual.items.map(item => item.font)).toEqual([12, 12, 12, 12, 12]);
  expect(actual.overflow).toBe(false);
  expect(actual.nav.height).toBe(66);
  for (const item of actual.items) {
    expect(item.width).toBeGreaterThanOrEqual(48);
    expect(item.height).toBeGreaterThanOrEqual(48);
    expect(item.labelWidth).toBeLessThanOrEqual(item.width);
    expect(item.labelHeight).toBeLessThanOrEqual(22);
    expect(item.inside).toBe(true);
    expect(item.hit).toBe(true);
  }
  if (actual.dockBottom !== null) expect(actual.dockBottom).toBeLessThanOrEqual(actual.nav.top - 8);
  return actual;
}

async function activateAll(page: Page, touch: boolean) {
  const nav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  const destinations = [
    ['Discover', '/discover'],
    ['My games', '/my-games'],
    onlineAvailable ? ['Friends', '/friends'] : ['Ranking', '/my-games'],
  ] as const;
  for (const [label, path] of destinations) {
    const link = nav.getByRole('link', { name: label, exact: true });
    if (touch) await link.tap(); else await link.click();
    await expect(page).toHaveURL(url => url.pathname === path);
    if (label === 'Friends') await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    if (label === 'Ranking') {
      await expect(page).toHaveURL(url => url.pathname === path && url.searchParams.get('tab') === 'ranking');
      await expect(page.getByRole('navigation', { name: 'My games views', exact: true })
        .getByRole('button', { name: /^Ranking/ })).toHaveAttribute('aria-current', 'page');
    }
  }
  const menu = nav.getByRole('button', { name: 'Menu', exact: true });
  if (touch) await menu.tap(); else await menu.click();
  await expect(page.locator('#menu-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toHaveCount(0);
  await expect(menu).toBeFocused();
  const home = nav.getByRole('link', { name: 'The 100', exact: true });
  if (touch) await home.tap(); else await home.click();
  await expect(page).toHaveURL(url => url.pathname === '/');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Use the owned local navigation preview.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort('blockedbyclient'));
});

for (const width of [320, 393]) {
  test(`all five mobile navigation labels stay readable and reachable at ${width}px without changing dock clearance`, async ({ page, isMobile }, info) => {
    test.skip(!isMobile, 'The actual coarse-pointer contract is exercised in the mobile project.');
    await page.setViewportSize({ width, height: width === 320 ? 740 : 852 });
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    const card = page.locator('.game-card').first();
    const title = (await card.locator('h3').innerText()).trim();
    const pin = card.getByRole('button', { name: `Pin ${title} for comparison`, exact: true });
    await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await pin.tap();
    await expect(card.getByRole('button', { name: `Unpin ${title} from comparison`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.compare-tray-dock')).toBeVisible();
    await expect(page.locator('.compare-tray-dock').getByRole('button', { name: 'Open Compare tray, 1 game', exact: true })).toBeVisible();
    const actual = await readNavigation(page);
    await info.attach('navigation-labels', { contentType: 'application/json', body: JSON.stringify(actual) });
    await assertNavigation(page);
    await activateAll(page, true);
    await assertNavigation(page);
  });
}

test('desktop stays unchanged and native 200 percent browser zoom keeps the five navigation labels usable', async ({ baseURL, isMobile }, info) => {
  test.skip(isMobile, 'One owned desktop Chrome profile checks native200% zoom.');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
    baseURL, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  let browserPid: number | undefined;
  try {
    const cdp = await context.browser()!.newBrowserCDPSession();
    const processInfo = await cdp.send('SystemInfo.getProcessInfo');
    browserPid = processInfo.processInfo.find((item: { type: string; id: number }) => item.type === 'browser')?.id;
    await cdp.detach();
    const page = await context.newPage();
    await page.goto('/?catalogs=off');
    await expect(page.locator('.mobile-nav')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeVisible();
    const settings = await context.newPage();
    await settings.goto('chrome://settings/appearance');
    await settings.waitForFunction(() => Boolean(Reflect.get(globalThis, 'chrome')?.settingsPrivate?.setDefaultZoom));
    const zoom = await settings.evaluate(async () => {
      const api = Reflect.get(globalThis, 'chrome').settingsPrivate;
      const before = await new Promise<number>(resolve => api.getDefaultZoom(resolve));
      await new Promise<void>(resolve => api.setDefaultZoom(2, resolve));
      const after = await new Promise<number>(resolve => api.getDefaultZoom(resolve));
      return { before, after };
    });
    expect(zoom).toEqual({ before: 1, after: 2 });
    const enlarged = await context.newPage();
    await enlarged.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin
      ? route.continue() : route.abort('blockedbyclient'));
    await enlarged.goto('/?catalogs=off');
    const actual = await assertNavigation(enlarged);
    expect(actual.width).toBe(720); expect(actual.dpr).toBe(2); expect(actual.scale).toBe(1);
    await activateAll(enlarged, false);
    await assertNavigation(enlarged);
    await info.attach('native-browser-zoom', { contentType: 'application/json', body: JSON.stringify({ zoom, actual }) });
    await settings.evaluate(() => new Promise<void>(resolve => Reflect.get(globalThis, 'chrome').settingsPrivate.setDefaultZoom(1, resolve)));
  } finally {
    await context.close();
    if (browserPid !== undefined) {
      expect(() => process.kill(browserPid!, 0)).toThrow();
    }
  }
});

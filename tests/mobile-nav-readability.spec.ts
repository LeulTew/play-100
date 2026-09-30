import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEnv } from 'vite';
import { readFirebaseConfiguration } from '../src/lib/online-config';
import { expectEqualColumns, readNavigationColumns } from './mobile-nav-helpers';
import { adoptTextSpacing } from './readability-helpers';

const mode = process.env.PLAY100_TEST_BUILD === 'development' ? 'development' : 'production';
const environment = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
const online = readFirebaseConfiguration(environment);
if (online.error || (environment.VITE_FIREBASE_REQUIRED === 'true' && !online.config)) {
  throw new Error(online.error ?? 'The declared navigation build requires complete public Firebase configuration.');
}
const onlineAvailable = online.config !== null;
const labels = ['The 100', 'Discover', 'My games', onlineAvailable ? 'Friends' : 'Ranking', 'Menu'];

async function readNavigation(page: Page) {
  return page.locator('.mobile-nav').evaluate((nav) => {
    const bounds = nav.getBoundingClientRect();
    const dock = document.querySelector('.compare-tray-dock')?.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      scale: visualViewport?.scale,
      overflow: document.documentElement.scrollWidth > innerWidth,
      nav: bounds.toJSON(),
      compareReserved: Boolean(document.querySelector('.compare-tray-reserve')),
      dockTop: dock?.top ?? null,
      dockBottom: dock?.bottom ?? null,
      items: [...nav.children].map((item) => {
        const rect = item.getBoundingClientRect();
        const label = item.querySelector('span')!;
        const text = label.getBoundingClientRect();
        const words: { word: string; lines: number; inside: boolean }[] = [];
        const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          for (const word of (walker.currentNode.textContent ?? '').matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(walker.currentNode, word.index);
            range.setEnd(walker.currentNode, word.index + word[0].length);
            const fragments = [...range.getClientRects()].filter((box) => box.width > 0);
            words.push({
              word: word[0],
              lines: new Set(fragments.map((box) => Math.round(box.top))).size,
              inside: fragments.every((box) => box.left >= rect.left - 1 && box.right <= rect.right + 1),
            });
          }
        }
        return {
          label: label.textContent,
          words,
          font: Number.parseFloat(getComputedStyle(label).fontSize),
          width: rect.width,
          height: rect.height,
          labelWidth: text.width,
          labelHeight: text.height,
          hit: item.contains(document.elementFromPoint(text.x + text.width / 2, text.y + text.height / 2)),
          inside:
            rect.left >= bounds.left &&
            rect.right <= bounds.right &&
            rect.top >= bounds.top &&
            rect.bottom <= bounds.bottom,
        };
      }),
    };
  });
}

async function assertNavigation(page: Page) {
  const actual = await readNavigation(page);
  expect(actual.items.map((item) => item.label)).toEqual(labels);
  expect(actual.items.map((item) => item.font)).toEqual([12, 12, 12, 12, 12]);
  expect(actual.overflow).toBe(false);
  expect(actual.nav.height).toBeGreaterThanOrEqual(66);
  if (!actual.compareReserved) expect(actual.nav.height).toBe(66);
  for (const item of actual.items) {
    expect(item.width).toBeGreaterThanOrEqual(actual.compareReserved ? 44 : 48);
    expect(item.height).toBeGreaterThanOrEqual(48);
    expect(item.labelWidth).toBeLessThanOrEqual(item.width);
    expect(item.labelHeight).toBeLessThanOrEqual(actual.compareReserved ? 44 : 22);
    expect(item.inside).toBe(true);
    expect(item.hit).toBe(true);
    for (const word of item.words) {
      expect(word.lines, `${item.label}: ${word.word} must not break mid-word`).toBe(1);
      expect(word.inside, `${item.label}: ${word.word} must stay inside its target`).toBe(true);
    }
  }
  if (actual.dockBottom !== null) {
    expect(actual.dockTop).toBeGreaterThanOrEqual(actual.nav.top);
    expect(actual.dockBottom).toBeLessThanOrEqual(actual.nav.bottom);
  }
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
    if (touch) await link.tap();
    else await link.click();
    await expect(page).toHaveURL((url) => url.pathname === path);
    if (label === 'Friends') {
      await expect(page.getByRole('heading', { name: 'Friends', level: 1, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
    }
    if (label === 'Ranking') {
      await expect(page).toHaveURL((url) => url.pathname === path && url.searchParams.get('tab') === 'ranking');
      await expect(
        page.getByRole('navigation', { name: 'My games views', exact: true }).getByRole('button', { name: /^Ranking/ }),
      ).toHaveAttribute('aria-current', 'page');
    }
  }
  const menu = nav.getByRole('button', { name: 'Menu', exact: true });
  if (touch) await menu.tap();
  else await menu.click();
  await expect(page.locator('#menu-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toHaveCount(0);
  await expect(menu).toBeFocused();
  const home = nav.getByRole('link', { name: 'The 100', exact: true });
  if (touch) await home.tap();
  else await home.click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
    throw new Error('Use the owned local navigation preview.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(baseURL).origin
      ? route.continue()
      : route.abort('blockedbyclient'),
  );
});

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 851, height: 393 },
  { width: 1024, height: 768 },
]) {
  test(`compact primary navigation has 44px targets without overlap at ${viewport.width}px`, async ({ page }, info) => {
    test.skip(!onlineAvailable, 'The Friends target requires the configured, signed-out header.');
    await page.setViewportSize(viewport);
    await page.goto('/?catalogs=off');
    const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    await expect(navigation.getByRole('link', { name: 'Friends', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.load('550 13px "Hanken Grotesk Variable"');
      await document.fonts.ready;
    });
    const geometry = await navigation.evaluate((element) => {
      const header = element.closest('header')!;
      return {
        width: innerWidth,
        height: innerHeight,
        fontLoaded: [...document.fonts].some(
          (font) => font.family.includes('Hanken Grotesk Variable') && font.status === 'loaded',
        ),
        overflow: document.documentElement.scrollWidth > innerWidth || header.scrollWidth > header.clientWidth,
        markRight: header.querySelector('.wordmark')!.getBoundingClientRect().right,
        actionsLeft: header.querySelector('.header-actions')!.getBoundingClientRect().left,
        items: [...element.querySelectorAll('a, button')].map((target) => {
          const bounds = target.getBoundingClientRect();
          return {
            name: target.textContent?.trim(),
            width: bounds.width,
            height: bounds.height,
            left: bounds.left,
            right: bounds.right,
            hit: target.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)),
          };
        }),
      };
    });
    await info.attach('compact-navigation-targets', {
      contentType: 'application/json',
      body: JSON.stringify(geometry),
    });
    expect({ width: geometry.width, height: geometry.height }).toEqual(viewport);
    expect(geometry.fontLoaded).toBe(true);
    expect(geometry.overflow).toBe(false);
    expect(geometry.items.map((item) => item.name)).toEqual(['The 100', 'Discover', 'My games', 'Friends']);
    let right = geometry.markRight;
    for (const item of geometry.items) {
      expect(item.width, item.name).toBeGreaterThanOrEqual(44);
      expect(item.height, item.name).toBeGreaterThanOrEqual(44);
      expect(item.left, item.name).toBeGreaterThanOrEqual(right);
      expect(item.right, item.name).toBeLessThanOrEqual(geometry.actionsLeft);
      expect(item.hit, item.name).toBe(true);
      right = item.right;
    }
  });
}

for (const width of [320, 360, 393]) {
  test(`all five mobile navigation labels stay readable and reachable at ${width}px without changing dock clearance`, async ({
    page,
    isMobile,
  }, info) => {
    test.skip(!isMobile, 'The actual coarse-pointer contract is exercised in the mobile project.');
    await page.setViewportSize({ width, height: width === 320 ? 740 : 852 });
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    const card = page.locator('.game-card').first();
    const title = (await card.locator('h3').innerText()).trim();
    const pin = card.getByRole('button', { name: `Pin for comparison: ${title}`, exact: true });
    await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await expect(pin.locator('svg')).toHaveAttribute('fill', 'none');
    await pin.tap();
    const pinned = card.getByRole('button', { name: `Pinned for comparison: ${title}`, exact: true });
    await expect(pinned).toHaveAttribute('aria-pressed', 'true');
    await expect(pinned.locator('svg')).toHaveAttribute('fill', 'currentColor');
    await expect(pinned).toBeEnabled();
    await expect(page.locator('.compare-tray-dock')).toBeVisible();
    await expect(
      page.locator('.compare-tray-dock').getByRole('button', { name: '1 game in Compare tray', exact: true }),
    ).toBeVisible();
    const actual = await readNavigation(page);
    await info.attach('navigation-labels', { contentType: 'application/json', body: JSON.stringify(actual) });
    await assertNavigation(page);
    await activateAll(page, true);
    await assertNavigation(page);
    await adoptTextSpacing(page);
    const spaced = await assertNavigation(page);
    await info.attach('navigation-labels-spaced', { contentType: 'application/json', body: JSON.stringify(spaced) });
  });
}

// G6-QA A11Y-001: under the WCAG 1.4.12 text spacing the labels grow; each stays in its own column, centred.
for (const width of [320, 393]) {
  test(`the five navigation columns stay equal with every label inside and centred at ${width}px, with and without text spacing`, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'The actual coarse-pointer contract is exercised in the mobile project.');
    await page.setViewportSize({ width, height: 851 });
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    await page.evaluate(() => document.fonts.ready);
    expectEqualColumns(await readNavigationColumns(page), `${width}px`);
    await adoptTextSpacing(page);
    const spaced = await readNavigationColumns(page);
    const spacing = new Set(spaced.items.map((item) => item.letterSpacing));
    expect(spacing, 'the WCAG letter spacing applies').toEqual(new Set(['1.44px']));
    expectEqualColumns(spaced, `${width}px with text spacing`);
    if (width === 320) {
      const myGames = spaced.items.find((item) => item.label === 'My games');
      expect(myGames?.lines, 'the longest label wraps within its column').toHaveLength(2);
    }
  });
}

test('desktop stays unchanged and native 200 percent browser zoom keeps the five navigation labels usable', async ({
  baseURL,
  isMobile,
}, info) => {
  test.skip(isMobile, 'One owned desktop Chrome profile checks native200% zoom.');
  // A second, persistent Chrome and its settings page take most of this test's time, and more on a busy host.
  test.setTimeout(120000);
  const context = await chromium.launchPersistentContext('', {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    baseURL,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
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
      const before = await new Promise<number>((resolve) => api.getDefaultZoom(resolve));
      await new Promise<void>((resolve) => api.setDefaultZoom(2, resolve));
      const after = await new Promise<number>((resolve) => api.getDefaultZoom(resolve));
      return { before, after };
    });
    expect(zoom).toEqual({ before: 1, after: 2 });
    const enlarged = await context.newPage();
    await enlarged.route('**/*', (route) =>
      new URL(route.request().url()).origin === new URL(baseURL!).origin
        ? route.continue()
        : route.abort('blockedbyclient'),
    );
    await enlarged.goto('/?catalogs=off');
    const actual = await assertNavigation(enlarged);
    expect(actual.width).toBe(720);
    expect(actual.dpr).toBe(2);
    expect(actual.scale).toBe(1);
    await activateAll(enlarged, false);
    await assertNavigation(enlarged);
    await info.attach('native-browser-zoom', {
      contentType: 'application/json',
      body: JSON.stringify({ zoom, actual }),
    });
    await settings.evaluate(
      () =>
        new Promise<void>((resolve) => Reflect.get(globalThis, 'chrome').settingsPrivate.setDefaultZoom(1, resolve)),
    );
  } finally {
    await context.close();
    if (browserPid !== undefined) {
      expect(() => process.kill(browserPid!, 0)).toThrow();
    }
  }
});

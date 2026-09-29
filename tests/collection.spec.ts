import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { emptyCatalogs } from './catalog-helpers';
import { openBrowsingFilters } from './browsing-helpers';

const firstTitle = 'Red Dead Redemption 2';
const firstSlug = 'red-dead-redemption-2';
const firstCard = `[data-game="${firstSlug}"]`;
const key = 'play100.library.v1';

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
});

test('all 100 games retain real ranks; pagination loads covers progressively', async ({ page }) => {
  const requestedCovers = new Set<string>();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/covers/')) requestedCovers.add(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  expect(requestedCovers.size).toBeLessThan(30);
  while (await page.getByRole('button', { name: /^Show \d+ more/ }).count()) {
    await page.getByRole('button', { name: /^Show \d+ more/ }).click();
  }
  await expect(page.locator('.game-card')).toHaveCount(100);
  expect(await page.locator('.cover-rank').allTextContents()).toEqual(
    Array.from({ length: 100 }, (_, i) => String(i + 1).padStart(2, '0')),
  );
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('mobile search is above the fixed navigation in the first viewport', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.evaluate(() => document.fonts.ready);
  if (isMobile) {
    const layout = await page.evaluate(() => ({
      searchBottom: document.querySelector('#game-search')?.getBoundingClientRect().bottom ?? Infinity,
      navigationTop: document.querySelector('.mobile-nav')?.getBoundingClientRect().top ?? 0,
    }));
    expect(layout.searchBottom).toBeLessThanOrEqual(layout.navigationTop - 12);
  } else {
    await expect(page.getByRole('searchbox')).toBeInViewport();
  }
});

test('all declared fonts and page resources load without console or CSP errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || /Content Security Policy|violates.*directive/i.test(message.text())) {
      errors.push(message.text().slice(0, 240));
    }
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      document.documentElement.dataset.cspViolation = `${event.effectiveDirective}: ${event.blockedURI.slice(0, 80)}`;
    });
  });
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  // The first-paint shell's metric-matched fallbacks are local() fonts, which may be absent (Impact on Linux,
  // Roboto off Android).
  const fonts = await page.evaluate(
    async (localOnly) => {
      const faces = [...document.fonts].filter((face) => !localOnly.includes(face.family.replace(/^["']|["']$/g, '')));
      await Promise.all(faces.map((face) => face.load()));
      await document.fonts.ready;
      return faces.map((face) => ({ family: face.family, status: face.status }));
    },
    ['P100 DF Impact', 'P100 DF Arial', 'P100 DF Roboto', 'P100 Sans Fallback', 'P100 Sans Roboto'],
  );
  expect(fonts.every((font) => font.status === 'loaded')).toBe(true);
  await page.locator(`${firstCard} .game-link`).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: firstTitle, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.cspViolation)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('search and real filters survive reload and browser history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('mass EFFECT 2');
  await expect(page.locator('.game-card')).toHaveCount(1);
  await expect(page.locator('.game-card h3')).toHaveText('Mass Effect 2');
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('mass EFFECT 2');
  await expect(page.locator('.game-card h3')).toHaveText('Mass Effect 2');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await openBrowsingFilters(page);
  await page.getByLabel('Genre', { exact: true }).selectOption('Open-world / Action-Adventure');
  await page.getByLabel('Year', { exact: true }).selectOption('2018');
  await expect(page.locator('.game-card')).toHaveCount(1);
  await expect(page.locator('.game-card h3')).toHaveText(firstTitle);
  await page.goBack();
  await expect(page.getByLabel('Year', { exact: true })).toHaveValue('');
  await page.goForward();
  await expect(page.getByLabel('Year', { exact: true })).toHaveValue('2018');
  await page.getByLabel('Collection', { exact: true }).selectOption('essential');
  await expect(page.getByRole('heading', { name: 'No worlds found. Yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'Browse all 100', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(24);
});

test('sorting changes display order, never collection ranks; list view roundtrips', async ({ page }) => {
  await page.goto('/');
  await openBrowsingFilters(page);
  await page.getByLabel('Sort', { exact: true }).selectOption('newest');
  await expect(page.locator('.game-meta').first()).toContainText('2026');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.locator('.games-list')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'List view', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Sort', { exact: true })).toHaveValue('newest');
  await openBrowsingFilters(page);
  await page.getByLabel('Sort', { exact: true }).selectOption('rank');
  await expect(page.locator('.game-card').first()).toHaveAttribute('data-game', firstSlug);
  await expect(page.locator('.cover-rank').first()).toHaveText('01');
});

test('game detail deep links, native scores, source notes and keyboard focus work', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('The 100 | Play 100');
  await expect(page.locator('.hero-footnote')).toHaveText("Leul's 100: the Core 50 and 50 more essentials.");
  await expect(page.locator('.hero-footnote')).toBeInViewport({ ratio: 1 });
  await expect(page.locator(`${firstCard} .author-rating-card`)).toHaveAttribute(
    'title',
    'Original workbook rating: 10',
  );
  await expect(page.locator(`${firstCard} .list-score`)).toContainText('critic avg.');
  const link = page.locator(`${firstCard} .game-link`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`game=${firstSlug}`));
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveTitle('Red Dead Redemption 2 · #1 | Play 100');
  await expect(page.getByRole('dialog').getByRole('heading', { name: firstTitle, exact: true })).toBeFocused();
  await expect(page.locator('.average')).toContainText('95');
  await expect(page.locator('.critic-scores')).toContainText('Unavailable');
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => Boolean(document.querySelector('dialog[open]')?.contains(document.activeElement))),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveTitle('The 100 | Play 100');
  await expect(link).toBeFocused();
  await page.goto('/?game=the-witcher-3-wild-hunt');
  await expect(page.locator('.source-note')).toContainText('(AI – not played)');
  await expect(page.getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

for (const route of ['/my-library?list=later&catalogs=off', '/my-games?tab=queue&catalogs=off']) {
  test(`Queue title follows direct entry, reload and history from ${route}`, async ({ page }) => {
    await page.goto(route);
    const tabs = page.getByRole('navigation', { name: 'My games views', exact: true });
    const queue = tabs.getByRole('button', { name: /^Play later,/ });
    await expect(queue).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('My games · Play later | Play 100');
    await page.reload();
    await expect(queue).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('My games · Play later | Play 100');
    await tabs.getByRole('button', { name: /^Library,/ }).click();
    await expect(page).toHaveTitle('My games · Library | Play 100');
    await page.goBack();
    await expect(page).toHaveURL(route);
    await expect(queue).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('My games · Play later | Play 100');
    await page.goForward();
    await expect(tabs.getByRole('button', { name: /^Library,/ })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('My games · Library | Play 100');
    await queue.click();
    await expect(page).toHaveTitle('My games · Play later | Play 100');
    await page.goBack();
    await expect(page).toHaveTitle('My games · Library | Play 100');
    await page.goForward();
    await expect(queue).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('My games · Play later | Play 100');
  });
}

test('Library and Ranking routes use specific document titles through history', async ({ page }) => {
  await page.goto('/my-library');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('My games · Library | Play 100');
  await page.goto('/my-rankings');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('My games · Ranking | Play 100');
  await page.goBack();
  await expect(page).toHaveTitle('My games · Library | Play 100');
});

test('play-later and completion are independent and persist on this device', async ({ page }) => {
  await page.goto(`/?game=${firstSlug}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Play later', exact: true }).click();
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play later', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play later', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await openBrowsingFilters(page);
  await page
    .locator('.collection-tabs')
    .getByRole('button', { name: /Play later/ })
    .click();
  await expect(page.locator('.game-card')).toHaveCount(1);
  await expect(page.locator('.list-privacy')).toContainText('including games you added beyond The 100');
  await expect(page.locator('.list-privacy').getByRole('button', { name: 'Open my full library' })).toBeVisible();
  await page
    .locator('.collection-tabs')
    .getByRole('button', { name: /^Completed/ })
    .click();
  await expect(page.locator('.game-card')).toHaveCount(1);
  await page.locator(`${firstCard} .save-game`).click();
  await expect(page.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('.game-card')).toHaveCount(1);
  await openBrowsingFilters(page);
  await page
    .locator('.collection-tabs')
    .getByRole('button', { name: /Play later/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Your next great game goes here.' })).toBeVisible();
});

test('blocked and corrupt storage remain usable, explicit and non-destructive', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    localStorage.setItem(storageKey, '{"this":"is not valid library data"}');
  }, key);
  await page.goto('/');
  await expect(page.locator('.storage-banner')).toHaveCount(1);
  await expect(page.locator('.storage-banner')).toContainText('The original data has not been changed.');
  await page.locator(`${firstCard} .save-game`).click();
  await expect(page.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe(
    '{"this":"is not valid library data"}',
  );
  await page.locator('.storage-banner').getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset device data', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, reset device data', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Your active library, Play later, ranking and preferences have been reset.' }),
  ).toBeVisible();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
});

test('storage denial warns while allowing temporary list changes', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    const read = Storage.prototype.getItem;
    const write = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === storageKey) throw new DOMException('Storage denied', 'SecurityError');
      return read.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === storageKey) throw new DOMException('Storage denied', 'SecurityError');
      return write.call(this, key, value);
    };
  }, key);
  await page.goto('/');
  await expect(page.locator('.storage-banner')).toContainText('Changes now work in this tab only');
  await page.locator(`${firstCard} .save-game`).click();
  await expect(page.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.storage-banner')).toContainText('work in this tab only');
});

test('share fallback exposes a copyable public URL without private list state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException('Clipboard denied', 'NotAllowedError');
        },
      },
    });
  });
  await page.goto('/?list=completed&year=2018');
  const share = page.getByRole('button', { name: 'Share this view', exact: true });
  await share.click();
  const fallback = page.getByRole('dialog', { name: 'Copy this link', exact: true });
  await expect(fallback.locator('#share-title')).toBeFocused();
  await expect(page).toHaveTitle('Copy this link | Play 100');
  // The dialog carries the explanation; no toast repeats it behind the dialog (UX-014).
  await expect(page.locator('.toast')).not.toHaveClass(/toast-visible/);
  await expect(page.locator('.toast')).toHaveText('');
  const link = await page.getByLabel('Shareable link', { exact: true }).inputValue();
  expect(new URL(link).searchParams.get('list')).toBeNull();
  expect(new URL(link).searchParams.get('year')).toBe('2018');
  await page.getByRole('button', { name: 'Select link to copy', exact: true }).click();
  expect(
    await page
      .getByLabel('Shareable link', { exact: true })
      .evaluate((input: HTMLInputElement) => input.selectionEnd === input.value.length && input.selectionStart === 0),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(fallback).toHaveCount(0);
  await expect(share).toBeFocused();
  await expect(page).toHaveTitle('The 100 | Play 100');
});

for (const method of ['clipboard', 'native'] as const) {
  for (const restriction of [
    'progress=not-played',
    'progress=unfinished',
    'progress=completed',
    'progress=any-played',
    'progress=not-completed',
    'list=later',
    'list=completed',
    'list=unplayed',
    'list=later&progress=completed',
    '',
  ]) {
    test(`${method} share reports omitted filters for ${restriction || 'public filters only'}`, async ({
      page,
      isMobile,
    }) => {
      if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const publicQuery = 'q=Mass&year=2010&tier=core&sort=title&direction=desc&view=list&catalogs=off';
      await page.goto(`/?${publicQuery}${restriction ? `&${restriction}` : ''}`);
      const action = page.getByRole('button', { name: 'Share this view', exact: true });
      await expect(action).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate((method) => {
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value:
            method === 'native'
              ? async (data: ShareData) => {
                  document.documentElement.dataset.sharedLink = data.url;
                  document.documentElement.dataset.sharedVia = 'native';
                }
              : undefined,
        });
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (url: string) => {
              document.documentElement.dataset.sharedLink = url;
              document.documentElement.dataset.sharedVia = 'clipboard';
            },
          },
        });
      }, method);
      const original = page.url();
      await action.click();
      const toast = page.locator('.toast-visible');
      const success = method === 'native' ? 'Shared.' : 'Link copied.';
      const suffix = restriction ? " Private progress and list filters aren't included." : '';
      await expect(toast).toHaveText(`${success}${suffix}`);
      await expect(toast).toBeVisible();
      const sent = await page.evaluate(() => ({
        url: document.documentElement.dataset.sharedLink,
        method: document.documentElement.dataset.sharedVia,
      }));
      expect(sent.method).toBe(method);
      if (!sent.url) throw new Error('The successful share must receive a public URL.');
      const shared = new URL(sent.url);
      expect(shared.origin).toBe(new URL(original).origin);
      expect(shared.pathname).toBe('/');
      expect(Object.fromEntries(shared.searchParams)).toEqual(Object.fromEntries(new URLSearchParams(publicQuery)));
      expect(page.url()).toBe(original);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const fit = await toast.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(element.querySelector('span')!);
        const dismiss = element.querySelector('button')!;
        const button = dismiss.getBoundingClientRect();
        const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
        return {
          visible:
            box.left >= 0 &&
            box.right <= innerWidth &&
            box.top >= 0 &&
            box.bottom <= (nav.height ? nav.top : innerHeight),
          textClear: [...text.getClientRects()].every(
            (line) =>
              line.left >= box.left - 1 &&
              line.right <= button.left + 1 &&
              line.top >= box.top - 1 &&
              line.bottom <= box.bottom + 1,
          ),
          dismissible:
            button.width >= 44 &&
            button.height >= 44 &&
            dismiss.contains(document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)),
        };
      });
      expect(fit).toEqual({ visible: true, textClear: true, dismissible: true });
    });
  }
}

test('clipboard sharing reports success and retains a game deep link', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          document.documentElement.dataset.copiedLink = value;
        },
      },
    });
  });
  await page.goto(`/?game=${firstSlug}`);
  await page.getByRole('button', { name: `Share ${firstTitle}`, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Link copied');
  expect(
    await page.evaluate(() => new URL(document.documentElement.dataset.copiedLink ?? '').searchParams.get('game')),
  ).toBe(firstSlug);
});

test('native sharing receives the public deep link and a cancellation is harmless', async ({ page }) => {
  await page.goto(`/?game=${firstSlug}`);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        document.documentElement.dataset.nativeShared = data.url;
      },
    });
  });
  await page.getByRole('button', { name: `Share ${firstTitle}`, exact: true }).click();
  expect(
    await page.evaluate(() => new URL(document.documentElement.dataset.nativeShared ?? '').searchParams.get('game')),
  ).toBe(firstSlug);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new DOMException('Canceled', 'AbortError');
      },
    });
  });
  await page.getByRole('button', { name: `Share ${firstTitle}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog').getByRole('heading', { name: firstTitle, exact: true })).toBeVisible();
});

test('same-browser tabs receive progress changes without cloud sync', async ({ page, context }) => {
  await page.goto('/');
  const second = await context.newPage();
  await second.goto('/');
  await second.locator(`${firstCard} .save-game`).click();
  await expect(page.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'true');
  await page.locator(`${firstCard} .save-game`).click();
  await expect(second.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'false');
  await second.close();
});

test('collection request failure is recoverable, not a success-shaped empty list', async ({ page }) => {
  await page.route('**/data/collection.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "The collection couldn't load." })).toBeVisible();
  await expect(page.locator('.data-error')).toContainText('503');
  await page.unroute('**/data/collection.json');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(24);
});

test('Lite and live system reduced-motion settings always retain functional browsing', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, motion: 'lite', progress: {} }));
  }, key);
  await page.goto('/');
  await expect(page.locator('.collection-artifact')).toHaveAttribute('data-render-mode', 'static');
  await page.getByRole('searchbox').fill('mass effect 2');
  await expect(page.locator('.game-card')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .locator('.footer-tools')
    .getByRole('button', { name: /Effects:/ })
    .click();
  await page.getByRole('radio', { name: /Full/ }).click();
  await expect(page.getByRole('radio', { name: /Full/ })).toBeChecked();
  await expect(page.locator('.preference-note')).toContainText('Your system requests reduced motion');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.collection-artifact')).toHaveAttribute('data-render-mode', 'static');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
});

test('no-WebGL fallback never blocks game actions', async ({ page }) => {
  await page.addInitScript(`
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
    localStorage.setItem('${key}', JSON.stringify({version:1,motion:'full',progress:{}}));
  `);
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expect(page.locator('.collection-artifact')).toHaveAttribute('data-render-mode', 'static');
  await page.locator(`${firstCard} .save-game`).click();
  await expect(page.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'true');
});

test('unknown game links recover; workbook download is the exact enhanced XLSX', async ({ page }) => {
  await page.goto('/?game=not-a-real-game');
  await expect(page.getByRole('heading', { name: "That game isn't in this collection." })).toBeVisible();
  await page.getByRole('button', { name: 'Back to the collection', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.workbook-copy').getByRole('link', { name: 'Download the workbook, XLSX', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Play-100-Collection.xlsx');
  const file = await download.path();
  expect(file).not.toBeNull();
  if (!file) throw new Error('Workbook download did not produce a file.');
  expect(
    (await readFile(file)).equals(
      await readFile(new URL('../public/downloads/Play-100-Collection.xlsx', import.meta.url)),
    ),
  ).toBe(true);
});

test('browse and game detail meet automated accessibility checks without horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  const browse = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(browse.violations).toEqual([]);
  await page.locator(`${firstCard} .game-link`).click();
  const details = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(details.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

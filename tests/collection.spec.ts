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
  page.on('request', (request) => { if (request.url().includes('/covers/')) requestedCovers.add(request.url()); });
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  expect(requestedCovers.size).toBeLessThan(30);
  while (await page.getByRole('button', { name: /^Show \d+ more/ }).count()) {
    await page.getByRole('button', { name: /^Show \d+ more/ }).click();
  }
  await expect(page.locator('.game-card')).toHaveCount(100);
  expect(await page.locator('.cover-rank').allTextContents()).toEqual(Array.from({ length: 100 }, (_, i) => String(i + 1).padStart(2, '0')));
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
  const fonts = await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((face) => face.load()));
    await document.fonts.ready;
    return [...document.fonts].map((face) => ({ family: face.family, status: face.status }));
  });
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
  const link = page.locator(`${firstCard} .game-link`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`game=${firstSlug}`));
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading', { name: firstTitle, exact: true })).toBeFocused();
  await expect(page.locator('.average')).toContainText('95');
  await expect(page.locator('.critic-scores')).toContainText('Unavailable');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.querySelector('dialog[open]')?.contains(document.activeElement)))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(link).toBeFocused();
  await page.goto('/?game=the-witcher-3-wild-hunt');
  await expect(page.locator('.source-note')).toContainText('(AI – not played)');
  await expect(page.getByRole('button', { name: 'Mark completed', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('play-later and completion are independent and persist on this device', async ({ page }) => {
  await page.goto(`/?game=${firstSlug}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Play later', exact: true }).click();
  await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play later', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play later', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.collection-tabs').getByRole('button', { name: /Play later/ }).click();
  await expect(page.locator('.game-card')).toHaveCount(1);
  await expect(page.locator('.list-privacy')).toContainText('including games you added beyond the 100');
  await expect(page.locator('.list-privacy').getByRole('button', { name: 'Open my full library' })).toBeVisible();
  await page.locator('.collection-tabs').getByRole('button', { name: /^Completed/ }).click();
  await expect(page.locator('.game-card')).toHaveCount(1);
  await page.locator(`${firstCard} .save-game`).click();
  await expect(page.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('.game-card')).toHaveCount(1);
  await page.locator('.collection-tabs').getByRole('button', { name: /Play later/ }).click();
  await expect(page.getByRole('heading', { name: 'Your next great game goes here.' })).toBeVisible();
});

test('blocked and corrupt storage remain usable, explicit and non-destructive', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    localStorage.setItem(storageKey, '{"this":"is not valid library data"}');
  }, key);
  await page.goto('/');
  await expect(page.locator('.storage-banner')).toContainText('has not been overwritten');
  await page.locator(`${firstCard} .save-game`).click();
  await expect(page.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe('{"this":"is not valid library data"}');
  await page.locator('.storage-banner').getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset device data', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, reset device data', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your device list and preferences have been reset.' })).toBeVisible();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
});

test('storage denial warns while allowing temporary list changes', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    const read = Storage.prototype.getItem;
    const write = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) { if (key === storageKey) throw new DOMException('Storage denied', 'SecurityError'); return read.call(this, key); };
    Storage.prototype.setItem = function (key, value) { if (key === storageKey) throw new DOMException('Storage denied', 'SecurityError'); return write.call(this, key, value); };
  }, key);
  await page.goto('/');
  await expect(page.locator('.storage-banner')).toContainText('Changes now work in this tab only');
  await page.locator(`${firstCard} .save-game`).click();
  await expect(page.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.storage-banner')).toContainText('work in this tab only');
});

test('share fallback exposes a copyable public URL without private list state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Clipboard denied', 'NotAllowedError'); } } });
  });
  await page.goto('/?list=completed&year=2018');
  await page.getByRole('button', { name: 'Share this view', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const link = await page.getByLabel('Shareable link', { exact: true }).inputValue();
  expect(new URL(link).searchParams.get('list')).toBeNull();
  expect(new URL(link).searchParams.get('year')).toBe('2018');
  await page.getByRole('button', { name: 'Select link to copy', exact: true }).click();
  expect(await page.getByLabel('Shareable link', { exact: true }).evaluate((input: HTMLInputElement) => input.selectionEnd === input.value.length && input.selectionStart === 0)).toBe(true);
});

test('clipboard sharing reports success and retains a game deep link', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { document.documentElement.dataset.copiedLink = value; } } });
  });
  await page.goto(`/?game=${firstSlug}`);
  await page.getByRole('button', { name: `Share ${firstTitle}`, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Link copied');
  expect(await page.evaluate(() => new URL(document.documentElement.dataset.copiedLink ?? '').searchParams.get('game'))).toBe(firstSlug);
});

test('native sharing receives the public deep link and a cancellation is harmless', async ({ page }) => {
  await page.goto(`/?game=${firstSlug}`);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { document.documentElement.dataset.nativeShared = data.url; } });
  });
  await page.getByRole('button', { name: `Share ${firstTitle}`, exact: true }).click();
  expect(await page.evaluate(() => new URL(document.documentElement.dataset.nativeShared ?? '').searchParams.get('game'))).toBe(firstSlug);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Canceled', 'AbortError'); } });
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
  await page.locator('.footer-tools').getByRole('button', { name: /Effects:/ }).click();
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
  expect((await readFile(file)).equals(await readFile('public\\downloads\\Play-100-Collection.xlsx'))).toBe(true);
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

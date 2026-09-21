import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { parseCollection } from '../src/lib/collection';
import { applyPersonalAction, emptyPersonalLibrary } from '../src/lib/personal-library';
import { recordFromGame } from '../src/lib/personal-types';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../src/lib/personal-db';
import type { MotionPreference } from '../src/lib/types';
import { readLibrary } from './library-helpers';

interface ShellAnimation {
  titleId: string | null;
  duration: number;
  animation: Animation;
}

declare global {
  interface Window {
    play100ShellMotion: { hold: boolean; calls: ShellAnimation[] };
  }
}

const collection = parseCollection(JSON.parse(readFileSync(new URL('../public/data/collection.json', import.meta.url), 'utf8')));
const firstGame = collection.games.find(game => game.rank === 1);
if (!firstGame) throw new Error('The shell fixture requires the first original game.');
const first = recordFromGame(firstGame);
const menu = (page: Page) => page.getByRole('dialog', { name: 'Menu', exact: true });
const menuTrigger = (page: Page) => page.getByRole('button', { name: 'Menu', exact: true });
const rating = (page: Page) => page.getByRole('spinbutton', { name: `Your rating for ${first.title}`, exact: true });
const errors = new WeakMap<Page, string[]>();

async function seedGuest(page: Page, motion: MotionPreference = 'full') {
  let state = applyPersonalAction(emptyPersonalLibrary(), { type: 'add-ranking', records: [first] });
  state = applyPersonalAction(state, { type: 'edit-ranking', id: first.id, score: 5 });
  state = applyPersonalAction(state, { type: 'set-motion', motion });
  await page.goto('/favicon.svg');
  await page.evaluate(({ name, version, store, key, state }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(name, version);
    open.onupgradeneeded = () => open.result.createObjectStore(store);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction(store, 'readwrite');
      transaction.objectStore(store).put(state, key);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }), { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, key: STATE_KEY, state });
}

async function openWorkspace(page: Page) {
  await page.goto('/my-games?tab=ranking&catalogs=off');
  await expect(rating(page)).toHaveValue('5');
}

async function entries(page: Page, titleId: string) {
  return page.evaluate(id => window.play100ShellMotion.calls.filter(call => call.titleId === id).map(call => ({
    duration: call.duration,
    active: call.animation.playState !== 'idle' && call.animation.playState !== 'finished',
  })), titleId);
}

async function expectEntry(page: Page, titleId: string, duration: 160 | 180) {
  await expect.poll(async () => (await entries(page, titleId)).length).toBeGreaterThan(0);
  expect((await entries(page, titleId)).every(call => call.duration === duration)).toBe(true);
  const dialog = page.locator(`dialog[aria-labelledby="${titleId}"]`);
  await expect(dialog.locator('[data-autofocus]')).toBeFocused();
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true);
  expect(await dialog.evaluate(element => element.getAnimations({ subtree: true })
    .filter(animation => animation instanceof CSSAnimation && animation.animationName === 'dialog-reveal').length)).toBe(0);
}

async function expectNoActiveEntry(page: Page, titleId: string) {
  await expect.poll(async () => (await entries(page, titleId)).filter(call => call.active).length).toBe(0);
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!);
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || ![origin.port, '9199', '8188'].includes(url.port)) return route.abort('blockedbyclient');
    if (url.pathname === '/api/catalog') return route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } });
    return route.continue();
  });
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    window.play100ShellMotion = { hold: true, calls: [] };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      const dialog = this.closest('dialog');
      if (dialog) {
        window.play100ShellMotion.calls.push({
          titleId: dialog.getAttribute('aria-labelledby'),
          duration: Number(animation.effect?.getTiming().duration),
          animation,
        });
        // Hold real visual completion to prove that native actions do not wait for it.
        if (window.play100ShellMotion.hold) animation.pause();
      }
      return animation;
    };
  });
  await seedGuest(page);
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
  errors.delete(page);
});

test('Menu is usable during its 180ms entry and rapid Escape/reopen leaves no lock or delayed navigation', async ({ page }) => {
  await openWorkspace(page);
  const before = await readLibrary(page);
  const overflow = await page.evaluate(() => document.body.style.overflow);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await menuTrigger(page).click();
    await expectEntry(page, 'menu-title', 180);
    await expect(menu(page).getByRole('link', { name: 'Queue', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(menuTrigger(page)).toBeFocused();
    await expectNoActiveEntry(page, 'menu-title');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(overflow);
  }
  expect(await readLibrary(page)).toEqual(before);
  await menuTrigger(page).click();
  await expectEntry(page, 'menu-title', 180);
  await menu(page).getByRole('link', { name: 'Queue', exact: true }).click();
  await expect(page).toHaveURL(/\/my-games\?catalogs=off&tab=queue$/);
  await expect(menu(page)).toHaveCount(0);
  await expectNoActiveEntry(page, 'menu-title');
  expect(await readLibrary(page)).toEqual(before);
});

test('Menu replacements open Settings and About at 160ms without retaining their predecessor', async ({ page }) => {
  await openWorkspace(page);
  const before = await readLibrary(page);
  for (const [action, titleId] of [
    ['Settings & backups', 'settings-title'],
    ['About & credits', 'about-title'],
  ] as const) {
    await menuTrigger(page).click();
    await expectEntry(page, 'menu-title', 180);
    await menu(page).getByRole('button', { name: action, exact: true }).click();
    await expect(menu(page)).toHaveCount(0);
    await expectNoActiveEntry(page, 'menu-title');
    await expectEntry(page, titleId, 160);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expectNoActiveEntry(page, titleId);
    await expect(menuTrigger(page)).toBeFocused();
  }
  expect(await readLibrary(page)).toEqual(before);
});

test('Return to edit restores the exact failed field while the Menu entry is still held', async ({ page }) => {
  await openWorkspace(page);
  const before = await readLibrary(page);
  await rating(page).fill('11');
  await menuTrigger(page).click();
  await expectEntry(page, 'menu-title', 180);
  const initialEntries = (await entries(page, 'menu-title')).length;
  await menu(page).getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(menu(page).getByRole('alert')).toContainText('Your edit has not saved');
  expect((await entries(page, 'menu-title')).length).toBe(initialEntries);
  await menu(page).getByRole('button', { name: 'Return to edit', exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(rating(page)).toBeFocused();
  await expect(rating(page)).toHaveValue('11');
  await expectNoActiveEntry(page, 'menu-title');
  expect(await readLibrary(page)).toEqual(before);
  await expect(page).toHaveURL(/\/my-games\?tab=ranking&catalogs=off$/);
});

test('choosing Lite cancels the actual Settings entry and the next Menu creates no optional animation', async ({ page }) => {
  await openWorkspace(page);
  await menuTrigger(page).click();
  await menu(page).getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expectEntry(page, 'settings-title', 160);
  await page.locator('input[name="visual-experience"][value="lite"]').check();
  await expect.poll(async () => (await readLibrary(page)).motion).toBe('lite');
  await expectNoActiveEntry(page, 'settings-title');
  await page.keyboard.press('Escape');
  const before = (await entries(page, 'menu-title')).length;
  await menuTrigger(page).click();
  await expect(menu(page).locator('#menu-title')).toBeFocused();
  expect((await entries(page, 'menu-title')).length).toBe(before);
  await page.keyboard.press('Escape');
  await expect(menuTrigger(page)).toBeFocused();
});

for (const change of ['reduced-motion', 'resize'] as const) {
  test(`${change} cancels an active Menu entry without closing it or replaying an old timeline`, async ({ page }) => {
    await openWorkspace(page);
    await menuTrigger(page).click();
    await expectEntry(page, 'menu-title', 180);
    const before = (await entries(page, 'menu-title')).length;
    if (change === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    else {
      const size = page.viewportSize();
      if (!size) throw new Error('The shell test requires a declared viewport.');
      await page.setViewportSize({ width: size.width, height: size.height - 80 });
    }
    await expectNoActiveEntry(page, 'menu-title');
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).locator('#menu-title')).toBeFocused();
    if (change === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect((await entries(page, 'menu-title')).length).toBe(before);
    await page.keyboard.press('Escape');
    await expect(menuTrigger(page)).toBeFocused();
  });
}

for (const mode of ['lite', 'reduced-motion', 'auto-constrained'] as const) {
  test(`${mode} opens Menu natively without creating a duration-zero animation`, async ({ page }) => {
    if (mode === 'lite') await seedGuest(page, 'lite');
    else if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    else {
      await seedGuest(page, 'auto');
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 2 });
      });
    }
    await openWorkspace(page);
    await menuTrigger(page).click();
    await expect(menu(page).locator('#menu-title')).toBeFocused();
    expect(await entries(page, 'menu-title')).toEqual([]);
    expect(await menu(page).evaluate(element => element.matches(':modal'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menuTrigger(page)).toBeFocused();
  });
}

test('closing the static cold Account placeholder prevents late module readiness from reopening it', async ({ page }) => {
  test.skip(process.env.PLAY100_SHELL_EMULATOR !== 'true', 'Requires an explicitly assigned emulator-bound local server.');
  const modulePath = /\/(?:src\/cloud\/OnlineController\.tsx|assets\/OnlineController-[^/]+\.js)(?:\?.*)?$/;
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(modulePath, async route => {
    await held;
    await route.continue();
  });
  await openWorkspace(page);
  const loaded = page.waitForResponse(response => modulePath.test(response.url()));
  try {
    await page.locator('.account-nav').click();
    const placeholder = page.locator('dialog[aria-labelledby="loading-account-title"]');
    await expect(placeholder).toBeVisible();
    await expect(placeholder.locator('[data-autofocus]')).toBeFocused();
    expect(await entries(page, 'loading-account-title')).toEqual([]);
    expect(await placeholder.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(placeholder).toHaveCount(0);
    await expect(page.locator('.account-nav')).toBeFocused();
  } finally {
    release();
  }
  const response = await loaded;
  await page.evaluate(async url => { await import(url); }, response.url());
  await expect(page.locator('.signin-dialog')).toHaveCount(0);
  expect(await entries(page, 'account-signin-title')).toEqual([]);
  await page.locator('.account-nav').click();
  await expectEntry(page, 'account-signin-title', 160);
});

test('the actual local sign-in sheet uses 160ms and removes typed credentials immediately on close', async ({ page }) => {
  test.skip(process.env.PLAY100_SHELL_EMULATOR !== 'true', 'Requires an explicitly assigned emulator-bound local server; no sign-in or account mutation is performed.');
  await openWorkspace(page);
  await page.locator('.account-nav').click();
  const sheet = page.locator('.signin-dialog');
  await expect(sheet.locator('.emulator-note')).toContainText('synthetic accounts only');
  await expectEntry(page, 'account-signin-title', 160);
  await sheet.getByRole('button', { name: 'Use email', exact: true }).click();
  await sheet.getByLabel('Email', { exact: true }).fill('motion-shell-draft@play100.test');
  await sheet.locator('input[name="password"]').fill('Unsubmitted-local-test-draft');
  const before = (await entries(page, 'account-signin-title')).length;
  await sheet.locator('input[name="password"]').press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  await expectNoActiveEntry(page, 'account-signin-title');
  await expect(page.locator('.account-nav')).toBeFocused();
  await page.locator('.account-nav').click();
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await entries(page, 'account-signin-title')).length).toBeGreaterThan(before);
  await sheet.getByRole('button', { name: 'Use email', exact: true }).click();
  await expect(sheet.getByLabel('Email', { exact: true })).toHaveValue('');
  await expect(sheet.locator('input[name="password"]')).toHaveValue('');
});

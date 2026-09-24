import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { readLibrary } from './library-helpers';
import { openBrowsingFilters } from './browsing-helpers';

const first = { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2' };
const second = { id: 'mass-effect-2', title: 'Mass Effect 2' };
const firstCard = `.game-card[data-game="${first.id}"]`;

interface CollectionMotionProbe {
  hold: boolean;
  holdReturn: boolean;
  calls: { duration: number | null; containsEditor: boolean; phase: string | null }[];
  errors: string[];
  modifiedClick?: { reachedAnchor: boolean; defaultPrevented: boolean; isTrusted: boolean; button: number; ctrlKey: boolean; metaKey: boolean };
}

declare global {
  interface Window {
    __collectionMotionProbe: CollectionMotionProbe;
  }
}

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    localStorage.setItem('play100.library.v1', JSON.stringify({ version: 1, motion: 'full', progress: {} }));
    window.__collectionMotionProbe = { hold: false, holdReturn: false, calls: [], errors: [] };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = animate.apply(this, args);
      const inDetail = Boolean(this.closest('.game-dialog'));
      const phase = this.getAttribute('data-motion-phase');
      if (inDetail || this.hasAttribute('data-motion-visual')) {
        const duration = animation.effect?.getTiming().duration;
        const containsEditor = this.matches('input, textarea, select') || Boolean(this.querySelector('input, textarea, select'));
        window.__collectionMotionProbe.calls.push({ duration: typeof duration === 'number' ? duration : null, containsEditor, phase });
        if (inDetail && window.__collectionMotionProbe.hold || phase === 'return' && window.__collectionMotionProbe.holdReturn) {
          animation.pause();
          animation.currentTime = 0;
        }
      }
      return animation;
    };
    window.addEventListener('error', event => window.__collectionMotionProbe.errors.push(event.message));
    window.addEventListener('unhandledrejection', event => {
      window.__collectionMotionProbe.errors.push(event.reason instanceof Error ? event.reason.message : String(event.reason));
    });
  });
});

test.afterEach(async ({ page }, info) => {
  if (info.status === 'skipped') return;
  await expect(page.locator('[data-motion-visual]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__collectionMotionProbe.errors)).toEqual([]);
});

async function prepareSource(page: Page) {
  const link = page.locator(`${firstCard} .game-link`);
  await expect(link).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await page.evaluate(() => document.fonts.ready);
  await link.locator('.game-cover').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return link;
}

async function expectStationaryEditor(input: Locator) {
  expect(await input.evaluate(element => {
    const dialog = element.closest('dialog');
    const animated: string[] = [];
    for (let current: Element | null = element; current && dialog?.contains(current); current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.transform !== 'none' || style.animationName !== 'none' || Number(style.opacity) !== 1) {
        animated.push(current.tagName);
      }
    }
    return animated;
  })).toEqual([]);
}

async function expectBounds(element: Locator, expected: { x: number; y: number; width: number; height: number }) {
  const actual = await element.boundingBox();
  if (!actual) throw new Error('The public sleeve has no measurable bounds');
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual[key] - expected[key]), `Public sleeve ${key}`).toBeLessThanOrEqual(2);
  }
}

async function seekPublicEnd(element: Locator) {
  return element.evaluate(node => {
    const animation = node.getAnimations()[0];
    const duration = animation?.effect?.getTiming().duration;
    if (!animation || typeof duration !== 'number') throw new Error('The public sleeve has no timed animation');
    animation.currentTime = Math.max(0, duration - 1);
    return duration;
  });
}

test('one public sleeve connects measured endpoints and returns only after native close', async ({ page, isMobile }) => {
  await page.goto('/?catalogs=off');
  const link = await prepareSource(page);
  const source = link.locator('.game-cover');
  const sourceBounds = await source.boundingBox();
  if (!sourceBounds) throw new Error('The collection source has no visible bounds');
  await page.evaluate(() => {
    window.__collectionMotionProbe.hold = true;
    window.__collectionMotionProbe.holdReturn = true;
  });
  await link.click();
  const dialog = page.locator('.game-dialog');
  const entering = page.locator('[data-motion-visual="jacket"][data-motion-phase="enter"]');
  await expect(entering).toHaveCount(1);
  await expect(page.locator('[data-motion-visual]')).toHaveCount(1);
  expect(await entering.evaluate(node => Boolean(node.closest('dialog[open] [data-motion-host="dialog"]')))).toBe(true);
  expect(await entering.evaluate(node => Boolean(node.closest('[aria-hidden="true"]')) && Boolean(node.closest('[inert]')))).toBe(true);
  await expect(entering.locator('img, input, textarea, select, button, a, [id], [tabindex]')).toHaveCount(0);
  await expect(entering).not.toContainText(first.title);
  await expectBounds(entering, sourceBounds);
  const destinationBounds = await dialog.locator('.detail-cover').boundingBox();
  if (!destinationBounds) throw new Error('The detail artwork target has no visible bounds');
  expect(await seekPublicEnd(entering)).toBe(isMobile ? 220 : 240);
  await expectBounds(entering, destinationBounds);
  await entering.evaluate(node => { for (const animation of node.getAnimations()) animation.finish(); });
  await expect(page.locator('[data-motion-visual]')).toHaveCount(0);
  await expectStationaryEditor(dialog.getByRole('spinbutton'));
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const returning = page.locator('[data-motion-visual="jacket"][data-motion-phase="return"]');
  await expect(returning).toHaveCount(1);
  expect(await returning.evaluate(node => Boolean(node.closest('[data-motion-host="root"]')) && !node.closest('dialog'))).toBe(true);
  await expectBounds(returning, destinationBounds);
  const returnBounds = await source.boundingBox();
  if (!returnBounds) throw new Error('The original sleeve is no longer visible');
  expect(await seekPublicEnd(returning)).toBe(160);
  await expectBounds(returning, returnBounds);
  await returning.evaluate(node => { for (const animation of node.getAnimations()) animation.finish(); });
  await expect(page.locator('[data-motion-visual]')).toHaveCount(0);
  await expect(link).toBeFocused();
});

for (const view of ['grid', 'list'] as const) {
  test(`${view} public continuity never makes the live editor wait for animation`, async ({ page }) => {
    await page.goto(`/?view=${view}&catalogs=off`);
    const link = await prepareSource(page);
    await page.evaluate(() => { window.__collectionMotionProbe.hold = true; });
    await link.click();
    const dialog = page.locator('.game-dialog');
    await expect(dialog.getByRole('heading', { name: first.title, exact: true })).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.__collectionMotionProbe.calls.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__collectionMotionProbe.calls.some(call => call.containsEditor))).toBe(false);
    const input = dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${first.title}`, exact: true });
    await expectStationaryEditor(input);
    await input.fill('8.75');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('8.75');
    await expect(dialog.locator(`img[src="/covers/${first.id}.webp"]`)).toHaveCount(1);
    await expect(dialog.locator('.detail-cover img')).toHaveJSProperty('complete', true);
    expect(await dialog.locator('.detail-cover img').evaluate(image => {
      if (!(image instanceof HTMLImageElement)) throw new Error('The detail artwork is not an image');
      const style = getComputedStyle(image);
      return image.naturalWidth > 0 && image.naturalHeight > 0 &&
        parseFloat(style.width) <= Math.min(Number(image.getAttribute('width')), image.naturalWidth) &&
        parseFloat(style.height) <= Math.min(Number(image.getAttribute('height')), image.naturalHeight);
    })).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(link).toBeFocused();
    expect(new URL(page.url()).searchParams.has('game')).toBe(false);
    await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(8.75);
  });
}

test('table titles keep native links and use a no-origin detail without moving the form', async ({ page, isMobile }) => {
  await page.goto('/?view=table&q=mass+effect+2&catalogs=off');
  const link = page.locator(`tr[data-game="${second.id}"] .table-game > a`);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `/?q=mass+effect+2&view=table&catalogs=off&game=${second.id}`);
  if (!isMobile) {
    const before = page.url();
    await link.evaluate(anchor => {
      window.addEventListener('click', event => {
        window.__collectionMotionProbe.modifiedClick = {
          reachedAnchor: event.target instanceof Node && anchor.contains(event.target),
          defaultPrevented: event.defaultPrevented, isTrusted: event.isTrusted,
          button: event.button, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
        };
      }, { once: true });
    });
    await link.click({ modifiers: ['ControlOrMeta'] });
    const click = await page.evaluate(() => window.__collectionMotionProbe.modifiedClick);
    expect(click).toMatchObject({ reachedAnchor: true, defaultPrevented: false, isTrusted: true, button: 0 });
    expect(click?.ctrlKey || click?.metaKey).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(before);
  }
  await link.focus();
  await link.press('Enter');
  const dialog = page.locator('.game-dialog');
  await expect(dialog.getByRole('heading', { name: second.title, exact: true })).toBeFocused();
  await expectStationaryEditor(dialog.getByRole('spinbutton'));
  expect(await page.evaluate(() => window.__collectionMotionProbe.calls)).toEqual([]);
  expect(new URL(page.url()).searchParams.get('view')).toBe('table');
  expect(new URL(page.url()).searchParams.get('q')).toBe('mass effect 2');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(link).toBeFocused();
});

test('nested save, selection and Pin controls never enroll a detail origin', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await prepareSource(page);
  const card = page.locator(firstCard);
  const save = card.locator('.save-game');
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Select multiple games', exact: true }).click();
  const select = card.getByRole('checkbox', { name: `Select ${first.title}`, exact: true });
  await select.check();
  await expect(select).toBeChecked();
  const pin = card.getByRole('button', { name: `Pin for comparison: ${first.title}`, exact: true });
  await pin.click();
  await expect(card.getByRole('button', { name: `Pinned for comparison: ${first.title}`, exact: true })).toBeDisabled();
  await expect(page.locator('.game-dialog')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('game')).toBe(false);
  expect(await page.evaluate(() => window.__collectionMotionProbe.calls)).toEqual([]);
});

test('direct links and next/previous preserve current-record drafts without a new motion key', async ({ page }) => {
  await page.goto(`/?game=${first.id}&catalogs=off`);
  const dialog = page.locator('.game-dialog');
  const input = dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${first.title}`, exact: true });
  await expect(input).toBeVisible();
  await page.clock.install({ time: new Date('2026-09-21T08:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-21T08:00:10Z'));
  await input.fill('8.25');
  const editor = await input.elementHandle();
  if (!editor) throw new Error('The first detail rating editor did not mount');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await editor.evaluate(element => element.isConnected)).toBe(true);
  await expect(input).toHaveValue('8.25');
  await dialog.getByRole('button', { name: 'Next game', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: second.title, exact: true })).toBeFocused();
  await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(8.25);
  const nextInput = dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${second.title}`, exact: true });
  await expect(nextInput).toHaveValue('');
  await nextInput.fill('4.5');
  await dialog.getByRole('button', { name: 'Previous game', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${first.title}`, exact: true })).toHaveValue('8.25');
  await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === second.id)?.score).toBe(4.5);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('game')).toBe(false);
  expect((await readLibrary(page)).progress).toEqual({});
  expect(await page.evaluate(() => window.__collectionMotionProbe.calls)).toEqual([]);
  await editor.dispose();
});

test('Escape, reopen and live reduced motion cancel a held public flight safely', async ({ page }) => {
  await page.goto('/?catalogs=off');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const link = await prepareSource(page);
    await page.evaluate(() => { window.__collectionMotionProbe.hold = true; });
    await link.click();
    const dialog = page.locator('.game-dialog');
    await expect(dialog.getByRole('heading', { name: first.title, exact: true })).toBeFocused();
    if (attempt === 2) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
      await expectStationaryEditor(dialog.getByRole('spinbutton'));
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(link).toBeFocused();
  }
  const calls = await page.evaluate(() => window.__collectionMotionProbe.calls.length);
  await page.locator(`${firstCard} .game-link`).click();
  await expect(page.locator('.game-dialog')).toBeVisible();
  expect(await page.evaluate(() => window.__collectionMotionProbe.calls.length)).toBe(calls);
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-dialog')).toHaveCount(0);
});

test('removing a filtered origin closes coherently instead of returning to stale geometry', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await prepareSource(page);
  await page.locator(`${firstCard} .save-game`).click();
  await expect(page.locator(`${firstCard} .save-game`)).toHaveAttribute('aria-pressed', 'true');
  await openBrowsingFilters(page);
  await page.locator('.collection-tabs').getByRole('button', { name: /Play later/ }).click();
  await expect(page.locator('.game-card')).toHaveCount(1);
  const link = await prepareSource(page);
  await link.click();
  const dialog = page.locator('.game-dialog');
  await dialog.getByRole('button', { name: 'Play later', exact: true }).click();
  await expect(page.locator(firstCard)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your next great game goes here.', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('list')).toBe('later');
});

test('a real desktop title drag pins without opening, then keyboard and a fresh click still open', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Native fine-pointer drag; the separate coarse test exercises visible Pin.');
  await page.goto('/?view=list&catalogs=off');
  await page.locator(`.game-card[data-game="${second.id}"]`).getByRole('button', {
    name: `Pin for comparison: ${second.title}`, exact: true,
  }).click();
  const dock = page.locator('.compare-tray-dock');
  await expect(dock).toBeVisible();
  const link = await prepareSource(page);
  await link.dragTo(dock, { targetPosition: { x: 20, y: 20 } });
  await expect(page.locator(firstCard).getByRole('button', {
    name: `Pinned for comparison: ${first.title}`, exact: true,
  })).toBeDisabled();
  expect(new URL(page.url()).searchParams.has('game')).toBe(false);
  await expect(page.locator('.game-dialog')).toHaveCount(0);
  await link.focus();
  await link.press('Enter');
  await expect(page.locator('.game-dialog').getByRole('heading', { name: first.title, exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-dialog')).toHaveCount(0);
  await link.click();
  await expect(page.locator('.game-dialog').getByRole('heading', { name: first.title, exact: true })).toBeFocused();
});

test('320px coarse detail keeps visible Pin, native artwork and reachable 44px close controls', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Runs with the existing coarse-pointer project, not viewport-only touch claims.');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/?view=list&catalogs=off');
  const link = await prepareSource(page);
  await page.locator(firstCard).getByRole('button', {
    name: `Pin for comparison: ${first.title}`, exact: true,
  }).tap();
  await expect(page.locator(firstCard).getByRole('button', {
    name: `Pinned for comparison: ${first.title}`, exact: true,
  })).toBeDisabled();
  await link.tap();
  const dialog = page.locator('.game-dialog');
  await expect(dialog.getByRole('heading', { name: first.title, exact: true })).toBeVisible();
  const close = dialog.getByRole('button', { name: 'Close dialog', exact: true });
  const bounds = await close.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('The mobile detail close control has no visible bounds');
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const input = dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${first.title}`, exact: true });
  await expectStationaryEditor(input);
  await input.fill('6.25');
  await close.tap();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(6.25);
});

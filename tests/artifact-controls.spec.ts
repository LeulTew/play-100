import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { expectReadableSurface } from './readability-helpers';

async function selectQuality(page: Page, name: 'Auto' | 'Full' | 'Lite') {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const radio = page.getByRole('radio', { name: new RegExp(`^${name}`) });
  await radio.click();
  await expect(radio).toBeChecked();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.collection-artifact').scrollIntoViewIfNeeded();
}

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: Object.assign(new EventTarget(), { saveData: false, effectiveType: '4g' }),
    });
  });
});

test('Auto offers a real on-demand fan on touch and a working loaded fan on desktop', async ({ page, isMobile }) => {
  await page.goto('/?catalogs=off');
  await expect(page.locator('.save-game').first()).toBeEnabled();
  const artifact = page.locator('.collection-artifact');
  const fan = page.getByRole('button', { name: 'Fan out the collection sleeves', exact: true });
  if (isMobile) {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0)).toBe(
      true,
    );
    await expect(artifact).toHaveAttribute('data-activation', 'on-demand');
    await expect(artifact.locator('canvas')).toHaveCount(0);
    await expect(artifact).toContainText('tap Fan out to start 3D');
  } else {
    // Idle-scheduled scene startup uses the test budget, not a 10s performance threshold.
    await expect(artifact).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
    await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
  }
  await fan.click();
  await expect(artifact).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
  await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
  await expect(artifact).toHaveAttribute('data-fanned', 'true');
  await page.getByRole('button', { name: 'Stack up the collection sleeves', exact: true }).click();
  await expect(artifact).toHaveAttribute('data-fanned', 'false');
});

test('Full is automatic and its Fan out control changes the active scene', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await selectQuality(page, 'Full');
  const artifact = page.locator('.collection-artifact');
  await expect(artifact).toHaveAttribute('data-activation', 'automatic');
  await expect(artifact).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
  await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
  await page.getByRole('button', { name: 'Fan out the collection sleeves', exact: true }).click();
  await expect(artifact).toHaveAttribute('data-fanned', 'true');
  await expect(page.getByRole('button', { name: 'Stack up the collection sleeves', exact: true })).toBeVisible();
});

test('Lite removes fan controls and retains the settled illustration and browsing', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await selectQuality(page, 'Full');
  await page.getByRole('button', { name: 'Fan out the collection sleeves', exact: true }).click();
  await selectQuality(page, 'Lite');
  const artifact = page.locator('.collection-artifact');
  await expect(artifact).toHaveAttribute('data-render-mode', 'static');
  await expect(artifact).toHaveAttribute('data-activation', 'static');
  await expect(artifact).toHaveAttribute('data-fanned', 'false');
  await expect(artifact).toContainText('Illustrated view · Lite mode');
  await expect(artifact.locator('.artifact-control, canvas')).toHaveCount(0);
  await expect(artifact.locator('.artifact-still')).toBeVisible();
  await page.locator('.game-card .game-link').first().click();
  await expect(page.locator('.game-dialog[open]')).toBeVisible();
});

test('system reduction removes the control even in Full and restores it only when motion is allowed', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  await selectQuality(page, 'Full');
  const artifact = page.locator('.collection-artifact');
  await expect(artifact).toHaveAttribute('data-activation', 'static');
  await expect(artifact).toContainText('Illustrated view · reduced motion');
  await expect(artifact.locator('.artifact-control, canvas')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(artifact).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
  await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
  await expect(artifact.locator('.artifact-control')).toBeVisible();
});

test('resource-saving Auto has no fan promise; explicit Full remains a real override', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 2 });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const artifact = page.locator('.collection-artifact');
  await expect(artifact).toContainText('Illustrated view · saving resources');
  await expect(artifact).toHaveAttribute('data-activation', 'static');
  await expect(artifact.locator('.artifact-control, canvas')).toHaveCount(0);
  await selectQuality(page, 'Full');
  await expect(artifact).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
  await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
  await expect(artifact.locator('.artifact-control')).toBeVisible();
});

test('Auto reconciles a Save-Data change before capability subscription', async ({ page }) => {
  await page.addInitScript(() => {
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const connection = (
        navigator as Navigator & {
          connection?: EventTarget & { saveData?: boolean };
        }
      ).connection;
      if (connection && this === connection && type === 'change') {
        EventTarget.prototype.addEventListener = original;
        document.documentElement.dataset.saveDataBeforeSubscription = String(connection.saveData);
        connection.saveData = true;
        connection.dispatchEvent(new Event('change'));
      }
      original.call(this, type, listener, options);
    };
  });
  await page.goto('/?catalogs=off');
  await expect(page.locator('html')).toHaveAttribute('data-save-data-before-subscription', 'false');
  await expect(page.locator('.save-game').first()).toBeEnabled();
  const artifact = page.locator('.collection-artifact');
  await expect(artifact).toContainText('Illustrated view · saving resources');
  await expect(artifact).toHaveAttribute('data-activation', 'static');
  await expect(artifact).toHaveAttribute('data-render-mode', 'static');
  await expect(artifact.locator('.artifact-control, canvas')).toHaveCount(0);
  await selectQuality(page, 'Full');
  await expect(artifact).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
  await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
  await expect(artifact.locator('.artifact-control')).toBeVisible();
});

test('WebGL failure leaves readable static art rather than a no-op Fan out button', async ({ page }) => {
  await page.addInitScript(`
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
  `);
  await page.goto('/?catalogs=off');
  await selectQuality(page, 'Full');
  const artifact = page.locator('.collection-artifact');
  await expect(artifact).toHaveAttribute('data-scene-status', 'fallback', { timeout: 0 });
  await expect(artifact).toContainText('Illustrated view · 3D unavailable');
  await expect(artifact.locator('.artifact-control, canvas')).toHaveCount(0);
  await expect(artifact.locator('.artifact-still')).toBeVisible();
});

test('a lost WebGL context swaps to the illustration without moving the collection', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await selectQuality(page, 'Full');
  const artifact = page.locator('.collection-artifact');
  await expect(artifact).toHaveAttribute('data-render-mode', 'webgl', { timeout: 0 });
  const geometry = () =>
    page.evaluate(() => ({
      footer: document.querySelector('.artifact-footer')!.getBoundingClientRect().height,
      collection: document.querySelector('#collection')!.getBoundingClientRect().top + scrollY,
    }));
  const before = await geometry();
  await artifact.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(artifact).toHaveAttribute('data-scene-status', 'fallback');
  await expect(artifact.locator('.artifact-status')).toHaveText('Illustrated view · 3D interrupted');
  await expect(artifact.locator('.artifact-control, canvas')).toHaveCount(0);
  const after = await geometry();
  expect(after.footer).toBeCloseTo(before.footer, 1);
  expect(after.collection).toBeCloseTo(before.collection, 1);
});

test('scaled decorative sleeves contain no DOM microtext or contrast incompletes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('.artifact-still')).toBeVisible();
    await expect(page.locator('.artifact-stage')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.artifact-still')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.artifact-still text')).toHaveCount(0);
    await expectReadableSurface(page, `Static illustration at ${width}px`);
    const contrast = await new AxeBuilder({ page })
      .include('.collection-artifact')
      .withRules(['color-contrast'])
      .analyze();
    expect(contrast.violations).toEqual([]);
    expect(contrast.incomplete).toEqual([]);
  }
});

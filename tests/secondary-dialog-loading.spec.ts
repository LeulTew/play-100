import path from 'node:path';
import { readBuildManifest } from '../scripts/build-metadata';
import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

async function dialogAsset(root = 'src/components/app/SettingsPanel.tsx') {
  const manifest = await readBuildManifest(path.join(process.cwd(), 'dist'));
  const file = manifest[root]?.file;
  if (!file) throw new Error(`${root} must remain a separately emitted lazy root.`);
  return `/${file}`;
}

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true, value: Object.assign(new EventTarget(), { saveData: true, effectiveType: '4g' }),
    });
  });
});

test('an 800ms Settings chunk retains the Menu and its focus, then opens the real native dialog', async ({ page }) => {
  const asset = await dialogAsset();
  await page.route(`**${asset}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
  const trigger = menu.getByRole('button', { name: 'Settings & backups', exact: true });
  const notice = await menu.evaluateHandle(dialog => {
    const observation = { visible: false, focused: false, pageToast: false };
    const observer = new MutationObserver(() => {
      const status = dialog.querySelector<HTMLElement>('[role="status"]');
      if (!status?.textContent?.includes('Opening Settings...') || !dialog.matches('[open]') ||
        status.closest('[inert], [hidden]') || status.getClientRects().length === 0 ||
        getComputedStyle(status).visibility !== 'visible') return;
      observation.visible = true;
      observation.focused = dialog.contains(document.activeElement) &&
        document.activeElement?.textContent?.trim() === 'Settings & backups';
      observation.pageToast = document.querySelector('.toast')?.textContent?.includes('Opening Settings...') ?? false;
      observer.disconnect();
    });
    observer.observe(dialog, { subtree: true, childList: true, characterData: true, attributes: true });
    return { observation, stop: () => observer.disconnect() };
  });
  try {
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect.poll(() => notice.evaluate(probe => probe.observation)).toEqual({
      visible: true, focused: true, pageToast: false,
    });
  } finally {
    await notice.evaluate(probe => probe.stop());
    await notice.dispose();
  }
  await expect(page.locator('.toast')).not.toContainText('Opening Settings...');
  await expect(page.locator('#settings-title')).toBeFocused();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.toast')).not.toContainText('Opening Settings...');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
});

test('an aborted Settings chunk announces its error and the same item retries without reloading', async ({ page }) => {
  const asset = await dialogAsset();
  let attempts = 0;
  await page.route(`**${asset}`, route => ++attempts === 1 ? route.abort('failed') : route.continue());
  const unhandled: string[] = [];
  page.on('pageerror', error => unhandled.push(error.message));
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
  const trigger = menu.getByRole('button', { name: 'Settings & backups', exact: true });
  await trigger.click();
  await expect(menu.getByRole('status')).toContainText('Settings could not load.');
  await expect(menu.getByRole('status')).toHaveClass('inline-error');
  await expect(page.locator('.toast')).not.toContainText('Settings could not load.');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.locator('#settings-title')).toBeFocused();
  expect(attempts).toBe(2);
  expect(unhandled).toEqual([]);
});

test('closing the invoking Menu cancels a delayed Settings commit', async ({ page }) => {
  const asset = await dialogAsset();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route(`**${asset}`, async route => { started = true; await held; await route.continue(); });
  try {
    await page.goto('/?catalogs=off');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Settings & backups', exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === asset);
    release();
    await loaded;
    await page.evaluate(async url => {
      await import(url);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, asset);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
    await expect(page.locator('#settings-title')).toBeFocused();
  } finally { release(); }
});

for (const entry of ['footer', 'deep link'] as const) {
  test(`${entry} credits loading stays in the usable page toast when no modal is open`, async ({ page }) => {
    const asset = await dialogAsset('src/components/AboutDialog.tsx');
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${asset}`, async route => { await held; await route.continue(); });
    try {
      await page.goto(entry === 'footer' ? '/?catalogs=off' : '/?info=credits&catalogs=off');
      if (entry === 'footer') await page.locator('.site-footer').getByRole('button', { name: 'About & credits', exact: true }).click();
      await expect(page.locator('.toast')).toContainText('Opening credits...');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
      await expect(page.locator('.toast')).not.toContainText('Opening credits...');
      release();
      await expect(page.locator('#about-title')).toBeFocused();
    } finally { release(); }
  });
}

test('credits requested inside Settings announces inside that modal instead of the inert page', async ({ page }) => {
  const asset = await dialogAsset('src/components/AboutDialog.tsx');
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${asset}`, async route => { await held; await route.continue(); });
  try {
    await page.goto('/?catalogs=off');
    await page.locator('.site-footer').getByRole('button', { name: /^Effects:/ }).click();
    const settings = page.locator('dialog[aria-labelledby="settings-title"]');
    const trigger = settings.getByRole('button', { name: 'Source, methodology & credits', exact: true });
    const status = settings.locator('.dialog-inner > div[role="status"]');
    await expect(status).toHaveCount(1);
    await expect(status).toBeEmpty();
    expect(await status.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
    await trigger.click();
    await expect(status).toContainText('Opening credits...');
    await expect(status).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.locator('.toast')).not.toContainText('Opening credits...');
    release();
    await expect(page.locator('#about-title')).toBeFocused();
  } finally { release(); }
});

test('Settings credits failure stays in the persistent modal status and retries from the focused trigger', async ({ page }) => {
  const asset = await dialogAsset('src/components/AboutDialog.tsx');
  let attempts = 0;
  await page.route(`**${asset}`, route => ++attempts === 1 ? route.abort('failed') : route.continue());
  await page.goto('/?catalogs=off');
  await page.locator('.site-footer').getByRole('button', { name: /^Effects:/ }).click();
  const settings = page.locator('dialog[aria-labelledby="settings-title"]');
  const status = settings.locator('.dialog-inner > div[role="status"]');
  const trigger = settings.getByRole('button', { name: 'Source, methodology & credits', exact: true });
  await expect(status).toHaveCount(1);
  await expect(status).toBeEmpty();
  expect(await status.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
  await trigger.click();
  await expect(status).toHaveText('Credits could not load. Check your connection and choose it again to retry.');
  await expect(status.locator('p')).toHaveClass('inline-error');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.toast')).not.toContainText('Credits could not load.');
  await trigger.click();
  await expect(page.locator('#about-title')).toBeFocused();
  expect(attempts).toBe(2);
});

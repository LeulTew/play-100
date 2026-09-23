import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

async function settingsAsset() {
  const manifest: Record<string, { file: string }> = JSON.parse(await readFile(path.join(process.cwd(), 'dist', '.vite', 'manifest.json'), 'utf8'));
  const file = manifest['src/components/app/SettingsPanel.tsx']?.file;
  if (!file) throw new Error('Settings must remain a separately emitted lazy root.');
  return `/${file}`;
}

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
  });
});

test('an 800ms Settings chunk retains the Menu and its focus, then opens the real native dialog', async ({ page }) => {
  const asset = await settingsAsset();
  await page.route(`**${asset}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
  const trigger = menu.getByRole('button', { name: 'Settings & backups', exact: true });
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator('.toast')).toContainText('Opening Settings...');
  await expect(page.locator('#settings-title')).toBeFocused();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.toast')).not.toContainText('Opening Settings...');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
});

test('an aborted Settings chunk announces its error and the same item retries without reloading', async ({ page }) => {
  const asset = await settingsAsset();
  let attempts = 0;
  await page.route(`**${asset}`, route => ++attempts === 1 ? route.abort('failed') : route.continue());
  const unhandled: string[] = [];
  page.on('pageerror', error => unhandled.push(error.message));
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const trigger = page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Settings & backups', exact: true });
  await trigger.click();
  await expect(page.locator('.toast')).toContainText('Settings could not load.');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.locator('#settings-title')).toBeFocused();
  expect(attempts).toBe(2);
  expect(unhandled).toEqual([]);
});

test('closing the invoking Menu cancels a delayed Settings commit', async ({ page }) => {
  const asset = await settingsAsset();
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

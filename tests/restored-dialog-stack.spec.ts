import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { readBuildManifest } from '../scripts/build-metadata';
import { emptyCatalogs } from './catalog-helpers';

const game = 'red-dead-redemption-2';
const panels = [
  { info: 'settings', root: 'src/components/app/SettingsPanel.tsx', title: 'settings-title' },
  { info: 'credits', root: 'src/components/AboutDialog.tsx', title: 'about-title' },
] as const;

async function asset(root: string) {
  const manifest = await readBuildManifest(path.join(process.cwd(), 'dist'));
  const entry = manifest[root]?.file;
  if (!entry) throw new Error(`Missing built dialog root: ${root}`);
  return `/${entry}`;
}

async function expectForeground(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return {
          modal: element.matches(':modal'),
          hit: hit?.closest('dialog') === element,
          focused: element.contains(document.activeElement),
        };
      }),
    )
    .toEqual({ modal: true, hit: true, focused: true });
}

test.beforeEach(async ({ page, baseURL }) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname);
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const panel of panels) {
  for (const order of ['utility-first', 'game-first'] as const) {
    test(`restored ${panel.info} stays above its game when ${order}`, async ({ page }) => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const url = order === 'utility-first' ? '/data/collection.json' : await asset(panel.root);
      await page.route(`**${url}`, async (route) => {
        await held;
        await route.continue();
      });
      try {
        await page.goto(`/?game=${game}&info=${panel.info}&catalogs=off`, { waitUntil: 'domcontentloaded' });
        const utility = page.locator(`dialog[aria-labelledby="${panel.title}"][open]`);
        const detail = page.locator('.game-dialog[open]');
        if (order === 'utility-first') {
          await expectForeground(utility);
          if (panel.info === 'settings') {
            await utility.getByRole('button', { name: 'Reset device data', exact: true }).click();
            await expect(utility.locator('.reset-confirmation')).toBeVisible();
            await utility.locator(`#${panel.title}`).focus();
          }
        } else {
          await expect(detail).toBeVisible();
        }
        const mounted = order === 'utility-first' ? await utility.elementHandle() : null;
        release();
        await expect(detail).toBeVisible();
        await expect(utility).toBeVisible();
        await expect(page.locator('dialog[open]')).toHaveCount(2);
        await expectForeground(utility);
        if (mounted) {
          expect(
            await mounted.evaluate(
              (element, title) => element === document.getElementById(title)?.closest('dialog'),
              panel.title,
            ),
          ).toBe(true);
          if (panel.info === 'settings') await expect(utility.locator('.reset-confirmation')).toBeVisible();
          await mounted.dispose();
        }
        await utility.getByRole('button', { name: 'Close dialog', exact: true }).click();
        await expect(utility).toHaveCount(0);
        await expectForeground(detail);
        await expect(page).toHaveURL((current) => current.searchParams.get('game') === game);
        await expect(page).not.toHaveURL(/info=/);
      } finally {
        release();
      }
    });
  }
}

test('guarded Settings reload with a game link restores Settings to the foreground', async ({ page }) => {
  const settingsAsset = await asset(panels[0].root);
  let attempts = 0;
  await page.route(`**${settingsAsset}`, (route) => (++attempts === 1 ? route.abort('failed') : route.continue()));
  await page.route('**/*', (route) =>
    route.request().method() === 'HEAD' ? route.fulfill({ status: 200 }) : route.fallback(),
  );
  await page.goto(`/?game=${game}&info=settings&catalogs=off`);
  const failure = page.getByRole('dialog', { name: 'Dialog unavailable', exact: true });
  await expect(failure.getByRole('alert')).toContainText("Settings didn't load.");
  await expectForeground(failure);
  await failure.getByRole('button', { name: 'Reload and open Settings', exact: true }).click();
  const settings = page.locator('.settings-dialog[open]');
  await expect(page.locator('.game-dialog[open]')).toBeVisible();
  await expectForeground(settings);
  expect(attempts).toBe(2);
  await expect(page).toHaveURL(
    (current) => current.searchParams.get('game') === game && current.searchParams.get('info') === 'settings',
  );
});

for (const panel of panels) {
  test(`one Escape dismisses failed ${panel.info} without closing its underlying game`, async ({ page }) => {
    const panelAsset = await asset(panel.root);
    await page.route(`**${panelAsset}`, (route) => route.abort('failed'));
    await page.goto(`/?game=${game}&info=${panel.info}&catalogs=off`);
    const failure = page.getByRole('dialog', { name: 'Dialog unavailable', exact: true });
    const detail = page.locator('.game-dialog[open]');
    await expect(detail).toBeVisible();
    await expectForeground(failure);
    await page.keyboard.press('Escape');
    await expect(failure).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expectForeground(detail);
    await expect(page).toHaveURL((current) => current.searchParams.get('game') === game);
    await expect(page).not.toHaveURL(/info=/);
  });
}

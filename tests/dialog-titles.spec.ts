import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { openMenu } from './readability-helpers';

test('Settings exposes Export and Import without scrolling at 1440x900', async ({ page, baseURL }) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname);
  await page.setViewportSize({ width: 1440, height: 900 });
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?info=settings&catalogs=off');
  const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
  await expect(settings.locator('#settings-title')).toBeFocused();
  await expect(settings.getByRole('button', { name: 'Export my library', exact: true })).toBeEnabled();
  await expect(settings.getByRole('button', { name: 'Import backup', exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const layout = await settings.evaluate((dialog) => {
    const backup = dialog.querySelector('.backup-panel');
    const preferences = dialog.querySelector('.motion-options');
    if (!backup || !preferences) throw new Error('Both Settings destinations must remain present.');
    const bounds = dialog.getBoundingClientRect();
    const buttons = [...backup.querySelectorAll('button')].slice(0, 2);
    return {
      scrollTop: dialog.scrollTop,
      beforePreferences: Boolean(backup.compareDocumentPosition(preferences) & Node.DOCUMENT_POSITION_FOLLOWING),
      controls: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.textContent?.trim(),
          visible:
            rect.top >= Math.max(0, bounds.top) &&
            rect.bottom <= Math.min(innerHeight, bounds.bottom) &&
            rect.left >= bounds.left &&
            rect.right <= bounds.right,
          hit: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
        };
      }),
    };
  });
  expect(layout.scrollTop).toBe(0);
  expect(layout.beforePreferences).toBe(true);
  expect(layout.controls.map((button) => button.name)).toEqual(['Export my library', 'Import backup']);
  expect(layout.controls.every((button) => button.visible && button.hit)).toBe(true);
});

test('committed Settings and About own the title, and Close restores the route title', async ({
  page,
  context,
  baseURL,
}) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname);
  await context.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort('blockedbyclient'),
  );
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?info=settings&catalogs=off');
  const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
  await expect(settings.locator('#settings-title')).toBeFocused();
  await expect(page).toHaveTitle('Settings & backups | Play 100');
  await settings.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(page).not.toHaveURL(/info=/);
  await expect(page).toHaveTitle('Find your next game | Play 100');

  await openMenu(page);
  await expect(page).toHaveTitle('Find your next game | Play 100');
  await page
    .getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('button', { name: 'About & credits', exact: true })
    .click();
  const about = page.locator('dialog[open]').filter({ has: page.locator('#about-title') });
  await expect(about.locator('#about-title')).toBeFocused();
  await expect(page).toHaveTitle('About & credits | Play 100');
  await about.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(about).toHaveCount(0);
  await expect(page).toHaveTitle('Find your next game | Play 100');
});

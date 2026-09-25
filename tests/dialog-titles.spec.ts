import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { openMenu } from './readability-helpers';

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
  const settings = page.locator('.settings-dialog[open]');
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

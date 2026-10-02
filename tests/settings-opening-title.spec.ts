import { expect, test } from '@playwright/test';
import { createLibraryBackup, emptyPersonalLibrary } from '../src/lib/personal-library';
import { withActionCleanup } from './action-cleanup';

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Loopback only.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }),
  );
});

test('deep-linked Settings describes opening storage truthfully and keeps a backup chosen before readiness', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    let held = false;
    IDBFactory.prototype.open = function (...args: Parameters<IDBFactory['open']>) {
      const request = open.apply(this, args);
      if (args[0] === 'play100-personal' && !held) {
        held = true;
        request.addEventListener(
          'success',
          (event) => {
            event.stopImmediatePropagation();
            window.addEventListener(
              'release-test-library',
              () => {
                IDBFactory.prototype.open = open;
                request.dispatchEvent(new Event('success'));
              },
              { once: true },
            );
          },
          { once: true },
        );
      }
      return request;
    };
  });
  await withActionCleanup(async () => {
    await page.goto('/?catalogs=off&info=settings');
    const dialog = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
    const panel = dialog.locator('.backup-panel');
    await expect(panel.getByRole('status', { name: '' }).filter({ hasText: 'Opening your library…' })).toBeVisible();
    await expect(panel).not.toContainText('Device storage is unavailable.');
    await expect(panel).not.toContainText('Your changes are temporary.');
    await expect(panel.getByRole('button', { name: 'Import backup', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await panel.getByLabel('Import personal library backup file').setInputFiles({
      name: 'opening-library.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(createLibraryBackup(emptyPersonalLibrary()))),
    });
    await expect(panel.locator('.restore-preview')).toBeVisible();
    const replace = panel.getByRole('button', { name: 'Replace with this backup', exact: true });
    await expect(replace).toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => dispatchEvent(new Event('release-test-library')));
    await expect(replace).not.toHaveAttribute('aria-disabled', 'true');
    await expect(panel).toContainText('Download a backup to move or recover your library.');
    await expect(panel).not.toContainText('Device storage is unavailable.');
    await panel.getByRole('button', { name: 'Cancel import', exact: true }).press('Enter');
    await expect(panel.getByRole('button', { name: 'Import backup', exact: true })).toBeFocused();
    await expect(page).toHaveTitle('Settings & backups | Play 100');
  }, [() => page.evaluate(() => dispatchEvent(new Event('release-test-library')))]);
});

for (const path of ['/', '/discover', '/my-games']) {
  test(`${path}: the missing-game dialog owns a specific title and restores the route title`, async ({ page }) => {
    const query = '?catalogs=off&game=not-a-real-game';
    await page.goto(`${path}${query}`);
    const dialog = page.locator('dialog:has(#missing-game-title)');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveTitle('Game not found | Play 100');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveTitle(
      `${path === '/' ? 'The 100' : path === '/discover' ? 'Discover' : 'My games · Library'} | Play 100`,
    );
  });
}

test('Settings above a missing game takes title precedence, then restores the missing-game title', async ({ page }) => {
  await page.goto('/?catalogs=off&game=not-a-real-game&info=settings');
  const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
  await expect(settings).toBeVisible();
  await expect(page.locator('#missing-game-title')).toBeVisible();
  await expect(page).toHaveTitle('Settings & backups | Play 100');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(page).toHaveTitle('Game not found | Play 100');
  await page.keyboard.press('Escape');
  await expect(page).toHaveTitle('The 100 | Play 100');
});

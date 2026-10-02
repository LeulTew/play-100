import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });
test.setTimeout(120000);

async function openOfflineSettings(page: Page) {
  await page.goto('/?catalogs=off');
  await expect(page.locator('[data-game="red-dead-redemption-2"] .game-link')).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('button', { name: 'Install & offline access', exact: true })
    .click();
  const settings = page.locator('dialog[aria-labelledby="settings-title"]');
  await expect(settings.locator('.pwa-settings')).toHaveAttribute('open', '');
  return settings;
}

test.beforeEach(async ({ browser, browserName, page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const engine = { project: info.project.name, browserName, version: browser.version() };
  console.log(`Offline floor engine: ${JSON.stringify(engine)}`);
  await info.attach('offline-floor-engine', { body: JSON.stringify(engine), contentType: 'application/json' });
});

test('the current engine prepares offline through Settings and reloads the collection without a network', async ({
  page,
  context,
}) => {
  const settings = await openOfflineSettings(page);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((values) => values.length))).toBe(0);
  await settings.getByRole('button', { name: 'Enable offline access', exact: true }).click();
  const ready = settings.getByRole('button', { name: 'Offline files ready', exact: true });
  await expect(ready).toBeVisible({ timeout: 45000 });
  await expect(ready).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-app-started', '');
    await expect(page.locator('[data-game="red-dead-redemption-2"] .game-link')).toBeVisible();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await expect(page).toHaveURL(/\/\?catalogs=off$/);
  } finally {
    await context.setOffline(false);
  }
});

test('an engine that ignores the module option shows the exact upgrade guidance without installing a worker', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(ServiceWorkerContainer.prototype, 'register', {
      configurable: true,
      writable: true,
      value: function register() {
        // Firefox 98–146 ignores options.type and fails to parse the worker as a classic script.
        return Promise.reject(new TypeError("ServiceWorker script evaluation failed: unexpected token 'export'"));
      },
    });
  });
  const settings = await openOfflineSettings(page);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((values) => values.length))).toBe(0);
  await settings.getByRole('button', { name: 'Enable offline access', exact: true }).click();
  await expect(settings.locator('.pwa-settings [role="alert"]')).toHaveText(
    'Offline access needs a newer version of this browser.',
  );
  await expect(settings.getByRole('button', { name: 'Offline files ready', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((values) => values.length))).toBe(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
});

import { expect, test } from '@playwright/test';
import { createAccount, emailFor, enableSync, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';

test('a signed-in Settings reload remains open after provisional auth resolves', async ({ page, request, context, baseURL }) => {
  const origin = new URL(baseURL!);
  expect(['localhost', '127.0.0.1']).toContain(origin.hostname);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || ![origin.port, '9199', '8188'].includes(url.port)) return route.abort('blockedbyclient');
    if (url.pathname === '/api/catalog') return route.fulfill({ status: 503, json: { error: 'Synthetic unavailable provider.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = emailFor('panel-recovery');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await enableSync(page, 'empty');
  const guest = await readLibrary(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route(/\/(?:src\/cloud\/OnlineController\.tsx|assets\/OnlineController-[^/]+\.js)(?:\?|$)/, async route => {
    requested = true;
    await held;
    await route.continue();
  });
  try {
    await page.goto('/?info=settings&catalogs=off');
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('#settings-title')).toBeFocused();
    await expect(page.locator('.settings-account')).toContainText('Opening account...');
    release();
    await expect(page.locator('.settings-account')).toContainText('separate account library');
    await expect(page.locator('#settings-title')).toBeFocused();
    await expect(page).toHaveURL(url => url.searchParams.get('info') === 'settings');
    expect(await readLibrary(page)).toEqual(guest);
    await page.keyboard.press('Escape');
    await expect(page.locator('.settings-dialog')).toHaveCount(0);
    await expect(page).not.toHaveURL(/info=/);
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
  } finally { release(); }
});

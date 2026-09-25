import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

// Google's script host, Firebase auth domains and the auth helper pages. A signed-out Account needs none of them.
const helperHosts = ['apis.google.com', 'play-100-collection.vercel.app'];
const helperDomains = ['.googleapis.com', '.firebaseapp.com'];
const helperPaths = ['/__/auth/', '/emulator/auth/'];

function googleOrAuthHelper(url: URL): boolean {
  if (helperHosts.includes(url.hostname)) return true;
  if (helperDomains.some((domain) => url.hostname.endsWith(domain))) return true;
  return helperPaths.some((path) => url.pathname.startsWith(path));
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('signed-out Account is ready while Google and the auth helper never answer', async ({ page, context }) => {
  const contacted: string[] = [];
  const held: Route[] = [];
  // Held open rather than refused: a refused script fails fast, but a stalled one would hold Firebase Auth's start-up.
  await context.route(googleOrAuthHelper, (route) => {
    contacted.push(new URL(route.request().url()).origin);
    held.push(route);
  });
  try {
    await page.goto('/');
    const account = page.locator('.account-nav');
    await expect(account).toHaveAccessibleName('Account Device only');
    await account.click();
    const sheet = page.getByRole('dialog', { name: 'Sign in', exact: true });
    await expect(sheet.locator('#account-signin-title')).toBeFocused();
    await expect(sheet.getByRole('button', { name: 'Continue with Google', exact: true })).toBeEnabled();
    await expect(sheet.getByRole('button', { name: 'Use email', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    // The Account page replaces "Restoring account…" only once Firebase Auth has started and found no session.
    await page.goto('/account');
    const signIn = page.locator('.auth-page');
    await expect(signIn.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(signIn.getByRole('button', { name: 'Use email', exact: true })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Restoring account…', exact: true })).toHaveCount(0);
    expect(contacted).toEqual([]);
  } finally {
    await Promise.all(held.map((route) => route.abort().catch(() => {})));
  }
});

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
    // Use email replaces itself with the email form: focus moves to its Email field, not to the page.
    await sheet.getByRole('button', { name: 'Use email', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(sheet.getByLabel('Email', { exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    // The Account page replaces "Restoring account…" only once Firebase Auth has started and found no session.
    await page.goto('/account');
    const signIn = page.locator('.auth-page');
    // It names the page it stands in for, as the tab title does, and says what an account is for.
    await expect(signIn.getByRole('heading', { name: 'Account', level: 1, exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Account | Play 100');
    await expect(signIn.locator('.auth-purpose')).toHaveText(
      'Sign in to save your games and rankings online and use them on your other devices. Your library stays on this device until you turn on online saving.',
    );
    await expect(signIn.getByRole('button', { name: 'Use email', exact: true })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Restoring account…', exact: true })).toHaveCount(0);
    await signIn.getByRole('button', { name: 'Use email', exact: true }).click();
    await expect(signIn.getByLabel('Email', { exact: true })).toBeFocused();
    expect(contacted).toEqual([]);
  } finally {
    await Promise.all(held.map((route) => route.abort().catch(() => {})));
  }
});

// G9 UX-003: each signed-out online page names itself as its tab title does, and says what it is for and why it needs
// an account before the sign-in choices.
for (const [path, title, purpose] of [
  [
    '/friends',
    'Friends',
    'Add friends with an invite link, see the games they share and compare your rankings. Sign in so your friends can find you.',
  ],
  [
    '/publish',
    'Publish ranking',
    'Publish your ranking as a public page that anyone with its link can see, and choose whether Community lists it. Sign in so the page belongs to you.',
  ],
  [
    '/friends/sharing',
    'Friend sharing',
    'Choose the ranked games, with their order and scores, that your friends can see. Sign in to share them with friends.',
  ],
  [
    '/friends/sharing/games',
    'Shared games',
    'Choose saved games from your library for your friends to see. Sign in to share them with friends.',
  ],
  [
    '/creator',
    'Creator desk',
    'The collection creator can review consenting members and moderate public rankings here. Sign in with the creator account to continue.',
  ],
] as const) {
  test(`signed-out ${path} names itself and explains its purpose before sign-in`, async ({ page }) => {
    await page.goto(`${path}?catalogs=off`);
    const signIn = page.locator('.auth-page');
    await expect(signIn.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(`${title} | Play 100`);
    await expect(signIn.locator('.auth-purpose')).toHaveText(purpose);
    const order = await signIn.evaluate((element) => {
      const text = element.querySelector('.auth-purpose')!;
      const provider = element.querySelector('.google-signin')!;
      return Boolean(text.compareDocumentPosition(provider) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
  });
}

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readLibrary } from '../tests/library-helpers';
import { googleRedirectStyles } from './strict-style-google';

// The live Google check, run apart from the release gate (docs/release-operations.md). It repeats two gate cases
// through Google's own loader script and iframe code and the Auth emulator sign-in page's public assets, instead of
// the controlled provider fixture the gate uses: the redirect and Back case (identity.spec.ts), and the Google case
// of strict-style-csp.spec.ts. playwright.cloud.config.ts includes it only with PLAY100_GOOGLE_LIVE=1 and never with
// PLAY100_RELEASE_GATE, so a public host's availability cannot decide the gate.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// Each case checks that Google's own loader answered, so the run did exercise the live service.
function answeredLoaders(page: Page): string[] {
  const answered: string[] = [];
  page.on('requestfinished', (request) => {
    if (request.url().startsWith('https://apis.google.com/js/api.js')) answered.push(request.url());
  });
  return answered;
}

test('live Google: the redirect stays in the same tab even if windows are blocked, and browser Back cancels it', async ({
  page,
  context,
}) => {
  const answered = answeredLoaders(page);
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await page.waitForURL(/127\.0\.0\.1:9199/, { timeout: 20000 });
  expect(context.pages()).toHaveLength(1);
  await page.goBack();
  await expect(page.locator('.auth-panel')).toBeVisible();
  await expect(page.locator('.auth-panel .inline-error')).toHaveCount(0);
  await expect(page.locator('.auth-panel')).toContainText('Google sign-in was not completed');
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeEnabled();
  expect((await readLibrary(page)).records).toEqual({});
  expect(answered.length).toBeGreaterThan(0);
});

test('live Google: redirect sign-in and reauthentication add no style attribute or third-party style element', async ({
  page,
  baseURL,
}) => {
  const answered = answeredLoaders(page);
  await googleRedirectStyles(page, baseURL);
  expect(answered.length).toBeGreaterThan(0);
});

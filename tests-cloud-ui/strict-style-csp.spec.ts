import { expect, test } from '@playwright/test';
import { routeGoogleProvider } from './google-provider-fixture';
import { googleRedirectStyles, recordStylePolicy } from './strict-style-google';

// SECURITY-01 on the Auth emulator (the policy and its recorders: strict-style-google.ts). Covers Account
// sign-in, Google redirect start and return, and Google reauthentication, including the auth iframe
// inserted into our document. The Google case runs against the controlled provider fixture, so no public
// host decides it; google-live.spec.ts repeats it through Google's own loader and iframe code.

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Account sign-in adds no style attribute or third-party style element', async ({ page, baseURL }) => {
  const violations = await recordStylePolicy(page, baseURL);
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use email', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create account with email', exact: true })).toBeVisible();
  expect(await violations.read()).toEqual([]);
});

test('Google redirect sign-in and reauthentication add no style attribute or third-party style element', async ({
  page,
  context,
  baseURL,
}) => {
  const google = await routeGoogleProvider(context);
  await googleRedirectStyles(page, baseURL);
  // Both returns were read through the fixture's loader, and nothing left this machine.
  expect(google.loaders.length).toBeGreaterThanOrEqual(2);
  expect(google.refused).toEqual([]);
});

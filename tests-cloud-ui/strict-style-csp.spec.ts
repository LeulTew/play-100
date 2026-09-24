import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { emailFor, googleRedirect } from './helpers';
import { recordStyleElements, recordViolations } from '../tests/csp-violation-helpers';

// SECURITY-01 on the Auth emulator. This suite runs on the Vite development server, which injects its
// CSS as <style> elements, so it cannot serve the production style-src as is. It checks the two halves
// separately: `style-src-attr 'none'` enforces exactly what the strict style-src does to style
// attributes (it lists no 'unsafe-hashes'), and every other added <style> element is recorded, since
// production would block it. Covers Account sign-in, Google redirect start and return, and Google
// reauthentication, including the Firebase/gapi auth iframe inserted into our document.
const attributePolicy = "style-src-attr 'none'";

async function record(page: Page, baseURL: string | undefined) {
  await recordStyleElements(page);
  return recordViolations(page, attributePolicy, new URL(baseURL ?? '/').origin);
}

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('Account sign-in adds no style attribute or third-party style element', async ({ page, baseURL }) => {
  const violations = await record(page, baseURL);
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use email', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create account with email', exact: true })).toBeVisible();
  expect(await violations.read()).toEqual([]);
});

test('Google redirect sign-in and reauthentication add no style attribute or third-party style element', async ({ page, baseURL }) => {
  const email = emailFor('strict-style');
  const violations = await record(page, baseURL);
  await page.goto('/account');
  await googleRedirect(page, () => page.getByRole('button', { name: 'Continue with Google', exact: true }).click(), email, true);
  await expect(page.locator('.account-heading')).toContainText(email);
  // Firebase inserts its auth-event iframe (styled by gapi) into this document; record whether it did.
  test.info().annotations.push({ type: 'auth iframes', description: String(await page.locator('iframe').count()) });
  await page.locator('.account-danger summary').click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await googleRedirect(page, () => page.getByRole('dialog').getByRole('button', { name: 'Continue in this tab', exact: true }).click(), email);
  await expect(page.getByRole('dialog')).toContainText('Google confirmed this account. Confirm below to delete.');
  expect(await violations.read()).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await violations.read()).toEqual([]);
});
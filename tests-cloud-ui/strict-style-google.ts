import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { emailFor, googleRedirect } from './helpers';
import { recordStyleElements, recordViolations } from '../tests/csp-violation-helpers';

// SECURITY-01 on the Auth emulator, shared by strict-style-csp.spec.ts and its live Google repeat in
// google-live.spec.ts. The Vite development server injects its CSS as <style> elements, so it cannot serve the
// production style-src as is. The two halves are checked separately: `style-src-attr 'none'` enforces exactly what the
// strict style-src does to style attributes (it lists no 'unsafe-hashes'), and every other added <style> element is
// recorded, since production would block it.
const attributePolicy = "style-src-attr 'none'";

export async function recordStylePolicy(page: Page, baseURL: string | undefined) {
  await recordStyleElements(page);
  // Continue, not fulfil, the documents: a fulfilled document fails Chrome's Local Network Access check
  // for the emulator's loopback auth iframe.
  return recordViolations(page, attributePolicy, new URL(baseURL ?? '/').origin, { network: 'continue' });
}

/**
 * Google redirect sign-in, then Google reauthentication and deletion, recording every style attribute and third-party
 * style element on the way, including those of the auth iframe that the loader inserts into this document.
 */
export async function googleRedirectStyles(page: Page, baseURL: string | undefined) {
  const email = emailFor('strict-style');
  const violations = await recordStylePolicy(page, baseURL);
  await page.goto('/account');
  await googleRedirect(
    page,
    () => page.getByRole('button', { name: 'Continue with Google', exact: true }).click(),
    email,
    true,
  );
  await expect(page.locator('.account-heading')).toContainText(email);
  // Firebase inserts its auth-event iframe (styled by gapi) into this document; record whether it did.
  test.info().annotations.push({ type: 'auth iframes', description: String(await page.locator('iframe').count()) });
  await page.locator('.account-danger summary').click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await googleRedirect(
    page,
    () => page.getByRole('dialog').getByRole('button', { name: 'Continue in this tab', exact: true }).click(),
    email,
  );
  await expect(page.getByRole('dialog')).toContainText('Google confirmed this account. Confirm below to delete.');
  expect(await violations.read()).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await violations.read()).toEqual([]);
}

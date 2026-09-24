import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { ScopedLibrary } from '../src/lib/cloud-types';
import { readLibrary } from '../tests/library-helpers';

export const password = 'Local-emulator-passphrase-8426';
export const authOrigin = 'http://127.0.0.1:9199';
export const firestoreOrigin = 'http://127.0.0.1:8188';
export function emailFor(prefix = 'qa') {
  return `${prefix}-${crypto.randomUUID()}@play100.test`;
}
export async function seedGuestRating(page: Page, score: string) {
  await page.getByRole('spinbutton').fill(score);
  await page.getByRole('spinbutton').press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(Number(score));
}

export async function createAccount(page: Page, email: string) {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Use email', exact: true }).click();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.locator('.auth-panel input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Create account with email', exact: true }).click();
  await expect(page.locator('.account-heading')).toContainText(email);
  await expect(page.getByRole('button', { name: 'Send verification email', exact: true })).toBeVisible();
}
export async function signIn(page: Page, email: string) {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Use email', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.locator('.auth-panel input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.locator('.account-heading')).toContainText(email);
}
export async function uidFor(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-play100-key`,
    {
      headers: { Authorization: 'Bearer owner' },
      data: { email: [email] },
    },
  );
  if (!response.ok()) throw new Error(`Emulator identity lookup failed: ${response.status()}`);
  const body = (await response.json()) as { users?: Array<{ localId: string }> };
  const uid = body.users?.[0]?.localId;
  if (!uid) throw new Error('The synthetic emulator identity is missing.');
  return uid;
}
export async function verifyEmail(page: Page, request: APIRequestContext, email: string) {
  await page.getByRole('button', { name: 'Send verification email', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Verification email requested' })).toBeVisible();
  const response = await request.get(`${authOrigin}/emulator/v1/projects/demo-play100/oobCodes`);
  const body = (await response.json()) as { oobCodes?: Array<{ email: string; oobCode: string; requestType: string }> };
  const code = body.oobCodes?.findLast((item) => item.email === email && item.requestType === 'VERIFY_EMAIL')?.oobCode;
  if (!code) throw new Error('The local verification email was not generated.');
  const confirmed = await request.post(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key`,
    { data: { oobCode: code } },
  );
  expect(confirmed.ok()).toBe(true);
  await page.getByRole('button', { name: 'I verified my email', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Agree & enable', exact: true })).toBeVisible();
}
export async function verifyByEmailReturn(page: Page, request: APIRequestContext, email: string) {
  await page.getByRole('button', { name: 'Send verification email', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Verification email requested' })).toBeVisible();
  const response = await request.get(`${authOrigin}/emulator/v1/projects/demo-play100/oobCodes`);
  const body = (await response.json()) as { oobCodes?: Array<{ email: string; oobLink: string; requestType: string }> };
  const link = body.oobCodes?.findLast((item) => item.email === email && item.requestType === 'VERIFY_EMAIL')?.oobLink;
  if (!link || new URL(link).origin !== authOrigin)
    throw new Error('The local verification link is missing or points outside the emulator.');
  await page.goto(link);
  await expect(page).toHaveURL(/127\.0\.0\.1:4187\/account/, { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Agree & enable', exact: true })).toBeVisible();
}
export async function readAccount(page: Page, uid: string): Promise<ScopedLibrary> {
  return page.evaluate(
    (key) =>
      new Promise<ScopedLibrary>((resolve, reject) => {
        const open = indexedDB.open('play100-personal', 2);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction('library', 'readonly');
          const request = transaction.objectStore('library').get(key);
          request.onsuccess = () => {
            if (request.result) resolve(request.result);
            else reject(new Error('Account cache is missing.'));
          };
          transaction.oncomplete = () => db.close();
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    `account:demo-play100:${uid}`,
  );
}
export async function enableSync(page: Page, choice: 'guest' | 'online' | 'empty' | 'cached' = 'guest') {
  const choices = page.locator('input[name="connection-copy"]');
  if (await choices.count()) {
    const selector = page.locator(`input[name="connection-copy"][value="${choice}"]`);
    await expect(selector).toBeVisible();
    await selector.check();
  } else {
    const label = {
      guest: 'Device-only library',
      online: 'Online library',
      empty: 'Empty library',
      cached: 'Account copy on this device',
    }[choice];
    await expect(page.locator('.connection-source strong')).toHaveText(label);
  }
  await page.getByRole('button', { name: /Agree & (enable|replace online)/ }).click();
  await expect(page.locator('.sync-panel .sync-state')).toHaveText('Saved online', { timeout: 30000 });
}

export async function expectRestoredSync(page: Page) {
  await expect(page.locator('.sync-panel .sync-state')).toHaveText('Saved online', { timeout: 30000 });
  await expect(page.getByRole('button', { name: /Agree & (enable|replace online)/ })).toHaveCount(0);
}

// New setups share all saved games and rankings with friends; selected-sharing flows start from an explicit Stop.
export async function stopAutomaticSharing(page: Page) {
  const summary = page.locator('.friend-sharing-summary');
  await expect(summary).toContainText('Sharing all saved games and rankings with friends.');
  await expect(summary).toContainText('Up to date', { timeout: 30000 });
  await summary.getByRole('button', { name: 'Stop friend sharing', exact: true }).click();
  await expect(summary).toContainText('Automatic friend sharing is off.');
}

export async function googleRedirect(page: Page, trigger: () => Promise<void>, email: string, create = false) {
  await trigger();
  await page.waitForURL(/127\.0\.0\.1:9199/);
  if (create) {
    await page.getByRole('button', { name: /Add new account/ }).click();
    await page.locator('#email-input').fill(email);
    await page.locator('#display-name-input').fill('QA Google account');
    await page.getByRole('button', { name: /Sign in with Google\.com/ }).click();
  } else await page.getByText(email, { exact: true }).click();
  await page.waitForURL(/127\.0\.0\.1:4187/);
}

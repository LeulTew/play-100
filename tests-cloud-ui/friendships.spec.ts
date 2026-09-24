import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createAccount, emailFor, enableSync, seedGuestRating, stopAutomaticSharing, uidFor, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

async function chooseName(page: Page, name: string) {
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Name saved.' })).toBeVisible();
}
async function inviteFrom(page: Page): Promise<string> {
  await page.goto('/friends');
  await page.getByRole('button', { name: 'Invite someone', exact: true }).click();
  const input = page.getByLabel('Invitation link', { exact: true });
  await expect(input).toBeVisible();
  const url = await input.inputValue();
  expect(new URL(url).pathname).toBe('/invite');
  expect(new URL(url).search).toBe('');
  expect(new URL(url).hash).toMatch(/^#[a-f0-9]{64}$/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  return url;
}
async function enableSelectedSharing(page: Page) {
  await page.goto('/friends/sharing');
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Preview friends sharing', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Red Dead Redemption 2');
  await page.getByRole('button', { name: 'Agree & share with friends', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Sharing saved' })).toBeVisible({ timeout: 30000 });
}

test('an invitation resumes after email sign-in, sharing stays opt-in, selected scores compare, groups persist, and unfriend revokes the open comparison', async ({ page, browser, request, viewport, isMobile }, testInfo) => {
  const senderEmail = emailFor('friend-a');
  const receiverEmail = emailFor('friend-b');
  await page.goto('/?game=red-dead-redemption-2'); await seedGuestRating(page, '8.8');
  await createAccount(page, senderEmail); await verifyEmail(page, request, senderEmail); await enableSync(page);
  await chooseName(page, 'QA Sender');
  await stopAutomaticSharing(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: testInfo.outputPath('account-visual.png'), fullPage: true });
  const sender = await uidFor(request, senderEmail);
  const link = await inviteFrom(page);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', reducedMotion: 'reduce', viewport, isMobile, hasTouch: isMobile });
  const anonymousContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', reducedMotion: 'reduce', viewport, isMobile, hasTouch: isMobile });
  try {
    const other = await context.newPage();
    await other.goto('/?game=red-dead-redemption-2'); await seedGuestRating(other, '6.8');
    await createAccount(other, receiverEmail); await verifyEmail(other, request, receiverEmail); await enableSync(other);
    await chooseName(other, 'QA Receiver');
    await stopAutomaticSharing(other);
    const receiver = await uidFor(request, receiverEmail);
    const receiving = await anonymousContext.newPage();
    await receiving.goto(link);
    await expect(receiving.getByRole('heading', { name: 'QA Sender', exact: true })).toBeVisible();
    await expect(receiving).toHaveURL(/\/invite$/);
    await receiving.getByRole('button', { name: 'Use email', exact: true }).click();
    await receiving.getByLabel('Email', { exact: true }).fill(receiverEmail);
    await receiving.locator('.auth-panel input[name="password"]').fill('Local-emulator-passphrase-8426');
    await receiving.getByRole('button', { name: 'Sign in with email', exact: true }).click();
    await expect(receiving.getByRole('button', { name: 'Accept invitation', exact: true })).toBeVisible();
    await expect(receiving).toHaveURL(/\/invite$/);
    await receiving.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(receiving.getByRole('heading', { name: "You're connected", exact: true })).toBeVisible();
    expect(await receiving.evaluate(() => sessionStorage.getItem('play100.invitation-return.v1'))).toBeNull();
    await page.goto('/friends');
    await expect(page.getByRole('button', { name: 'View QA Receiver', exact: true })).toBeVisible();
    await receiving.goto(`/friends/${sender}`);
    await expect(receiving.locator('.friend-ranking-list')).toBeEmpty();
    await enableSelectedSharing(page);
    await enableSelectedSharing(other);
    await receiving.goto('/compare');
    await receiving.getByLabel('QA Sender', { exact: true }).check();
    await expect(receiving.locator('.friend-matrix')).toContainText('Red Dead Redemption 2', { timeout: 30000 });
    await expect(receiving.locator('.friend-matrix')).toContainText('8.8');
    await expect(receiving.locator('.friend-matrix')).toContainText('6.8');
    await expect(receiving.locator('.friend-matrix')).toContainText('7.80');
    await receiving.getByLabel('Search games', { exact: true }).fill('Red');
    await receiving.getByLabel('Games', { exact: true }).selectOption('all-shared');
    await receiving.locator('.friend-matrix').getByRole('button', { name: 'Red Dead Redemption 2', exact: true }).click();
    await expect(receiving.getByRole('dialog')).toBeVisible();
    await receiving.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(receiving.getByRole('dialog')).toHaveCount(0);
    await expect(receiving.getByLabel('Search games', { exact: true })).toHaveValue('Red');
    await expect(receiving.getByLabel('Games', { exact: true })).toHaveValue('all-shared');
    await expect(receiving.getByLabel('QA Sender', { exact: true })).toBeChecked();
    expect(await receiving.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await receiving.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
    await receiving.screenshot({ path: testInfo.outputPath('comparison-visual.png'), fullPage: true });
    await receiving.getByLabel('Group name', { exact: true }).fill('My comparison');
    await receiving.getByRole('button', { name: 'Save group', exact: true }).click();
    await expect(receiving).toHaveURL(/\/compare\?group=[a-f0-9-]{36}$/);
    await receiving.reload();
    await expect(receiving.getByLabel('Group name', { exact: true })).toHaveValue('My comparison');
    await expect(receiving.locator('.friend-matrix')).toContainText('8.8', { timeout: 30000 });
    await page.goto('/friends');
    const row = page.locator('.friend-list > li').filter({ hasText: 'QA Receiver' });
    await row.getByRole('button', { name: 'More actions for QA Receiver', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Remove friend', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove friend', exact: true }).click();
    await expect(receiving.locator('.friend-matrix')).toHaveCount(0, { timeout: 15000 });
    await expect(receiving.getByRole('status').filter({ hasText: 'removed from this comparison' })).toBeVisible();
    await receiving.goto(`/friends/${sender}`);
    await expect(receiving.locator('.friend-ranking-list')).toBeEmpty();
    expect((await readLibrary(receiving)).records).toEqual({});
    expect(receiver).not.toBe(sender);
  } finally { await context.close(); await anonymousContext.close(); }
});

test('revoked invites show no inviter snapshot and a cancelled sharing preview does not enable sharing', async ({ page, browser, request }) => {
  const email = emailFor('invite-revoke');
  await page.goto('/?game=red-dead-redemption-2'); await seedGuestRating(page, '9');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page);
  await chooseName(page, 'QA Invite Owner');
  await stopAutomaticSharing(page);
  const link = await inviteFrom(page);
  await page.getByRole('button', { name: 'Invite links', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke invitation', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Invitation revoked.' })).toBeVisible();
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const visitor = await context.newPage();
    await visitor.goto(link);
    await expect(visitor.getByRole('heading', { name: 'Invitation unavailable', exact: true })).toBeVisible();
    await expect(visitor.getByRole('heading', { name: 'QA Invite Owner', exact: true })).toHaveCount(0);
  } finally { await context.close(); }
  await page.goto('/friends/sharing');
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Preview friends sharing', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Off$/ })).toBeVisible();
});

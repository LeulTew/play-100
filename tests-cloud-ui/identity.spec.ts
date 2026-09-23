import { expect, test } from '@playwright/test';
import { createAccount, emailFor, enableSync, readAccount, signIn, uidFor, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('a cross-tab identity change flushes the old account draft without exposing it to the next account', async ({ page, context, request }) => {
  const firstEmail = emailFor('scope-a');
  const nextEmail = emailFor('scope-b');
  const title = `Private A ${crypto.randomUUID().slice(0, 8)}`;
  await createAccount(page, firstEmail); await verifyEmail(page, request, firstEmail); await enableSync(page, 'empty');
  const firstUid = await uidFor(request, firstEmail);
  await page.goto('/my-library');
  await page.locator('.manual-add summary').click();
  await page.getByLabel('Game title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Add to my library', exact: true }).click();
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('dialog').getByRole('spinbutton').fill('5');
  await page.getByRole('dialog').getByRole('spinbutton').press('Tab');
  await expect.poll(async () => (await readAccount(page, firstUid)).sync.dirty, { timeout: 30000 }).toBe(false);
  const peer = await context.newPage();
  try {
    await peer.goto('/account');
    await expect(peer.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.clock.install({ time: new Date('2026-09-14T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-14T12:00:10Z'));
    await page.getByRole('dialog').getByRole('spinbutton').fill('8.3');
    await peer.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(peer).toHaveURL(/\/$/);
    await expect.poll(async () => (await readAccount(page, firstUid)).state.ranking[0]?.score).toBe(8.3);
    await expect(page.locator('body')).not.toContainText(title);
    expect((await readLibrary(page)).records).toEqual({});
    await page.clock.resume();
    await createAccount(peer, nextEmail); await verifyEmail(peer, request, nextEmail); await enableSync(peer, 'empty');
    const nextUid = await uidFor(request, nextEmail);
    expect((await readAccount(peer, nextUid)).state.records).toEqual({});
    await expect(peer.locator('body')).not.toContainText(title);
    await peer.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(peer).toHaveURL(/\/$/);
    await signIn(peer, firstEmail);
    await peer.goto('/my-rankings');
    await expect(peer.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true })).toHaveValue('8.3');
    expect((await readAccount(peer, nextUid)).state.records).toEqual({});
  } finally { await peer.close(); }
});

test('Google stays in the same tab even if windows are blocked, and browser Back cancels without changing the guest', async ({ page, context }) => {
  await page.addInitScript(() => { window.open = () => null; });
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
});

import { expect, test } from '@playwright/test';
import { createAccount, emailFor, enableSync, expectRestoredSync, readAccount, seedGuestRating, signIn, uidFor, verifyEmail } from './helpers';

const id = 'red-dead-redemption-2';
const title = 'Red Dead Redemption 2';
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('offline edits survive a newer online head and conflict replacement is bound to the reviewed revision', async ({ page, context, browser, request, isMobile, viewport }) => {
  const email = emailFor('conflict');
  await page.goto(`/?game=${id}`);
  await seedGuestRating(page, '5');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page);
  const uid = await uidFor(request, email);
  const peerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
  try {
    const peer = await peerContext.newPage();
    await signIn(peer, email); await expectRestoredSync(peer); await peer.goto('/my-rankings');
    await page.goto('/my-rankings');
    await expect(page.getByRole('spinbutton', { name: `Your rating for ${title}`, exact: true })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: `Your rating for ${title}`, exact: true })).toBeEnabled();
    await context.setOffline(true);
    await page.getByRole('spinbutton', { name: `Your rating for ${title}`, exact: true }).fill('6');
    await page.getByRole('spinbutton').press('Tab');
    await expect.poll(async () => (await readAccount(page, uid)).state.ranking[0]?.score).toBe(6);
    await peer.getByRole('spinbutton', { name: `Your rating for ${title}`, exact: true }).fill('9');
    await peer.getByRole('spinbutton').press('Tab');
    await expect.poll(async () => (await readAccount(peer, uid)).sync.dirty, { timeout: 30000 }).toBe(false);
    await context.setOffline(false);
    await page.locator('.account-nav').click();
    await expect(page.locator('.sync-state')).toHaveText('Needs a choice');
    expect((await readAccount(page, uid)).state.ranking[0]?.score).toBe(6);
    await page.getByRole('button', { name: 'Use online copy', exact: true }).click();
    await peer.getByRole('spinbutton').fill('9.5'); await peer.getByRole('spinbutton').press('Tab');
    await expect.poll(async () => (await readAccount(peer, uid)).sync.dirty, { timeout: 30000 }).toBe(false);
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm this choice', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed again');
    expect((await readAccount(page, uid)).state.ranking[0]?.score).toBe(6);
    await page.getByRole('dialog').getByRole('button', { name: 'Keep my data', exact: true }).click();
    await page.getByRole('button', { name: 'Use online copy', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm this choice', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const chosen = await readAccount(page, uid);
    expect(chosen.state.ranking[0]?.score).toBe(9.5);
    expect(chosen.recovery?.state.ranking[0]?.score).toBe(6);
  } finally { await context.setOffline(false); await peerContext.close(); }
});

test('finishing upload N cannot show Saved online while a newer edit remains pending', async ({ page, request }) => {
  const email = emailFor('pending-status');
  await page.goto(`/?game=${id}`);
  await seedGuestRating(page, '5');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page);
  const uid = await uidFor(request, email);
  const originalRevision = (await readAccount(page, uid)).sync.baseRemoteRevision;
  await page.goto('/my-rankings');
  const releases: Array<() => void> = [];
  let delayed = 0;
  await page.route('**/documents:commit*', async (route) => {
    const body = route.request().postDataJSON() as { writes?: Array<{ update?: { name?: string } }> };
    const writesHead = body.writes?.some((write) => write.update?.name?.endsWith(`/syncHeads/${uid}`));
    if (writesHead && delayed < 2) {
      delayed += 1;
      await new Promise<void>((resolve) => { releases.push(resolve); });
    }
    await route.continue();
  });
  try {
    await page.getByRole('spinbutton').fill('6'); await page.getByRole('spinbutton').press('Tab');
    await expect.poll(() => delayed, { timeout: 30000 }).toBe(1);
    await page.getByRole('spinbutton').fill('7'); await page.getByRole('spinbutton').press('Tab');
    await expect.poll(async () => (await readAccount(page, uid)).state.ranking[0]?.score).toBe(7);
    releases.shift()?.();
    await expect.poll(async () => (await readAccount(page, uid)).sync.baseRemoteRevision).toBeGreaterThan(originalRevision);
    expect((await readAccount(page, uid)).sync.dirty).toBe(true);
    await expect(page.locator('.account-nav')).not.toHaveAccessibleName(/Saved online/);
    await expect.poll(() => delayed, { timeout: 30000 }).toBe(2);
    await expect(page.locator('.account-nav')).not.toHaveAccessibleName(/Saved online/);
    releases.shift()?.();
    await expect.poll(async () => (await readAccount(page, uid)).sync.dirty, { timeout: 30000 }).toBe(false);
    await expect(page.locator('.account-nav')).toHaveAccessibleName(/Saved online/);
  } finally { releases.forEach((release) => release()); await page.unroute('**/documents:commit*'); }
});

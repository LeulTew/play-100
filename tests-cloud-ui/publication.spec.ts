import { expect, test } from '@playwright/test';
import {
  createAccount,
  emailFor,
  enableSync,
  expectRestoredSync,
  readAccount,
  seedGuestRating,
  signIn,
  uidFor,
  verifyEmail,
} from './helpers';
import { readLibrary } from '../tests/library-helpers';

const title = 'Red Dead Redemption 2';
const id = 'red-dead-redemption-2';
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('an explicitly published snapshot stays frozen, keeps private fields out, and can be safely saved by a guest', async ({
  page,
  browser,
  request,
  isMobile,
  viewport,
}) => {
  const email = emailFor('publication');
  const handle = `qa_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await page.goto(`/?game=${id}`);
  await seedGuestRating(page, '8.2');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await enableSync(page);
  const uid = await uidFor(request, email);
  await page.goto('/my-rankings');
  await page.locator('.ranking-note summary').click();
  await page
    .getByLabel(`Your note for ${title}`, { exact: true })
    .fill('PRIVATE ONLY: never publish this note or queue.');
  await page.getByLabel(`Your note for ${title}`, { exact: true }).press('Tab');
  await expect.poll(async () => (await readAccount(page, uid)).sync.dirty, { timeout: 30000 }).toBe(false);
  await page.getByRole('button', { name: 'Publish a ranking', exact: true }).click();
  await page.getByLabel('Public name', { exact: true }).fill('QA published nickname');
  await page.locator('input[name="public-handle"]').fill(handle);
  await expect(page.getByRole('checkbox', { name: 'Show in Community', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Preview public snapshot', exact: true }).click();
  const preview = page.getByRole('dialog');
  await expect(preview).toContainText('8.2');
  await expect(preview).not.toContainText('PRIVATE ONLY');
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', viewport, isMobile, hasTouch: isMobile });
  try {
    const peer = await other.newPage();
    await signIn(peer, email);
    await expectRestoredSync(peer);
    await peer.goto('/my-rankings');
    await peer.getByRole('spinbutton').fill('9.4');
    await peer.getByRole('spinbutton').press('Tab');
    await expect.poll(async () => (await readAccount(peer, uid)).sync.dirty, { timeout: 30000 }).toBe(false);
    await expect.poll(async () => (await readAccount(page, uid)).state.ranking[0]?.score, { timeout: 30000 }).toBe(9.4);
    await expect(preview.locator('.publication-preview-list')).toContainText('8.2');
    await expect(preview.locator('.publication-preview-list')).not.toContainText('9.4');
    await preview.getByRole('checkbox', { name: 'I want this selected snapshot to be public.', exact: true }).check();
    await preview.getByRole('button', { name: 'Publish this ranking', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${handle}$`));
    const score = page.locator('.public-score');
    await expect(score.locator('[aria-hidden="true"]')).toHaveText('8.2 / 10');
    await expect(score.locator('.sr-only')).toHaveText('Publisher rating 8.2 out of 10');
    await expect(score).not.toHaveAttribute('aria-label');
    await expect(page.locator('.public-profile-page')).not.toContainText(email);
    await expect(page.locator('.public-profile-page')).not.toContainText('PRIVATE ONLY');
  } finally {
    await other.close();
  }
  const visitor = await browser.newContext({
    baseURL: 'http://127.0.0.1:4187',
    viewport,
    isMobile,
    hasTouch: isMobile,
  });
  try {
    const guest = await visitor.newPage();
    await guest.goto(`/u/${handle}`);
    await guest.getByRole('button', { name: `Save for later: ${title}`, exact: true }).click();
    await expect.poll(async () => (await readLibrary(guest)).queueOrder).toEqual([id]);
    expect((await readLibrary(guest)).ranking).toEqual([]);
    expect((await readLibrary(guest)).progress[id]?.played).toBe(false);
    await guest.goto(`/community?q=${handle}`);
    await expect(guest.getByRole('heading', { name: 'No matching handles', exact: true })).toBeVisible();
  } finally {
    await visitor.close();
  }
});

test('a fresh unverified mistyped registration can be cancelled without touching its guest library', async ({
  page,
  request,
}) => {
  const email = emailFor('mistyped-unused');
  await page.goto('/');
  await page.locator(`[data-game="${id}"] .save-game`).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([id]);
  const before = await readLibrary(page);
  await createAccount(page, email);
  await page.locator('.account-danger summary').click();
  await page.getByRole('button', { name: 'Delete unused registration', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill('Local-emulator-passphrase-8426');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await readLibrary(page)).toEqual(before);
  const lookup = await request.post(
    'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-play100-key',
    {
      headers: { Authorization: 'Bearer owner' },
      data: { email: [email] },
    },
  );
  const result = (await lookup.json()) as { users?: unknown[] };
  expect(result.users ?? []).toEqual([]);
});

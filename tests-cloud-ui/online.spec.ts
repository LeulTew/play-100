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
  verifyByEmailReturn,
  verifyEmail,
} from './helpers';
import { readLibrary } from '../tests/library-helpers';

const game = { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2' };
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('verified opt-in copies a guest library and a second browser loads the account without touching either guest', async ({
  page,
  browser,
  request,
  isMobile,
  viewport,
}) => {
  const email = emailFor('two-device');
  await page.goto(`/?game=${game.id}`);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true }).fill('8.4');
  await dialog.getByRole('spinbutton').press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(8.4);
  await dialog.getByRole('button', { name: 'Play later', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([game.id]);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const originalGuest = await readLibrary(page);
  await createAccount(page, email);
  const uid = await uidFor(request, email);
  expect((await readAccount(page, uid)).state.ranking).toEqual([]);
  await verifyEmail(page, request, email);
  expect((await readAccount(page, uid)).sync.enabled).toBe(false);
  await enableSync(page);
  expect((await readAccount(page, uid)).state.ranking[0]?.score).toBe(8.4);
  expect(await readLibrary(page)).toEqual(originalGuest);
  const second = await browser.newContext({
    baseURL: 'http://127.0.0.1:4187',
    viewport,
    isMobile,
    hasTouch: isMobile,
    reducedMotion: 'reduce',
  });
  try {
    const peer = await second.newPage();
    await signIn(peer, email);
    await expectRestoredSync(peer);
    expect((await readAccount(peer, uid)).state.ranking[0]?.score).toBe(8.4);
    expect((await readLibrary(peer)).ranking).toEqual([]);
    await peer.goto('/my-rankings');
    await peer.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true }).fill('9.1');
    await expect.poll(async () => (await readAccount(peer, uid)).state.ranking[0]?.score).toBe(9.1);
    await expect.poll(async () => (await readAccount(page, uid)).state.ranking[0]?.score, { timeout: 30000 }).toBe(9.1);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await readLibrary(page)).toEqual(originalGuest);
    await page.goto('/my-rankings');
    await expect(page.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true })).toHaveValue(
      '8.4',
    );
  } finally {
    await second.close();
  }
});

test('guest browsing does not load Firebase and closing the sign-in sheet leaves device mode intact', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/OnlineController|googleapis|firebase|:9199|:8188/.test(request.url())) requests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  expect(requests).toEqual([]);
  await page.locator('.account-nav').click();
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep using this device', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await readLibrary(page)).records).toEqual({});
});

test('verification-email return refreshes signed claims before immediate online consent', async ({ page, request }) => {
  const email = emailFor('email-return');
  await createAccount(page, email);
  await verifyByEmailReturn(page, request, email);
  await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  expect((await readAccount(page, uid)).sync.dirty).toBe(false);
  await expect(page.locator('.inline-error')).toHaveCount(0);
});

test('an active prior-consented account restores on a new device without another enable click', async ({
  page,
  browser,
  request,
  isMobile,
  viewport,
}) => {
  const email = emailFor('hydrate');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await page.getByLabel('Name', { exact: true }).fill('Hydrated account name');
  await enableSync(page, 'empty');
  const second = await browser.newContext({
    baseURL: 'http://127.0.0.1:4187',
    viewport,
    isMobile,
    hasTouch: isMobile,
    reducedMotion: 'reduce',
  });
  try {
    const peer = await second.newPage();
    await signIn(peer, email);
    await expectRestoredSync(peer);
    await expect(peer.getByLabel('Name', { exact: true })).toHaveValue('Hydrated account name');
    await expect(peer.locator('input[name="connection-copy"]')).toHaveCount(0);
  } finally {
    await second.close();
  }
});

test('remembered-account restoration never exposes an editable guest fallback while the SDK is loading', async ({
  page,
  request,
}) => {
  const email = emailFor('slow-restore');
  await page.goto(`/?game=${game.id}`);
  await seedGuestRating(page, '5');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await enableSync(page);
  const uid = await uidFor(request, email);
  let release: (() => void) | undefined;
  let intercepted = false;
  // The cloud-UI server is the cloud-test development server; also accept a built chunk.
  const onlineModule = /\/(?:src\/cloud\/OnlineController\.tsx|assets\/OnlineController-[^/]+\.js)(?:\?|$)/;
  await page.route(onlineModule, async (route) => {
    intercepted = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue();
  });
  try {
    await page.goto('/my-rankings', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.getByRole('spinbutton')).toHaveCount(0);
    const waiting = page.locator('.route-fallback:visible');
    await expect(waiting).toHaveCount(1);
    await expect(waiting.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
    await expect(waiting.getByRole('status')).toHaveText(
      'Opening your guest or account library before allowing edits.',
    );
    expect((await readLibrary(page)).ranking[0]?.score).toBe(5);
    release?.();
    await expect(page.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true })).toHaveValue(
      '5',
    );
    await page.getByRole('spinbutton').fill('6.3');
    await page.getByRole('spinbutton').press('Tab');
    await expect.poll(async () => (await readAccount(page, uid)).state.ranking[0]?.score).toBe(6.3);
    expect((await readLibrary(page)).ranking[0]?.score).toBe(5);
  } finally {
    release?.();
    await page.unroute(onlineModule);
  }
});

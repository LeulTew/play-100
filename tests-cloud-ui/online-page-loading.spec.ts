import { expect, test } from '@playwright/test';
import { createAccount, emailFor, firestoreOrigin, readAccount, uidFor, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';
import { onlineModuleRequest, onlinePageRoots } from '../tests/online-module-helpers';

const controllerModule = onlineModuleRequest('src/cloud/OnlineController.tsx');
const pickerModule = onlineModuleRequest('src/components/avatar/AvatarPicker.tsx');
const routes = [
  { root: 'AuthPanel', path: '/account', selector: '.auth-panel', signedIn: false },
  { root: 'AccountPage', path: '/account', selector: '.account-page', signedIn: true },
  { root: 'CommunityPage', path: '/community', selector: '.community-page', signedIn: false },
  {
    root: 'PublicProfilePage',
    path: '/u/online_split_missing',
    heading: 'This ranking is not available.',
    signedIn: false,
  },
  { root: 'PublishPage', path: '/publish', selector: '.publish-page', signedIn: true },
  { root: 'CreatorPage', path: '/creator', heading: 'Creator access only.', signedIn: true },
  { root: 'FriendsPage', path: '/friends', selector: '.friends-page', signedIn: true },
  { root: 'FriendDetailPage', path: '/friends/online-split-missing', selector: '.friend-detail-page', signedIn: true },
  { root: 'InvitationPage', path: '/invite', selector: '.invitation-page', signedIn: false },
  { root: 'FriendComparisonPage', path: '/compare', selector: '.friend-compare-page', signedIn: true },
  { root: 'FriendSharingPage', path: '/friends/sharing', selector: '.friends-sharing-page', signedIn: true },
  { root: 'FriendShelfPage', path: '/friends/sharing/games', selector: '.friend-shelf-editor', signedIn: true },
  { root: 'FriendSharedGames', path: '/friends/online-split-missing', selector: '.friend-shelf-cards', signedIn: true },
] as const;

test.beforeEach(async ({ page, context, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
    throw new Error('Online page loading checks require the owned local cloud-test server.');
  const origin = new URL(baseURL);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || ![origin.port, '9199', '8188'].includes(url.port))
      return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ status: 503, json: { error: 'Synthetic unavailable provider.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('a remembered account restores on collection without requesting page bodies; Account loads only on entry', async ({
  page,
  request,
}) => {
  const email = emailFor('online-split-restored');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  const uid = await uidFor(request, email);
  const before = await readAccount(page, uid);
  expect(await page.evaluate(() => localStorage.getItem('play100.online-requested.v1'))).toBe('yes');
  const requested = new Set<string>();
  let bridgeRequested = false;
  page.on('request', (request) => {
    if (controllerModule.test(request.url())) bridgeRequested = true;
    for (const root of onlinePageRoots) if (onlineModuleRequest(root).test(request.url())) requested.add(root);
  });
  await page.goto('/?catalogs=off');
  await expect.poll(() => bridgeRequested).toBe(true);
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expect(page.locator('.game-card .save-game').first()).toBeEnabled();
  await expect(page.locator('.account-nav img')).toBeVisible();
  expect([...requested]).toEqual([]);
  expect((await readAccount(page, uid)).state).toEqual(before.state);
  await page.locator('.account-nav').click();
  await expect(page.locator('.account-page')).toBeVisible();
  expect([...requested]).toEqual(['src/cloud/AccountPage.tsx']);
  await page.getByRole('button', { name: 'Change icon', exact: true }).click();
  await expect(page.locator('.avatar-picker')).toBeVisible();
  expect([...requested].sort()).toEqual(['src/cloud/AccountPage.tsx', 'src/components/avatar/AvatarPicker.tsx']);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

for (const routeCase of routes) {
  test(`${routeCase.root} loads only for its route and recovers a failed module without discarding the library`, async ({
    page,
    request,
  }) => {
    await page.goto('/?catalogs=off');
    await page.locator('[data-game="red-dead-redemption-2"] .save-game').click();
    await expect.poll(async () => (await readLibrary(page)).queueOrder).toContain('red-dead-redemption-2');
    let uid: string | null = null;
    if (routeCase.signedIn) {
      const email = emailFor(`online-split-${routeCase.root.toLowerCase()}`);
      await createAccount(page, email);
      await verifyEmail(page, request, email);
      uid = await uidFor(request, email);
    }
    const before = await readLibrary(page);
    const accountBefore = uid ? (await readAccount(page, uid)).state : null;
    const bodies = new Set<string>();
    page.on('request', (request) => {
      for (const root of onlinePageRoots) if (onlineModuleRequest(root).test(request.url())) bodies.add(root);
    });
    let requests = 0;
    await page.route(onlineModuleRequest(`src/cloud/${routeCase.root}.tsx`), (route) =>
      ++requests === 1 ? route.abort('failed') : route.continue(),
    );
    await page.goto(routeCase.path);
    const failure = page.getByRole('alert').filter({ hasText: "This online page didn't load." });
    await expect(failure).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload this page', exact: true })).toBeVisible();
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(page.getByText("Online tools couldn't open.", { exact: true })).toHaveCount(0);
    expect(await readLibrary(page)).toEqual(before);
    if (uid) expect((await readAccount(page, uid)).state).toEqual(accountBefore);
    expect(requests).toBe(1);
    let headRequests = 0;
    await page.route('**/*', (route) => {
      if (route.request().method() !== 'HEAD') return route.fallback();
      headRequests += 1;
      return route.fulfill({ status: headRequests === 1 ? 503 : 200 });
    });
    const retainedUrl = page.url();
    await page.getByRole('button', { name: 'Reload this page', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: "Play 100 didn't respond." })).toBeVisible();
    expect(page.url()).toBe(retainedUrl);
    expect(requests).toBe(1);
    await Promise.all([
      page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame()),
      page.getByRole('button', { name: 'Reload this page', exact: true }).click(),
    ]);
    if ('selector' in routeCase) await expect(page.locator(routeCase.selector)).toBeVisible();
    else await expect(page.getByRole('heading', { name: routeCase.heading, exact: true })).toBeVisible();
    await expect(failure).toHaveCount(0);
    expect(page.url()).toBe(retainedUrl);
    expect(requests).toBe(2);
    const expectedBodies =
      routeCase.root === 'FriendDetailPage' || routeCase.root === 'FriendSharedGames'
        ? ['src/cloud/FriendDetailPage.tsx', 'src/cloud/FriendSharedGames.tsx']
        : [`src/cloud/${routeCase.root}.tsx`];
    expect([...bodies].sort()).toEqual(expectedBodies.sort());
    expect(await readLibrary(page)).toEqual(before);
    if (uid) expect((await readAccount(page, uid)).state).toEqual(accountBefore);
  });
}

test('a delayed page body cannot mount its old account scope after cross-tab sign-out', async ({
  page,
  context,
  request,
}) => {
  const email = emailFor('online-split-scope');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  const uid = await uidFor(request, email);
  const before = (await readAccount(page, uid)).state;
  const peer = await context.newPage();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(onlineModuleRequest('src/cloud/PublishPage.tsx'), async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await peer.goto('/account');
    await expect(peer.locator('.account-page')).toBeVisible();
    await page.goto('/publish', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('.route-fallback')).toBeVisible();
    await peer.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('.auth-panel')).toBeVisible();
    const arrived = page.waitForResponse(onlineModuleRequest('src/cloud/PublishPage.tsx'));
    release();
    await (await arrived).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await expect(page.locator('.publish-page')).toHaveCount(0);
    expect((await readAccount(page, uid)).state).toEqual(before);
    await expect(page.locator('body')).not.toContainText(email);
  } finally {
    release();
    await peer.close();
  }
});

test('a page failure leaves the identity bridge mounted and another online page can open without reload', async ({
  page,
  request,
}) => {
  const email = emailFor('online-split-boundary');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await page.route(onlineModuleRequest('src/cloud/FriendsPage.tsx'), (route) => route.abort('failed'));
  await page.goto('/friends');
  await expect(page.getByRole('alert').filter({ hasText: "This online page didn't load." })).toBeVisible();
  await expect(page.locator('.account-nav img')).toBeVisible();
  await page.locator('.account-nav').click();
  await expect(page.locator('.account-heading')).toContainText(email);
  await expect(page.getByRole('alert').filter({ hasText: "This online page didn't load." })).toHaveCount(0);
});

test('the optional picker can fail and close natively, then load after a guarded reload without changing the avatar', async ({
  page,
  request,
}) => {
  const email = emailFor('online-split-picker');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  const uid = await uidFor(request, email);
  // A saved icon lives on the member document; an account without one shows a fresh random default on each load.
  const savedIcon = async () => {
    const response = await request.get(
      `${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/members/${uid}`,
      { headers: { Authorization: 'Bearer owner' } },
    );
    return response.ok() ? JSON.stringify((await response.json()).fields?.avatar ?? null) : response.status();
  };
  const iconBefore = await savedIcon();
  let requests = 0;
  await page.route(pickerModule, (route) => (++requests === 1 ? route.abort('failed') : route.continue()));
  const avatarBefore = await page.locator('.account-avatar img').getAttribute('src');
  await page.getByRole('button', { name: 'Change icon', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveText("The creature picker didn't load.");
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change icon', exact: true })).toBeFocused();
  expect(await page.locator('.account-avatar img').getAttribute('src')).toBe(avatarBefore);
  await page.getByRole('button', { name: 'Change icon', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText("The creature picker didn't load.");
  expect(requests).toBe(1);
  await page.route('**/*', (route) =>
    route.request().method() === 'HEAD' ? route.fulfill({ status: 200 }) : route.fallback(),
  );
  await Promise.all([
    page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame()),
    dialog.getByRole('button', { name: 'Reload this page', exact: true }).click(),
  ]);
  await expect(page.locator('.account-page')).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(requests).toBe(1);
  const shownAfterReload = await page.locator('.account-avatar img').getAttribute('src');
  await page.getByRole('button', { name: 'Change icon', exact: true }).click();
  await expect(page.locator('.avatar-picker')).toBeVisible();
  expect(requests).toBe(2);
  expect(await page.locator('.account-avatar img').getAttribute('src')).toBe(shownAfterReload);
  expect(await savedIcon()).toEqual(iconBefore);
});

test('a cancelled cold sign-in sheet never reopens when its AuthPanel module arrives', async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(onlineModuleRequest('src/cloud/AuthPanel.tsx'), async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/?catalogs=off');
    await page.locator('.account-nav').click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Loading sign-in…');
    await page.keyboard.press('Escape');
    const arrived = page.waitForResponse(onlineModuleRequest('src/cloud/AuthPanel.tsx'));
    release();
    await (await arrived).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('.account-nav')).toBeFocused();
    await page.locator('.account-nav').click();
    await expect(page.getByRole('dialog').locator('.auth-panel')).toBeVisible();
  } finally {
    release();
  }
});

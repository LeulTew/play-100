import { expect, test } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { createAccount, emailFor, enableSync, googleRedirect, password, uidFor, verifyEmail } from './helpers';
import { routeGoogleProvider } from './google-provider-fixture';
import { DB_NAME, DB_VERSION } from '../src/lib/personal-db';

// Signs out an account that can compare, then, as the device, pins two games on The 100 and chooses Compare. The tray
// is a count chip whose sheet holds the Compare action, Choose friends; the Table view (`table`) keeps its strip with
// the action itself. With `from`, it opens that page first and reaches The 100 through the site navigation, so `from`
// stays in this document's history.
async function compareSignedOut(
  page: Page,
  { from, table = false }: { from?: { path: string; isMobile: boolean }; table?: boolean } = {},
) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(from?.path ?? (table ? '/?view=table&catalogs=off' : '/?catalogs=off'));
  if (from) {
    await page
      .getByRole('navigation', { name: from.isMobile ? 'Mobile navigation' : 'Main navigation', exact: true })
      .getByRole('link', { name: 'The 100', exact: true })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
  }
  const games = table ? page.locator('.ratings-table') : page;
  const titles: string[] = [];
  for (let index = 0; index < 2; index += 1) {
    const pin = games
      .getByRole('button', { name: /^Pin for comparison: / })
      .and(page.locator('[aria-pressed="false"]'))
      .first();
    const title = ((await pin.getAttribute('aria-label')) ?? '').replace('Pin for comparison: ', '');
    await pin.click();
    await expect(games.getByRole('button', { name: `Pin for comparison: ${title}`, exact: true })).toBeVisible();
    titles.push(title);
  }
  if (table) await page.getByRole('button', { name: 'Compare rankings with friends', exact: true }).click();
  else {
    await page.getByRole('button', { name: '2 games in Compare tray', exact: true }).click();
    const tray = page.getByRole('dialog', { name: 'Compare tray', exact: true });
    await tray.getByRole('button', { name: 'Choose friends', exact: true }).click();
    await expect(tray).toHaveCount(0);
  }
  const sheet = page.getByRole('dialog', { name: 'Sign in', exact: true });
  await expect(sheet.locator('.auth-purpose')).toContainText(
    'Sign in to compare your 2 pinned games with friends. Pins select games for comparison; they do not share your library.',
  );
  // The sheet keeps the page it opened over.
  await expect(page).toHaveURL((url) => url.pathname === '/');
  return { sheet, titles };
}

// After sign-in the comparison continues on Compare with the device's pins as its game filter, and the account's own
// tray has not adopted them.
async function expectContinued(page: Page, request: APIRequestContext, email: string, titles: string[]) {
  await expect(page).toHaveURL((url) => url.pathname === '/compare');
  const chosen = page.getByRole('region', { name: 'Games chosen for comparison', exact: true });
  await expect(chosen).toContainText('2 games from your tray');
  for (const title of titles) await expect(chosen.getByRole('button', { name: title, exact: true })).toBeVisible();
  const uid = await uidFor(request, email);
  const trays = await page.evaluate(
    (uid) => ({
      device: JSON.parse(localStorage.getItem('play100:compare-tray:v1:guest') ?? 'null')?.items?.length ?? 0,
      account: localStorage.getItem(`play100:compare-tray:v1:account:demo-play100:${uid}`),
    }),
    uid,
  );
  expect(trays).toEqual({ device: 2, account: null });
}

// Fills a sign-in sheet's email form and returns its submit button.
async function fillEmailSignIn(sheet: Locator, email: string) {
  await sheet.getByRole('button', { name: 'Use email', exact: true }).click();
  await sheet.getByLabel('Email', { exact: true }).fill(email);
  await sheet.locator('input[name="password"]').fill(password);
  return sheet.getByRole('button', { name: 'Sign in with email', exact: true });
}

// Holds the device's libraries, so an account that signs in stays "Opening account…" until the release. They share one
// object store, and a read-write transaction on it, kept open by back-to-back reads, makes every later one wait.
async function holdDeviceLibraries(page: Page) {
  await page.evaluate(
    ({ name, version }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name, version);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction('library', 'readwrite');
          transaction.oncomplete = () => database.close();
          const store = transaction.objectStore('library');
          Reflect.set(window, 'libraryHold', true);
          const read = () => {
            if (Reflect.get(window, 'libraryHold')) store.get('library-hold').onsuccess = read;
          };
          read();
          resolve();
        };
      }),
    { name: DB_NAME, version: DB_VERSION },
  );
  return () => page.evaluate(() => Reflect.set(window, 'libraryHold', false));
}

test('signed-out Compare explains friends rankings before authentication and preserves the device-only exit', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/compare?catalogs=off');
  // The page's heading names it as its tab title does; its purpose explains it before the sign-in choices.
  await expect(page.getByRole('heading', { name: 'Compare rankings', level: 1, exact: true })).toBeVisible();
  const purpose = page.getByRole('heading', { name: "Compare friends' rankings", exact: true });
  await expect(purpose).toBeVisible();
  await expect(page.locator('.auth-purpose')).toContainText('Sign in to compare rankings shared by your friends.');
  await expect(page.locator('.auth-purpose')).toContainText(
    'Pins select games for comparison; they do not share your library.',
  );
  const order = await page.locator('.auth-panel').evaluate((element) => {
    const purpose = element.querySelector('.auth-purpose')!;
    const provider = element.querySelector('.google-signin')!;
    return Boolean(purpose.compareDocumentPosition(provider) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
  await page.getByRole('button', { name: 'Keep using this device', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await page.goto('/account?catalogs=off');
  // Account explains its own purpose, never Compare's.
  await expect(page.getByRole('heading', { name: 'Account', level: 1, exact: true })).toBeVisible();
  await expect(page.locator('.auth-purpose')).toHaveText(
    'Sign in to save your games and rankings online and use them on your other devices. Your library stays on this device until you turn on online saving.',
  );
  await expect(page.getByRole('heading', { name: "Compare friends' rankings", exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
});

for (const table of [false, true]) {
  test(`a Compare tray sign-in names its pins and continues to Compare with them after email sign-in${table ? ', from the Table strip' : ''}`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const email = emailFor(table ? 'compare-table' : 'compare-continue');
    await createAccount(page, email);
    await verifyEmail(page, request, email);
    await enableSync(page, 'empty');
    const { sheet, titles } = await compareSignedOut(page, { table });
    await (await fillEmailSignIn(sheet, email)).click();
    await expectContinued(page, request, email, titles);
  });
}

test('a Compare tray sign-in does not continue once Back leaves its page while the account is opening', async ({
  page,
  request,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = emailFor('compare-leave');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await enableSync(page, 'empty');
  const { sheet } = await compareSignedOut(page, { from: { path: '/discover?catalogs=off', isMobile } });
  const submit = await fillEmailSignIn(sheet, email);
  const release = await holdDeviceLibraries(page);
  try {
    await submit.click();
    // Named for the signed-in account, so the sign-in has handed the comparison off before Back.
    await expect(page.locator('.account-nav')).toHaveAccessibleName(/^Account for .+ Opening account…$/);
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === '/discover');
  } finally {
    await release();
  }
  await expect(page.locator('.account-nav')).not.toHaveAccessibleName(/Opening account/);
  // Whatever the account's arrival started has run: a task after the next frame, then the comparison tools that a
  // continued comparison loads first. The loads coalesce, so its next step is queued ahead of this one's.
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const load = async (source: string) => import(source);
    const tools: typeof import('../src/lib/app-tool-preload') = await load('/src/lib/app-tool-preload.ts');
    await tools.loadComparisonTools();
  });
  // The account opened on the page Back chose. No comparison opened or took the pins as its filter; they stay pinned.
  await expect(page).toHaveURL((url) => url.pathname === '/discover');
  const after = await page.evaluate(() => ({
    filter: sessionStorage.getItem('play100.comparison-games.v1'),
    device: JSON.parse(localStorage.getItem('play100:compare-tray:v1:guest') ?? 'null')?.items?.length ?? 0,
  }));
  expect(after).toEqual({ filter: null, device: 2 });
});

test('a cancelled Google return reopens the Compare sheet once, and signing in from it uses it up', async ({
  page,
  context,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const google = await routeGoogleProvider(context);
  const email = emailFor('compare-cancel');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await enableSync(page, 'empty');
  const { sheet, titles } = await compareSignedOut(page);
  await sheet.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await page.waitForURL(/127\.0\.0\.1:9199/, { timeout: 20000 });
  await page.goBack();
  // The return reopens the tray's sheet over the page it left, with its purpose and pins.
  const reopened = page.getByRole('dialog', { name: 'Sign in', exact: true });
  await expect(reopened.locator('.auth-purpose')).toContainText('Sign in to compare your 2 pinned games with friends.');
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await (await fillEmailSignIn(reopened, email)).click();
  await expectContinued(page, request, email, titles);
  // Signing out doesn't reopen that sheet, and the next sign-in is an ordinary one.
  await page.locator('.account-nav').click();
  await expect(page).toHaveURL((url) => url.pathname === '/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.locator('.account-nav')).toHaveAccessibleName('Account Device only');
  await expect(page.getByRole('dialog', { name: 'Sign in', exact: true })).toHaveCount(0);
  await page.locator('.account-nav').click();
  const ordinary = page.getByRole('dialog', { name: 'Sign in', exact: true });
  await expect(ordinary.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await expect(ordinary.locator('.auth-purpose')).toHaveCount(0);
  expect(google.refused).toEqual([]);
});

test('a Compare tray sign-in through Google continues to Compare with its pins when the redirect returns', async ({
  page,
  context,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const google = await routeGoogleProvider(context);
  const email = emailFor('compare-google');
  await page.goto('/account');
  await googleRedirect(
    page,
    () => page.getByRole('button', { name: 'Continue with Google', exact: true }).click(),
    email,
    true,
  );
  await expect(page.locator('.account-heading')).toContainText(email);
  await enableSync(page, 'empty');
  const { sheet, titles } = await compareSignedOut(page);
  await googleRedirect(
    page,
    () => sheet.getByRole('button', { name: 'Continue with Google', exact: true }).click(),
    email,
  );
  await expectContinued(page, request, email, titles);
  expect(google.refused).toEqual([]);
});

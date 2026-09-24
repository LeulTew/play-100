import { expect, test } from '@playwright/test';
import { authOrigin, emailFor, password } from './helpers';
import { installGuestLibrary, libraryFixture } from '../tests/library-pagination-helpers';
import { readLibrary } from '../tests/library-helpers';

test('a real emulator identity transition invalidates the guest Compare focus origin without losing guest pins', async ({
  page,
  request,
  baseURL,
}) => {
  if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1')
    throw new Error('Scope focus validation requires the owned local emulator app.');
  await page.goto('/account');
  await expect(page.locator('.emulator-note').first()).toBeVisible();
  const email = emailFor('compare-scope');
  const created = await request.post(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-play100-key`,
    {
      data: { email, password, returnSecureToken: false },
    },
  );
  expect(created.ok()).toBe(true);
  const uid: unknown = (await created.json()).localId;
  if (typeof uid !== 'string') throw new Error('The isolated identity fixture was not created.');
  await installGuestLibrary(page, libraryFixture(3));
  const before = await readLibrary(page);
  await page
    .locator('.personal-row-static')
    .first()
    .getByRole('button', { name: /^Pin for comparison: / })
    .and(page.locator('button[aria-pressed]'))
    .click();
  const pins = await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'));
  // Away from The 100 the tray is a compact chip, so Compare starts from its sheet's Choose friends action.
  const compare = page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true });
  await expect(page.locator('.compare-tray-action')).toBeHidden();
  await compare.focus();
  await page.keyboard.press('Enter');
  const choose = page
    .getByRole('dialog', { name: 'Compare tray', exact: true })
    .getByRole('button', { name: 'Choose friends', exact: true });
  await choose.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#account-signin-title')).toBeFocused();
  // The tray invocation carries its Compare purpose into the sheet even though the route is My games.
  await expect(
    page
      .getByRole('dialog', { name: 'Sign in', exact: true })
      .getByRole('region', { name: "Compare friends' rankings", exact: true }),
  ).toContainText(
    'Sign in to compare rankings shared by your friends. Pins select games for comparison; they do not share your library.',
  );
  await expect(page.locator('.account-nav')).toHaveAccessibleName('Account Device only');
  await page.evaluate(
    async (credentials) => {
      const clientPath = '/src/cloud/firebase-client.ts';
      const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
      if (client.firebaseApp.options.projectId !== 'demo-play100')
        throw new Error('Never use a production identity for a scope fixture.');
      const scopePath = '/src/lib/cloud-types.ts';
      const { accountScope }: typeof import('../src/lib/cloud-types') = await import(scopePath);
      const libraryPath = '/src/lib/scoped-library.ts';
      const scoped: typeof import('../src/lib/scoped-library') = await import(libraryPath);
      const scope = accountScope(credentials.uid, 'demo-play100');
      const current = await scoped.loadScopedLibrary(scope);
      await scoped.connectScopedLibrary(
        scope,
        current.state,
        {
          format: 1,
          epoch: 1,
          revision: 0,
          enabled: true,
          deleted: false,
          current: null,
          previous: null,
          updatedAt: Date.now(),
        },
        'Paused local scope fixture',
        false,
        {
          localRevision: current.state.revision,
          epoch: current.sync.epoch,
          enabled: current.sync.enabled,
        },
      );
      await scoped.pauseScopedLibrary(scope, 1);
      const sdkPath = performance
        .getEntriesByType('resource')
        .map((item) => item.name)
        .find((value) => new URL(value).pathname === '/node_modules/.vite/deps/firebase_auth.js');
      if (!sdkPath) throw new Error('The active local Auth SDK module is missing.');
      const sdk: typeof import('firebase/auth') = await import(sdkPath);
      await sdk.signInWithEmailAndPassword(client.cloudAuth, credentials.email, credentials.password);
    },
    { email, password, uid },
  );
  await expect(page.locator('.signin-dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No games yet', exact: true })).toBeVisible();
  await expect(page.locator('.account-nav')).toBeFocused();
  await expect(compare).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect(await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'))).toBe(pins);
  expect(await readLibrary(page)).toEqual(before);
});

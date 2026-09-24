import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectRestoredSync, readAccount, signIn } from '../tests-cloud-ui/helpers';
import { readLibrary } from './library-helpers';

const alpha = { email: process.env.PLAY100_MENU_ALPHA_EMAIL, uid: process.env.PLAY100_MENU_ALPHA_UID };
const beta = { email: process.env.PLAY100_MENU_BETA_EMAIL, uid: process.env.PLAY100_MENU_BETA_UID };
const game = { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2' };
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Menu', exact: true });
const rating = (page: Page) =>
  page.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true });

async function followMenu(page: Page, name: string) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(dialog(page).getByRole('link', { name: 'Creator desk', exact: true })).toHaveCount(0);
  await dialog(page).getByRole('link', { name, exact: true }).click();
}

test.use({ trace: 'off' });

test('Menu keeps guest, Alpha and Beta drafts in their own scopes through real emulator sign-in and sign-out', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  test.skip(
    !alpha.email || !alpha.uid || !beta.email || !beta.uid,
    'Requires two dedicated Menu emulator actors; run this file with one worker.',
  );
  const origin = new URL(baseURL!);
  expect(['localhost', '127.0.0.1']).toContain(origin.hostname);
  for (const actor of [alpha, beta]) expect(actor.email).toMatch(/^ux-menu-.*@play100\.test$/);
  expect(alpha.uid).not.toBe(beta.uid);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || ![origin.port, '9199', '8188'].includes(url.port))
      return route.abort('blockedbyclient');
    if (url.pathname === '/api/catalog')
      return route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?game=${game.id}&catalogs=off`);
  const emulator = await page.evaluate(async () => {
    const path = '/src/lib/online-availability.ts';
    const source: { EMULATOR_MODE: boolean; firebaseConfiguration: () => { projectId: string } | null } = await import(
      path
    );
    return { enabled: source.EMULATOR_MODE, project: source.firebaseConfiguration()?.projectId };
  });
  expect(emulator).toEqual({ enabled: true, project: 'demo-play100' });
  await rating(page).fill('5');
  await rating(page).press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(5);
  await page.keyboard.press('Escape');
  const guest = await readLibrary(page);
  await followMenu(page, 'Account');
  await expect(page.locator('.emulator-page-note')).toContainText('no production account');
  await signIn(page, alpha.email!);
  await expectRestoredSync(page);
  const beforeAlpha = await readAccount(page, alpha.uid!);
  expect(Object.keys(beforeAlpha.state.records)).toHaveLength(2);
  expect(await readLibrary(page)).toEqual(guest);
  await followMenu(page, 'Ranking');
  await expect(rating(page)).toHaveValue(
    String(beforeAlpha.state.ranking.find((entry) => entry.id === game.id)?.score),
  );
  await rating(page).fill('11');
  await followMenu(page, 'Discover');
  await expect(dialog(page).getByRole('alert')).toContainText('Your edit has not saved');
  await page.keyboard.press('Escape');
  await expect(rating(page)).toHaveValue('11');
  expect((await readAccount(page, alpha.uid!)).state).toEqual(beforeAlpha.state);
  const score = beforeAlpha.state.ranking.find((entry) => entry.id === game.id)?.score === 8.45 ? 8.65 : 8.45;
  await rating(page).fill(String(score));
  await followMenu(page, 'Queue');
  await expect(page).toHaveURL(/\/my-games\?tab=queue$/);
  const afterAlpha = await readAccount(page, alpha.uid!);
  expect(afterAlpha.state.ranking.find((entry) => entry.id === game.id)?.score).toBe(score);
  expect(afterAlpha.state.queueOrder).toEqual(beforeAlpha.state.queueOrder);
  expect(afterAlpha.state.progress).toEqual(beforeAlpha.state.progress);
  expect(afterAlpha.state.records).toEqual(beforeAlpha.state.records);
  expect(await readLibrary(page)).toEqual(guest);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expect(page.locator('.settings-account')).toContainText('separate account library');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
  await followMenu(page, 'Account');
  await expectRestoredSync(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Account Device only', exact: true })).toBeVisible();
  await signIn(page, beta.email!);
  await expectRestoredSync(page);
  const beforeBeta = await readAccount(page, beta.uid!);
  expect(Object.keys(beforeBeta.state.records)).toHaveLength(2);
  expect(beforeBeta.state.ranking.find((entry) => entry.id === game.id)?.score).not.toBe(score);
  await followMenu(page, 'Ranking');
  await expect(rating(page)).toHaveValue(String(beforeBeta.state.ranking.find((entry) => entry.id === game.id)?.score));
  for (const name of ['Friends', 'Compare', 'Community', 'Public ranking']) {
    await followMenu(page, name);
    await expect(page.locator('main [data-page-heading]').first()).toBeVisible();
  }
  await followMenu(page, 'Account');
  await expectRestoredSync(page);
  expect((await readAccount(page, beta.uid!)).state).toEqual(beforeBeta.state);
  expect((await readAccount(page, alpha.uid!)).state.ranking.find((entry) => entry.id === game.id)?.score).toBe(score);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Account Device only', exact: true })).toBeVisible();
  await followMenu(page, 'Ranking');
  await expect(rating(page)).toHaveValue('5');
  expect(await readLibrary(page)).toEqual(guest);
});

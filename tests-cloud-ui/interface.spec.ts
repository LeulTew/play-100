import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, emailFor, enableSync, seedGuestRating, verifyEmail } from './helpers';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('account, creature chooser and publication controls stay accessible at mobile, tablet and zoom-sized widths', async ({ page, request, viewport }, testInfo) => {
  const email = emailFor('interface');
  await page.goto('/?game=red-dead-redemption-2');
  await seedGuestRating(page, '8.6');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page);
  for (const width of [320, 640, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize(viewport ?? { width: 1440, height: 1000 });
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.screenshot({ path: testInfo.outputPath('account-interface.png'), fullPage: true });
  const account = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(account.violations).toEqual([]);
  const labels = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
  expect(labels.violations).toEqual([]);
  await page.getByRole('button', { name: 'Change icon', exact: true }).click();
  const picker = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(picker.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Public ranking', exact: true }).click();
  const publication = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(publication.violations).toEqual([]);
  await page.locator('.account-nav').click();
  await page.locator('.account-danger summary').click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  const deletion = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(deletion.violations).toEqual([]);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Keep my data', exact: true })).toBeFocused();
});

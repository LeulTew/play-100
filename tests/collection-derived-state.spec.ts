import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { openBrowsingFilters } from './browsing-helpers';

test('collection derivations stay current across Menu, filters, progress edits and paging', async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  const cards = page.locator('.game-card');
  await expect(cards).toHaveCount(24);
  const search = page.locator('#game-search');
  await search.fill('Red Dead Redemption 2');
  await expect(cards).toHaveCount(1);
  const before = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-game')));
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-game')))).toEqual(before);
  await expect(search).toHaveValue('Red Dead Redemption 2');
  await cards.getByRole('button', { name: 'Play later: Red Dead Redemption 2', exact: true }).click();
  await expect(cards.getByRole('button', { name: 'Play later: Red Dead Redemption 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await openBrowsingFilters(page);
  await page
    .getByRole('group', { name: 'Your collection views', exact: true })
    .getByRole('button', { name: /^Play later/ })
    .click();
  await expect(cards).toHaveCount(1);
  await cards.getByRole('button', { name: 'Play later: Red Dead Redemption 2', exact: true }).click();
  await expect(cards).toHaveCount(0);
  await page.goBack();
  await expect(cards).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(cards).toHaveCount(24);
  await page.getByRole('button', { name: 'Show 24 more', exact: true }).click();
  await expect(cards).toHaveCount(48);
});

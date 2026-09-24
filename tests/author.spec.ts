import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseCollection } from '../src/lib/collection';
import { readLibrary } from './library-helpers';
import author from '../author.json' with { type: 'json' };

test('canonical rationale stays complete before bookkeeping at narrow, mobile, intermediate and wide widths', async ({
  page,
}) => {
  const game = parseCollection(JSON.parse(readFileSync(new URL('../data/collection.json', import.meta.url), 'utf8')))
    .games[0]!;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  const opener = page.locator(`[data-game="${game.slug}"] .game-link`);
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: game.title, exact: true })).toBeFocused();
  await expect(dialog.locator('.rationale')).toHaveText(game.rationale);
  await expect(dialog.locator('.author-rating-detail')).toContainText("Leul's original rating");
  for (const width of [320, 393, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await dialog.evaluate((element) => {
      const rationale = element.querySelector('.rationale')!.getBoundingClientRect();
      const actions = element.querySelector('.detail-actions')!.getBoundingClientRect();
      const close = element.querySelector('.dialog-close')!.getBoundingClientRect();
      return {
        rationaleBottom: rationale.bottom,
        actionsTop: actions.top,
        width: element.clientWidth,
        contentWidth: element.scrollWidth,
        closeWidth: close.width,
        closeHeight: close.height,
      };
    });
    expect(geometry.rationaleBottom).toBeLessThan(geometry.actionsTop);
    expect(geometry.contentWidth).toBeLessThanOrEqual(geometry.width);
    expect(geometry.closeWidth).toBeGreaterThanOrEqual(44);
    expect(geometry.closeHeight).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('Leul original values are visible by default and never become visitor ratings', async ({ page }) => {
  await page.goto('/?view=table');
  await expect(page.getByRole('columnheader', { name: /Leul's rating/ })).toBeVisible();
  await expect(page.locator('tr[data-game="the-witcher-3-wild-hunt"] .table-author-rating')).toHaveText('9.9');
  await expect(page.locator('tr[data-game="grand-theft-auto-iv"] .table-author-rating')).toHaveText('9.8');
  await page.locator('tr[data-game="the-witcher-3-wild-hunt"] .table-game a').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.author-rating-detail')).toContainText("Leul's original rating");
  await expect(dialog.locator('.author-rating-detail')).toContainText('9.9');
  await expect(
    dialog.getByRole('checkbox', { name: 'I have played it: The Witcher 3: Wild Hunt', exact: true }),
  ).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Add to my ranking', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.length).toBe(1);
  expect((await readLibrary(page)).ranking[0]?.score).toBeNull();
  await page.goto('/my-rankings');
  const ownRating = page.getByRole('spinbutton', {
    name: 'Your rating / 10 for The Witcher 3: Wild Hunt',
    exact: true,
  });
  await expect(ownRating).toHaveValue('');
  await ownRating.fill('4');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(4);
  await page.goto('/');
  await expect(page.locator('[data-game="the-witcher-3-wild-hunt"] .author-rating-card')).toContainText('9.9');
});

test('shared creator footer links are present on every route', async ({ page }) => {
  for (const route of ['/', '/my-library', '/my-rankings', '/discover']) {
    await page.goto(route);
    const footer = page.locator('.author-footer');
    await expect(footer).toContainText(author.fullName);
    await expect(footer.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', author.githubUrl);
    await expect(footer.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', author.linkedinUrl);
    await expect(footer.getByRole('link', { name: 'Telegram @fabbin' })).toHaveAttribute('href', author.telegramUrl);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('a stale cached dataset has an explicit recovery path, never a substitute author rating', async ({
  page,
  request,
}) => {
  const current = await (await request.get('/data/collection.json')).json();
  const old = structuredClone(current);
  delete old.collection.authorRatingsAreOriginal;
  for (const game of old.games) delete game.authorRating;
  await page.route('**/data/collection.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(old) }),
  );
  await page.goto('/');
  await expect(page.locator('.source-version-notice')).toContainText('No substitute values are shown');
  await expect(page.locator('[data-game="red-dead-redemption-2"] .author-rating-card')).toContainText('Unavailable');
  await page.unroute('**/data/collection.json');
  await page.getByRole('button', { name: 'Refresh original ratings', exact: true }).click();
  await expect(page.locator('.source-version-notice')).toHaveCount(0);
  await expect(page.locator('[data-game="red-dead-redemption-2"] .author-rating-card')).toContainText('10.0');
});

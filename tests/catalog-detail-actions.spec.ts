import { expect, test } from '@playwright/test';
import { catalogFixture, discoveryFixture } from '../src/lib/discovery-test-fixtures';
import { emptyCatalogs } from './catalog-helpers';
import { readLibrary } from './library-helpers';

const record = discoveryFixture.record;

test.beforeEach(async ({ page, baseURL, isMobile }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
    throw new Error('Catalog detail fixtures require the owned local preview.');
  await page.setViewportSize({ width: isMobile ? 393 : 1440, height: isMobile ? 851 : 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emptyCatalogs(page);
  await page.route('**/data/discovery/catalog.v1.json', (route) => route.fulfill({ json: catalogFixture }));
});

for (const input of ['pointer', 'keyboard'] as const) {
  test(`catalog detail adds only to Library using ${input}`, async ({ page, isMobile }) => {
    await page.goto('/discover?catalogs=off');
    const card = page.locator(`[data-catalog-id="${record.id}"]`);
    const opener = card.getByRole('button', { name: record.title, exact: true });
    await expect(opener).toBeVisible();
    const before = await readLibrary(page);
    expect(before.records[record.id]).toBeUndefined();
    if (input === 'keyboard') {
      await opener.focus();
      await page.keyboard.press('Enter');
    } else if (isMobile) await opener.tap();
    else await opener.click();
    const dialog = page.getByRole('dialog', { name: record.title, exact: true });
    const add = dialog.getByRole('button', { name: `Add to My games: ${record.title}`, exact: true });
    await expect(dialog.locator('#catalog-game-title')).toBeFocused();
    await expect(add).toBeEnabled();
    await expect(dialog.locator('.device-note')).toContainText(
      'Add to My games to keep this game without changing your progress, queue or ranking.',
    );
    if (input === 'keyboard') {
      for (let step = 0; step < 12; step++) {
        if (await add.evaluate((element) => element === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(add).toBeFocused();
      await page.keyboard.press('Enter');
    } else if (isMobile) await add.tap();
    else await add.click();
    await expect(dialog.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
    await expect(dialog.locator('.device-note')).toHaveText('Saved in My games. The 100 stays unchanged.');
    const after = await readLibrary(page);
    expect(after).toEqual({
      ...before,
      revision: before.revision + 1,
      records: { ...before.records, [record.id]: record },
    });
    expect(after.progress[record.id]).toBeUndefined();
    expect(after.queueOrder).toEqual(before.queueOrder);
    expect(after.ranking).toEqual(before.ranking);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(card.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
    await page.reload();
    await expect(card.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
    expect(await readLibrary(page)).toEqual(after);
  });
}

test('canonical Discover details keep the original collection actions', async ({ page }) => {
  await page.goto('/discover?q=red%20dead%20redemption%202&include100=on&catalogs=off');
  await page
    .locator('[data-catalog-id="red-dead-redemption-2"]')
    .getByRole('button', { name: 'Red Dead Redemption 2', exact: true })
    .click();
  const detail = page.getByRole('dialog', { name: 'Red Dead Redemption 2', exact: true });
  await expect(detail).toHaveClass(/game-dialog/);
  await expect(detail.getByRole('button', { name: /^Add to My games:/ })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
});

for (const [genre, label] of [
  [
    'role-playing video game / turn-based Japanese role-playing game / time travel video game / video game with LGBT character',
    'Role-playing',
  ],
  ['time travel video game / unknown shooterish theme', 'Other / unclassified'],
  [null, 'Other / unclassified'],
] as const) {
  test(`provider genre ${genre ?? 'missing'} keeps its full source classification`, async ({ page }) => {
    await page.route('**/data/discovery/catalog.v1.json', (route) =>
      route.fulfill({
        json: {
          ...catalogFixture,
          items: [{ ...discoveryFixture, record: { ...record, genre } }],
        },
      }),
    );
    await page.goto('/discover?catalogs=off');
    const card = page.locator(`[data-catalog-id="${record.id}"]`);
    await expect(card.locator('.discovery-card-meta')).toHaveText(`${record.year} · ${label}`);
    await card.getByText('Actions & source', { exact: true }).click();
    await expect(card.locator('.discovery-card-source')).toContainText(
      `Source classification: ${genre ?? 'Not provided'}`,
    );
    await card.getByRole('button', { name: record.title, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: record.title, exact: true });
    const genreField = dialog.locator('.catalog-facts > div').filter({
      has: page.locator('dt').filter({ hasText: /^Genre$/ }),
    });
    await expect(genreField.locator('dd')).toHaveText(label);
    const classification = dialog.locator('.catalog-source-classification');
    await expect(classification).not.toHaveAttribute('open');
    await classification.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(classification).toHaveAttribute('open', '');
    await expect(classification.locator('p')).toHaveText(genre ?? 'Not provided');
    await dialog.getByRole('button', { name: `Add to My games: ${record.title}`, exact: true }).click();
    await expect(dialog.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
    expect((await readLibrary(page)).records[record.id]?.genre).toBe(genre);
  });
}

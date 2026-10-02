import { expect, test } from '@playwright/test';
import { installGuestLibrary, libraryFixture, rankedRecords } from './library-pagination-helpers';

test('mobile Play later rows keep Rank and delete together without a repeated progress line', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, json: { error: 'Offline fixture' } }));
  await installGuestLibrary(page, libraryFixture(3));
  await page
    .getByRole('navigation', { name: 'My games views' })
    .getByRole('button', { name: /^Play later,/ })
    .click();
  await page.evaluate(() => document.fonts.ready);
  const list = page.getByRole('list', { name: 'Your Play later games' });
  const heights: number[] = [];
  for (const [index, record] of rankedRecords.entries()) {
    const row = list.locator(`[data-record-id="${record.id}"]`);
    await row.scrollIntoViewIfNeeded();
    await expect(row.locator('.play-state')).toBeHidden();
    const rank = row.getByRole('link', {
      name: `Ranked #${index + 1}: ${record.title}. Open in Ranking`,
      exact: true,
    });
    const remove = row.getByRole('button', { name: `Remove from Play later: ${record.title}`, exact: true });
    await expect(rank).toHaveText(`Ranked #${index + 1}`);
    await expect(rank).toHaveAttribute('href', `/my-games?tab=ranking#${new URLSearchParams({ rank: record.id })}`);
    const pin = row.locator('.compare-pin');
    await expect(pin).toHaveAccessibleName(`Pin for comparison: ${record.title}`);
    await expect(pin).toHaveText('Pin');
    await expect(row.locator('.compare-pin')).toHaveCount(1);
    const played = row.locator('.played-toggle');
    const [pinBox, playedBox] = await Promise.all([pin.boundingBox(), played.boundingBox()]);
    if (!pinBox || !playedBox) throw new Error('Pin and Played must have visible targets.');
    expect(playedBox.y >= pinBox.y + pinBox.height || playedBox.x - (pinBox.x + pinBox.width) >= 16).toBe(true);
    await pin.click();
    await expect(pin).toHaveText('Pinned');
    await expect(pin).toHaveAccessibleName(`Pinned for comparison: ${record.title}`);
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(pin).toBeFocused();
    const pinnedBox = await pin.boundingBox();
    expect(pinnedBox?.width).toBeCloseTo(pinBox.width, 0);
    await pin.press('Enter');
    await expect(pin).toHaveText('Pin');
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    const [rankBox, removeBox, rowBox] = await Promise.all([
      rank.boundingBox(),
      remove.boundingBox(),
      row.boundingBox(),
    ]);
    if (!rankBox || !removeBox || !rowBox) throw new Error('Mobile row controls must have visible boxes.');
    expect(rankBox.y).toBeCloseTo(removeBox.y, 0);
    expect(rankBox.height).toBeGreaterThanOrEqual(44);
    expect(removeBox.height).toBeGreaterThanOrEqual(44);
    expect(rowBox.height).toBeLessThan(230);
    heights.push(rowBox.height);
    const arrows = await row.locator('.move-buttons').boundingBox();
    if (!arrows) throw new Error('Move arrows must remain visible.');
    expect(arrows.x).toBeGreaterThanOrEqual(removeBox.x + removeBox.width);
    expect(arrows.y).toBeCloseTo(removeBox.y, 0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('compact-row-heights', { body: JSON.stringify(heights), contentType: 'application/json' });
});

test('compact collection Pin offers a visible touch label without changing its accessible action', async ({
  page,
  isMobile,
}) => {
  await page.goto('/?catalogs=off');
  const pin = page
    .locator('.game-card')
    .first()
    .getByRole('button', { name: /^Pin for comparison:/ });
  await expect(pin).toBeVisible();
  if (isMobile) await expect(pin).toHaveText('Pin');
  else await expect(pin).toHaveText('');
  const box = await pin.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
});

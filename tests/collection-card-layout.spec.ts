import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { emptyCatalogs } from './catalog-helpers';

const first = { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2', year: '2018' };
const fallbackText = 'Cover unavailable \u00b7 collection artwork';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emptyCatalogs(page);
});

async function expectClearFallback(cover: Locator, rank: string) {
  const caption = cover.locator('.art-fallback-note');
  await expect(caption).toHaveText(fallbackText);
  await expect(cover.locator('.cover-rank')).toHaveText(rank);
  await cover.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const geometry = await cover.evaluate((element) => {
    const caption = element.querySelector<HTMLElement>('.art-fallback-note');
    const rank = element.querySelector<HTMLElement>('.cover-rank');
    if (!caption || !rank) throw new Error('The failed jacket must retain both its full caption and rank.');
    const coverBox = element.getBoundingClientRect();
    const frameBox = element.closest('.discovery-card-art')?.getBoundingClientRect() ?? coverBox;
    const captionBox = caption.getBoundingClientRect();
    const rankBox = rank.getBoundingClientRect();
    const text = document.createRange();
    text.selectNodeContents(caption);
    const lines = Array.from(text.getClientRects());
    const intersectsRank =
      captionBox.left < rankBox.right &&
      captionBox.right > rankBox.left &&
      captionBox.top < rankBox.bottom &&
      captionBox.bottom > rankBox.top;
    const inside = (box: DOMRect) =>
      box.left >= coverBox.left - 1 &&
      box.right <= coverBox.right + 1 &&
      box.top >= coverBox.top - 1 &&
      box.bottom <= coverBox.bottom + 1 &&
      box.left >= frameBox.left - 1 &&
      box.right <= frameBox.right + 1 &&
      box.top >= frameBox.top - 1 &&
      box.bottom <= frameBox.bottom + 1;
    return {
      intersectsRank,
      contained: inside(captionBox) && inside(rankBox) && lines.every(inside),
      clipped: caption.scrollWidth > caption.clientWidth + 1 || caption.scrollHeight > caption.clientHeight + 1,
      fontSize: parseFloat(getComputedStyle(caption).fontSize),
      lines: lines.length,
      uncovered: lines.every((box) =>
        caption.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)),
      ),
    };
  });
  expect(geometry.intersectsRank).toBe(false);
  expect(geometry.contained).toBe(true);
  expect(geometry.clipped).toBe(false);
  expect(geometry.fontSize).toBeGreaterThanOrEqual(12);
  expect(geometry.lines).toBeGreaterThan(0);
  expect(geometry.uncovered).toBe(true);
}

async function expectNativeCover(cover: Locator, ratio: number) {
  const image = cover.locator('img');
  await expect
    .poll(() => image.evaluate((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0))
    .toBe(true);
  const geometry = await cover.evaluate((element) => {
    const image = element.querySelector('img');
    if (!image) throw new Error('The successful workbook jacket must retain its image.');
    const box = element.getBoundingClientRect();
    return {
      ratio: box.width / box.height,
      width: image.offsetWidth,
      height: image.offsetHeight,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      fit: getComputedStyle(image).objectFit,
    };
  });
  expect(Math.abs(geometry.ratio - ratio)).toBeLessThan(0.02);
  expect(geometry.width).toBeGreaterThan(0);
  expect(geometry.height).toBeGreaterThan(0);
  expect(geometry.width).toBeLessThanOrEqual(geometry.naturalWidth);
  expect(geometry.height).toBeLessThanOrEqual(geometry.naturalHeight);
  expect(geometry.fit).toBe('contain');
}

for (const width of [320, 393]) {
  test(`failed covers keep the full caption clear of rank and controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 851 });
    await page.route('**/covers/**', (route) => route.abort('failed'));
    await page.goto('/?catalogs=off');
    const cards = page.locator('.games-grid > .game-card');
    await expect(cards).toHaveCount(24);
    await page.evaluate(() => document.fonts.ready);
    for (const index of [0, 1]) {
      await expectClearFallback(cards.nth(index).locator('.game-cover'), String(index + 1).padStart(2, '0'));
    }
    await page.getByRole('button', { name: 'Select multiple games', exact: true }).click();
    await expectClearFallback(cards.first().locator('.game-cover'), '01');
    await page.getByRole('button', { name: 'Exit selection mode', exact: true }).click();
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    const row = page.locator(`.games-list > .game-card[data-game="${first.id}"]`);
    await expectClearFallback(row.locator('.game-cover'), '01');
    await row.locator('.game-link').click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: first.title, exact: true })).toBeVisible();
    await expectClearFallback(page.locator('.detail-cover .game-cover'), '01');
  });

  test(`canonical Discover failed jackets retain the full caption at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 851 });
    await page.route('**/covers/**', (route) => route.abort('failed'));
    await page.goto('/discover?catalogs=off&source=collection&include100=on&q=red+dead+redemption+2');
    const card = page.locator(`.discovery-card[data-catalog-id="${first.id}"]`);
    await expect(card).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectClearFallback(card.locator('.game-cover'), '01');
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    await expectClearFallback(card.locator('.game-cover'), '01');
  });

  test(`narrow jackets omit redundant print without resizing workbook art at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 851 });
    await page.goto('/?catalogs=off');
    const card = page.locator(`.games-grid > .game-card[data-game="${first.id}"]`);
    await expect(card).toBeVisible();
    const cover = card.locator('.game-cover');
    await expectNativeCover(cover, 1.24);
    await expect(cover.locator('.jacket-series')).toBeHidden();
    await expect(cover.locator('.jacket-year')).toBeHidden();
    await expect(cover.locator('.cover-rank')).toHaveText('01');
    await expect(card.locator('.game-meta')).toContainText(first.year);
    await card.locator('.game-link').click();
    const detail = page.locator('.game-dialog');
    await expect(detail).toBeVisible();
    const detailCover = detail.locator('.game-cover');
    await expectNativeCover(detailCover, 1.5);
    await expect(detailCover.locator('.jacket-series')).toBeHidden();
    await expect(detailCover.locator('.jacket-year')).toBeHidden();
    await expect(detail.locator('.detail-byline')).toContainText(first.year);
    await expect(detailCover.locator('.cover-rank')).toHaveText('01');
  });
}

for (const width of [320, 393, 1440]) {
  test(`collection grid dividers and action rows align within one pixel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?catalogs=off');
    const cards = page.locator('.games-grid > .game-card');
    await expect(cards).toHaveCount(24);
    await page.evaluate(() => document.fonts.ready);
    const row = await cards.evaluateAll((items) => {
      const top = items[0]?.getBoundingClientRect().top;
      return items
        .filter((item) => Math.abs(item.getBoundingClientRect().top - (top ?? 0)) <= 1)
        .map((item) => {
          const copy = item.querySelector<HTMLElement>('.game-copy');
          const actions = item.querySelector<HTMLElement>('.card-played');
          const title = item.querySelector<HTMLElement>('h3');
          const genre = item.querySelector<HTMLElement>('.game-genre');
          if (!copy || !actions || !title || !genre) throw new Error('A collection card is incomplete.');
          return {
            actionTop: actions.getBoundingClientRect().top,
            divider: copy.getBoundingClientRect().bottom,
            bottom: item.getBoundingClientRect().bottom,
            textClipped: [title, genre].some(
              (node) => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1,
            ),
            genreFont: parseFloat(getComputedStyle(genre).fontSize),
          };
        });
    });
    expect(row).toHaveLength(width <= 393 ? 2 : 4);
    for (const key of ['actionTop', 'divider', 'bottom'] as const) {
      const positions = row.map((card) => card[key]);
      expect(Math.max(...positions) - Math.min(...positions), key).toBeLessThanOrEqual(1);
    }
    expect(row.every((card) => !card.textClipped && card.genreFont >= 12)).toBe(true);
  });
}

for (const view of ['grid', 'list'] as const) {
  test(`collection ${view} uses a valid native list without overriding article semantics`, async ({ page }) => {
    await page.goto(`/?view=${view}&catalogs=off`);
    const list = page.getByRole('list', { name: 'Games in this view', exact: true });
    await expect(list.locator(':scope > li.game-card')).toHaveCount(24);
    await expect(page.locator('article[role]')).toHaveCount(0);
    expect(await list.evaluate((element) => element.tagName)).toBe('UL');
    expect(
      await list.evaluate((element) =>
        Array.from(element.children).every((child) => child.tagName === 'LI' && !child.hasAttribute('role')),
      ),
    ).toBe(true);
    await expect(list.locator('.game-card').first().locator('.game-link')).toHaveAttribute(
      'href',
      new RegExp(`game=${first.id}`),
    );
    const result = await new AxeBuilder({ page })
      .include('.games')
      .withRules(['aria-allowed-role', 'list', 'listitem'])
      .analyze();
    expect(result.violations).toEqual([]);
  });
}

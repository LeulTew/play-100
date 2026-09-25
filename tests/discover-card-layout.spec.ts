import { expect, test } from '@playwright/test';
import { catalogFixture, discoveryFixture } from '../src/lib/discovery-test-fixtures';
import { catalogRecord, emptyCatalogs } from './catalog-helpers';

const items = [
  { title: 'A short title', genre: 'Puzzle' },
  {
    title: 'B longer title: an expedition across the many islands of a distant world',
    genre: 'action-adventure game / role-playing video game / historical video game / open-world action RPG',
  },
  { title: 'C another game', genre: 'real-time strategy / historical video game' },
  { title: 'D final layout fixture', genre: 'social deduction video game / party video game / science fiction video game' },
].map(({ title, genre }, index) => ({
  ...discoveryFixture,
  record: { ...catalogRecord('wikidata', `Q9100000${index + 1}`, title), genre },
  aliases: [],
}));

test('Discover grid action rows align at 1024 and 393 without truncating text', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 393 : 1024, height: isMobile ? 851 : 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emptyCatalogs(page);
  await page.route('**/data/discovery/catalog.v1.json', (route) =>
    route.fulfill({ json: { ...catalogFixture, items } }),
  );
  await page.goto('/discover?catalogs=off');
  const cards = page.locator('.discovery-cards-grid > .discovery-card');
  await expect(cards).toHaveCount(items.length);
  await page.evaluate(() => document.fonts.ready);

  for (const { record } of items) {
    const card = page.locator(`[data-catalog-id="${record.id}"]`);
    await expect(card.locator('h3')).toHaveText(record.title);
    await expect(card.locator('.discovery-card-meta')).toHaveText(`${record.year} · ${record.genre}`);
  }
  const geometry = await cards.evaluateAll((elements) =>
    elements.map((card) => {
      const title = card.querySelector<HTMLElement>('h3');
      const genre = card.querySelector<HTMLElement>('.discovery-card-meta');
      const primary = card.querySelector<HTMLElement>('.discovery-card-primary');
      const summary = card.querySelector<HTMLElement>('.discovery-card-details > summary');
      const add = primary?.querySelector<HTMLButtonElement>('button');
      const pin = primary?.querySelector<HTMLButtonElement>('button[aria-label^="Pin for comparison:"]');
      if (!title || !genre || !primary || !summary || !add || !pin)
        throw new Error('Every layout fixture must expose its full identity and native actions.');
      const bounds = card.getBoundingClientRect();
      return {
        top: bounds.top,
        height: bounds.height,
        primaryTop: primary.getBoundingClientRect().top,
        addTop: add.getBoundingClientRect().top,
        pinTop: pin.getBoundingClientRect().top,
        summaryTop: summary.getBoundingClientRect().top,
        titleHeight: title.getBoundingClientRect().height,
        genreHeight: genre.getBoundingClientRect().height,
        textFits: [title, genre].every(
          (element) => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1,
        ),
        targetHeights: [add, pin, summary].map((element) => element.getBoundingClientRect().height),
      };
    }),
  );
  const firstTop = geometry[0]?.top;
  if (firstTop === undefined) throw new Error('The first Discover row did not render.');
  const firstRow = geometry.filter((card) => Math.abs(card.top - firstTop) <= 1);
  expect(firstRow).toHaveLength(isMobile ? 2 : 4);
  for (const field of ['height', 'primaryTop', 'addTop', 'pinTop', 'summaryTop'] as const) {
    const positions = firstRow.map((card) => card[field]);
    expect(Math.max(...positions) - Math.min(...positions), `${field} alignment`).toBeLessThanOrEqual(1);
  }
  expect(
    Math.max(...firstRow.map((card) => card.titleHeight)) - Math.min(...firstRow.map((card) => card.titleHeight)),
  ).toBeGreaterThan(10);
  expect(
    Math.max(...firstRow.map((card) => card.genreHeight)) - Math.min(...firstRow.map((card) => card.genreHeight)),
  ).toBeGreaterThan(10);
  expect(geometry.every((card) => card.textFits)).toBe(true);
  expect(geometry.every((card) => card.targetHeights.every((height) => height >= 44))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'List view', exact: true }).click();
  const listCard = page.locator('.discovery-cards-list > .discovery-card').first();
  await expect(listCard).toHaveCSS('display', 'grid');
  await expect(listCard.locator('.discovery-card-primary')).toHaveCSS('padding-top', '0px');
  await listCard.locator('.discovery-card-details > summary').click();
  await expect(listCard.locator('.discovery-card-details')).toHaveAttribute('open', '');
  await expect(listCard.getByRole('link', { name: 'Game data: Wikidata' })).toHaveAttribute(
    'href',
    items[0]!.record.sourceUrl!,
  );
});

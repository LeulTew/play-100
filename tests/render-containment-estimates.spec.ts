import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { emptyCatalogs } from './catalog-helpers';

test('containment estimates remain authored plain lengths for Chrome 106', () => {
  const css = readFileSync(new URL('../src/render-containment.css', import.meta.url), 'utf8');
  const values = [...css.matchAll(/contain-intrinsic-block-size:\s*([^;]+);/g)].map((match) => match[1]!);
  expect(values.length).toBeGreaterThanOrEqual(9);
  for (const value of values) expect(value).toMatch(/^\d+(?:\.\d+)?px$/);
});

for (const width of [320, 393, 1024, 1280, 1920]) {
  for (const collection of [true, false]) {
    for (const view of ['grid', 'list'] as const) {
      const route = collection ? 'Collection' : 'Discover';
      test(`${route} ${view} intrinsic estimate matches rendered cards at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await emptyCatalogs(page);
        await page.goto(collection ? '/?catalogs=off' : '/discover?catalogs=off');
        await expect(page.locator(collection ? '.game-card' : '.discovery-card')).toHaveCount(24);
        await page.getByRole('button', { name: view === 'grid' ? 'Grid view' : 'List view', exact: true }).click();
        const selector = collection ? `.games-${view} > .game-card` : `.discovery-cards-${view} > .discovery-card`;
        await expect(page.locator(selector)).toHaveCount(24);
        if (collection) {
          const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
          await expect(page.locator(selector).first().locator('.compare-pin')).toHaveText(coarse ? 'Pin' : '');
        }
        await page.evaluate(() => document.fonts.ready);
        const measurement = await page.locator(selector).evaluateAll(async (elements) => {
          const cards = elements.filter((element): element is HTMLElement => element instanceof HTMLElement);
          const contained = cards.filter((card) => getComputedStyle(card).contentVisibility === 'auto');
          const estimates = contained.map((card) => getComputedStyle(card).containIntrinsicBlockSize);
          // Render every row together so a skipped sibling's estimate cannot stretch a measured grid card.
          for (const card of cards) card.style.contentVisibility = 'visible';
          try {
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            const heights = contained.map((card) => {
              const style = getComputedStyle(card);
              const borderBox = card.getBoundingClientRect().height;
              const edges =
                parseFloat(style.paddingTop) +
                parseFloat(style.paddingBottom) +
                parseFloat(style.borderTopWidth) +
                parseFloat(style.borderBottomWidth);
              return { borderBox, contentBox: borderBox - edges };
            });
            const median = (values: number[]) => {
              const sorted = [...values].sort((a, b) => a - b);
              const middle = Math.floor(sorted.length / 2);
              return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
            };
            return {
              count: contained.length,
              estimates: [...new Set(estimates)],
              medianBorderBox: median(heights.map((height) => height.borderBox)),
              medianContentBox: median(heights.map((height) => height.contentBox)),
              heights,
            };
          } finally {
            for (const card of cards) card.style.removeProperty('content-visibility');
          }
        });
        const row = { project: info.project.name, route, view, width, ...measurement };
        console.info('Containment measurement', JSON.stringify(row));
        await info.attach('containment-measurement', { body: JSON.stringify(row), contentType: 'application/json' });
        expect(measurement.count).toBe(collection || view === 'list' ? 20 : 19);
        expect(measurement.estimates).toHaveLength(1);
        // Modern Chromium serializes an implicit auto prefix for content-visibility:auto.
        // The separate source guard prevents authoring that prefix on the Chrome 106 path.
        const estimate = measurement.estimates[0]!.replace(/^auto /, '');
        expect(estimate).toMatch(/^\d+(?:\.\d+)?px$/);
        // Intrinsic lengths reserve the content box; padding and borders are added by layout.
        expect(
          Math.abs(parseFloat(estimate) - measurement.medianContentBox) / measurement.medianContentBox,
          JSON.stringify(row),
        ).toBeLessThanOrEqual(0.05);
      });
    }
  }
}

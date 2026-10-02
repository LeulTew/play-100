import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

// DIAGNOSTIC ONLY, not for merge: The 100's rendered card sizes per width and view (NIT-08), as the window's
// cards106.mts measures them, against the estimates in src/render-containment.css. Every card is made visible first (a
// skipped card takes the estimate), so each figure is a rendered card's laid-out size.
for (const view of ['grid', 'list'] as const) {
  test(`card sizes: ${view}`, async ({ page, isMobile }, info) => {
    await emptyCatalogs(page);
    const rows: object[] = [];
    for (const width of isMobile ? [412, 360] : [1440, 1280, 1024, 800]) {
      await page.setViewportSize({ width, height: isMobile ? 800 : 1000 });
      await page.goto(view === 'list' ? '/?catalogs=off&view=list' : '/?catalogs=off');
      await expect(page.locator('.game-card')).toHaveCount(24);
      await page.waitForTimeout(1500);
      const measured = await page.evaluate(async () => {
        const style = document.createElement('style');
        style.textContent = '.games > .game-card { content-visibility: visible !important; }';
        document.head.append(style);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const cards = [...document.querySelectorAll('.games > .game-card')];
        const heights = cards.map((card) => Math.round(card.getBoundingClientRect().height)).sort((a, b) => a - b);
        const computed = cards[0] ? getComputedStyle(cards[0]) : null;
        const chrome = computed
          ? ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce(
              (sum, key) => sum + parseFloat(computed.getPropertyValue(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))),
              0,
            )
          : null;
        const list = document.querySelector('.games');
        return {
          view: list?.classList.contains('games-list') ? 'list' : 'grid',
          cards: cards.length,
          rows: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top))).size,
          median: heights[Math.floor(heights.length / 2)] ?? null,
          p10: heights[Math.floor(heights.length / 10)] ?? null,
          p90: heights[Math.floor((heights.length * 9) / 10)] ?? null,
          min: heights[0] ?? null,
          max: heights.at(-1) ?? null,
          chrome: chrome === null ? null : Math.round(chrome * 100) / 100,
          estimate: getComputedStyle(cards[5] ?? document.body).containIntrinsicBlockSize,
          constrained: document.documentElement.hasAttribute('data-constrained'),
        };
      });
      rows.push({ width, requested: view, ...measured });
    }
    await info.attach('card-sizes', { body: JSON.stringify(rows), contentType: 'application/json' });
  });
}

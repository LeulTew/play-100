import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { emptyCatalogs } from './catalog-helpers';
import { textSpacingCSS } from './readability-helpers';

for (const width of [320, 393, 1280]) {
  test(`${width}px: expanded text spacing keeps every card's visible text inside its link`, async ({
    page,
    baseURL,
  }) => {
    if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Loopback only.');
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?catalogs=off');
    const cards = page.locator('.game-card');
    await expect(cards).toHaveCount(24);
    await page.addStyleTag({ content: textSpacingCSS });
    await page.evaluate(() => document.fonts.ready);
    const samples = [];
    for (let index = 0; index < 24; index++) {
      const card = cards.nth(index);
      await card.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      );
      const sample = await card.evaluate((element) => {
        const link = element.querySelector('.game-link');
        if (!link) throw new Error('The game identity link must remain available.');
        const bounds = link.getBoundingClientRect();
        const clipped: string[] = [];
        const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const parent = node.parentElement;
          if (!parent || !node.textContent?.trim() || parent.closest('.sr-only, [aria-hidden="true"], svg')) continue;
          if (!parent.checkVisibility({ contentVisibilityAuto: true, checkVisibilityCSS: true })) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          if (
            [...range.getClientRects()].some(
              (rect) =>
                rect.width > 0 &&
                rect.height > 0 &&
                (rect.top < bounds.top - 1 ||
                  rect.bottom > bounds.bottom + 1 ||
                  rect.left < bounds.left - 1 ||
                  rect.right > bounds.right + 1),
            )
          )
            clipped.push(node.textContent.trim());
        }
        return {
          id: element.getAttribute('data-game'),
          linkHeight: bounds.height,
          cardHeight: element.getBoundingClientRect().height,
          clipped,
        };
      });
      samples.push(sample);
      expect.soft(sample.clipped, JSON.stringify(sample)).toEqual([]);
    }
    await test.info().attach('visible-card-spacing.json', {
      body: JSON.stringify({ width, samples }, null, 2),
      contentType: 'application/json',
    });
  });
}

for (const width of [393, 1280]) {
  test(`${width}px: tall fallback-font metrics cannot push card actions into neighboring links`, async ({
    page,
    baseURL,
  }) => {
    if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Loopback only.');
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    await page.addStyleTag({
      content: `
      @font-face {
        font-family: "Tall card fixture";
        src: local("Arial"), local("Liberation Sans"), local("DejaVu Sans");
        ascent-override: 175%;
        descent-override: 65%;
        line-gap-override: 0%;
      }
      .games-grid .game-card, .games-grid .game-card button { font-family: "Tall card fixture", sans-serif; }
    `,
    });
    await page.evaluate(async () => {
      const faces = await document.fonts.load('16px "Tall card fixture"');
      if (!faces.length) throw new Error('The tall local test face did not load.');
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    const collisions = () =>
      page.locator('.game-card').evaluateAll((cards) => {
        const links = cards.flatMap((card) => {
          const link = card.querySelector<HTMLAnchorElement>('.game-link');
          return link ? [{ card, link, rect: link.getBoundingClientRect() }] : [];
        });
        return cards.flatMap((card) =>
          [...card.querySelectorAll<HTMLElement>('.compare-pin, .save-game')].flatMap((button) => {
            const rect = button.getBoundingClientRect();
            return links.flatMap((link) => {
              // The in-card bookmark intentionally overlays its own cover. The reported fault is a previous
              // card's footer colliding with the next card's link/bookmark, not that authored cover overlay.
              if (link.card === card && button.matches('.save-game')) return [];
              const width = Math.min(rect.right, link.rect.right) - Math.max(rect.left, link.rect.left);
              const height = Math.min(rect.bottom, link.rect.bottom) - Math.max(rect.top, link.rect.top);
              return width > 0.01 && height > 0.01
                ? [
                    {
                      button: button.getAttribute('aria-label'),
                      link: link.card.getAttribute('data-game'),
                      width,
                      height,
                    },
                  ]
                : [];
            });
          }),
        );
      });
    expect(await collisions(), 'offscreen intrinsic-size estimates must contain their actions').toEqual([]);
    for (const index of [0, 6, 12, 20]) {
      await page.locator('.game-card').nth(index).scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(await collisions(), `cards surrounding loaded row ${index}`).toEqual([]);
      const target = page.locator('.game-card').nth(index).locator('.compare-pin');
      await target.scrollIntoViewIfNeeded();
      expect(
        await target.evaluate((button) => {
          const box = button.getBoundingClientRect();
          return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        }),
      ).toBe(true);
    }
    const results = await new AxeBuilder({ page }).include('.games-grid').withRules(['target-size']).analyze();
    expect(results.violations).toEqual([]);
  });
}

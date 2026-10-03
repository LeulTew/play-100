import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function verifyAuthorGeometry(block: Locator) {
  const links = block.locator('.author-links a');
  await expect(links).toHaveCount(4);
  await block.scrollIntoViewIfNeeded();
  const alignment = await block.evaluate((element) => {
    const text = element.querySelector('p')!;
    const nav = element.querySelector('nav')!;
    const icons = nav.querySelectorAll('svg');
    const textBox = text.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const endAligned = element.classList.contains('author-footer') && navBox.top < textBox.bottom;
    return endAligned
      ? Math.abs(icons[icons.length - 1]!.getBoundingClientRect().right - (box.right - parseFloat(style.paddingRight)))
      : Math.abs(icons[0]!.getBoundingClientRect().left - textBox.left);
  });
  expect(alignment, 'The outer icon aligns optically with its adjacent text/content edge.').toBeLessThanOrEqual(1);
  for (const link of await links.all()) {
    await link.scrollIntoViewIfNeeded();
    await link.focus();
    await expect(link).toBeFocused();
    const geometry = await link.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const ring = parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset));
      const bounds = { left: box.left - ring, right: box.right + ring, top: box.top - ring, bottom: box.bottom + ring };
      let unclipped = bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const ancestor = getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        if (ancestor.overflowX !== 'visible') unclipped &&= bounds.left >= rect.left && bounds.right <= rect.right;
        if (ancestor.overflowY !== 'visible') unclipped &&= bounds.top >= rect.top && bounds.bottom <= rect.bottom;
      }
      return { width: box.width, height: box.height, ring, unclipped };
    });
    expect(geometry.width).toBe(44);
    expect(geometry.height).toBe(44);
    expect(geometry.ring).toBeGreaterThan(0);
    expect(geometry.unclipped).toBe(true);
  }
}

for (const width of [320, 393, 1024, 1280]) {
  test(`standalone genre labels stay compact and wrapped controls stay reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    await page.getByText('Exact source genre', { exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.locator('label[for="exact-genre-filter"]').evaluate((label) => {
      const select = document.getElementById('exact-genre-filter')!;
      const sibling = document.querySelector('label[for="genre-filter"]')!;
      return {
        labelHeight: label.getBoundingClientRect().height,
        siblingHeight: sibling.getBoundingClientRect().height,
        gap: select.getBoundingClientRect().top - label.getBoundingClientRect().bottom,
        selectHeight: select.getBoundingClientRect().height,
      };
    });
    expect(geometry.labelHeight).toBeLessThanOrEqual(20);
    expect(Math.abs(geometry.labelHeight - geometry.siblingHeight)).toBeLessThanOrEqual(1);
    expect(geometry.gap).toBeGreaterThanOrEqual(5);
    expect(geometry.gap).toBeLessThanOrEqual(7);
    expect(geometry.selectHeight).toBeGreaterThanOrEqual(44);
    await page.goto('/discover?catalogs=off');
    await page.getByText('Exact source genre', { exact: true }).first().click();
    await page.getByText('Search options & sources', { exact: true }).click();
    const wrapped = page.locator('.discovery-help label:has(input, select)');
    expect(await wrapped.count()).toBeGreaterThanOrEqual(2);
    for (const label of await wrapped.all()) {
      await expect(label).toBeVisible();
      expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test(`author glyph edges align without clipping hit areas or focus rings at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    await page.evaluate(() => document.fonts.ready);
    await verifyAuthorGeometry(page.locator('.author-footer'));
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await verifyAuthorGeometry(page.locator('.menu-author'));
    await page.getByRole('button', { name: 'About & credits', exact: true }).click();
    await verifyAuthorGeometry(page.locator('dialog[open] .author-block'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`ratings metadata keeps each tier together without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const tier of ['core', 'essential']) {
      await page.goto(`/?view=table&catalogs=off&tier=${tier}`);
      const metadata = page.locator('.ratings-table tbody .table-game > span');
      await expect(metadata).toHaveCount(24);
      await page.evaluate(() => document.fonts.ready);
      const readings = await metadata.evaluateAll((elements) =>
        elements.map((element) => {
          const text = [...element.childNodes].find((node) => /(?:Core|Essential) 50/.test(node.textContent ?? ''));
          if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected the original genre/tier text.');
          const value = text.textContent!;
          const start = value.indexOf(value.includes('Core 50') ? 'Core 50' : 'Essential 50');
          const range = document.createRange();
          range.setStart(text, start);
          range.setEnd(text, value.length);
          const lines = [...range.getClientRects()];
          const box = element.getBoundingClientRect();
          return {
            value,
            lines: lines.length,
            contained: lines.every((line) => line.left >= box.left - 1 && line.right <= box.right + 1),
            overflow: element.scrollWidth > element.clientWidth + 1,
          };
        }),
      );
      for (const reading of readings) {
        expect(reading.lines, reading.value).toBe(1);
        expect(reading.contained, reading.value).toBe(true);
        expect(reading.overflow, reading.value).toBe(false);
      }
    }
  });
}

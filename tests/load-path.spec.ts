import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

test('production HTML preloads only the hero font without dropping the other font faces', async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  const fonts = await page.locator('link[rel="preload"][as="font"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  expect(fonts).toHaveLength(1);
  expect(fonts[0]).toMatch(/barlow-condensed-latin-800-normal.*\.woff2$/);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('#hero-title').evaluate(node => getComputedStyle(node).fontWeight)).toBe('800');
  expect(await page.evaluate(() => document.fonts.check('800 64px "Barlow Condensed"'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('400 16px "Hanken Grotesk Variable"'))).toBe(true);
});

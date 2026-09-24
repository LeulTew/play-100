import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

// scripts/landing-fonts.ts: the hero weight first, then the body face and the section headings.
const LANDING_FONTS = [
  /\/barlow-condensed-latin-800-normal-[\w-]+\.woff2$/,
  /\/hanken-grotesk-latin-wght-normal-[\w-]+\.woff2$/,
  /\/barlow-condensed-latin-700-normal-[\w-]+\.woff2$/,
];

test('production HTML preloads the landing fonts as their faces request them, and each downloads once', async ({
  page,
}) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  const fonts = await page.locator('link[rel="preload"][as="font"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute('href') ?? '',
      type: node.getAttribute('type'),
      crossorigin: node.getAttribute('crossorigin'),
    })),
  );
  expect(fonts).toHaveLength(LANDING_FONTS.length);
  fonts.forEach((font, index) => {
    expect(font.href).toMatch(LANDING_FONTS[index]);
    expect(font).toMatchObject({ type: 'font/woff2', crossorigin: 'anonymous' });
  });
  // Each preload names a URL an @font-face of the app's stylesheets requests (the build checks the bytes).
  const faceUrls = await page.evaluate(() =>
    Array.from(document.styleSheets).flatMap((sheet) =>
      Array.from(sheet.cssRules)
        .filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
        .flatMap((rule) =>
          Array.from(
            rule.style.getPropertyValue('src').matchAll(/url\("([^"]+)"\)/g),
            (match) => new URL(match[1] ?? '', sheet.href ?? location.href).pathname,
          ),
        ),
    ),
  );
  for (const font of fonts) expect(faceUrls).toContain(font.href);
  await page.evaluate(() =>
    Promise.all(
      ['800 64px "Barlow Condensed"', '700 32px "Barlow Condensed"', '400 16px "Hanken Grotesk Variable"'].map((font) =>
        document.fonts.load(font),
      ),
    ).then(() => undefined),
  );
  // The faces reused the preloads: a mismatched preload would add a second request for its file.
  expect(
    await page.evaluate(
      (hrefs) =>
        hrefs.map(
          (href) =>
            performance.getEntriesByType('resource').filter((entry) => new URL(entry.name).pathname === href).length,
        ),
      fonts.map((font) => font.href),
    ),
  ).toEqual(fonts.map(() => 1));
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('#hero-title').evaluate((node) => getComputedStyle(node).fontWeight)).toBe('800');
  expect(await page.evaluate(() => document.fonts.check('800 64px "Barlow Condensed"'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('700 32px "Barlow Condensed"'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('400 16px "Hanken Grotesk Variable"'))).toBe(true);
});

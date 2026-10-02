import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openMenu } from './readability-helpers';

const catalogLinks = [
  ['Wikidata (CC0)', 'https://www.wikidata.org/wiki/Wikidata:Data_access'],
  ['FreeToGame API', 'https://www.freetogame.com/api-doc'],
  ['FreeToGame', 'https://www.freetogame.com/'],
] as const;
const projectLinks = [
  ['React Bits', 'https://reactbits.dev'],
  ['Creature avatar notices', '/licenses/dicebear.txt'],
  ['Read third-party notices', '/credits.txt'],
] as const;

async function expectSourceLinks(page: Page, scope: Locator, references: readonly (readonly [string, string])[]) {
  await expect(scope.getByRole('link')).toHaveCount(references.length);
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press('Tab');
  const measurements = [];
  for (const [name, href] of references) {
    const link = scope.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noreferrer');
    await link.scrollIntoViewIfNeeded();
    await link.focus();
    await expect(link).toBeFocused();
    const target = await link.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        height: box.height,
        width: box.width,
        left: box.left,
        right: box.right,
        viewport: innerWidth,
        hitTarget: hit === element || (hit !== null && element.contains(hit)),
        focusVisible: element.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
        forcedColorAdjust: style.forcedColorAdjust,
      };
    });
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.width).toBeGreaterThanOrEqual(24);
    expect(target.left).toBeGreaterThanOrEqual(0);
    expect(target.right).toBeLessThanOrEqual(target.viewport);
    expect(target.hitTarget).toBe(true);
    expect(target.focusVisible).toBe(true);
    expect(target.outlineStyle).not.toBe('none');
    expect(target.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(target.forcedColorAdjust).toBe('auto');
    measurements.push({ name, href, ...target });
  }
  expect(
    await scope.evaluate((element) => ({
      containerFits: element.scrollWidth <= element.clientWidth + 1,
      pageFits: document.documentElement.scrollWidth <= innerWidth,
    })),
  ).toEqual({ containerFits: true, pageFits: true });
  return measurements;
}

for (const forcedColors of ['none', 'active'] as const) {
  test(`About and Discover source links meet the product target size with forced colors ${forcedColors}`, async ({
    page,
    baseURL,
    isMobile,
  }, info) => {
    if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
      throw new Error('Source-link target fixtures require the owned local preview.');
    }
    await page.setViewportSize({ width: isMobile ? 320 : 1440, height: isMobile ? 780 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors });
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.origin !== new URL(baseURL).origin || url.pathname.startsWith('/api/')
        ? route.abort('blockedbyclient')
        : route.continue();
    });
    await page.goto('/?catalogs=off');
    await openMenu(page);
    await page
      .getByRole('dialog', { name: 'Menu', exact: true })
      .getByRole('button', { name: 'About & credits', exact: true })
      .click();
    const about = page.getByRole('dialog', { name: 'About & credits', exact: true });
    await expect(about).toBeVisible();
    const catalogSources = about.getByRole('group', { name: 'Public catalog sources', exact: true });
    const projectSources = about.getByRole('group', { name: 'Project sources and notices', exact: true });
    await expect(catalogSources).toBeVisible();
    await expect(projectSources).toBeVisible();
    await expect(about.getByRole('navigation', { name: 'Author links', exact: true }).getByRole('link')).toHaveCount(4);
    const aboutMeasurements = [
      ...(await expectSourceLinks(page, catalogSources, catalogLinks)),
      ...(await expectSourceLinks(page, projectSources, projectLinks)),
    ];
    expect(
      await about.evaluate((element) => ({
        containerFits: element.scrollWidth <= element.clientWidth + 1,
        pageFits: document.documentElement.scrollWidth <= innerWidth,
      })),
    ).toEqual({ containerFits: true, pageFits: true });
    await expect(about).toContainText('FreeToGame data retains credit and source links.');
    await expect(about).toContainText('React Bits is copyright 2026 David Haz, used under MIT + Commons Clause.');
    await expect(about).toContainText('Barlow Condensed and Hanken Grotesk use the SIL Open Font License.');
    await about.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.goto('/discover?catalogs=off');
    // Discover has two .discovery-help disclosures; the exact-genre one precedes the sources one.
    const sources = page
      .locator('.discovery-help')
      .filter({ has: page.getByText('Search options & sources', { exact: true }) });
    await sources.getByText('Search options & sources', { exact: true }).click();
    const catalogRow = sources.getByRole('group', { name: 'Public catalog sources', exact: true });
    const discoverMeasurements = await expectSourceLinks(page, catalogRow, [catalogLinks[0], catalogLinks[2]]);
    await expect(sources.getByRole('link')).toHaveCount(2);
    await expect(sources).toContainText(
      "Metadata from Wikidata (CC0) and FreeToGame. Image credits are under each game's More actions or in its details.",
    );
    await info.attach('source-link-targets', {
      contentType: 'application/json',
      body: JSON.stringify({
        viewport: page.viewportSize(),
        forcedColors,
        about: aboutMeasurements,
        discover: discoverMeasurements,
      }),
    });
  });
}

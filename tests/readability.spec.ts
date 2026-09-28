import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { canonicalCatalogId } from '../src/lib/catalog-identity';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { openBrowsingFilters } from './browsing-helpers';
import { closeDialog, expectReadableSurface, openMenu, textSpacingCSS } from './readability-helpers';

const catalog = parseDiscoveryCatalog(
  JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')),
);
const provider = catalog.items.find(
  (item) => item.artwork && item.artwork.credit.length > 200 && canonicalCatalogId(item.record.id) === item.record.id,
);
if (!provider)
  throw new Error('Readability coverage requires the existing long-credit, non-canonical catalog fixture.');
const providerRecord = provider.record;

async function surfaces(page: Page, spacing = false) {
  const audit = async (name: string) => expectReadableSurface(page, name, spacing);
  if (spacing) await page.addStyleTag({ content: textSpacingCSS });
  for (const name of ['Queue', 'Library', 'Ranking']) {
    await page
      .getByRole('navigation', { name: 'My games views' })
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'My games views' }).getByRole('button', { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute('aria-pressed', 'true');
    await audit(`My games ${name}`);
  }
  await page.goto('/?catalogs=off');
  if (spacing) await page.addStyleTag({ content: textSpacingCSS });
  await expect(page.locator('.game-card')).toHaveCount(24);
  for (const view of ['Grid', 'List', 'Table']) {
    await page
      .getByRole('button', { name: view === 'Table' ? 'Ratings table view' : `${view} view`, exact: true })
      .click();
    await audit(`Collection ${view}`);
    if (view === 'Table') {
      const table = page.getByRole('region', { name: /ratings/i });
      await expect(table).toHaveClass(/ratings-scroll/);
      expect(await table.evaluate((element) => getComputedStyle(element).overflowX)).toBe('auto');
    }
  }
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await openBrowsingFilters(page);
  await audit('Expanded collection filters');
  await page
    .locator('.game-card')
    .first()
    .getByRole('button', { name: `Pin for comparison: ${libraryRecords[0].title}`, exact: true })
    .click();
  await expect(page.locator('.compare-tray-dock')).toBeVisible();
  await audit('Pinned comparison dock');
  if (await page.evaluate(() => matchMedia('(forced-colors: active)').matches)) {
    const borders = await page
      .locator('.compare-tray-dock, .search-field, .game-cover')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          selector: element.className,
          style: getComputedStyle(element).borderTopStyle,
          width: parseFloat(getComputedStyle(element).borderTopWidth),
        })),
      );
    expect(
      borders.every((border) => border.style === 'solid' && border.width >= 1),
      JSON.stringify(borders),
    ).toBe(true);
    await page.locator('.compare-tray-expand').focus();
    await expect(page.locator('.compare-tray-expand')).toHaveCSS('outline-style', 'solid');
  }
  await page.locator('.game-card .game-link').first().click();
  await expect(page.locator('#game-title')).toBeVisible();
  await audit('Curated game detail');
  await closeDialog(page);
  await openMenu(page);
  await audit('Menu');
  await page
    .getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('button', { name: 'Settings & backups', exact: true })
    .click();
  await expect(page.locator('#settings-title')).toBeVisible();
  await audit('Settings');
  await closeDialog(page);
  await openMenu(page);
  await page
    .getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('button', { name: 'About & credits', exact: true })
    .click();
  await expect(page.locator('#about-title')).toBeVisible();
  await audit('About');
  await closeDialog(page);
  await page.goto('/discover?catalogs=off');
  if (spacing) await page.addStyleTag({ content: textSpacingCSS });
  await expect(page.locator('.discovery-cards > li')).toHaveCount(24);
  await audit('Discover catalog');
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill(providerRecord.title);
  const card = page
    .locator('.discovery-card')
    .filter({ has: page.getByRole('button', { name: providerRecord.title, exact: true }) });
  await expect(card).toHaveCount(1);
  await audit('Discover with provider result');
  await card.getByRole('button', { name: providerRecord.title, exact: true }).click();
  await expect(page.locator('#catalog-game-title')).toHaveText(providerRecord.title);
  const credit = page.locator('dialog[open] .game-artwork-disclosure > summary');
  await credit.click();
  await audit('Provider detail with full artwork credit');
  await closeDialog(page);
  await page.locator('.compare-tray-expand').click();
  await expect(page.getByRole('dialog', { name: 'Compare tray', exact: true })).toBeVisible();
  await audit('Comparison tray sheet');
  await closeDialog(page);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/catalog?**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Readability offline-provider fixture.' } }),
  );
});

for (const width of [320, 393, 768, 1440]) {
  test(`readable type floor and reflow across routes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await installGuestLibrary(page, libraryFixture(3));
    await surfaces(page);
  });
}

test('320px text spacing retains information, targets and single-axis page reflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await installGuestLibrary(page, libraryFixture(3));
  await surfaces(page, true);
});

test('forced colors preserves native focus, selected navigation and comparison controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.emulateMedia({ forcedColors: 'active' });
  await installGuestLibrary(page, libraryFixture(3));
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  const selected = page.getByRole('navigation', { name: 'My games views' }).locator('[aria-pressed="true"]');
  await selected.focus();
  await selected.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(selected).toBeFocused();
  const appearance = await selected.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outline: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
      border: style.borderBottomStyle,
      borderWidth: parseFloat(style.borderBottomWidth),
      decoration: style.textDecorationLine,
    };
  });
  expect(appearance.outline).toBe('solid');
  expect(appearance.width).toBeGreaterThanOrEqual(2);
  expect(appearance.border).toBe('solid');
  expect(appearance.borderWidth).toBeGreaterThanOrEqual(1);
  expect(appearance.decoration).toContain('underline');
  await surfaces(page, true);
});

test('forced colors draws the select chevrons in the field text colour, not the fixed ink', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/discover?catalogs=off');
  // Mobile keeps the filters in a closed disclosure; computed colour doesn't depend on visibility.
  const chevrons = page.locator('.select-chevron');
  await expect(chevrons.first()).toBeAttached();
  const colours = await chevrons.evaluateAll((elements) => {
    const probe = document.createElement('span');
    probe.style.color = 'FieldText';
    document.body.append(probe);
    const fieldText = getComputedStyle(probe).color;
    probe.remove();
    return { fieldText, chevrons: elements.map((element) => getComputedStyle(element).color) };
  });
  expect(colours.chevrons.length).toBeGreaterThan(0);
  expect(new Set(colours.chevrons)).toEqual(new Set([colours.fieldText]));
});

/** A computed colour's sRGB channels (0 to 255) and alpha. */
function rgba(color: string) {
  const [r = 0, g = 0, b = 0, a = 1] = color.match(/[\d.]+/g)?.map(Number) ?? [];
  return { r, g, b, a };
}
type Rgba = ReturnType<typeof rgba>;

/** `top` painted over the opaque `bottom`. */
const over = (top: Rgba, bottom: Rgba): Rgba => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});

/** The WCAG 2 contrast ratio of two opaque colours. */
function contrast(first: Rgba, second: Rgba): number {
  const luminance = ({ r, g, b }: Rgba) => {
    const [red, green, blue] = [r, g, b].map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test('resting search and select edges keep 3:1 against the page and their own fill', async ({ page }) => {
  for (const [surface, route, items, selects] of [
    ['Collection', '/?catalogs=off', '.game-card', 5],
    ['Discover', '/discover?catalogs=off', '.discovery-cards > li', 6],
  ] as const) {
    await page.goto(route);
    await expect(page.locator(items)).toHaveCount(24);
    await openBrowsingFilters(page);
    // Discover's exact source genre select sits in its own closed disclosure.
    const exactGenre = page.locator('details.discovery-help').filter({ has: page.locator('select') });
    if ((await exactGenre.count()) > 0 && (await exactGenre.getAttribute('open')) === null)
      await exactGenre.locator('summary').click();
    // At rest: no pointer over a field and no focus in one.
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const edges = await page.locator('main .search-field, main select').evaluateAll((elements) =>
      elements
        .filter((element) => element.checkVisibility())
        .map((element) => {
          // What shows through the field: each ancestor's background, up to the first opaque one.
          const layers: string[] = [];
          for (let node = element.parentElement; node; node = node.parentElement) {
            const background = getComputedStyle(node).backgroundColor;
            layers.push(background);
            if (!background.startsWith('rgba')) break;
          }
          const field = element instanceof HTMLSelectElement ? element : element.querySelector('input');
          const style = getComputedStyle(element);
          return {
            name: field?.getAttribute('aria-label') ?? field?.labels?.[0]?.childNodes[0]?.textContent?.trim() ?? '',
            search: element.classList.contains('search-field'),
            border: style.borderTopColor,
            borderStyle: style.borderTopStyle,
            borderWidth: parseFloat(style.borderTopWidth),
            fill: style.backgroundColor,
            layers,
          };
        }),
    );
    expect(
      edges.filter((edge) => edge.search),
      `${surface} search field`,
    ).toHaveLength(1);
    expect(edges.filter((edge) => !edge.search).length, `${surface} selects`).toBeGreaterThanOrEqual(selects);
    for (const edge of edges) {
      const label = `${surface} ${edge.search ? 'search field' : `${edge.name} select`}`;
      const backdrop = edge.layers.reduceRight((below, layer) => over(rgba(layer), below), rgba('rgb(255, 255, 255)'));
      const fill = over(rgba(edge.fill), backdrop);
      const border = over(rgba(edge.border), fill);
      expect(edge.borderStyle, label).toBe('solid');
      expect(edge.borderWidth, label).toBeGreaterThan(0);
      expect(contrast(border, backdrop), `${label} against the page`).toBeGreaterThanOrEqual(3);
      expect(contrast(border, fill), `${label} against its fill`).toBeGreaterThanOrEqual(3);
    }
  }
});

test('empty and failed local views retain readable recovery at 320px with text spacing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 852 });
  await installGuestLibrary(page, libraryFixture(0));
  await page.addStyleTag({ content: textSpacingCSS });
  await expectReadableSurface(page, 'First-run Library', true);
  await page.goto('/discover?catalogs=off&q=NoSuchGameReadabilityFixture');
  await page.addStyleTag({ content: textSpacingCSS });
  await expect(page.getByRole('heading', { name: 'No matching games', exact: true })).toBeVisible();
  await expectReadableSurface(page, 'Empty Discover recovery', true);
  await page.route('**/data/collection.json', (route) =>
    route.fulfill({ status: 503, body: 'Synthetic readability collection failure' }),
  );
  await page.goto('/?catalogs=off');
  await page.addStyleTag({ content: textSpacingCSS });
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expectReadableSurface(page, 'Failed collection recovery', true);
});

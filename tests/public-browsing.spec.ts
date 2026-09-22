import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { devices, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { canonicalCatalogId } from '../src/lib/catalog-identity';
import { readLibrary } from './library-helpers';
import { openBrowsingFilters } from './browsing-helpers';

const rawSeed = JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8'));
const seed = parseDiscoveryCatalog(rawSeed);
const credited = seed.items.find(item => item.artwork && item.artwork.credit.length > 200 && canonicalCatalogId(item.record.id) === item.record.id)!;
const cards = (page: Page) => page.locator('.discovery-cards > li');
const pager = (page: Page) => page.getByRole('navigation', { name: 'Catalog pages', exact: true });

declare global {
  interface Window {
    browsingDenyWrites?: boolean;
    releaseBrowsingNavigation?: () => void;
    removeBrowsingEditor?: () => Promise<boolean>;
  }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/catalog?**', route => route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }));
});

async function expectResultsFocus(page: Page) {
  const heading = page.getByRole('heading', { name: 'Catalog games', exact: true });
  await expect(heading).toBeFocused();
  const geometry = await heading.evaluate(element => ({
    top: element.getBoundingClientRect().top,
    headerBottom: document.querySelector('.site-header')!.getBoundingClientRect().bottom,
  }));
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom);
  expect(geometry.top).toBeLessThan(200);
}

test('local page 1, 2 and last preserve identity, view, history and truthful 24-item bearings', async ({ page }) => {
  const queries: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/catalog?')) queries.push(request.url()); });
  await page.goto('/discover');
  await expect(pager(page)).toContainText('1–24 of 845 catalog games');
  await expect(cards(page)).toHaveCount(24);
  const firstIds = await cards(page).evaluateAll(elements => elements.map(element => element.getAttribute('data-catalog-id')));
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/offset=24/);
  await expectResultsFocus(page);
  const secondIds = await cards(page).evaluateAll(elements => elements.map(element => element.getAttribute('data-catalog-id')));
  expect(firstIds.some(id => secondIds.includes(id))).toBe(false);
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page).toHaveURL(/offset=24.*view=list/);
  await page.reload();
  await expect(page.locator('.discovery-cards-list > li')).toHaveCount(24);
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await pager(page).getByRole('button', { name: 'Last', exact: true }).click();
  await expectResultsFocus(page);
  await expect(cards(page)).toHaveCount(5);
  await expect(pager(page)).toContainText('841–845 of 845 catalog games');
  await expect(pager(page).getByRole('combobox')).toHaveValue('36');
  await page.goBack();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(cards(page)).toHaveCount(24);
  expect(await cards(page).evaluateAll(elements => elements.map(element => element.getAttribute('data-catalog-id')))).toEqual(secondIds);
  await pager(page).getByRole('combobox').selectOption('36');
  await expectResultsFocus(page);
  await pager(page).getByRole('button', { name: 'First', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  expect(queries).toEqual([]);
});

test('filters reset and bound local pages without stealing focus while typing or changing selection scope', async ({ page }) => {
  await page.goto('/discover?offset=9999&catalogs=off');
  await expect(page).toHaveURL(/offset=840/);
  await expect(cards(page)).toHaveCount(5);
  const input = page.getByRole('searchbox', { name: 'Find a game', exact: true });
  await input.fill('RDR2');
  await expect(input).toBeFocused();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAttribute('data-catalog-id', 'red-dead-redemption-2');
  await expect(page).not.toHaveURL(/offset=/);
  await expect(pager(page)).toHaveCount(0);
  await input.fill('');
  await expect(pager(page)).toContainText('845 catalog games');
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await page.getByRole('button', { name: 'Select all 24 in this view', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Bulk game actions' })).toContainText('24 selected');
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Bulk game actions' })).toContainText('0 selected');
  await openBrowsingFilters(page);
  await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption('collection');
  await expect(page).not.toHaveURL(/offset=/);
  await expect(pager(page)).toContainText('1–24 of 100 catalog games');
  await pager(page).getByRole('button', { name: 'Last', exact: true }).click();
  await expect(cards(page)).toHaveCount(4);
  await expect(pager(page).getByRole('combobox')).toHaveValue('5');
  await input.fill('zzzz no matching collection game');
  await expect(input).toBeFocused();
  await expect(cards(page)).toHaveCount(0);
  await expect(pager(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No matching games' })).toBeVisible();
});

test('a cold late seed does not clamp a valid last-page URL to the temporary canonical-only count', async ({ page }) => {
  let release = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/data/discovery/catalog.v1.json', async route => { await waiting; await route.fulfill({ json: rawSeed }); });
  await page.goto('/discover?offset=840&catalogs=off');
  await expect(page.locator('.discovery-results-heading')).toContainText('Loading more catalog games');
  await expect(page.getByRole('heading', { name: 'No games on this page', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/offset=840/);
  release();
  await expect(pager(page).getByRole('combobox')).toHaveValue('36');
  await expect(cards(page)).toHaveCount(5);
  await expect(page).toHaveURL(/offset=840/);
});

test('provider offsets stay separate from known-local pages and local navigation never requests provider offsets', async ({ page }) => {
  await page.unroute('**/api/catalog?**');
  const offsets: number[] = [];
  await page.route('**/api/catalog?**', route => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get('offset') ?? '0');
    offsets.push(offset);
    return route.fulfill({ json: { source: 'wikidata', query: params.get('q') ?? '', offset, items: [], total: 11, nextOffset: offset === 5 ? 10 : null, notices: ['Bounded provider fixture; provider count is separate from local coverage.'] } });
  });
  await page.goto('/discover?source=wikidata&online=on&offset=5');
  await expect(page.getByRole('button', { name: 'More from Wikidata', exact: true })).toBeVisible();
  await expect(pager(page)).toHaveCount(0);
  await expect(page).toHaveURL(/offset=5/);
  await page.getByRole('button', { name: 'More from Wikidata', exact: true }).click();
  await expect(page).toHaveURL(/offset=10/);
  await expectResultsFocus(page);
  expect(offsets).toEqual([5, 10]);
  await page.getByRole('button', { name: 'Back to catalog', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  const before = offsets.length;
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  expect(offsets).toHaveLength(before);
});

test('invalid and failed ratings stay with their original card; successful paging waits for persistence', async ({ page }) => {
  await page.goto('/discover?catalogs=off');
  await expect(pager(page)).toContainText('845 catalog games');
  const first = cards(page).first();
  const id = await first.getAttribute('data-catalog-id');
  if (!id) throw new Error('The fixture must expose its exact catalog identity.');
  await first.locator('.discovery-card-details > summary').click();
  const rating = first.getByRole('spinbutton');
  await rating.fill('12');
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).not.toHaveURL(/offset=/);
  await expect(rating).toHaveValue('12');
  await expect(page.getByText('Your rating has not saved.', { exact: false })).toBeVisible();
  await page.evaluate(() => {
    window.browsingDenyWrites = true;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'library' && window.browsingDenyWrites) throw new DOMException('Synthetic public-browsing write failure.', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await rating.fill('8.6');
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).not.toHaveURL(/offset=/);
  await expect(rating).toHaveValue('8.6');
  expect((await readLibrary(page)).ranking.find(entry => entry.id === id)).toBeUndefined();
  await page.evaluate(() => { window.browsingDenyWrites = false; });
  await rating.fill('8.7');
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/offset=24/);
  await expectResultsFocus(page);
  const library = await readLibrary(page);
  expect(library.ranking.find(entry => entry.id === id)?.score).toBe(8.7);
  expect(library.progress[id]?.played ?? false).toBe(false);
  expect(library.queueOrder).toEqual([]);
});

test('a pending page intent cannot replace a newer Back navigation after its delayed flush', async ({ page }) => {
  await page.goto('/discover?catalogs=off');
  await expect(pager(page)).toContainText('845 catalog games');
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/offset=24/);
  await page.evaluate(async () => {
    const path = '/src/hooks/useExitSave.ts';
    const loaded = performance.getEntriesByType('resource').map(entry => entry.name).findLast(value => new URL(value).pathname === path);
    if (!loaded) throw new Error('The active app editor registry was not loaded.');
    const { registerPendingEditor }: typeof import('../src/hooks/useExitSave') = await import(loaded);
    let pending = true;
    const flush = new Promise<boolean>(resolve => { window.releaseBrowsingNavigation = () => { pending = false; resolve(true); }; });
    window.removeBrowsingEditor = registerPendingEditor({ pending: () => pending, flush: () => flush });
  });
  await pager(page).getByRole('button', { name: 'Last', exact: true }).click();
  await expect(page.getByText('Saving your rating before changing results...', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/offset=/);
  await page.evaluate(async () => { window.releaseBrowsingNavigation?.(); await window.removeBrowsingEditor?.(); });
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(page).not.toHaveURL(/offset=/);
});

test('short targets and horizontal table scrolling retain a compact visible original identity', async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/?view=table&catalogs=off');
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  const targets = await table.locator('.table-sort').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
  const region = page.getByRole('region', { name: 'Rankings and ratings table; scroll horizontally for all scores' });
  await region.focus(); await region.press('ArrowRight');
  if (isMobile) {
    await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await region.evaluate(element => { element.scrollLeft = 620; });
    const bounds = await table.locator('tbody tr').first().locator('.table-game').evaluate(element => {
      const region = document.querySelector('.ratings-scroll')!;
      return { identity: element.getBoundingClientRect().toJSON(), region: region.getBoundingClientRect().toJSON(), inlineRank: element.querySelector('.table-inline-rank')!.textContent };
    });
    expect(Math.abs(bounds.identity.left - bounds.region.left - 1)).toBeLessThan(2);
    expect(bounds.identity.width).toBeLessThanOrEqual(150);
    expect(bounds.region.width - bounds.identity.width).toBeGreaterThanOrEqual(100);
    expect(bounds.inlineRank).toBe('#01');
  }
  await expect(table.getByRole('link', { name: 'Red Dead Redemption 2', exact: true })).toHaveAttribute('href', /game=red-dead-redemption-2/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/discover?catalogs=off');
  await expect(pager(page)).toContainText('845 catalog games');
  const titles = await cards(page).locator('h3 button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
  expect(titles.every(width => width >= 44)).toBe(true);
});

test('the tray preserves complete art provenance behind a labelled disclosure and names friends rankings', async ({ page }) => {
  expect(credited?.artwork).toBeTruthy();
  await page.addInitScript(record => localStorage.setItem('play100:compare-tray:v1:guest', JSON.stringify({ version: 1, scope: 'guest', items: [record] })), credited.record);
  await page.goto('/discover?catalogs=off');
  await expect(page.getByRole('button', { name: 'Compare rankings with friends', exact: true })).toBeVisible();
  await expect(page.locator('.compare-tray-action-context')).toBeVisible();
  await expect(page.locator('.compare-tray-action')).toHaveText('Compare rankings with friends');
  await page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare tray', exact: true });
  await expect(dialog).toContainText('Choose friends to compare their rankings of these games.');
  const disclosure = dialog.locator('.game-artwork-disclosure');
  await expect(disclosure).toHaveCount(1);
  await expect(disclosure.locator('.game-artwork-credit')).toBeHidden();
  await disclosure.locator('summary').focus(); await disclosure.locator('summary').press('Enter');
  await expect(disclosure.locator('.game-artwork-credit')).toBeVisible();
  expect(await disclosure.locator('.game-artwork-credit').textContent()).toBe(`Art: ${credited.artwork!.credit} / ${credited.artwork!.license}`);
  await expect(disclosure.locator('a').first()).toHaveAttribute('href', credited.artwork!.sourceUrl);
  await expect(disclosure.locator('a').last()).toHaveAttribute('href', credited.artwork!.licenseUrl);
  expect((await readLibrary(page)).ranking).toEqual([]);
  expect((await readLibrary(page)).records).toEqual({});
});

test('focused mobile recovery clears the fixed bar and retries through ordinary input', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The fixed bottom navigation is mobile-only.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/data/collection.json', route => route.fulfill({ status: 503, body: 'Synthetic public collection failure' }));
  await page.goto('/');
  const retry = page.getByRole('button', { name: 'Try again', exact: true });
  await retry.focus();
  const focus = await retry.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, navTop: nav.top, centerHitsButton: element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) };
  });
  expect(focus.bottom).toBeLessThanOrEqual(focus.navTop);
  expect(focus.centerHitsButton).toBe(true);
  await page.unroute('**/data/collection.json');
  await retry.press('Enter');
  await expect(page.locator('.game-card')).toHaveCount(24);
});

test('a pinned tray leaves the first explored game identity unobscured at 320px without changing target sizes or saved data', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'This is the actual coarse-pointer narrow mobile dock intersection.');
  const pinnedGame = seed.items.find(item => item.record.id === 'wikidata:Q161234')?.record;
  if (!pinnedGame) throw new Error('The local 0 A.D. fixture is required for the reported cross-flow.');
  expect(pinnedGame.title).toBe('0 A.D.');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.evaluate(() => document.fonts.ready);
  const before = await readLibrary(page);
  const measure = () => page.locator('.game-card h3').first().evaluate(element => {
    const title = element.getBoundingClientRect();
    const link = element.closest('a');
    const hits = [0.15, 0.5, 0.85].map(fraction => {
      const hit = document.elementFromPoint(title.left + title.width * fraction, title.bottom - 2);
      return { intendedGame: Boolean(hit && (element.contains(hit) || link?.contains(hit))), tag: hit?.tagName, className: hit?.getAttribute('class') };
    });
    return {
      title: title.toJSON(),
      nav: document.querySelector('.mobile-nav')!.getBoundingClientRect().toJSON(),
      dock: document.querySelector('.compare-tray-dock')?.getBoundingClientRect().toJSON() ?? null,
      header: document.querySelector('.site-header')!.getBoundingClientRect().toJSON(),
      collection: document.querySelector('#collection')!.getBoundingClientRect().toJSON(),
      hits, coarse: matchMedia('(pointer: coarse)').matches, touch: navigator.maxTouchPoints,
      targets: [...document.querySelectorAll('.compare-tray-dock button')].map(button => ({
        label: button.getAttribute('aria-label') ?? button.textContent,
        width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
      })),
    };
  });
  await page.getByRole('link', { name: 'Explore all 100', exact: true }).click();
  const empty = await measure();
  expect(empty.coarse).toBe(true); expect(empty.touch).toBeGreaterThan(0);
  expect(empty.dock).toBeNull();
  expect(empty.title.bottom).toBeLessThanOrEqual(empty.nav.top);
  expect(empty.hits.every(hit => hit.intendedGame)).toBe(true);
  await page.locator('.mobile-nav').getByRole('link', { name: 'Discover', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill(pinnedGame.title);
  const card = page.locator(`[data-catalog-id="${pinnedGame.id}"]`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: `Pin ${pinnedGame.title} for comparison`, exact: true }).click();
  const targetsBefore = await page.locator('.compare-tray-dock button').evaluateAll(buttons => buttons.map(button => ({
    label: button.getAttribute('aria-label') ?? button.textContent,
    width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
  })));
  await page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true }).click();
  await page.getByRole('dialog', { name: 'Compare tray', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.mobile-nav').getByRole('link', { name: 'The 100', exact: true }).click();
  await page.getByRole('link', { name: 'Explore all 100', exact: true }).click();
  const pinned = await measure();
  await writeFile(info.outputPath('pinned-explore-geometry.json'), JSON.stringify({ empty, pinned, targetsBefore, pinnedGame: pinnedGame.id }, null, 2));
  await page.screenshot({ path: info.outputPath('pinned-explore-320.png'), scale: 'css' });
  expect(pinned.dock).not.toBeNull();
  expect(pinned.title.bottom).toBeLessThanOrEqual(pinned.dock!.top);
  expect(pinned.hits.every(hit => hit.intendedGame)).toBe(true);
  expect(pinned.targets).toEqual(targetsBefore);
  expect(pinned.targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
  expect(pinned.collection.top).toBeGreaterThanOrEqual(pinned.header.bottom);
  expect(await readLibrary(page)).toEqual(before);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('play100:compare-tray:v1:guest') ?? '{}').items.map((record: { id: string }) => record.id))).toEqual([pinnedGame.id]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('batched desktop and mobile pixels keep games before secondary filters and bound native chevrons', async ({ browser, isMobile, baseURL }, info) => {
  test.setTimeout(90_000);
  test.skip(isMobile, 'One explicit multi-width pixel batch, not a duplicate project pass.');
  const measurements = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 393, height: 851 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const touch = viewport.width <= 760;
    const context = await browser.newContext({ ...(touch ? devices['Pixel 7'] : devices['Desktop Chrome']), baseURL, viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
    await page.route('**/api/catalog?**', route => route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }));
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    await page.getByRole('link', { name: 'Explore all 100', exact: true }).click();
    const first = page.locator('.game-card h3').first();
    const result = await first.evaluate(element => ({
      identity: element.getBoundingClientRect().toJSON(),
      nav: document.querySelector('.mobile-nav')!.getBoundingClientRect().toJSON(),
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      maxTouchPoints: navigator.maxTouchPoints,
      resultWidth: document.querySelector('.result-summary')!.getBoundingClientRect().width,
    }));
    if (touch) expect(result.identity.bottom).toBeLessThanOrEqual(result.nav.top);
    expect(result.width).toBe(viewport.width);
    expect(result.coarsePointer).toBe(touch);
    expect(result.resultWidth).toBeGreaterThanOrEqual(90);
    expect(result.documentWidth).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: info.outputPath(`collection-${viewport.width}.png`) });
    await openBrowsingFilters(page);
    const controls = await page.locator('.filter-select').evaluateAll(elements => elements.map(element => {
      const select = element.querySelector('select')!.getBoundingClientRect();
      const arrow = element.querySelector('.select-chevron')!.getBoundingClientRect();
      return { width: select.width, height: select.height, contained: arrow.left >= select.left && arrow.right <= select.right, centered: Math.abs(select.y + select.height / 2 - arrow.y - arrow.height / 2) };
    }));
    expect(controls).toHaveLength(5);
    expect(controls.every(control => control.height >= 44 && control.contained && control.centered <= 0.5)).toBe(true);
    measurements.push({ viewport, result, controls });
    await writeFile(info.outputPath('geometry.json'), JSON.stringify(measurements, null, 2));
    await page.goto('/discover?catalogs=off');
    await expect(pager(page)).toContainText('845 catalog games');
    await page.screenshot({ path: info.outputPath(`discover-${viewport.width}.png`) });
    await page.goto('/?view=table&catalogs=off');
    const scroll = page.locator('.ratings-scroll');
    await expect(scroll).toBeVisible();
    await scroll.scrollIntoViewIfNeeded();
    await scroll.evaluate(element => { element.scrollLeft = 600; });
    await page.screenshot({ path: info.outputPath(`table-${viewport.width}.png`) });
    await page.evaluate(record => localStorage.setItem('play100:compare-tray:v1:guest', JSON.stringify({ version: 1, scope: 'guest', items: [record] })), credited.record);
    await page.goto('/discover?catalogs=off');
    await expect(page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true }).click();
    const credits = page.locator('.compare-tray-sheet .game-artwork-disclosure');
    await expect(credits).toBeVisible();
    await page.screenshot({ path: info.outputPath(`tray-${viewport.width}.png`) });
    await credits.locator('summary').click();
    await expect(credits.locator('.game-artwork-credit')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`tray-credits-${viewport.width}.png`) });
    await page.getByRole('dialog', { name: 'Compare tray', exact: true }).getByRole('button', { name: 'Clear all', exact: true }).click();
    await page.getByRole('dialog', { name: 'Compare tray', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click();
    } finally {
      await context.close();
    }
  }
  await writeFile(info.outputPath('geometry.json'), JSON.stringify(measurements, null, 2));
});

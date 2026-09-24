import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { parseCollection } from '../src/lib/collection';
import { parseDiscoveryCatalogJson } from '../src/lib/discovery-catalog';
import { catalogSearchItems } from '../src/lib/catalog-identity';
import { defaultDiscoveryFilters, parseDiscoverySearch } from '../src/lib/discovery-search';
import { discoveryScope } from '../src/lib/discovery-scope';
import { readLibrary } from './library-helpers';
import { openBrowsingFilters } from './browsing-helpers';

const games = parseCollection(
  JSON.parse(readFileSync(new URL('../public/data/collection.json', import.meta.url), 'utf8')),
).games;
const seed = parseDiscoveryCatalogJson(
  readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8'),
);
const items = catalogSearchItems(games, seed.items);
const ids = (page: Page) =>
  page.locator('[data-catalog-id]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-catalog-id')));
async function ready(page: Page) {
  await expect(page.locator('.discovery-results-heading')).not.toContainText('Loading');
  await expect(page.locator('[data-catalog-id]').first()).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('small native family choices preserve legacy exact URLs, Back, refresh, reset and private state', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/catalog?')) requests.push(request.url());
  });
  const genre = '2D fighting game / airdasher';
  await page.goto(`/discover?catalogs=off&genre=${encodeURIComponent(genre)}&online=on&offset=48&campaign=preserved`);
  await ready(page);
  await openBrowsingFilters(page);
  const family = page.getByRole('combobox', { name: 'Genre family', exact: true });
  const exact = page.getByRole('combobox', { name: 'Exact source genre', exact: true });
  await expect(family.locator('option')).toHaveCount(15);
  await expect(family).toHaveValue('');
  await expect(exact).toBeVisible();
  await expect(exact).toHaveValue(genre);
  expect(await ids(page)).toEqual(
    discoveryScope(items, { ...defaultDiscoveryFilters, genre })
      .cards.slice(0, 24)
      .map((item) => item.record.id),
  );
  const before = await readLibrary(page);
  await family.selectOption('role-playing');
  await expect(page).toHaveURL(/genreFamily=role-playing/);
  expect(parseDiscoverySearch(new URL(page.url()).search)).toMatchObject({
    genre: '',
    genreFamily: 'role-playing',
    offset: 0,
    online: 'auto',
  });
  expect(new URL(page.url()).searchParams.get('campaign')).toBe('preserved');
  const expected = discoveryScope(items, { ...defaultDiscoveryFilters, genreFamily: 'role-playing' }).cards;
  await expect.poll(() => ids(page)).toEqual(expected.slice(0, 24).map((item) => item.record.id));
  await expect(page.locator('.discovery-results-heading')).toContainText(`of ${expected.length} catalog games`);
  await page
    .getByRole('navigation', { name: 'Catalog pages' })
    .getByRole('button', { name: 'Next', exact: true })
    .click();
  await expect(page.locator('#discovery-results-title')).toBeFocused();
  await expect.poll(() => ids(page)).toEqual(expected.slice(24, 48).map((item) => item.record.id));
  await page.goBack();
  await expect.poll(() => ids(page)).toEqual(expected.slice(0, 24).map((item) => item.record.id));
  await page.goBack();
  await expect(exact).toHaveValue(genre);
  await expect(family).toHaveValue('');
  await page.goForward();
  await expect(family).toHaveValue('role-playing');
  await expect.poll(() => ids(page)).toEqual(expected.slice(0, 24).map((item) => item.record.id));
  await page.goBack();
  await page.reload();
  await ready(page);
  await openBrowsingFilters(page);
  await expect(exact).toHaveValue(genre);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect
    .poll(() => ids(page))
    .toEqual(
      discoveryScope(items, defaultDiscoveryFilters)
        .cards.slice(0, 24)
        .map((item) => item.record.id),
    );
  expect(parseDiscoverySearch(new URL(page.url()).search)).toEqual({ ...defaultDiscoveryFilters, catalogs: 'off' });
  expect(new URL(page.url()).searchParams.get('campaign')).toBe('preserved');
  expect(await readLibrary(page)).toEqual(before);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('new family links roundtrip through details and filter fetched provider results without forwarding local filter parameters', async ({
  page,
}) => {
  const requests: URL[] = [];
  const record = {
    id: 'freetogame:999999',
    source: 'freetogame',
    sourceId: '999999',
    sourceUrl: 'https://www.freetogame.com/game',
    title: 'Facet fixture',
    genre: 'Shooter',
    year: 2020,
    studio: null,
    collectionRank: null,
  };
  await page.route('**/api/catalog?**', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    return route.fulfill({
      json: {
        source: 'freetogame',
        query: url.searchParams.get('q') ?? '',
        offset: Number(url.searchParams.get('offset')),
        total: 2,
        nextOffset: null,
        notices: [],
        items: [
          record,
          { ...record, id: 'freetogame:999998', sourceId: '999998', title: 'Other facet fixture', genre: 'RPG' },
        ],
      },
    });
  });
  await page.goto('/discover?q=Facet%20fixture&source=freetogame&genreFamily=shooter&online=on');
  const card = page.locator('[data-catalog-id="freetogame:999999"]');
  await expect(card).toBeVisible();
  await expect(page.locator('[data-catalog-id="freetogame:999998"]')).toHaveCount(0);
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) expect([...url.searchParams.keys()].sort()).toEqual(['offset', 'q', 'source']);
  await card.getByRole('button', { name: record.title, exact: true }).click();
  await expect(page.getByRole('dialog', { name: record.title, exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('genreFamily')).toBe('shooter');
  await page
    .getByRole('dialog', { name: record.title, exact: true })
    .getByRole('button', { name: 'Close dialog', exact: true })
    .click();
  await expect(card).toBeVisible();
  expect(new URL(page.url()).searchParams.get('genreFamily')).toBe('shooter');
  await page.reload();
  await expect(card).toBeVisible();
  await openBrowsingFilters(page);
  await expect(page.getByRole('combobox', { name: 'Genre family', exact: true })).toHaveValue('shooter');
});

test('clear filters retains search and view while the empty-result reset clears search too', async ({ page }) => {
  await page.goto('/discover?q=RDR2&source=collection&genreFamily=shooter&view=list&catalogs=off&campaign=preserved');
  await expect(page.getByRole('heading', { name: 'No matching games', exact: true })).toBeVisible();
  await openBrowsingFilters(page);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('[data-canonical-id="red-dead-redemption-2"]')).toBeVisible();
  expect(parseDiscoverySearch(new URL(page.url()).search)).toMatchObject({
    q: 'RDR2',
    source: 'all',
    genreFamily: '',
    view: 'list',
    catalogs: 'off',
  });
  await page.getByRole('combobox', { name: 'Genre family', exact: true }).selectOption('shooter');
  await expect(page.getByRole('heading', { name: 'No matching games', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset search and filters', exact: true }).click();
  await expect
    .poll(() => ids(page))
    .toEqual(
      discoveryScope(items, defaultDiscoveryFilters)
        .cards.slice(0, 24)
        .map((item) => item.record.id),
    );
  expect(parseDiscoverySearch(new URL(page.url()).search)).toEqual({
    ...defaultDiscoveryFilters,
    view: 'list',
    catalogs: 'off',
  });
  expect(new URL(page.url()).searchParams.get('campaign')).toBe('preserved');
});

test('changing a family cannot discard an invalid pending rating or replace its results', async ({ page }) => {
  await page.goto('/discover?q=RDR2&catalogs=off&include100=on');
  await ready(page);
  await openBrowsingFilters(page);
  const card = page.locator('[data-catalog-id="red-dead-redemption-2"]');
  await card.getByText('Actions & source', { exact: true }).click();
  const rating = card.getByRole('spinbutton', { name: 'Your rating / 10 for Red Dead Redemption 2', exact: true });
  await rating.fill('11');
  const before = await readLibrary(page);
  const url = page.url();
  const family = page.getByRole('combobox', { name: 'Genre family', exact: true });
  await family.focus();
  await family.selectOption('shooter');
  await expect(page.locator('.discovery-page')).toContainText('Your rating has not saved.');
  expect(page.url()).toBe(url);
  await expect(rating).toHaveValue('11');
  await expect(card).toBeVisible();
  await expect(family).toBeFocused();
  await expect(family).toHaveValue('');
  expect(await readLibrary(page)).toEqual(before);
});

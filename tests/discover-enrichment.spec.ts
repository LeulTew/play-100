import { expect, test } from '@playwright/test';
import { enrichmentFixture } from '../src/lib/discovery-test-fixtures';
import { readLibrary } from './library-helpers';
import { openBrowsingFilters } from './browsing-helpers';

const id = 'wikidata:Q15408545';
const title = 'Kingdom Come: Deliverance';
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/catalog?**', route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { source: params.get('source'), query: params.get('q') ?? '', offset: Number(params.get('offset') ?? 0), items: [], total: 0, nextOffset: null, notices: [] } });
  });
});

test('outside100 is the default and canonical alias recovery never requests enrichment', async ({ page }) => {
  const lookups: string[] = [];
  await page.route('**/api/catalog-detail?**', route => { lookups.push(route.request().url()); return route.fulfill({ json: enrichmentFixture() }); });
  await page.goto('/discover?q=RDR2&genreFamily=action-adventure&campaign=retained');
  const canonical = page.locator('[data-canonical-id="red-dead-redemption-2"]');
  await expect(canonical).toBeVisible();
  await expect(page.locator('[data-catalog-id="red-dead-redemption-2"]')).toHaveCount(0);
  await canonical.click();
  await expect(page.locator('.game-dialog')).toBeVisible();
  await expect(page.locator('.game-dialog .author-rating-detail')).toContainText("Leul's original rating");
  expect(new URL(page.url()).searchParams.get('genreFamily')).toBe('action-adventure');
  expect(new URL(page.url()).searchParams.get('campaign')).toBe('retained');
  await page.keyboard.press('Escape');
  await openBrowsingFilters(page);
  await page.getByRole('checkbox', { name: 'Include The 100', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Include The 100', exact: true })).toBeChecked();
  await expect(page.locator('[data-catalog-id="red-dead-redemption-2"]')).toHaveCount(1);
  await expect(canonical).toHaveCount(0);
  expect(lookups).toEqual([]);
});

test('an unknown edition is not title-merged with The100', async ({ page }) => {
  await page.unroute('**/api/catalog?**');
  await page.route('**/api/catalog?**', route => route.fulfill({ json: {
    source: 'wikidata', query: 'RDR2', offset: 0, total: 2, nextOffset: null, notices: [],
    items: [
      { id: 'wikidata:Q27438121', source: 'wikidata', sourceId: 'Q27438121', title: 'RDR2', year: 2018, studio: null, genre: null, sourceUrl: 'https://www.wikidata.org/wiki/Q27438121', collectionRank: null },
      { id: 'wikidata:Q90000001', source: 'wikidata', sourceId: 'Q90000001', title: 'RDR2', year: 2025, studio: null, genre: 'RPG', sourceUrl: 'https://www.wikidata.org/wiki/Q90000001', collectionRank: null },
    ],
  } }));
  await page.goto('/discover?q=RDR2&online=on&source=wikidata');
  await expect(page.locator('[data-catalog-id="wikidata:Q90000001"]')).toBeVisible();
  await expect(page.locator('[data-catalog-id="wikidata:Q27438121"]')).toHaveCount(0);
  await expect(page.locator('[data-catalog-id="red-dead-redemption-2"]')).toHaveCount(0);
  await expect(page.locator('[data-canonical-id="red-dead-redemption-2"]')).toHaveCount(1);
});

test('detail opens before enrichment, keeps source scales separate and does not write private opinions', async ({ page }) => {
  let release = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const requests: URL[] = [];
  await page.route('**/api/catalog-detail?**', async route => {
    requests.push(new URL(route.request().url()));
    await waiting;
    await route.fulfill({ json: enrichmentFixture() });
  });
  await page.goto('/discover?q=Kingdomcome');
  const card = page.locator(`[data-catalog-id="${id}"]`);
  await expect(card).toBeVisible();
  const before = await readLibrary(page);
  await card.getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeFocused();
  await expect(dialog.getByRole('spinbutton', { name: `Your rating for ${title}`, exact: true })).toBeEnabled();
  await expect(dialog).toContainText('Loading public ratings');
  release();
  await expect(dialog.locator('.catalog-review-list')).toContainText('83/100');
  await expect(dialog.locator('.catalog-review-list')).toContainText('Example publication');
  await expect(dialog.locator('.catalog-review-list')).toContainText('via Wikidata');
  await expect(dialog.locator('.catalog-review-list')).toContainText('2024-04-20');
  await expect(dialog.getByRole('spinbutton')).toHaveValue('');
  expect(await readLibrary(page)).toEqual(before);
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) {
    expect([...url.searchParams.keys()]).toEqual(['id']);
    expect(url.searchParams.get('id')).toBe(id);
  }
});

test('online optout makes no detail request until the explicit enable action', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/catalog-detail?**', route => { requests.push(route.request().url()); return route.fulfill({ json: enrichmentFixture() }); });
  await page.goto('/discover?q=Kingdomcome&catalogs=off&genreFamily=role-playing');
  await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toContainText('Online lookup is off.');
  expect(requests).toEqual([]);
  await dialog.getByRole('button', { name: 'Enable online details', exact: true }).click();
  await expect(dialog.locator('.catalog-review-list')).toContainText('83/100');
  expect(new URL(page.url()).searchParams.get('genreFamily')).toBe('role-playing');
  expect(requests.length).toBeGreaterThan(0);
});

test('a late response cannot reopen a closed detail or attach ratings to a new game', async ({ page }) => {
  let release = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/catalog-detail?**', async route => { await waiting; await route.fulfill({ json: enrichmentFixture() }); });
  await page.goto('/discover?q=Kingdomcome');
  await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Loading public ratings');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  release();
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill('RDR2');
  await page.locator('[data-canonical-id="red-dead-redemption-2"]').click();
  await expect(page.locator('.game-dialog')).toBeVisible();
  await expect(page.locator('.game-dialog')).not.toContainText('Example publication');
  await expect(page.locator('.game-dialog .catalog-review-list')).toHaveCount(0);
});

test('a per-source failure stays visible while successful scores remain usable', async ({ page }) => {
  const fixture = enrichmentFixture();
  fixture.sources[1] = { source: 'steam', status: 'error', code: 'rate-limited', message: 'Steam is rate-limiting public summaries.', retryAfter: 30 };
  await page.route('**/api/catalog-detail?**', route => route.fulfill({ json: fixture }));
  await page.goto('/discover?q=Kingdomcome');
  await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog.locator('.catalog-review-list')).toContainText('83/100');
  await expect(dialog.getByRole('alert')).toContainText('Steam is rate-limiting');
  await expect(dialog.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
});

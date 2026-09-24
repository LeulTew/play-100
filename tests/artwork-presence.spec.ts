import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { emptyPersonalLibrary } from '../src/lib/personal-library';
import type { LibraryRecord } from '../src/lib/personal-types';
import { installGuestLibrary, libraryFixture } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

const catalog = parseDiscoveryCatalog(JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')));
const noArt = catalog.items.find(item => item.record.id === 'freetogame:615');
const illustrated = catalog.items.find(item => item.record.id === 'wikidata:Q161234');
if (!noArt || noArt.artwork || !illustrated?.artwork) throw new Error('The exact shipped artwork-presence fixtures changed.');
const noArtRecord = noArt.record;
const illustratedItem = illustrated;
const illustratedArtwork = illustrated.artwork;
const manual: LibraryRecord = { id: 'manual:art-presence', source: 'manual', sourceId: 'art-presence',
  title: 'Owned manual fixture', year: null, sourceUrl: null, collectionRank: null, studio: null, genre: null };

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Artwork-presence fixtures require the owned local preview.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname === '/api/catalog') return route.abort('blockedbyclient');
    return route.continue();
  });
});

function requestLedger(page: Page) {
  const requests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/data/discovery/catalog.v1.json') requests.push(request.url());
  });
  return requests;
}

async function singleLibrary(page: Page, records: LibraryRecord[]) {
  await installGuestLibrary(page, { ...emptyPersonalLibrary(), motion: 'lite',
    records: Object.fromEntries(records.map(record => [record.id, record])) });
}

test('known no-art dense Library preview and Pin need no complete catalog request or metadata override', async ({ page }, info) => {
  const requests = requestLedger(page);
  const fixture = libraryFixture();
  const own = fixture.records[noArtRecord.id];
  if (!own) throw new Error('The dense fixture must own freetogame:615.');
  const ownedTitle = 'Owned metadata for the no-art fixture';
  await installGuestLibrary(page, { ...fixture, records: { ...fixture.records, [own.id]: { ...own, title: ownedTitle } } });
  const before = await readLibrary(page);
  await page.getByRole('searchbox', { name: 'Search your library', exact: true }).fill(ownedTitle);
  const row = page.locator(`.personal-row-static[data-record-id="${own.id}"]`);
  const opener = row.getByRole('button', { name: ownedTitle, exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: ownedTitle, exact: true });
  await expect(dialog.getByRole('heading', { name: ownedTitle, exact: true })).toBeFocused();
  await expect(dialog.getByText('Artwork unavailable', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(opener).toBeFocused();
  await row.getByRole('button', { name: `Pin for comparison: ${ownedTitle}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Compare tray', exact: true })).toContainText(ownedTitle);
  expect(await readLibrary(page)).toEqual(before);
  expect(requests).toEqual([]);
  await info.attach('no-art-request-ledger', { contentType: 'application/json', body: JSON.stringify({
    exactRecord: own.id, libraryRecords: Object.keys(before.records).length, fullCatalogRequests: requests.length,
    privateMetadataPreserved: true, timingClaim: false,
  }) });
});

test('a validated manual Pin and preview do not request public metadata or gain artwork', async ({ page }) => {
  const requests = requestLedger(page);
  await singleLibrary(page, [manual]);
  const before = await readLibrary(page);
  const row = page.locator(`.personal-row-static[data-record-id="${manual.id}"]`);
  await row.getByRole('button', { name: `Pin for comparison: ${manual.title}`, exact: true }).click();
  await row.getByRole('button', { name: manual.title, exact: true }).click();
  await expect(page.getByRole('dialog', { name: manual.title, exact: true })).toBeVisible();
  await expect(page.locator('.catalog-detail-sleeve img')).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(await readLibrary(page)).toEqual(before);
});

for (const intent of ['preview', 'pin'] as const) {
  test(`known licensed artwork still loads the original catalog and credits for a ${intent}`, async ({ page }, info) => {
    const requests = requestLedger(page);
    await singleLibrary(page, [illustratedItem.record]);
    const before = await readLibrary(page);
    const row = page.locator(`.personal-row-static[data-record-id="${illustratedItem.record.id}"]`);
    if (intent === 'preview') await row.getByRole('button', { name: illustratedItem.record.title, exact: true }).click();
    else {
      await row.getByRole('button', { name: `Pin for comparison: ${illustratedItem.record.title}`, exact: true }).click();
      await page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true }).click();
    }
    const dialog = page.getByRole('dialog', { name: intent === 'preview' ? illustratedItem.record.title : 'Compare tray', exact: true });
    await expect(dialog.locator('img').first()).toHaveAttribute('src', illustratedArtwork.src);
    await dialog.locator('.game-artwork-disclosure > summary').click();
    await expect(dialog.locator('.game-artwork-credit')).toContainText(illustratedArtwork.credit);
    await expect(dialog.getByRole('link', { name: illustratedArtwork.license, exact: true })).toHaveAttribute('href', illustratedArtwork.licenseUrl);
    expect(requests).toHaveLength(1);
    expect(await readLibrary(page)).toEqual(before);
    await info.attach('licensed-art-request-ledger', { contentType: 'application/json', body: JSON.stringify({
      exactRecord: illustratedItem.record.id, fullCatalogRequests: requests.length, exactArtworkAndLicense: true,
    }) });
  });
}

for (const id of ['freetogame:615', 'wikidata:Q999999999999999']) {
  test(`an unresolved public deep link still loads metadata for ${id}`, async ({ page }) => {
    const requests = requestLedger(page);
    await singleLibrary(page, []);
    const before = await readLibrary(page);
    await page.goto(`/?${new URLSearchParams({ catalogs: 'off', game: id })}`);
    if (id === noArtRecord.id) {
      await expect(page.getByRole('dialog', { name: noArtRecord.title, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: noArtRecord.title, exact: true })).toBeFocused();
    } else {
      await expect(page.getByRole('heading', { name: "That game isn't in this collection.", exact: true })).toBeVisible();
    }
    expect(requests).toHaveLength(1);
    expect(await readLibrary(page)).toEqual(before);
  });
}

test('the existing friend-comparison artwork request remains enabled without a selected game', async ({ page }) => {
  const requests = requestLedger(page);
  await singleLibrary(page, []);
  await page.goto('/compare?catalogs=off');
  await expect.poll(() => requests.length).toBe(1);
  expect(new URL(page.url()).searchParams.has('game')).toBe(false);
});

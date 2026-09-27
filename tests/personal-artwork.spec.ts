import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { applyPersonalAction, emptyPersonalLibrary } from '../src/lib/personal-library';
import type { LibraryRecord, PersonalLibraryState } from '../src/lib/personal-types';
import { installGuestLibrary, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

const catalog = parseDiscoveryCatalog(
  JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')),
);
const illustrated = catalog.items.find((item) => item.record.title === '0 A.D.');
const missing = catalog.items.find((item) => item.record.id === 'freetogame:615');
const authored = libraryRecords.find((record) => record.source === 'collection');
const secondIllustrated = catalog.items.find((item) => item.artwork && item.record.id !== illustrated?.record.id);
if (!illustrated?.artwork || !missing || missing.artwork || !authored || !secondIllustrated?.artwork) {
  throw new Error('The shipped personal-artwork fixtures changed.');
}
const provider = illustrated.record;
const artwork = illustrated.artwork;
const noArt = missing.record;
const original = authored;
const otherProvider = secondIllustrated.record;
const views = ['Library', 'Queue', 'Ranking'] as const;
type View = (typeof views)[number];

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Personal-artwork fixtures require the owned local preview.');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin !== new URL(baseURL).origin || url.pathname.startsWith('/api/')
      ? route.abort('blockedbyclient')
      : route.continue();
  });
});

function inEveryView(records: LibraryRecord[]) {
  let state: PersonalLibraryState = { ...emptyPersonalLibrary(), motion: 'lite' };
  state = applyPersonalAction(state, { type: 'set-progress', records, key: 'later', value: true });
  return applyPersonalAction(state, { type: 'add-ranking', records });
}

function identity(page: Page, id: string) {
  return page.locator(`.my-games-editor:visible [data-record-id="${id}"] .record-identity`);
}

async function openView(page: Page, view: View) {
  await page.goto(`/my-games?catalogs=off&tab=${view.toLowerCase()}`);
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'My games views', exact: true }).getByRole('button', {
      name: new RegExp(`^${view},`),
    }),
  ).toHaveAttribute('aria-current', 'page');
}

async function expectCredits(row: Locator) {
  const disclosure = row.locator('.game-artwork-disclosure');
  await expect(disclosure).not.toHaveAttribute('open');
  const summary = disclosure.locator(':scope > summary');
  await expect(summary).toHaveAccessibleName(`Artwork credits for ${provider.title}`);
  await summary.focus();
  await summary.press('Enter');
  await expect(disclosure.locator('.game-artwork-credit-text')).toHaveText(artwork.credit);
  await expect(disclosure.getByRole('link', { name: 'Source image', exact: true })).toHaveAttribute(
    'href',
    artwork.sourceUrl,
  );
  await expect(disclosure.getByRole('link', { name: artwork.license, exact: true })).toHaveAttribute(
    'href',
    artwork.licenseUrl,
  );
  await summary.press('Enter');
}

async function expectImage(row: Locator, src: string) {
  const image = row.locator('.record-thumb img');
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', src);
  await expect(image).toHaveJSProperty('complete', true);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(image).toHaveCSS('object-fit', 'contain');
  const size = await image.evaluate((element: HTMLImageElement) => {
    const box = element.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      nativeWidth: element.naturalWidth,
      nativeHeight: element.naturalHeight,
    };
  });
  expect(size.width).toBeLessThanOrEqual(Math.min(48, size.nativeWidth));
  expect(size.height).toBeLessThanOrEqual(Math.min(60, size.nativeHeight));
  await expect(row.locator('.game-artwork-fallback')).toHaveCount(0);
}

test('saving 0 A.D. from Discover retains its logo and full credits in Library, Queue and Ranking', async ({
  page,
}) => {
  await installGuestLibrary(page, inEveryView([original]));
  await page.goto('/discover?catalogs=off');
  const card = page.locator(`[data-catalog-id="${provider.id}"]`);
  await expect(card.locator('img')).toHaveAttribute('src', artwork.src);
  await card.getByRole('button', { name: `Add to My games: ${provider.title}`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).records[provider.id]).toEqual(provider);
  await card.getByText('Actions & source', { exact: true }).click();
  await card.getByRole('button', { name: `Play later: ${provider.title}`, exact: true }).click();
  const rating = card.getByRole('spinbutton', { name: `Your rating / 10 for ${provider.title}`, exact: true });
  await rating.fill('8');
  await rating.press('Enter');
  await expect
    .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === provider.id)?.score)
    .toBe(8);
  await expect.poll(async () => (await readLibrary(page)).progress[provider.id]?.later).toBe(true);
  const before = await readLibrary(page);
  for (const view of views) {
    await openView(page, view);
    const row = identity(page, provider.id);
    await expectImage(row, artwork.src);
    await expectCredits(row);
    await expectImage(identity(page, original.id), `/covers/${original.id}.webp`);
    expect(await readLibrary(page)).toEqual(before);
  }
});

test('missing or same-title manual artwork stays unavailable without fetching the catalog', async ({ page }) => {
  const manual: LibraryRecord = {
    ...provider,
    id: 'manual:same-title',
    source: 'manual',
    sourceId: 'same-title',
    sourceUrl: null,
  };
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/data/discovery/catalog.v1.json') requests.push(request.url());
  });
  await installGuestLibrary(page, inEveryView([noArt, manual]));
  const before = await readLibrary(page);
  for (const view of views) {
    await openView(page, view);
    for (const record of [noArt, manual]) {
      const row = identity(page, record.id);
      await expect(row.locator('.game-artwork-fallback')).toBeVisible();
      await expect(row.locator('img')).toHaveCount(0);
      await expect(row.locator('.game-artwork-disclosure')).toHaveCount(0);
    }
    expect(await readLibrary(page)).toEqual(before);
  }
  expect(requests).toEqual([]);
});

test('a failed local logo falls back in every personal view without losing its original attribution', async ({
  page,
}) => {
  const failedImages: string[] = [];
  await page.route(`**${artwork.src}`, (route) => {
    failedImages.push(route.request().url());
    return route.abort('failed');
  });
  await installGuestLibrary(page, inEveryView([provider]));
  const before = await readLibrary(page);
  for (const view of views) {
    const failuresBefore = failedImages.length;
    await openView(page, view);
    const row = identity(page, provider.id);
    await row.locator('.record-thumb').scrollIntoViewIfNeeded();
    await expect(row.locator('.game-artwork-disclosure')).toBeVisible();
    await expect.poll(() => failedImages.length).toBeGreaterThan(failuresBefore);
    await expect(row.locator('img')).toHaveCount(0);
    await expect(row.locator('.game-artwork-fallback')).toBeVisible();
    await expectCredits(row);
    expect(await readLibrary(page)).toEqual(before);
  }
});

test('multiple illustrated rows share one local catalog load for the visible personal page', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/data/discovery/catalog.v1.json') requests.push(request.url());
  });
  await installGuestLibrary(page, inEveryView([provider, otherProvider]));
  await expectImage(identity(page, provider.id), artwork.src);
  await expect(identity(page, otherProvider.id).locator('img')).toBeVisible();
  expect(requests).toHaveLength(1);
  await page
    .getByRole('navigation', { name: 'My games views', exact: true })
    .getByRole('button', { name: 'Ranking, 2', exact: true })
    .click();
  await expectImage(identity(page, provider.id), artwork.src);
  await expect(identity(page, otherProvider.id).locator('img')).toBeVisible();
  expect(requests).toHaveLength(1);
});

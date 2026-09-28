import path from 'node:path';
import { expect, test } from '@playwright/test';
import { readBuildManifest } from '../scripts/build-metadata';
import { emptyPersonalLibrary } from '../src/lib/personal-library';
import { installGuestLibrary } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

async function extrasAsset() {
  const manifest = await readBuildManifest(path.join(process.cwd(), 'dist'));
  const file = manifest['src/components/CollectionExtras.tsx']?.file;
  if (!file) throw new Error('The conditional collection entry must be emitted separately.');
  return `/${file}`;
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Conditional collection fixtures require the owned local preview.');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin !== new URL(baseURL).origin || url.pathname.startsWith('/api/')
      ? route.abort('blockedbyclient')
      : route.continue();
  });
});

test('cold view=table keeps a reserved table frame and renders after its guarded chunk arrives', async ({ page }) => {
  const asset = await extrasAsset();
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${asset}`, async (route) => {
    await waiting;
    await route.continue();
  });
  try {
    await page.goto('/?view=table&catalogs=off');
    await expect(page.getByRole('heading', { name: 'The collection, 100', exact: true })).toBeVisible();
    const region = page.locator('[data-collection-extras="table"]');
    await expect(region.locator('[aria-busy="true"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const before = await region.boundingBox();
    const shifts = await page.evaluateHandle(() => {
      const result = { value: 0 };
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          if ('value' in entry && typeof entry.value === 'number') result.value += entry.value;
        }
      }).observe({ type: 'layout-shift' });
      return result;
    });
    release();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.locator('.ratings-table tbody tr')).toHaveCount(24);
    const after = await region.boundingBox();
    if (!before || !after) throw new Error('The table frame must exist before and after loading.');
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    expect(await shifts.evaluate((result) => result.value)).toBe(0);
    await shifts.dispose();
    await page.getByRole('columnheader', { name: /IGN/ }).getByRole('button').click();
    await expect(page.getByRole('columnheader', { name: /IGN/ })).toHaveAttribute('aria-sort', 'descending');
  } finally {
    release();
  }
});

test('table focus preloads one entry and warm view toggles retain the focused control', async ({ page }) => {
  const asset = await extrasAsset();
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === asset) requests.push(request.url());
  });
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  expect(requests).toEqual([]);
  const table = page.getByRole('button', { name: 'Ratings table view', exact: true });
  const response = page.waitForResponse((reply) => new URL(reply.url()).pathname === asset);
  await table.focus();
  await (await response).finished();
  await table.click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(table).toBeFocused();
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(24);
  await table.click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('[data-collection-extras="table"] [aria-busy="true"]')).toHaveCount(0);
  expect(requests).toHaveLength(1);
});

test('a failed conditional chunk offers guarded reload without removing collection navigation', async ({ page }) => {
  const asset = await extrasAsset();
  await page.route(`**${asset}`, (route) => route.abort('failed'));
  await page.goto('/?view=table&catalogs=off');
  const failure = page.locator('[data-collection-extras="table"]');
  await expect(failure.getByRole('alert')).toContainText("These collection tools didn't load.");
  await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }));
  await failure.getByRole('button', { name: 'Reload this page', exact: true }).click();
  await expect(failure.getByRole('status')).toContainText("You're offline.");
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(24);
});

test('approaching saved additions loads their real controls without changing private data', async ({ page }) => {
  const record = {
    id: 'manual:lazy-fixture',
    source: 'manual' as const,
    sourceId: 'lazy-fixture',
    title: 'Saved extra fixture',
    year: null,
    genre: null,
    studio: null,
    sourceUrl: null,
    collectionRank: null,
  };
  await installGuestLibrary(page, { ...emptyPersonalLibrary(), records: { [record.id]: record } });
  const before = await readLibrary(page);
  const asset = await extrasAsset();
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === asset) requests.push(request.url());
  });
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  expect(requests).toEqual([]);
  await page.getByRole('heading', { name: 'Beyond The 100', exact: true }).scrollIntoViewIfNeeded();
  const card = page.locator(`[data-catalog-id="${record.id}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
  await expect(card.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true })).toBeEnabled();
  expect(requests).toHaveLength(1);
  expect(await readLibrary(page)).toEqual(before);
});

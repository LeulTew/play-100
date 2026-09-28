import path from 'node:path';
import { expect, test } from '@playwright/test';
import { readBuildManifest } from '../scripts/build-metadata';
import { emptyPersonalLibrary } from '../src/lib/personal-library';
import { installGuestLibrary } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';
import { catalogFixture, discoveryFixture } from '../src/lib/discovery-test-fixtures';
import { catalogRecord, respondWithCatalog } from './catalog-helpers';

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

test('saved additions load immediately and preserve their heading and private data', async ({ page }) => {
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
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${asset}`, async (route) => {
    await waiting;
    await route.continue();
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === asset) requests.push(request.url());
  });
  try {
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    const heading = page.getByRole('heading', { name: 'Beyond The 100', exact: true });
    await expect(heading).toBeVisible();
    await expect.poll(() => requests.length).toBe(1);
    const handle = await heading.elementHandle();
    if (!handle) throw new Error('The additional-results heading must exist while loading.');
    release();
    const card = page.locator(`[data-catalog-id="${record.id}"]`);
    await expect(card).toBeVisible();
    expect(
      await handle.evaluate((node) => node.isConnected && node === document.getElementById('extended-results-title')),
    ).toBe(true);
    await handle.dispose();
    await expect(card.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
    await expect(card.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true })).toBeEnabled();
    expect(requests).toHaveLength(1);
    expect(await readLibrary(page)).toEqual(before);
  } finally {
    release();
  }
});

test('cold film anchors remain connected across chunk arrival', async ({ page }) => {
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
    await page.goto('/?catalogs=off#collection-films');
    const section = page.locator('#collection-films');
    const heading = page.locator('#collection-films-title');
    await expect(section).toHaveAttribute('aria-busy', 'true');
    await expect(heading).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    const sectionHandle = await section.elementHandle();
    const headingHandle = await heading.elementHandle();
    if (!sectionHandle || !headingHandle) throw new Error('Both film anchors must exist before their body loads.');
    const before = await section.boundingBox();
    release();
    await expect(section).toHaveAttribute('aria-busy', 'false');
    await expect(section.locator('.film-poster img')).toHaveCount(2);
    expect(
      await sectionHandle.evaluate((node) => node.isConnected && node === document.getElementById('collection-films')),
    ).toBe(true);
    expect(await headingHandle.evaluate((node) => node.isConnected && node === document.activeElement)).toBe(true);
    await expect(section).toHaveCount(1);
    await expect(heading).toHaveCount(1);
    const after = await section.boundingBox();
    if (!before || !after) throw new Error('The film frame must exist before and after body loading.');
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    await sectionHandle.dispose();
    await headingHandle.dispose();
    await expect(page.locator('video')).toHaveCount(0);
  } finally {
    release();
  }
});

for (const activate of [false, true]) {
  const behavior = activate ? 'queued activation' : 'keyboard focus';
  test(`cold query loads extras without proximity: ${behavior}`, async ({ page }, info) => {
    const locals = Array.from({ length: 6 }, (_, index) =>
      catalogRecord('wikidata', `Q${990010 + index}`, `Mass local fixture ${index + 1}`),
    );
    const local = locals[0]!;
    const remote = catalogRecord('wikidata', 'Q990002', 'Mass remote fixture');
    const seed = {
      ...catalogFixture,
      items: locals.map((record) => ({ ...discoveryFixture, record, aliases: [] })),
    };
    const asset = await extrasAsset();
    let release = () => {};
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const imports: string[] = [];
    const lookups: string[] = [];
    await page.route(`**${asset}`, async (route) => {
      imports.push(route.request().url());
      await waiting;
      await route.continue();
    });
    await page.route('**/data/discovery/catalog.v1.json', (route) => route.fulfill({ json: seed }));
    await page.route('**/api/catalog?**', (route) => {
      const source = new URL(route.request().url()).searchParams.get('source');
      if (!source) throw new Error('The catalog request needs its source.');
      lookups.push(source);
      return respondWithCatalog(route, source === 'wikidata' ? [remote] : []);
    });
    try {
      await page.goto('/?q=mass');
      await expect(page.locator('[data-game="mass-effect-2"]')).toBeVisible();
      const section = page.getByRole('region', { name: 'Beyond The 100', exact: true });
      await expect(section).toHaveAttribute('aria-busy', 'true');
      await expect(section.getByText('6 matches', { exact: true })).toBeVisible();
      await expect.poll(() => imports.length).toBe(1);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await expect(section.locator('[data-unranked-id]')).toHaveCount(locals.length);
      const beforeLibrary = await readLibrary(page);
      const heading = section.getByRole('heading', { name: 'Beyond The 100', exact: true });
      const search = section.getByRole('button', { name: 'Search online', exact: true });
      await expect(search).toBeEnabled();
      if (activate) {
        await search.evaluate((button: HTMLButtonElement) => button.focus({ preventScroll: true }));
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        expect(await page.evaluate(() => scrollY)).toBe(0);
      } else {
        await heading.focus();
        await page.keyboard.press('Tab');
        await expect(search).toBeFocused();
      }
      expect(lookups).toEqual([]);
      await page.evaluate(() => document.fonts.ready);
      const before = await section.boundingBox();
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
      await expect(section).toHaveAttribute('aria-busy', 'false');
      await expect(section.locator(`[data-catalog-id="${local.id}"]`)).toBeVisible();
      if (activate) {
        await expect(heading).toBeFocused();
      } else {
        await expect(search).toBeFocused();
        const after = await section.boundingBox();
        if (!before || !after) throw new Error('The extended-results frame must stay mounted across loading.');
        expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
        );
        expect(await shifts.evaluate((result) => result.value)).toBe(0);
        expect(lookups).toEqual([]);
        await page.keyboard.press('Enter');
      }
      await shifts.dispose();
      await expect.poll(() => [...lookups].sort()).toEqual(['freetogame', 'wikidata']);
      await expect(section.locator(`[data-unranked-id="${remote.id}"]`)).toBeVisible();
      expect(imports).toHaveLength(1);
      expect(await readLibrary(page)).toEqual(beforeLibrary);
      await info.attach('active-search-intent', {
        contentType: 'application/json',
        body: JSON.stringify({ activationQueued: activate, chunkRequests: imports.length, lookupSources: lookups }),
      });
    } finally {
      release();
    }
  });
}

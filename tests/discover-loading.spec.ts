import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { parseDiscoveryCatalogJson } from '../src/lib/discovery-catalog';

const catalogFile = fileURLToPath(new URL('../public/data/discovery/catalog.v1.json', import.meta.url));

function holdCatalog() {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return { ready, release: () => release() };
}

test.beforeEach(async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 393 : 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emptyCatalogs(page);
});

for (const view of ['grid', 'list']) {
  test(`Discover ${view} loads without a false count, blank anatomy or shifted first artwork`, async ({ page }) => {
    const catalog = holdCatalog();
    await page.route('**/data/discovery/catalog.v1.json', async route => {
      await catalog.ready;
      await route.fulfill({ path: catalogFile, contentType: 'application/json' });
    });
    try {
      await page.goto(`/discover?catalogs=off&view=${view}`);
      await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: 'Find a game', exact: true })).toBeVisible();
      const status = page.locator('.discovery-results-heading [role="status"]');
      const results = page.getByRole('region', { name: 'Catalog games', exact: true });
      await expect(status).toHaveText('Loading the catalog…');
      await expect(status).toHaveAttribute('aria-live', 'polite');
      await expect(page.getByRole('status').filter({ hasText: /^Loading the catalog…$/ })).toHaveCount(1);
      await expect(results).toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('.discovery-card')).toHaveCount(0);
      await expect(page.locator('.discovery-skeleton')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('.discovery-skeleton')).toHaveAttribute('inert', '');
      await expect(page.locator('.discovery-card-skeleton')).toHaveCount(24);
      await expect(page.locator('.discovery-skeleton button, .discovery-skeleton a, .discovery-skeleton input')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      const before = await page.locator('.discovery-skeleton .discovery-card-art').first().boundingBox();
      if (!before) throw new Error('The loading artwork slot is not laid out.');
      expect(await page.locator('.discovery-skeleton').evaluate(element =>
        element.getAnimations({ subtree: true }).length)).toBe(0);
      await page.evaluate(() => {
        if (!PerformanceObserver.supportedEntryTypes.includes('layout-shift')) throw new Error('This check needs native layout-shift observations.');
        let total = 0;
        document.documentElement.dataset.catalogLoadShift = '0';
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if ('hadRecentInput' in entry && entry.hadRecentInput === false && 'value' in entry && typeof entry.value === 'number') total += entry.value;
          }
          document.documentElement.dataset.catalogLoadShift = String(total);
        });
        observer.observe({ type: 'layout-shift' });
      });
      catalog.release();
      await expect(results).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('.discovery-card')).toHaveCount(24);
      await expect(page.locator('.discovery-skeleton')).toHaveCount(0);
      await expect(status).toHaveText(/^\d+\S*\d* of \d+ catalog games$/);
      const after = await page.locator('.discovery-card .discovery-card-art').first().boundingBox();
      if (!after) throw new Error('The resolved artwork slot is not laid out.');
      for (const dimension of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(after[dimension] - before[dimension]), `${view} artwork ${dimension}`).toBeLessThanOrEqual(.5);
      }
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await page.evaluate(() => Number(document.documentElement.dataset.catalogLoadShift))).toBe(0);
    } finally {
      catalog.release();
    }
  });
}

test('known original entries stay usable without claiming a complete catalog count', async ({ page }) => {
  const catalog = holdCatalog();
  await page.route('**/data/discovery/catalog.v1.json', async route => {
    await catalog.ready;
    await route.fulfill({ path: catalogFile, contentType: 'application/json' });
  });
  try {
    await page.goto('/discover?catalogs=off&include100=on');
    await expect(page.locator('.discovery-card')).toHaveCount(24);
    await expect(page.locator('.discovery-results-heading [role="status"]')).toHaveText('Loading the catalog…');
    await expect(page.getByRole('region', { name: 'Catalog games', exact: true })).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.discovery-skeleton')).toHaveCount(0);
    await page.locator('.discovery-card h3 button').first().click();
    await expect(page.locator('.game-dialog[open]')).toBeVisible();
  } finally {
    catalog.release();
  }
});

test('a failed original catalog is an explicit recovery state, not an endless skeleton or zero count', async ({ page }) => {
  await page.route('**/data/collection.json', route => route.fulfill({ status: 503, body: 'Controlled collection load failure.' }));
  await page.goto('/discover?catalogs=off');
  await expect(page.getByRole('button', { name: 'Reload The 100', exact: true })).toBeVisible();
  await expect(page.locator('.discovery-results-heading [role="status"]')).toHaveText('Catalog unavailable');
  await expect(page.getByRole('region', { name: 'Catalog games', exact: true })).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.discovery-skeleton')).toHaveCount(0);
});

test('a failed seed reports incomplete coverage while retaining known original games and retry', async ({ page }) => {
  await page.route('**/data/discovery/catalog.v1.json', route => route.fulfill({ status: 503, body: 'Controlled local catalog failure.' }));
  await page.goto('/discover?catalogs=off&include100=on');
  await expect(page.getByRole('button', { name: 'Reload local catalog', exact: true })).toBeVisible();
  await expect(page.locator('.discovery-results-heading [role="status"]')).toHaveText('Catalog incomplete');
  await expect(page.getByRole('region', { name: 'Catalog games', exact: true })).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.discovery-card')).toHaveCount(24);
  await expect(page.locator('.discovery-skeleton')).toHaveCount(0);
  await page.locator('.discovery-card h3 button').first().click();
  await expect(page.locator('.game-dialog[open]')).toBeVisible();
});

for (const destination of ['/discover?q=Kingdomcome&catalogs=off', '/?q=Kingdomcome']) {
  for (const diagnostic of ['expected an ISO UTC timestamp.', 'artwork must use its content-addressed local WebP path.']) {
    test(`catalog validation on ${destination} keeps ${diagnostic} in diagnostics, not visible copy`, async ({ page }) => {
      const broken = parseDiscoveryCatalogJson(await readFile(catalogFile, 'utf8'));
      if (diagnostic === 'expected an ISO UTC timestamp.') broken.generatedAt = 'not-a-timestamp';
      else {
        const item = broken.items.find(item => item.artwork !== null);
        if (!item?.artwork) throw new Error('The catalog fixture needs artwork to exercise its path validator.');
        item.artwork.src = '/images/discovery/not-content-addressed.webp';
      }
      const diagnostics: Promise<string[]>[] = [];
      page.on('console', message => {
        if (message.type() === 'error') diagnostics.push(Promise.all(message.args().map(argument =>
          argument.evaluate((value: unknown) => value instanceof Error ? value.message : String(value)))));
      });
      let fail = true;
      await page.route('**/data/discovery/catalog.v1.json', route => fail
        ? route.fulfill({ json: broken })
        : route.fulfill({ path: catalogFile, contentType: 'application/json' }));
      await page.goto(destination);
      const notice = page.getByRole('alert').filter({ hasText: 'The local catalog could not be loaded.' });
      await expect(notice).toHaveCount(1);
      await expect(notice).toContainText('Choose Reload local catalog to try again.');
      await expect(notice).toContainText(destination.startsWith('/discover') ? 'The 100 remains searchable.' : 'Saved games remain available.');
      await expect(page.locator('body')).not.toContainText(diagnostic);
      await expect.poll(async () => (await Promise.all(diagnostics)).flat().join('\n')).toContain(diagnostic);
      fail = false;
      await notice.getByRole('button', { name: 'Reload local catalog', exact: true }).click();
      await expect(notice).toHaveCount(0);
      await expect(page.locator('[data-catalog-id="wikidata:Q15408545"]')).toBeVisible();
    });
  }
}

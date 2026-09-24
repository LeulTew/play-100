import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { LibraryRecord } from '../src/lib/personal-types';
import { readLibrary } from './library-helpers';
import { catalogRecord, respondWithCatalog } from './catalog-helpers';
import { openBrowsingFilters } from './browsing-helpers';

const a = catalogRecord('wikidata', 'Q990001', 'Mass Atlas');
const b = catalogRecord('freetogame', '990001', 'Mass Meridian');
const row = (page: Page, record: LibraryRecord) => page.locator(`[data-unranked-id="${record.id}"]`);
const beyond = (page: Page) => page.getByRole('region', { name: 'Beyond The 100', exact: true });

async function searchOnline(page: Page) {
  await beyond(page).getByRole('button', { name: 'Search online', exact: true }).click();
}

async function openActions(page: Page, record: LibraryRecord) {
  const details = row(page, record).locator('.discovery-card-details');
  if (await details.getAttribute('open') === null) await details.getByText('Actions & source', { exact: true }).click();
  await expect(details).toHaveAttribute('open', '');
}

async function mockGames(page: Page) {
  await page.route('**/api/catalog?**', (route) => {
    const source = new URL(route.request().url()).searchParams.get('source');
    return respondWithCatalog(route, [a, b].filter((record) => record.source === source));
  });
}

async function rate(page: Page, record: LibraryRecord, value: string) {
  await openActions(page, record);
  await row(page, record).getByRole('spinbutton', { name: `Your rating / 10 for ${record.title}`, exact: true }).fill(value);
  await expect.poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === record.id)?.score).toBe(value ? Number(value) : null);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('main search combines the 100 and unranked catalogs; preview, rating and saving have distinct effects', async ({ page }) => {
  await mockGames(page);
  await page.goto('/?q=mass');
  await expect(page.locator('[data-game="mass-effect-2"]')).toBeVisible();
  const unranked = page.locator('[data-unranked-id]');
  await expect(beyond(page).getByText(/^\d+ matches?$/)).toBeVisible();
  const seeded = await unranked.count();
  await searchOnline(page);
  await expect(unranked).toHaveCount(seeded + 2);
  await expect(row(page, b)).toHaveCount(1);
  await expect(row(page, a).locator('.discovery-canonical')).toHaveCount(0);
  await expect(row(page, a).getByRole('button', { name: `Add to My games: ${a.title}`, exact: true })).toBeEnabled();
  await expect(row(page, a).locator('.cover-rank, .author-rating-card, .numeric-score')).toHaveCount(0);
  await openActions(page, a);
  await expect(row(page, a).getByRole('spinbutton')).toHaveValue('');
  await row(page, a).getByRole('button', { name: a.title, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Preview only');
  expect((await readLibrary(page)).records[a.id]).toBeUndefined();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(row(page, a).getByRole('button', { name: a.title, exact: true })).toBeFocused();
  await rate(page, a, '9.25');
  const inMyGames = row(page, a).getByRole('button', { name: `In My games: ${a.title}`, exact: true });
  await expect(inMyGames).toHaveText('In My games');
  await expect(inMyGames).toBeDisabled();
  await openActions(page, b);
  await row(page, b).getByRole('button', { name: `Play later: ${b.title}`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([b.id]);
  const saved = await readLibrary(page);
  expect(saved.records[a.id]).toEqual(a);
  expect(saved.records[b.id]).toEqual(b);
  expect(saved.ranking).toEqual([{ id: a.id, score: 9.25, note: '', manualPosition: null }]);
  expect(saved.progress[a.id]?.played ?? false).toBe(false);
  expect(saved.progress[b.id]).toEqual({ later: true, played: false, completed: false });
  await page.reload();
  await expect(row(page, a)).toHaveCount(1);
  await openActions(page, a);
  await expect(row(page, a).getByRole('spinbutton')).toHaveValue('9.25');
  await openActions(page, b);
  await expect(row(page, b).getByRole('button', { name: `Play later: ${b.title}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/my-library');
  await expect(page.locator('.my-games-editor:visible [data-record-id]')).toHaveCount(2);
});

test('bulk actions span original and external search matches and private filters include both', async ({ page }) => {
  await mockGames(page);
  await page.goto('/?q=mass&view=table');
  await searchOnline(page);
  await expect(row(page, a)).toBeVisible();
  await page.getByRole('button', { name: 'Select multiple games', exact: true }).click();
  const canonical = page.getByRole('checkbox', { name: 'Select Mass Effect 2', exact: true });
  const external = row(page, a).getByRole('checkbox', { name: `Select ${a.title}`, exact: true });
  await canonical.check();
  await external.check();
  await expect(page.locator('.selection-summary')).toContainText('2 selected');
  await page.getByRole('button', { name: 'Add to play later', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual(['mass-effect-2', a.id]);
  await canonical.check();
  await external.check();
  await page.locator('.selection-actions').getByRole('button', { name: 'Mark completed', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).progress[a.id]?.completed).toBe(true);
  await openBrowsingFilters(page);
  await page.locator('.collection-tabs').getByRole('button', { name: /^Completed/ }).click();
  await expect(page.locator('tr[data-game]')).toHaveCount(1);
  await expect(page.locator('[data-unranked-id]')).toHaveCount(1);
  await openActions(page, a);
  await expect(row(page, a).getByRole('checkbox', { name: `I have played it: ${a.title}`, exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Search public catalogs', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await row(page, a).getByRole('checkbox', { name: `I have played it: ${a.title}`, exact: true }).click();
  // Unmarking a completed game asks first, since it also clears Completed (621bcef); nothing changes until confirmed.
  const confirmation = page.getByRole('dialog', { name: `Mark ${a.title} not played?`, exact: true });
  await expect(confirmation).toContainText('This also clears Completed.');
  expect((await readLibrary(page)).progress[a.id]).toEqual({ played: true, completed: true, later: true });
  await confirmation.getByRole('button', { name: 'Mark not played', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect.poll(async () => (await readLibrary(page)).progress[a.id]?.played).toBe(false);
  await expect(row(page, a)).toHaveCount(0);
  expect((await readLibrary(page)).progress[a.id]).toEqual({ played: false, completed: false, later: true });
});

test('search ratings preserve manual ranking slots and notes while played and ratings synchronize across tabs', async ({ page, context }) => {
  await mockGames(page);
  await page.goto('/?q=mass&view=table');
  await searchOnline(page);
  await rate(page, a, '6');
  await rate(page, b, '9');
  await page.goto('/my-rankings');
  await expect(page.locator('.my-games-editor:visible .personal-row').first()).toHaveAttribute('data-record-id', b.id);
  await page.getByRole('button', { name: `Move ${a.title} up in ranking`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.manualPosition).toBe(1);
  const ranked = page.locator(`.my-games-editor:visible [data-record-id="${a.id}"]`);
  await ranked.locator('.ranking-note summary').click();
  await ranked.getByRole('textbox').fill('Keep this in my chosen place.');
  await ranked.getByRole('textbox').press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.note).toBe('Keep this in my chosen place.');
  await page.goto('/?q=mass&view=table');
  await rate(page, b, '10');
  await rate(page, a, '0');
  const before = await readLibrary(page);
  expect(before.ranking.map((entry) => entry.id)).toEqual([a.id, b.id]);
  expect(before.ranking[0]).toEqual({ id: a.id, score: 0, manualPosition: 1, note: 'Keep this in my chosen place.' });
  const peer = await context.newPage();
  await peer.goto('/my-rankings');
  await row(page, b).getByRole('spinbutton').focus();
  await peer.getByRole('spinbutton', { name: `Your rating / 10 for ${b.title}`, exact: true }).fill('8');
  await peer.getByRole('spinbutton', { name: `Your rating / 10 for ${b.title}`, exact: true }).press('Tab');
  await expect(row(page, b).getByRole('spinbutton')).toHaveValue('8');
  await peer.getByRole('checkbox', { name: `I have played it: ${a.title}`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(peer)).progress[a.id]?.played).toBe(true);
  await expect(row(page, a).getByRole('checkbox', { name: `I have played it: ${a.title}`, exact: true })).toBeChecked();
  expect((await readLibrary(page)).ranking[0]?.manualPosition).toBe(1);
  await peer.close();
});

test('saved additions remain searchable after provider failure and an online opt-out survives reload', async ({ page }) => {
  let unavailable = false;
  let requests = 0;
  await page.route('**/api/catalog?**', (route) => {
    requests += 1;
    if (unavailable) return route.fulfill({ status: 503, json: { error: 'The source is temporarily unavailable.' } });
    const url = new URL(route.request().url());
    expect([...url.searchParams.keys()].sort()).toEqual(['offset', 'q', 'source']);
    expect(route.request().postData()).toBeNull();
    return respondWithCatalog(route, url.searchParams.get('source') === 'wikidata' ? [a] : []);
  });
  await page.goto('/?q=mass&view=table');
  await searchOnline(page);
  await rate(page, a, '8.5');
  unavailable = true;
  await page.reload();
  await openActions(page, a);
  await expect(row(page, a).getByRole('spinbutton')).toHaveValue('8.5');
  await searchOnline(page);
  await expect(page.getByRole('button', { name: 'Retry Wikidata', exact: true })).toBeVisible();
  await expect(beyond(page).getByRole('group', { name: 'Online catalog status', exact: true }).getByRole('alert').first()).toContainText('The source is temporarily unavailable.');
  await expect(row(page, a).getByRole('spinbutton')).toHaveValue('8.5');
  await openBrowsingFilters(page);
  await page.getByRole('checkbox', { name: 'Search public catalogs', exact: true }).uncheck();
  await expect(page).toHaveURL(/catalogs=off/);
  const requestCount = requests;
  await page.reload();
  await expect(row(page, a)).toBeVisible();
  await openBrowsingFilters(page);
  await expect(page.getByRole('checkbox', { name: 'Search public catalogs', exact: true })).not.toBeChecked();
  await page.waitForTimeout(1000);
  expect(requests).toBe(requestCount);
  await expect(page.locator('.discovery-source-status')).toHaveCount(0);
});

test('online search is debounced, length bounded, scoped and URL reversible without a background crawl', async ({ page }) => {
  const queries: string[] = [];
  await page.clock.install({ time: new Date('2026-09-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-01T12:00:10Z'));
  await page.route('**/api/catalog?**', (route) => {
    queries.push(new URL(route.request().url()).searchParams.get('q') ?? '');
    return respondWithCatalog(route, []);
  });
  await page.goto('/?view=table');
  await expect(page.locator('tr[data-game]')).toHaveCount(24);
  await page.clock.runFor(1000);
  expect(queries).toEqual([]);
  const input = page.getByRole('searchbox', { name: 'Search games, studios or genres', exact: true });
  await input.fill('m');
  await page.clock.runFor(1000);
  expect(queries).toEqual([]);
  await input.fill('ma');
  await page.clock.runFor(400);
  await input.fill('mass');
  await searchOnline(page);
  await expect(page.getByText('Searching public catalogs…', { exact: true })).toBeVisible();
  await page.clock.runFor(499);
  expect(queries).toEqual([]);
  await page.clock.runFor(1);
  await expect.poll(() => queries).toEqual(['mass', 'mass']);
  await openBrowsingFilters(page);
  await page.getByLabel('Collection', { exact: true }).selectOption('core');
  await input.fill('another query');
  await page.clock.runFor(1000);
  expect(queries).toHaveLength(2);
  await page.getByLabel('Collection', { exact: true }).selectOption('all');
  await input.fill('x'.repeat(81));
  await page.clock.runFor(1000);
  expect(queries).toHaveLength(2);
  await expect(page.locator('#catalog-search-help')).toContainText('80 characters maximum');
  await page.getByRole('checkbox', { name: 'Search public catalogs', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('link', { name: 'Ranking', exact: true }).click();
  await expect(page).toHaveURL(/\/my-games\?catalogs=off&tab=ranking$/);
  await page.locator('.wordmark').first().click();
  await input.fill('mass');
  await page.clock.runFor(1000);
  expect(queries).toHaveLength(2);
  await page.goBack();
  await expect(input).toHaveValue('');
  await page.goForward();
  await expect(input).toHaveValue('mass');
  await openBrowsingFilters(page);
  await expect(page.getByRole('checkbox', { name: 'Search public catalogs', exact: true })).not.toBeChecked();
});

test('late results from a cancelled query never replace the current search', async ({ page }) => {
  const old = catalogRecord('wikidata', 'Q990010', 'Old Atlas');
  const current = catalogRecord('wikidata', 'Q990011', 'New Atlas');
  let release: (() => void) | undefined;
  let finished = false;
  await page.route('**/api/catalog?**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('source') !== 'wikidata') return respondWithCatalog(route, []);
    if (url.searchParams.get('q') === 'old') {
      await new Promise<void>((resolve) => { release = resolve; });
      await respondWithCatalog(route, [old]);
      finished = true;
      return;
    }
    return respondWithCatalog(route, [current]);
  });
  try {
    await page.goto('/?q=old&view=table');
    await searchOnline(page);
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.getByRole('searchbox').fill('new');
    await searchOnline(page);
    await expect(row(page, current)).toBeVisible();
    if (!release) throw new Error('The old request was not captured.');
    release();
    await expect.poll(() => finished).toBe(true);
    await expect(row(page, old)).toHaveCount(0);
    await expect(row(page, current)).toHaveCount(1);
    await expect(page.getByRole('searchbox')).toHaveValue('new');
  } finally { release?.(); }
});

test('failed load-more retries the failed page without losing prior records or duplicating saved games', async ({ page }) => {
  const more = catalogRecord('wikidata', 'Q990002', 'Mass Second Edition');
  const offsets: number[] = [];
  await page.route('**/api/catalog?**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('source') !== 'wikidata') return respondWithCatalog(route, []);
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    if (!offset) return respondWithCatalog(route, [a], 5);
    if (offsets.length === 2) return route.fulfill({ status: 503, json: { error: 'This page is temporarily unavailable.' } });
    return respondWithCatalog(route, [a, more]);
  });
  await page.goto('/?q=mass&view=table');
  await searchOnline(page);
  await rate(page, a, '8');
  await page.getByRole('button', { name: 'More from Wikidata', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry Wikidata', exact: true })).toBeVisible();
  await expect(row(page, a).getByRole('spinbutton')).toHaveValue('8');
  await page.getByRole('button', { name: 'Retry Wikidata', exact: true }).click();
  await expect(row(page, more)).toBeVisible();
  expect(offsets).toEqual([0, 5, 5]);
  await expect(row(page, a)).toHaveCount(1);
  expect((await readLibrary(page)).ranking).toHaveLength(1);
});

test('a quota failure keeps an unranked rating draft without partially importing or endlessly retrying', async ({ page }) => {
  await mockGames(page);
  await page.goto('/?q=mass&view=table');
  await searchOnline(page);
  await openActions(page, a);
  await expect(row(page, a).getByRole('spinbutton')).toBeEnabled();
  const before = await readLibrary(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (document.documentElement.dataset.failImport === 'yes') {
        document.documentElement.dataset.importAttempts = String(Number(document.documentElement.dataset.importAttempts ?? 0) + 1);
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
    document.documentElement.dataset.failImport = 'yes';
  });
  await row(page, a).getByRole('spinbutton').fill('7');
  await expect(row(page, a).locator('.inline-error')).toContainText('could not be saved');
  await expect(row(page, a).getByRole('spinbutton')).toHaveValue('7');
  expect(await readLibrary(page)).toEqual(before);
  const attempts = await page.evaluate(() => document.documentElement.dataset.importAttempts);
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => document.documentElement.dataset.importAttempts)).toBe(attempts);
  await page.evaluate(() => { document.documentElement.dataset.failImport = 'no'; });
  await rate(page, a, '8.5');
  expect((await readLibrary(page)).records[a.id]).toEqual(a);
});

test('external metadata, ratings and queue survive a full browser restart even when both providers fail', async ({ baseURL, isMobile, viewport }, testInfo) => {
  const profile = testInfo.outputPath('persistent-search-profile');
  const options = { headless: true, baseURL, isMobile, hasTouch: isMobile, viewport, args: ['--enable-unsafe-swiftshader'] };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = context.pages()[0] ?? await context.newPage();
    await mockGames(page);
    await page.goto('/?q=mass&view=table');
    await searchOnline(page);
    await rate(page, a, '9');
    await openActions(page, b);
    await row(page, b).getByRole('button', { name: `Play later: ${b.title}`, exact: true }).click();
    await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([b.id]);
    const before = await readLibrary(page);
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = context.pages()[0] ?? await context.newPage();
    await page.route('**/api/catalog?**', (route) => route.fulfill({ status: 503, json: { error: 'Source offline for this check.' } }));
    await page.goto('/?q=mass&view=table');
    await searchOnline(page);
    await expect(page.getByRole('button', { name: 'Retry Wikidata', exact: true })).toBeVisible();
    await openActions(page, a);
    await expect(row(page, a).getByRole('spinbutton')).toHaveValue('9');
    await openActions(page, b);
    await expect(row(page, b).getByRole('button', { name: `Play later: ${b.title}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    const after = await readLibrary(page);
    expect(after.records).toEqual(before.records);
    expect(after.ranking).toEqual(before.ranking);
    expect(after.queueOrder).toEqual(before.queueOrder);
    expect(after.progress).toEqual(before.progress);
  } finally { await context.close(); }
});

test('native selects have aligned labels, values and chevrons across viewports with accessible unranked actions', async ({ page, viewport }, testInfo) => {
  await mockGames(page);
  await page.goto('/?q=Mass%20Atlas&view=table');
  await expect(row(page, a)).toBeVisible();
  await openBrowsingFilters(page);
  await page.getByLabel('Genre', { exact: true }).selectOption('Action RPG');
  for (const width of [1440, 800, 393, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await openBrowsingFilters(page);
    const geometry = await page.evaluate(() => {
      const fields = [...document.querySelectorAll('.filter-select')].map((field) => {
        const select = field.querySelector('select');
        const label = field.querySelector('label');
        const arrow = field.querySelector('.select-chevron');
        if (!select || !label || !arrow) throw new Error('A labeled native select is incomplete.');
        const input = select.getBoundingClientRect();
        const chevron = arrow.getBoundingClientRect();
        const style = getComputedStyle(select);
        return {
          native: select.tagName, height: input.height, labelGap: input.top - label.getBoundingClientRect().bottom,
          centered: Math.abs(input.y + input.height / 2 - chevron.y - chevron.height / 2),
          evenPadding: style.paddingTop === style.paddingBottom, pointerEvents: getComputedStyle(arrow).pointerEvents,
        };
      });
      return { fields, noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
    });
    expect(geometry.noOverflow).toBe(true);
    expect(geometry.fields).toHaveLength(5);
    for (const field of geometry.fields) {
      expect(field.native).toBe('SELECT');
      expect(field.height).toBeGreaterThanOrEqual(44);
      expect(field.labelGap).toBeGreaterThanOrEqual(4);
      expect(field.centered).toBeLessThanOrEqual(0.5);
      expect(field.evenPadding).toBe(true);
      expect(field.pointerEvents).toBe('none');
    }
  }
  await page.setViewportSize(viewport ?? { width: 1440, height: 1000 });
  await openBrowsingFilters(page);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('unified-search.png'), fullPage: true });
  const year = page.getByLabel('Year', { exact: true });
  await year.focus();
  await year.press('ArrowDown');
  await year.press('Enter');
  await expect(year).not.toHaveValue('');
});

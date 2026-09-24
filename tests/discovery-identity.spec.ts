import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parseCollection } from '../src/lib/collection';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { applyPersonalAction, emptyPersonalLibrary } from '../src/lib/personal-library';
import { recordFromGame } from '../src/lib/personal-types';
import type { LibraryRecord, PersonalLibraryState } from '../src/lib/personal-types';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../src/lib/personal-db';
import { readLibrary } from './library-helpers';
import { openBrowsingFilters } from './browsing-helpers';

const collection = JSON.parse(readFileSync(new URL('../public/data/collection.json', import.meta.url), 'utf8'));
const games = parseCollection(collection).games;
const seed = parseDiscoveryCatalog(
  JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')),
);
const rdr = games[0]!;
const canonical = recordFromGame(rdr);
const provider = seed.items.find((item) => item.record.id === 'wikidata:Q27438121')!.record;
const cardFor = (page: Page, id = canonical.id) => page.locator(`[data-catalog-id="${id}"]`);
const detailFor = (page: Page) => page.getByRole('dialog', { name: rdr.title, exact: true });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/catalog?**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }),
  );
});

async function installLibrary(page: Page, state: PersonalLibraryState) {
  await page.goto('/favicon.svg');
  await page.evaluate(
    ({ name, version, store, key, state }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name, version);
        open.onupgradeneeded = () => open.result.createObjectStore(store);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(state, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, key: STATE_KEY, state },
  );
}

async function rate(scope: Page | Locator, value: string) {
  const input = scope.getByRole('spinbutton', { name: `Your rating / 10 for ${rdr.title}`, exact: true });
  await input.fill(value);
  await input.press('Enter');
}

for (const surface of ['Discover', 'Collection'] as const) {
  test(`${surface} add-only Pin keeps keyboard focus and ignores a second Enter`, async ({ page }) => {
    await page.goto(surface === 'Discover' ? '/discover?q=RDR2&catalogs=off&include100=on' : '/?q=RDR2&catalogs=off');
    const card = surface === 'Discover' ? cardFor(page) : page.locator(`[data-game="${rdr.slug}"]`);
    const pin = card
      .locator(
        surface === 'Discover'
          ? '.discovery-card-primary > button[aria-label]'
          : '.card-compare-actions > button[aria-label]',
      )
      .last();
    await expect(pin).toHaveAccessibleName(`Pin for comparison: ${rdr.title}`);
    await expect(pin).toBeEnabled();
    await pin.focus();
    const original = await pin.elementHandle();
    if (!original) throw new Error('The Pin control is not mounted.');
    await page.keyboard.press('Enter');
    await expect(pin).toBeFocused();
    expect(await original.evaluate((node) => node.isConnected && node === document.activeElement)).toBe(true);
    await expect(pin).toHaveAccessibleName(`Pinned for comparison: ${rdr.title}`);
    await expect(pin).toHaveAttribute('aria-disabled', 'true');
    await expect(pin).not.toHaveAttribute('disabled');
    await expect(pin).not.toHaveAttribute('aria-pressed');
    const tray = page.locator('.compare-tray-expand');
    await expect(tray).toHaveAccessibleName('Open Compare tray, 1 game');
    await page.keyboard.press('Enter');
    await expect(pin).toBeFocused();
    await expect(tray).toHaveAccessibleName('Open Compare tray, 1 game');
    await page.keyboard.press('Tab');
    const next =
      surface === 'Discover'
        ? card.locator('summary')
        : card.getByRole('button', { name: `Play later: ${rdr.title}`, exact: true });
    await expect(next).toBeFocused();
    await original.dispose();
  });
}

test('fresh Discover canonical facts, all personal actions, details and main aliases share one original ID', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/discover?q=RDR2&catalogs=off&include100=on');
  const card = cardFor(page);
  await expect(card).toBeVisible();
  await expect(page.locator('[data-catalog-id]')).toHaveCount(1);
  await expect(card).toContainText('From The 100 · #1');
  await expect(card).toContainText("Leul's rating 10.0 / 10");
  await expect(card).toContainText('2018');
  await expect(card.locator('img')).toHaveAttribute('src', '/covers/red-dead-redemption-2.webp');
  expect(await card.getAttribute('data-unranked-id')).toBeNull();
  await card.getByRole('button', { name: `Add to My games: ${rdr.title}`, exact: true }).click();
  await expect(card.getByRole('button', { name: `In My games: ${rdr.title}`, exact: true })).toBeDisabled();
  expect((await readLibrary(page)).progress[canonical.id]?.played ?? false).toBe(false);
  await card.getByRole('button', { name: `Pin for comparison: ${rdr.title}`, exact: true }).click();
  await expect(card.getByRole('button', { name: `Pinned for comparison: ${rdr.title}`, exact: true })).toBeDisabled();
  await card.getByText('Actions & source', { exact: true }).click();
  await rate(page, '8.7');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(8.7);
  expect((await readLibrary(page)).progress[canonical.id]?.played ?? false).toBe(false);
  await card.getByRole('checkbox', { name: `I have played it: ${rdr.title}`, exact: true }).click();
  await expect
    .poll(async () => (await readLibrary(page)).progress[canonical.id])
    .toEqual({ played: true, completed: false, later: false });
  await card.getByRole('button', { name: `Completed: ${rdr.title}`, exact: true }).click();
  await card.getByRole('button', { name: `Play later: ${rdr.title}`, exact: true }).click();
  await card.getByRole('button', { name: rdr.title, exact: true }).click();
  await expect(page).toHaveURL(/game=red-dead-redemption-2/);
  const detail = detailFor(page);
  await expect(detail).toContainText('#01 in the collection');
  await expect(detail).toContainText("Leul's original rating");
  await expect(detail.getByRole('spinbutton', { name: `Your rating / 10 for ${rdr.title}`, exact: true })).toHaveValue(
    '8.7',
  );
  await detail.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect
    .poll(async () => (await readLibrary(page)).progress[canonical.id])
    .toEqual({ played: true, completed: false, later: true });
  await detail.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(card.getByRole('button', { name: rdr.title, exact: true })).toBeFocused();
  await page.reload();
  await expect(card).toBeVisible();
  expect(Object.keys((await readLibrary(page)).records)).toEqual([canonical.id]);
  const tray = await page.evaluate(() => JSON.parse(localStorage.getItem('play100:compare-tray:v1:guest') ?? '{}'));
  expect(tray.items.map((item: LibraryRecord) => item.id)).toEqual([canonical.id]);
  await page.goto('/?q=RDR2&catalogs=off');
  await expect(page.locator('[data-game="red-dead-redemption-2"]')).toHaveCount(1);
  await expect(page.locator('[data-unranked-id]')).toHaveCount(0);
  await expect(page.locator('.result-summary strong')).toHaveText('1');
  await expect(page.getByRole('button', { name: `Pinned for comparison: ${rdr.title}`, exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/discover?q=Red%20Dead&catalogs=off&include100=on');
  await expect(page.locator('[data-catalog-id]')).toHaveCount(2);
  expect((await new AxeBuilder({ page }).include('.discovery-page').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('canonical-discover.png'), fullPage: true });
});

test('bulk Discover and main100 actions keep canonical IDs for MassEffect2 and GTAIV without false completion', async ({
  page,
}) => {
  await page.goto('/discover?q=Mass%20Effect%202&catalogs=off&include100=on');
  const me2 = cardFor(page, 'mass-effect-2');
  await expect(me2).toContainText('From The 100 · #2');
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await expect(
    page.locator('.discovery-results-heading').getByRole('button', { name: 'Done selecting', exact: true }),
  ).not.toHaveAttribute('aria-pressed');
  await me2.getByRole('checkbox', { name: 'Select Mass Effect 2', exact: true }).check();
  await page.getByRole('button', { name: 'Mark played', exact: true }).click();
  await expect
    .poll(async () => (await readLibrary(page)).progress['mass-effect-2'])
    .toEqual({ played: true, completed: false, later: false });
  await page.goto('/discover?q=Grand%20Theft%20Auto%20IV&source=wikidata&year=2008&catalogs=off&include100=on');
  const gta = cardFor(page, 'grand-theft-auto-iv');
  await expect(gta).toContainText('From The 100 · #7');
  await expect(gta).toContainText('2008');
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await gta.getByRole('checkbox', { name: 'Select Grand Theft Auto IV', exact: true }).check();
  await page
    .getByRole('region', { name: 'Bulk game actions' })
    .getByRole('button', { name: 'Add to my ranking', exact: true })
    .click();
  await expect
    .poll(async () => (await readLibrary(page)).ranking.map((entry) => entry.id))
    .toEqual(['grand-theft-auto-iv']);
  expect((await readLibrary(page)).progress['grand-theft-auto-iv']?.played ?? false).toBe(false);
  await page.goto('/?q=Grand%20Theft%20Auto%20IV&catalogs=off');
  await expect(page.locator('.result-summary strong')).toHaveText('1');
  await page.getByRole('button', { name: 'Select multiple games', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Grand Theft Auto IV', exact: true }).check();
  await page.getByRole('button', { name: 'Mark played', exact: true }).click();
  await expect
    .poll(async () => (await readLibrary(page)).progress['grand-theft-auto-iv'])
    .toEqual({ played: true, completed: false, later: false });
  expect(Object.keys((await readLibrary(page)).records).sort()).toEqual(['grand-theft-auto-iv', 'mass-effect-2']);
});

test('Back and Forward clear a Discover selection when results change, but a detail-only URL change keeps it', async ({
  page,
}) => {
  const results = '/discover?q=Mass%20Effect%202&catalogs=off&include100=on';
  await page.goto(results);
  const me2 = cardFor(page, 'mass-effect-2');
  const select = me2.getByRole('checkbox', { name: 'Select Mass Effect 2', exact: true });
  const count = page.getByRole('status').filter({ hasText: /^\d+ selected$/ });
  await expect(me2).toContainText('From The 100 · #2');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page).toHaveURL((url) => !new URL(url).searchParams.has('q'));
  await page.goBack();
  await expect(page).toHaveURL((url) => new URL(url).searchParams.get('q') === 'Mass Effect 2');
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await select.check();
  await expect(count).toHaveText('1 selected');
  // Forward to other results, then Back: neither history step goes through the page's own change().
  await page.goForward();
  await expect(page).toHaveURL((url) => !new URL(url).searchParams.has('q'));
  await expect(count).toHaveText('0 selected');
  await page.goBack();
  await expect(page).toHaveURL((url) => new URL(url).searchParams.get('q') === 'Mass Effect 2');
  await expect(count).toHaveText('0 selected');
  await expect(select).not.toBeChecked();
  // A detail-only transition (the ?game= parameter, as the detail uses) leaves results and selection alone.
  await select.check();
  await expect(count).toHaveText('1 selected');
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set('game', 'mass-effect-2');
    history.pushState(history.state, '', `${url.pathname}${url.search}`);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  });
  // The detail may make the results inert, so the selection is read once it closes.
  await expect(page).toHaveURL((url) => new URL(url).searchParams.get('game') === 'mass-effect-2');
  await page.goBack();
  await expect(page).toHaveURL(
    (url) => !new URL(url).searchParams.has('game') && new URL(url).searchParams.get('q') === 'Mass Effect 2',
  );
  await expect(count).toHaveText('1 selected');
  await expect(select).toBeChecked();
});
test('a legacy-only saved copy stays Saved and owns every implicit create path, including canonical detail and bulk', async ({
  page,
}, info) => {
  let state = applyPersonalAction(emptyPersonalLibrary(), { type: 'add-ranking', records: [provider] });
  state = applyPersonalAction(state, {
    type: 'edit-ranking',
    id: provider.id,
    score: 7.3,
    note: 'Preserve this legacy note.',
  });
  state = applyPersonalAction(state, { type: 'set-progress', records: [provider], key: 'later', value: true });
  await installLibrary(page, state);
  await page.evaluate(
    (record) =>
      localStorage.setItem(
        'play100:compare-tray:v1:guest',
        JSON.stringify({ version: 1, scope: 'guest', items: [record] }),
      ),
    provider,
  );
  await page.goto('/discover?q=RDR2&catalogs=off&include100=on');
  const card = cardFor(page);
  await expect(card.getByRole('button', { name: `In My games: ${rdr.title}`, exact: true })).toBeDisabled();
  await expect(card.getByRole('button', { name: `Pinned for comparison: ${rdr.title}`, exact: true })).toBeDisabled();
  await expect(card).toContainText('Progress and ratings use your existing saved catalog copy.');
  await card.getByText('Actions & source', { exact: true }).click();
  await expect(card.getByRole('spinbutton')).toHaveValue('7.3');
  await card.getByRole('checkbox', { name: `I have played it: ${rdr.title}`, exact: true }).click();
  await card.getByRole('button', { name: `Completed: ${rdr.title}`, exact: true }).click();
  await rate(page, '8.1');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(8.1);
  await card.getByRole('button', { name: rdr.title, exact: true }).click();
  await expect(detailFor(page)).toContainText('#01 in the collection');
  await expect(detailFor(page).getByRole('spinbutton')).toHaveValue('8.1');
  const played = detailFor(page).getByRole('checkbox', { name: `I have played it: ${rdr.title}`, exact: true });
  const beforeConfirmation = await readLibrary(page);
  await played.click();
  const confirmation = page.getByRole('dialog', { name: `Mark ${rdr.title} not played?`, exact: true });
  await expect(confirmation.getByRole('button', { name: 'Keep completed', exact: true })).toBeFocused();
  await confirmation.getByRole('button', { name: 'Keep completed', exact: true }).click();
  await expect(played).toBeFocused();
  expect(await readLibrary(page)).toEqual(beforeConfirmation);
  await played.click();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(detailFor(page)).toBeVisible();
  await expect(played).toBeFocused();
  expect(await readLibrary(page)).toEqual(beforeConfirmation);
  await played.click();
  await confirmation.getByRole('button', { name: 'Mark not played', exact: true }).click();
  await expect
    .poll(async () => (await readLibrary(page)).progress[provider.id])
    .toEqual({ played: false, completed: false, later: true });
  expect((await readLibrary(page)).ranking).toEqual(beforeConfirmation.ranking);
  await rate(detailFor(page), '8.2');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(8.2);
  await detailFor(page)
    .getByRole('button', { name: `Open saved copy (Wikidata) of ${rdr.title}`, exact: true })
    .click();
  await expect(page).toHaveURL(/game=wikidata%3AQ27438121/);
  await expect(detailFor(page)).not.toContainText('#01 in the collection');
  await expect(detailFor(page).getByRole('spinbutton')).toHaveValue('8.2');
  await page.goto('/?q=RDR2&catalogs=off&view=table');
  await expect(page.locator('.result-summary strong')).toHaveText('1');
  await page.getByRole('button', { name: `Completed: ${rdr.title}`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).progress[provider.id]?.completed).toBe(true);
  await page.goto('/discover?q=RDR2&catalogs=off&include100=on');
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await cardFor(page)
    .getByRole('checkbox', { name: `Select ${rdr.title}`, exact: true })
    .check();
  await page.getByRole('button', { name: 'Mark played', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).records).toEqual(state.records);
  await page.goto('/?q=RDR2&catalogs=off');
  await page.getByRole('button', { name: 'Select multiple games', exact: true }).click();
  await page.getByRole('checkbox', { name: `Select ${rdr.title}`, exact: true }).check();
  await page
    .getByRole('region', { name: 'Bulk game actions' })
    .getByRole('button', { name: 'Add to my ranking', exact: true })
    .click();
  const actual = await readLibrary(page);
  expect(actual.records).toEqual(state.records);
  expect(actual.ranking).toEqual([{ ...state.ranking[0], score: 8.2 }]);
  expect(actual.queueOrder).toEqual([provider.id]);
  expect(actual.progress[provider.id]).toEqual({ played: true, completed: true, later: true });
  expect(actual.progress[canonical.id]).toBeUndefined();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('play100:compare-tray:v1:guest') ?? '{}').items.map(
        (item: LibraryRecord) => item.id,
      ),
    ),
  ).toEqual([provider.id]);
  await page.goto('/my-games?tab=ranking');
  await expect(page.locator('.my-games-editor:visible [data-record-id]')).toHaveCount(1);
  await expect(page.locator('.my-games-editor:visible [data-record-id]')).toHaveAttribute(
    'data-record-id',
    provider.id,
  );
  await page.screenshot({ path: info.outputPath('legacy-copy-retained.png') });
});

test('both owned copies keep conflicting opinions and manual names remain separate', async ({ page }) => {
  const manual: LibraryRecord = {
    ...provider,
    id: 'manual:own-version',
    source: 'manual',
    sourceId: 'own-version',
    sourceUrl: null,
  };
  let state = applyPersonalAction(emptyPersonalLibrary(), {
    type: 'add-ranking',
    records: [canonical, provider, manual],
  });
  state = applyPersonalAction(state, {
    type: 'edit-ranking',
    id: canonical.id,
    score: 9.1,
    note: 'Original-ID opinion.',
  });
  state = applyPersonalAction(state, {
    type: 'edit-ranking',
    id: provider.id,
    score: 3.2,
    note: 'Different old opinion, never merge.',
  });
  await installLibrary(page, state);
  await page.evaluate(
    (record) =>
      localStorage.setItem(
        'play100:compare-tray:v1:guest',
        JSON.stringify({ version: 1, scope: 'guest', items: [record] }),
      ),
    provider,
  );
  await page.goto('/discover?q=RDR2&catalogs=off&include100=on');
  const card = cardFor(page);
  await expect(card).toContainText('You also have a separate saved catalog copy.');
  await card.getByText('Actions & source', { exact: true }).click();
  await expect(card.getByRole('spinbutton')).toHaveValue('9.1');
  await rate(page, '8.9');
  await expect
    .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === canonical.id)?.score)
    .toBe(8.9);
  await card.getByRole('button', { name: `Open saved copy (Wikidata) of ${rdr.title}`, exact: true }).click();
  await expect(detailFor(page).getByRole('spinbutton')).toHaveValue('3.2');
  await page.goto('/?q=Red%20Dead%20Redemption%202&catalogs=off');
  await expect(page.locator('.result-summary [role="status"]')).toHaveText('1 in The 100 · 1 beyond The 100');
  await expect(page.locator('[data-game="red-dead-redemption-2"]')).toHaveCount(1);
  await expect(page.locator('[data-unranked-id]')).toHaveAttribute('data-unranked-id', manual.id);
  await page.goto('/my-games');
  await expect(page.locator('.my-games-editor:visible [data-record-id]')).toHaveCount(3);
  await page
    .locator(`.my-games-editor:visible [data-record-id="${canonical.id}"]`)
    .getByRole('button', { name: `Pin for comparison: ${rdr.title}`, exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(() => JSON.parse(localStorage.getItem('play100:compare-tray:v1:guest') ?? '{}').items),
    )
    .toEqual([]);
  const actual = await readLibrary(page);
  expect(actual.records).toEqual(state.records);
  expect(actual.ranking.find((entry) => entry.id === provider.id)).toEqual(
    state.ranking.find((entry) => entry.id === provider.id),
  );
  expect(actual.ranking.find((entry) => entry.id === canonical.id)?.note).toBe('Original-ID opinion.');
});

test('provider echoes resolve before filtering and cannot reappear from another local page', async ({ page }) => {
  await page.unroute('**/api/catalog?**');
  const outside: LibraryRecord = {
    ...provider,
    id: 'wikidata:Q90000001',
    sourceId: 'Q90000001',
    sourceUrl: null,
    title: 'Bounded provider-only fixture',
  };
  const offsets: number[] = [];
  await page.route('**/api/catalog?**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    const offset = Number(query.get('offset') ?? '0');
    offsets.push(offset);
    const source = query.get('source') ?? 'wikidata';
    return route.fulfill({
      json: {
        source,
        query: query.get('q') ?? '',
        offset,
        items: source === 'wikidata' ? [provider, ...(offset ? [outside] : [])] : [],
        total: 2,
        nextOffset: offset ? null : 5,
        notices: [],
      },
    });
  });
  await page.goto('/discover?source=wikidata&online=on&include100=on');
  await expect(page.getByRole('group', { name: 'Online catalog status' })).toContainText('1 loaded online');
  await expect(page.locator('[data-catalog-id]')).toHaveCount(24);
  await expect(cardFor(page)).toHaveCount(0);
  await expect(cardFor(page, provider.id)).toHaveCount(0);
  await page.getByRole('button', { name: 'More from Wikidata', exact: true }).click();
  await expect(page).toHaveURL(/offset=5/);
  await expect(cardFor(page, outside.id)).toBeVisible();
  await expect(page.locator('[data-catalog-id]')).toHaveCount(25);
  await expect(cardFor(page)).toHaveCount(0);
  expect(offsets).toContain(5);
  await page.goto('/discover?q=RDR2&source=wikidata&year=2018&online=on&include100=on');
  await expect(page.getByRole('group', { name: 'Online catalog status' })).toContainText('1 loaded online');
  await expect(page.locator('[data-catalog-id]')).toHaveCount(1);
  await expect(cardFor(page)).toContainText('2018');
  await expect(cardFor(page, provider.id)).toHaveCount(0);
  await openBrowsingFilters(page);
  await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption('collection');
  await expect(cardFor(page)).toBeVisible();
  await page.reload();
  await openBrowsingFilters(page);
  await expect(page.getByRole('combobox', { name: 'Source', exact: true })).toHaveValue('collection');
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Source', exact: true })).toHaveValue('wikidata');
});

test('late canonical data gates duplicate actions, error is recoverable, and all100 remain available without the seed', async ({
  page,
}) => {
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let seedLoaded = false;
  page.on('response', (response) => {
    if (response.url().includes('/data/discovery/catalog.v1.json')) seedLoaded = true;
  });
  await page.route('**/data/collection.json', async (route) => {
    await waiting;
    await route.fulfill({ json: collection });
  });
  try {
    await page.goto('/discover?q=RDR2&catalogs=off&include100=on');
    await expect.poll(() => seedLoaded).toBe(true);
    await expect(page.locator('.discovery-results-heading').getByRole('status')).toHaveText('Loading the catalog…');
    await expect(page.getByRole('region', { name: 'Catalog games', exact: true })).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('[data-catalog-id]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Add to My games: ${rdr.title}`, exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(cardFor(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Catalog games', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.unroute('**/data/collection.json');
  await page.route('**/data/collection.json', (route) =>
    route.fulfill({ status: 503, body: 'Synthetic unavailable original collection' }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reload The 100', exact: true })).toBeVisible();
  await expect(page.locator('[data-catalog-id]')).toHaveCount(0);
  await page.unroute('**/data/collection.json');
  await page.getByRole('button', { name: 'Reload The 100', exact: true }).click();
  await expect(cardFor(page)).toBeVisible();
  await page.route('**/data/discovery/catalog.v1.json', (route) =>
    route.fulfill({ status: 503, body: 'Synthetic unavailable seed' }),
  );
  await page.goto('/discover?source=collection&catalogs=off');
  await expect(page.locator('.discovery-results-heading')).toContainText('1–24 of 100 catalog games');
  await expect(page.locator('[data-catalog-id]')).toHaveCount(24);
  const firstIds = await page
    .locator('[data-catalog-id]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-catalog-id')));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/offset=24/);
  const nextIds = await page
    .locator('[data-catalog-id]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-catalog-id')));
  expect(firstIds.some((id) => nextIds.includes(id))).toBe(false);
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill('Dishonored');
  await expect(cardFor(page, 'dishonored')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill('Hitman');
  await expect(cardFor(page, 'hitman-world-of-assassination')).toBeVisible();
});

test('verified unsaved legacy links open canonical details while genuinely different remake identities stay separate', async ({
  page,
}, info) => {
  await page.goto('/discover?catalogs=off&game=wikidata%3AQ27438121');
  await expect(detailFor(page)).toContainText('#01 in the collection');
  await detailFor(page).getByRole('button', { name: 'Play later', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([canonical.id]);
  expect((await readLibrary(page)).records[provider.id]).toBeUndefined();
  await page.goto('/discover?q=Resident%20Evil%204&catalogs=off&include100=on');
  await expect(cardFor(page, 'resident-evil-4')).toBeVisible();
  await expect(cardFor(page, 'wikidata:Q275950')).toBeVisible();
  await expect(cardFor(page, 'wikidata:Q275950')).toContainText('2005 original');
  await expect(cardFor(page, 'wikidata:Q112231148')).toHaveCount(0);
  await page.locator('.discovery-cards').screenshot({ path: info.outputPath('distinct-re4-editions.png') });
  await cardFor(page, 'wikidata:Q275950').getByRole('button', { name: 'Resident Evil 4', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('2005 original');
  await expect(page).toHaveURL(/game=wikidata%3AQ275950/);
  await page.goto('/discover?q=Tomb%20Raider&catalogs=off&include100=on');
  await expect(cardFor(page, 'tomb-raider')).toBeVisible();
  await expect(cardFor(page, 'wikidata:Q317620')).toBeVisible();
  await page.goto('/discover?q=Overwatch&catalogs=off&include100=on');
  await expect(cardFor(page, 'overwatch')).toBeVisible();
  await expect(cardFor(page, 'freetogame:540')).toBeVisible();
});

test('a superseded provider response cannot restore an old query or duplicate a newly resolved canonical result', async ({
  page,
}) => {
  await page.unroute('**/api/catalog?**');
  let oldRequested = false;
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let oldFinished = false;
  await page.route('**/api/catalog?**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const source = params.get('source') ?? 'wikidata';
    const query = params.get('q') ?? '';
    if (source === 'wikidata' && query === 'RDR2') {
      oldRequested = true;
      await waiting;
    }
    const record =
      query === 'RDR2' ? provider : seed.items.find((item) => item.record.id === 'wikidata:Q725057')!.record;
    await route.fulfill({
      json: {
        source,
        query,
        offset: 0,
        nextOffset: null,
        total: source === 'wikidata' ? 1 : 0,
        items: source === 'wikidata' ? [record] : [],
        notices: [],
      },
    });
    if (source === 'wikidata' && query === 'RDR2') oldFinished = true;
  });
  await page.goto('/discover?q=RDR2&online=on&include100=on');
  await expect.poll(() => oldRequested).toBe(true);
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill('Mass Effect 2');
  await expect(cardFor(page, 'mass-effect-2')).toBeVisible();
  await page.getByRole('button', { name: 'Search online', exact: true }).click();
  release();
  await expect.poll(() => oldFinished).toBe(true);
  await expect(page.getByRole('group', { name: 'Online catalog status' })).toContainText('1 loaded online');
  await expect(page.locator('[data-catalog-id]')).toHaveCount(1);
  await expect(cardFor(page, 'mass-effect-2')).toContainText('From The 100 · #2');
  await expect(cardFor(page)).toHaveCount(0);
  await expect(cardFor(page, 'wikidata:Q725057')).toHaveCount(0);
});

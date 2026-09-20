import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ComponentType } from 'react';
import { parseCollection } from '../src/lib/collection';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { applyPersonalAction, emptyPersonalLibrary } from '../src/lib/personal-library';
import type { LibraryRecord, PersonalLibraryState } from '../src/lib/personal-types';
import { recordFromGame } from '../src/lib/personal-types';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../src/lib/personal-db';
import { readLibrary } from './library-helpers';

const games = parseCollection(JSON.parse(readFileSync(new URL('../public/data/collection.json', import.meta.url), 'utf8'))).games;
const seedCatalog = parseDiscoveryCatalog(JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')));
const canonical = recordFromGame(games[0]!);
const provider = seedCatalog.items.find(item => item.record.id === 'wikidata:Q27438121')!.record;
const manual: LibraryRecord = { ...provider, id: 'manual:same-title-picker', source: 'manual', sourceId: 'same-title-picker', sourceUrl: null };
const picker = (page: Page) => page.locator('.my-games-editor:visible .game-picker');
const choices = (page: Page) => picker(page).locator('[data-picker-id]');

test.beforeEach(async ({ context, page, baseURL }) => {
  const origin = new URL(baseURL!);
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) return route.abort('blockedbyclient');
    if (url.pathname === '/api/catalog') return route.fulfill({ status: 503, json: { error: 'Provider lookup is outside this guest identity fixture.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function openPicker(page: Page, state = emptyPersonalLibrary()) {
  await page.goto('/favicon.svg');
  await page.evaluate(({ name, version, store, key, state }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(name, version);
    open.onupgradeneeded = () => open.result.createObjectStore(store);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(state, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, key: STATE_KEY, state });
  await page.goto('/my-games?tab=ranking&catalogs=off');
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  await picker(page).getByRole('searchbox').fill(canonical.title);
}

function legacyState(ranked: boolean, record = provider): PersonalLibraryState {
  let state = applyPersonalAction(emptyPersonalLibrary(), { type: ranked ? 'add-ranking' : 'add-records', records: [record] });
  state = applyPersonalAction(state, { type: 'set-progress', records: [record], key: 'played', value: true });
  state = applyPersonalAction(state, { type: 'set-progress', records: [record], key: 'later', value: true });
  if (ranked) state = applyPersonalAction(state, { type: 'edit-ranking', id: record.id, score: 8.5, note: 'Keep the historical provider opinion.' });
  return state;
}

test('fresh private picker adds one canonical record without inferring play history', async ({ page }) => {
  await openPicker(page);
  await expect(choices(page)).toHaveCount(1);
  await expect(choices(page)).toHaveAttribute('data-picker-id', canonical.id);
  await picker(page).getByRole('button', { name: `Add ${canonical.title} to ranking`, exact: true }).click();
  await expect(picker(page).getByRole('button', { name: `Already in ranking: ${canonical.title}`, exact: true })).toBeDisabled();
  const state = await readLibrary(page);
  expect(Object.keys(state.records)).toEqual([canonical.id]);
  expect(state.ranking).toEqual([{ id: canonical.id, score: null, note: '', manualPosition: null }]);
  expect(state.progress[canonical.id]?.played ?? false).toBe(false);
  expect(state.queueOrder).toEqual([]);
});

test('an already-ranked unique provider copy has one honest disabled target and no implicit canonical copy', async ({ page }, info) => {
  const before = legacyState(true);
  await openPicker(page, before);
  await expect(choices(page)).toHaveCount(1);
  await expect(choices(page)).toHaveAttribute('data-picker-id', provider.id);
  await expect(choices(page)).toContainText('Already ranked');
  const button = picker(page).getByRole('button', { name: `Already in ranking: ${provider.title}`, exact: true });
  await expect(button).toBeDisabled();
  await button.evaluate(element => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('The ranked choice is not a native button.');
    element.click();
  });
  expect(await readLibrary(page)).toEqual(before);
  expect((await readLibrary(page)).records[canonical.id]).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await picker(page).screenshot({ path: info.outputPath('owned-alias-already-ranked.png'), scale: 'css' });
});

test('ranking an unranked owned alias reuses only its existing metadata and preserves Queue and Played', async ({ page }) => {
  const before = legacyState(false);
  await openPicker(page, before);
  await expect(choices(page)).toHaveCount(1);
  await expect(choices(page)).toHaveAttribute('data-picker-id', provider.id);
  await picker(page).getByRole('button', { name: `Add ${provider.title} to ranking`, exact: true }).click();
  await expect(picker(page).getByRole('button', { name: `Already in ranking: ${provider.title}`, exact: true })).toBeDisabled();
  const after = await readLibrary(page);
  expect(after.records).toEqual(before.records);
  expect(after.progress).toEqual(before.progress);
  expect(after.queueOrder).toEqual(before.queueOrder);
  expect(after.ranking).toEqual([{ id: provider.id, score: null, note: '', manualPosition: null }]);
  await page.reload();
  expect(await readLibrary(page)).toEqual(after);
});

test('both owned opinions and an unknown same-title manual game stay independently accessible', async ({ page }) => {
  let before = applyPersonalAction(legacyState(true), { type: 'add-ranking', records: [canonical] });
  before = applyPersonalAction(before, { type: 'edit-ranking', id: canonical.id, score: 9.3, note: 'Separate canonical opinion.' });
  before = applyPersonalAction(before, { type: 'add-records', records: [manual] });
  await openPicker(page, before);
  await expect(choices(page)).toHaveCount(3);
  for (const id of [canonical.id, provider.id]) {
    await expect(picker(page).locator(`[data-picker-id="${id}"] button`)).toBeDisabled();
  }
  await picker(page).locator(`[data-picker-id="${manual.id}"]`).getByRole('button', { name: `Add ${manual.title} to ranking`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.length).toBe(3);
  const after = await readLibrary(page);
  for (const id of [canonical.id, provider.id]) expect(after.ranking.find(entry => entry.id === id)).toEqual(before.ranking.find(entry => entry.id === id));
  expect(after.records).toEqual(before.records);
  expect(after.progress).toEqual(before.progress);
  expect(after.queueOrder).toEqual(before.queueOrder);
  await page.getByRole('button', { name: 'Close game picker', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Your ranked games', exact: true }).locator('[data-record-id]')).toHaveCount(3);
});

test('saved and canonical titles both find the one existing add target without overwriting its metadata', async ({ page }) => {
  const saved = { ...provider, title: 'Saved Western Adventure', studio: 'Historical source studio' };
  const before = legacyState(false, saved);
  await openPicker(page, before);
  await expect(choices(page)).toHaveCount(1);
  await expect(choices(page)).toContainText(saved.title);
  await picker(page).getByRole('searchbox').fill(saved.title);
  await expect(choices(page)).toHaveCount(1);
  await expect(choices(page)).toHaveAttribute('data-picker-id', saved.id);
  await picker(page).getByRole('button', { name: `Add ${saved.title} to ranking`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.id).toBe(saved.id);
  expect((await readLibrary(page)).records).toEqual(before.records);
});

test('late canonical props retain the already-owned candidate and its searchable saved title', async ({ page }) => {
  await page.goto('/data-use');
  await expect(page.getByRole('heading', { name: 'Data use', exact: true })).toBeVisible();
  const saved = { ...provider, title: 'Saved Western Adventure' };
  await page.evaluate(async ({ saved, canonical }) => {
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const reactPath = resources.findLast(value => new URL(value).pathname === '/node_modules/.vite/deps/react.js');
    const domPath = resources.findLast(value => new URL(value).pathname === '/node_modules/.vite/deps/react-dom_client.js');
    if (!reactPath || !domPath) throw new Error('The actual app React modules were not loaded.');
    const { default: React }: { default: typeof import('react') } = await import(reactPath);
    const { default: ReactDom }: { default: typeof import('react-dom/client') } = await import(domPath);
    const panelPath = '/src/components/personal/AddGamesPanel.tsx';
    const { default: Panel }: { default: ComponentType<{
      records: LibraryRecord[]; ownedRecords: Record<string, LibraryRecord>; existingIds: ReadonlySet<string>;
      busy: boolean; onDiscover: () => void; onAdd: (records: LibraryRecord[]) => Promise<boolean>;
    }> } = await import(panelPath);
    const container = document.createElement('div');
    container.id = 'late-picker-fixture';
    document.body.append(container);
    function Fixture() {
      const [available, setAvailable] = React.useState<LibraryRecord[]>([]);
      return React.createElement('section', null,
        React.createElement('button', { onClick: () => setAvailable([canonical]) }, 'Supply canonical data'),
        React.createElement(Panel, { records: available, ownedRecords: { [saved.id]: saved }, existingIds: new Set([saved.id]),
          busy: false, onDiscover: () => {}, onAdd: async () => { document.documentElement.dataset.latePickerUnexpectedAdd = 'yes'; return true; } }));
    }
    ReactDom.createRoot(container).render(React.createElement(Fixture));
  }, { saved, canonical });
  const fixture = page.locator('#late-picker-fixture');
  await fixture.getByRole('button', { name: 'Add games', exact: true }).click();
  await fixture.getByRole('searchbox').fill(saved.title);
  await expect(fixture.locator('[data-picker-id]')).toHaveCount(1);
  await expect(fixture.locator('[data-picker-id]')).toHaveAttribute('data-picker-id', saved.id);
  await fixture.getByRole('button', { name: 'Supply canonical data', exact: true }).click();
  await expect(fixture.getByRole('searchbox')).toHaveValue(saved.title);
  await expect(fixture.locator('[data-picker-id]')).toHaveCount(1);
  await fixture.getByRole('searchbox').fill(canonical.title);
  await expect(fixture.locator('[data-picker-id]')).toHaveCount(1);
  await expect(fixture.getByRole('button', { name: `Already in ranking: ${saved.title}`, exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.dataset.latePickerUnexpectedAdd)).toBeUndefined();
});

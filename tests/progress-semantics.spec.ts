import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parseCollection } from '../src/lib/collection';
import { recordFromGame } from '../src/lib/personal-types';
import type { LibraryRecord } from '../src/lib/personal-types';
import { readLibrary } from './library-helpers';
import { openBrowsingFilters } from './browsing-helpers';

const editor = (page: Page) => page.locator('.my-games-editor:visible');
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Synthetic clipboard denial', 'NotAllowedError'); } } });
  });
  await page.route('**/api/catalog?**', route => route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }));
});
async function seed(page: Page, request: APIRequestContext) {
  const games = parseCollection(await (await request.get('/data/collection.json')).json()).games.slice(0, 4);
  const records: LibraryRecord[] = [...games.map(recordFromGame), ...['unfinished', 'completed'].map(id => ({
    id: `manual:${id}`, source: 'manual' as const, sourceId: id, sourceUrl: null, title: `Manual ${id}`, year: null, studio: null, genre: null, collectionRank: null,
  }))];
  await page.goto('/my-games');
  await page.evaluate(async records => {
    const statePath = '/src/lib/personal-library.ts'; const dbPath = '/src/lib/personal-db.ts';
    const lib: typeof import('../src/lib/personal-library') = await import(statePath);
    const db: typeof import('../src/lib/personal-db') = await import(dbPath);
    let state = lib.applyPersonalAction(lib.emptyPersonalLibrary(), { type: 'add-ranking', records });
    state = lib.applyPersonalAction(state, { type: 'set-progress', records: [records[1]!, records[4]!], key: 'played', value: true });
    state = lib.applyPersonalAction(state, { type: 'set-progress', records: [records[2]!, records[3]!, records[5]!], key: 'completed', value: true });
    state = lib.applyPersonalAction(state, { type: 'set-progress', records: [records[3]!, records[4]!], key: 'later', value: true });
    state = lib.applyPersonalAction(state, { type: 'edit-ranking', id: records[0]!.id, score: 8.5, note: 'Keep the private note and manual order.' });
    state = lib.applyPersonalAction(state, { type: 'move-item', list: 'ranking', id: records[0]!.id, overId: records[3]!.id });
    await db.restorePersonalLibrary(state);
  }, records);
  return records;
}

test('clear progress views roundtrip for the100, additions, Queue and Ranking without changing stored order', async ({ page, request }, info) => {
  const records = await seed(page, request); const before = await readLibrary(page);
  await page.goto('/?progress=unfinished&catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(1);
  await expect(page.locator('[data-unranked-id]')).toHaveCount(1);
  await expect(page.locator('.result-summary [role="status"]')).toHaveText('1 in The 100 · 1 beyond The 100');
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('unfinished');
  await openBrowsingFilters(page);
  await page.getByLabel('Progress', { exact: true }).selectOption('completed');
  await expect(page.locator('.result-summary [role="status"]')).toHaveText('2 in The 100 · 1 beyond The 100');
  await page.reload(); await expect(page.locator('.result-summary [role="status"]')).toHaveText('2 in The 100 · 1 beyond The 100');
  await openBrowsingFilters(page);
  await page.getByLabel('Progress', { exact: true }).selectOption('not-played');
  await expect(page.locator('.result-summary strong')).toHaveText('97');
  await page.goBack();
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('completed');
  await page.goto('/?list=unplayed&catalogs=off');
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('not-completed');
  await expect(page.locator('.result-summary [role="status"]')).toHaveText('98 in The 100 · 1 beyond The 100');
  await page.getByRole('button', { name: 'Share this view', exact: true }).click();
  const shared = await page.getByLabel('Shareable link', { exact: true }).inputValue();
  expect(new URL(shared).searchParams.get('list')).toBeNull();
  expect(new URL(shared).searchParams.get('progress')).toBeNull();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.goto('/my-games?tab=queue&progress=completed');
  await expect(editor(page).locator('[data-record-id]')).toHaveCount(1);
  await expect(editor(page).locator('[data-record-id]')).toHaveAttribute('data-record-id', records[3]!.id);
  await page.getByLabel('Progress', { exact: true }).selectOption('unfinished');
  await expect(editor(page).locator('[data-record-id]')).toHaveAttribute('data-record-id', 'manual:unfinished');
  await page.getByRole('navigation', { name: 'My games views' }).getByRole('button', { name: /^Ranking/ }).click();
  await expect(editor(page).locator('[data-record-id]')).toHaveCount(2);
  await page.getByLabel('Progress', { exact: true }).selectOption('completed');
  await expect(editor(page).locator('[data-record-id]')).toHaveCount(3);
  await page.getByLabel('Progress', { exact: true }).selectOption('any-played');
  await expect(editor(page).locator('[data-record-id]')).toHaveCount(5);
  await page.getByLabel('Progress', { exact: true }).selectOption('not-played');
  await expect(editor(page).locator('[data-record-id]')).toHaveCount(1);
  expect((await readLibrary(page)).queueOrder).toEqual(before.queueOrder);
  expect((await readLibrary(page)).ranking).toEqual(before.ranking);
  expect((await readLibrary(page)).progress).toEqual(before.progress);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.my-games-workspace').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('progress-ranking.png') });
});

test('bulk Mark played is independent on collection, imported Discovery and saved Library records', async ({ page }, info) => {
  await page.goto('/?q=Red%20Dead%20Redemption%202&catalogs=off');
  await page.getByRole('button', { name: 'Select multiple games', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Red Dead Redemption 2', exact: true }).check();
  await page.getByRole('button', { name: 'Mark played', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).progress['red-dead-redemption-2']).toEqual({ played: true, completed: false, later: false });
  expect((await readLibrary(page)).queueOrder).toEqual([]);
  await page.goto('/discover?q=Kingdomcome&catalogs=off');
  const card = page.locator('[data-catalog-id="wikidata:Q15408545"]');
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await card.getByRole('checkbox', { name: 'Select Kingdom Come: Deliverance', exact: true }).check();
  await page.getByRole('button', { name: 'Mark played', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).progress['wikidata:Q15408545']).toEqual({ played: true, completed: false, later: false });
  await openBrowsingFilters(page);
  await page.getByLabel('Progress', { exact: true }).selectOption('unfinished');
  await expect(card).toBeVisible();
  await page.getByLabel('Progress', { exact: true }).selectOption('completed');
  await expect(card).toHaveCount(0);
  await page.goto('/my-games');
  await editor(page).locator('.manual-add > summary').click();
  await editor(page).getByLabel('Game title', { exact: true }).fill('Manual progress fixture');
  await editor(page).getByRole('button', { name: 'Add to my library', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: 'Manual progress fixture', exact: true })).toBeVisible();
  await editor(page).getByRole('button', { name: 'Select games', exact: true }).click();
  await editor(page).getByRole('checkbox', { name: 'Select Manual progress fixture', exact: true }).check();
  await editor(page).getByRole('button', { name: 'Mark played', exact: true }).click();
  const state = await readLibrary(page);
  const manual = Object.values(state.records).find(record => record.title === 'Manual progress fixture');
  if (!manual) throw new Error('Actual manual record missing.');
  expect(state.progress[manual.id]).toEqual({ played: true, completed: false, later: false });
  expect(state.queueOrder).toEqual([]); expect(state.ranking).toEqual([]);
  await editor(page).getByRole('button', { name: `Mark ${manual.title} completed`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).progress[manual.id]).toEqual({ played: true, completed: true, later: false });
  await editor(page).getByRole('button', { name: `Unmark ${manual.title} completed`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).progress[manual.id]).toEqual({ played: true, completed: false, later: false });
  await page.getByLabel('Progress', { exact: true }).selectOption('unfinished');
  await expect(editor(page).locator('[data-record-id]')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('progress-library.png') });
});

test('progress-filter changes flush valid drafts, block invalid drafts and never infer played from the author', async ({ page, request }) => {
  await page.goto('/?game=the-witcher-3-wild-hunt');
  await expect(page.locator('.source-note')).toContainText('not played');
  await expect(page.getByRole('checkbox', { name: 'I have played it: The Witcher 3: Wild Hunt', exact: true })).not.toBeChecked();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Mark completed', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const records = await seed(page, request);
  await page.goto('/my-games?tab=ranking');
  const rating = editor(page).getByRole('spinbutton', { name: `Your rating for ${records[0]!.title}`, exact: true });
  await rating.fill('11');
  await page.getByLabel('Progress', { exact: true }).selectOption('completed');
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('all');
  await expect(rating).toHaveValue('11');
  await expect(page.getByRole('alert').filter({ hasText: 'Your edit has not saved' })).toBeVisible();
  await rating.fill('8.4');
  await page.getByLabel('Progress', { exact: true }).selectOption('completed');
  await expect(page.getByLabel('Progress', { exact: true })).toHaveValue('completed');
  expect((await readLibrary(page)).ranking.find(entry => entry.id === records[0]!.id)?.score).toBe(8.4);
  expect((await readLibrary(page)).progress[records[0]!.id]?.played ?? false).toBe(false);
});

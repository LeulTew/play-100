import { chromium, test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readLibrary } from './library-helpers';
import type { Game } from '../src/lib/types';
import { recordFromGame } from '../src/lib/personal-types';

const a = { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2' };
const b = { id: 'mass-effect-2', title: 'Mass Effect 2' };
const c = { id: 'the-witcher-3-wild-hunt', title: 'The Witcher 3: Wild Hunt' };

async function prepare(page: Page) {
  await page.goto('/my-rankings');
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  for (const game of [a, b, c]) {
    await page.getByRole('button', { name: `Add ${game.title} to ranking`, exact: true }).click();
    await expect.poll(async () => (await readLibrary(page)).ranking.some((entry) => entry.id === game.id)).toBe(true);
  }
  await page.getByRole('button', { name: 'Close game picker', exact: true }).click();
}

async function rate(page: Page, game: typeof a, value: string) {
  await page.getByRole('spinbutton', { name: `Your rating for ${game.title}`, exact: true }).fill(value);
  await expect.poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score).toBe(value ? Number(value) : null);
}

test('played state is one committed value across detail, grid, list, table, library and rankings', async ({ page, context }) => {
  await page.goto(`/?game=${a.id}`);
  const detailPlayed = page.getByRole('dialog').getByRole('checkbox', { name: `I have played it: ${a.title}`, exact: true });
  await detailPlayed.click();
  await expect(detailPlayed).toBeChecked();
  await page.getByRole('button', { name: 'Add to my ranking', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.length).toBe(1);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator(`[data-game="${a.id}"] [data-played-id] input`)).toBeChecked();
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.locator(`[data-game="${a.id}"] [data-played-id] input`)).toBeChecked();
  await page.getByRole('button', { name: 'Ratings table view', exact: true }).click();
  await expect(page.locator(`tr[data-game="${a.id}"] [data-played-id] input`)).toBeChecked();
  await page.goto('/my-rankings');
  const rankedPlayed = page.getByRole('checkbox', { name: `I have played it: ${a.title}`, exact: true });
  await expect(rankedPlayed).toBeChecked();
  await rankedPlayed.click();
  await expect(rankedPlayed).not.toBeChecked();
  await page.goto('/my-library');
  const libraryPlayed = page.locator(`.my-games-editor:visible [data-record-id="${a.id}"] [data-played-id] input`);
  await expect(libraryPlayed).not.toBeChecked();
  await libraryPlayed.click();
  await expect(libraryPlayed).toBeChecked();
  const peer = await context.newPage();
  await peer.goto('/?view=table');
  const peerPlayed = peer.locator(`tr[data-game="${a.id}"] [data-played-id] input`);
  await expect(peerPlayed).toBeChecked();
  await peerPlayed.click();
  await expect(peerPlayed).not.toBeChecked();
  await expect(libraryPlayed).not.toBeChecked();
  await page.reload();
  await expect(page.locator(`.my-games-editor:visible [data-record-id="${a.id}"] [data-played-id] input`)).not.toBeChecked();
  await peer.close();
});

test('unmarking played visibly confirms completion loss and keeps the replay queue, rating and note', async ({ page }, info) => {
  await page.goto(`/?game=${a.id}`);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Play later', exact: true }).click();
  await dialog.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const played = dialog.getByRole('checkbox', { name: `I have played it: ${a.title}`, exact: true });
  await expect(played).toBeChecked();
  await dialog.getByRole('spinbutton', { name: `Your rating for ${a.title}`, exact: true }).fill('8.5');
  await dialog.getByRole('spinbutton').press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(8.5);
  await page.evaluate(async id => {
    const modulePath = '/src/lib/personal-db.ts';
    const source: typeof import('../src/lib/personal-db') = await import(modulePath);
    await source.commitPersonalAction({ type: 'edit-ranking', id, note: 'Keep this replay note.' });
  }, a.id);
  const before = await readLibrary(page);
  await played.click();
  const confirmation = page.getByRole('dialog', { name: `Mark ${a.title} not played?`, exact: true });
  await expect(confirmation).toContainText('This also clears Completed.');
  await expect(confirmation.getByRole('button', { name: 'Keep completed', exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath('progress-confirmation.png') });
  await confirmation.getByRole('button', { name: 'Keep completed', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(played).toBeFocused();
  expect(await readLibrary(page)).toEqual(before);
  await played.click();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: a.title, exact: true })).toBeVisible();
  await expect(played).toBeFocused();
  expect(await readLibrary(page)).toEqual(before);
  await played.click();
  await confirmation.getByRole('button', { name: 'Mark not played', exact: true }).click();
  await expect(played).not.toBeChecked();
  const state = await readLibrary(page);
  expect(state.progress[a.id]).toEqual({ played: false, completed: false, later: true });
  expect(state.queueOrder).toEqual([a.id]);
  expect(state.ranking).toEqual(before.ranking);
});

test('scores automatically reorder and persist while manually moved games keep their chosen slots', async ({ page }) => {
  await prepare(page);
  await rate(page, a, '8');
  await rate(page, b, '9');
  await rate(page, c, '7');
  await expect.poll(async () => (await readLibrary(page)).ranking.map((entry) => entry.id)).toEqual([b.id, a.id, c.id]);
  await page.getByRole('button', { name: `Move ${a.title} up in ranking`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.manualPosition).toBe(1);
  await rate(page, c, '10');
  await rate(page, a, '0');
  await expect.poll(async () => (await readLibrary(page)).ranking.map((entry) => entry.id)).toEqual([a.id, c.id, b.id]);
  await page.reload();
  await expect(page.locator('.my-games-editor:visible .personal-row').first()).toHaveAttribute('data-record-id', a.id);
  await expect(page.locator(`[data-record-id="${a.id}"] .manual-rank`)).toContainText('Fixed at #1');
  await page.getByRole('button', { name: `Use rating order for ${a.title}`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.map((entry) => entry.id)).toEqual([c.id, b.id, a.id]);
  expect((await readLibrary(page)).ranking.every((entry) => entry.manualPosition === null)).toBe(true);
  expect(Object.values((await readLibrary(page)).progress).every((entry) => !entry.played)).toBe(true);
});

test('older IndexedDB rankings keep their saved order until automatic sorting is explicitly chosen', async ({ page, request }) => {
  const source = await (await request.get('/data/collection.json')).json() as { games: Game[] };
  const records = source.games.filter((game) => [a.id, b.id].includes(game.slug)).map(recordFromGame);
  await page.goto('/favicon.svg');
  await page.evaluate(({ records, a, b }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('play100-personal', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('library');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('library', 'readwrite');
      tx.objectStore('library').put({
        version: 2, revision: 11, records: Object.fromEntries(records.map((record) => [record.id, record])),
        progress: { [a]: { later: false, completed: false, played: true } },
        queueOrder: [], ranking: [{ id: a, score: 1, note: 'Old custom order' }, { id: b, score: 9, note: '' }], motion: 'lite',
      }, 'state');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), { records, a: a.id, b: b.id });
  await page.goto('/my-rankings');
  await expect(page.locator('.my-games-editor:visible .personal-row')).toHaveCount(2);
  expect((await readLibrary(page)).version).toBe(3);
  expect((await readLibrary(page)).ranking.map((entry) => [entry.id, entry.manualPosition])).toEqual([[a.id, 1], [b.id, 2]]);
  await rate(page, b, '10');
  expect((await readLibrary(page)).ranking[0]?.id).toBe(a.id);
  await page.getByRole('button', { name: 'Use rating order for all', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.map((entry) => entry.id)).toEqual([b.id, a.id]);
  await page.reload();
  await expect(page.locator('.my-games-editor:visible .personal-row').first()).toHaveAttribute('data-record-id', b.id);
});

test('catalog played state follows the saved game into its library, detail and personal ranking', async ({ page }) => {
  const record = { id: 'wikidata:Q555', title: 'Shared catalog game', year: 2020, studio: null, genre: null, source: 'wikidata', sourceId: 'Q555', sourceUrl: 'https://www.wikidata.org/wiki/Q555', collectionRank: null };
  await page.route('**/api/catalog?**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ source: 'wikidata', query: '', items: [record], total: 1, offset: 0, nextOffset: null, notices: [] }),
  }));
  await page.goto('/discover');
  await page.getByRole('button', { name: 'Browse catalog', exact: true }).click();
  const played = page.locator(`[data-catalog-id="${record.id}"] [data-played-id] input`);
  await played.click();
  await expect(played).toBeChecked();
  await page.getByRole('button', { name: `Add ${record.title} to my ranking`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.length).toBe(1);
  await page.goto('/my-rankings');
  await expect(page.getByRole('checkbox', { name: `I have played it: ${record.title}`, exact: true })).toBeChecked();
  await page.getByRole('button', { name: record.title, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('checkbox', { name: `I have played it: ${record.title}`, exact: true })).toBeChecked();
});

test('failed rating autosave keeps the prior score and does not retry in a background loop', async ({ page }) => {
  await prepare(page);
  await rate(page, a, '7');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (document.documentElement.dataset.failRatingSave === 'yes') {
        document.documentElement.dataset.ratingSaveAttempts = String(Number(document.documentElement.dataset.ratingSaveAttempts ?? 0) + 1);
        throw new DOMException('Storage is full', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
    document.documentElement.dataset.failRatingSave = 'yes';
  });
  await page.getByRole('spinbutton', { name: `Your rating for ${a.title}`, exact: true }).fill('9');
  await expect(page.locator(`[data-record-id="${a.id}"] .inline-error`)).toContainText('could not be saved');
  const attempts = await page.evaluate(() => document.documentElement.dataset.ratingSaveAttempts);
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => document.documentElement.dataset.ratingSaveAttempts)).toBe(attempts);
  expect((await readLibrary(page)).ranking.find((entry) => entry.id === a.id)?.score).toBe(7);
  await page.evaluate(() => { document.documentElement.dataset.failRatingSave = 'no'; });
  await rate(page, a, '8');
});

test('played state, score ordering and manual slots survive a full browser restart', async ({ baseURL, isMobile, viewport }, testInfo) => {
  const profile = testInfo.outputPath('persistent-library-profile');
  const options = { headless: true, baseURL, isMobile, hasTouch: isMobile, viewport, args: ['--enable-unsafe-swiftshader'] };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = context.pages()[0] ?? await context.newPage();
    await prepare(page);
    await rate(page, a, '8');
    await rate(page, b, '9');
    await rate(page, c, '10');
    await page.getByRole('button', { name: `Move ${a.title} up in ranking`, exact: true }).click();
    await expect.poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === a.id)?.manualPosition).toBe(2);
    const played = page.getByRole('checkbox', { name: `I have played it: ${a.title}`, exact: true });
    await played.click();
    await expect(played).toBeChecked();
    const before = await readLibrary(page);
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = context.pages()[0] ?? await context.newPage();
    await page.goto('/my-rankings');
    await expect(page.locator('.personal-row')).toHaveCount(3);
    const after = await readLibrary(page);
    expect(after.ranking).toEqual(before.ranking);
    expect(after.progress).toEqual(before.progress);
    expect(after.ranking.map((entry) => entry.id)).toEqual([c.id, a.id, b.id]);
    await expect(page.getByRole('checkbox', { name: `I have played it: ${a.title}`, exact: true })).toBeChecked();
    await rate(page, c, '6');
    await expect.poll(async () => (await readLibrary(page)).ranking.map((entry) => entry.id)).toEqual([b.id, a.id, c.id]);
    expect((await readLibrary(page)).ranking[1]?.manualPosition).toBe(2);
  } finally { await context.close(); }
});

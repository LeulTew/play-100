import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { readLibrary } from './library-helpers';

const first = 'red-dead-redemption-2';
const second = 'mass-effect-2';
const third = 'the-witcher-3-wild-hunt';
const legacyKey = 'play100.library.v1';

async function seedLegacy(page: Page) {
  await page.addInitScript(({ key, first, second, third }) => {
    if (sessionStorage.getItem('play100-test-seeded')) return;
    localStorage.setItem(key, JSON.stringify({
      version: 1, motion: 'lite',
      progress: {
        [third]: { later: true, completed: false },
        [second]: { later: true, completed: true },
        [first]: { later: true, completed: false },
      },
    }));
    sessionStorage.setItem('play100-test-seeded', 'yes');
  }, { key: legacyKey, first, second, third });
}

async function openSettings(page: Page) {
  await page.locator('.footer-tools').getByRole('button', { name: /Effects:/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('legacy lists migrate once into IndexedDB without inferring rankings or play history', async ({ page }) => {
  await seedLegacy(page);
  await page.goto('/my-library?list=later');
  await expect(page.locator('.personal-row')).toHaveCount(3);
  const state = await readLibrary(page);
  expect(state.version).toBe(3);
  expect(state.queueOrder).toEqual([first, second, third]);
  expect(state.progress[first]?.played).toBe(false);
  expect(state.progress[second]?.played).toBe(true);
  expect(state.ranking).toEqual([]);
  expect(state.motion).toBe('lite');
  expect(await page.evaluate((key) => localStorage.getItem(key), legacyKey)).toBeNull();
  await page.reload();
  await expect(page.locator('.personal-row')).toHaveCount(3);
  expect((await readLibrary(page)).queueOrder).toEqual([first, second, third]);
});

test('ratings table shows native scales, missing values and reversible column sorting', async ({ page }) => {
  await page.goto('/?view=table');
  await expect(page.getByRole('table')).toBeVisible();
  const row = page.locator(`tr[data-game="${first}"]`);
  await expect(row.locator('.numeric-score')).toHaveText(['10.0', '97', '93', '10', '9', '—', '95']);
  await expect(page.getByRole('columnheader', { name: /Leul's rating/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /IGN/ })).toContainText('/ 10');
  await expect(page.getByRole('columnheader', { name: /Metacritic PC/ })).toContainText('/ 100');
  const ign = page.getByRole('columnheader', { name: /IGN/ });
  await ign.getByRole('button').click();
  await expect(ign).toHaveAttribute('aria-sort', 'descending');
  await ign.getByRole('button').click();
  await expect(ign).toHaveAttribute('aria-sort', 'ascending');
  await page.reload();
  await expect(page.getByRole('columnheader', { name: /IGN/ })).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('.table-footnote')).toContainText('original cached ratings');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('bulk selection updates queue, completion and own ranking without changing author ranks', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('Mass Effect');
  await expect(page.locator('.game-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Select multiple games', exact: true }).click();
  await page.getByRole('button', { name: 'Select all 3 in this view', exact: true }).click();
  await expect(page.locator('.card-selection input:checked')).toHaveCount(3);
  await page.getByRole('button', { name: 'Add to play later', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder.length).toBe(3);
  await page.getByRole('button', { name: 'Select all 3 in this view', exact: true }).click();
  await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
  await expect.poll(async () => Object.values((await readLibrary(page)).progress).filter((entry) => entry.completed).length).toBe(3);
  await page.getByRole('button', { name: 'Select all 3 in this view', exact: true }).click();
  await page.getByRole('button', { name: 'Add to my ranking', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.length).toBe(3);
  const original = await page.request.get('/data/collection.json');
  expect((await original.json()).games[0].rank).toBe(1);
  await page.goto('/my-library?list=completed');
  await expect(page.locator('.my-games-editor:visible .personal-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await page.getByRole('button', { name: 'Select all 3 matching games', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from queue', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([]);
  expect(Object.values((await readLibrary(page)).progress).every((entry) => entry.completed)).toBe(true);
});

test('play queue reorders by keyboard and accessible arrows, then survives reload', async ({ page }) => {
  await seedLegacy(page);
  await page.goto('/my-library?list=later');
  await expect(page.locator('.personal-row')).toHaveCount(3);
  const handle = page.getByRole('button', { name: 'Drag Red Dead Redemption 2 to reorder your queue', exact: true });
  await page.evaluate(() => document.fonts.ready);
  await handle.focus();
  await page.keyboard.press('Space', { delay: 70 });
  await expect(page.locator('.drag-preview')).toBeVisible();
  await expect(page.locator('.drag-preview')).toHaveAttribute('aria-hidden', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[id^="DndLiveRegion-"]')).toContainText('Over position 2');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([second, first, third]);
  await page.getByRole('button', { name: 'Move Red Dead Redemption 2 up in queue', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([first, second, third]);
  await page.reload();
  await expect(page.locator('.personal-row').first()).toHaveAttribute('data-record-id', first);
  await page.getByRole('searchbox', { name: 'Search your queue' }).fill('Mass');
  await expect(page.locator('.personal-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Drag Mass Effect 2 to reorder your queue', exact: true })).toBeDisabled();
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
});

test('play queue supports actual mouse and touch drag gestures', async ({ page, isMobile, context }) => {
  await seedLegacy(page);
  await page.goto('/my-library?list=later');
  await expect(page.locator('.personal-row')).toHaveCount(3);
  const handle = page.getByRole('button', { name: 'Drag Red Dead Redemption 2 to reorder your queue', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox();
  const target = await page.locator(`[data-record-id="${second}"]`).boundingBox();
  if (!start || !target) throw new Error('Queue drag targets are missing.');
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  const endY = target.y + target.height / 2;
  if (isMobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(220);
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (endY - y) * step / 8 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, endY, { steps: 12 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([second, first, third]);
});

test('personal rankings accept unplayed and historical games, scores and notes', async ({ page }) => {
  await page.goto('/my-rankings');
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  await page.locator('.my-games-editor:visible').getByText('Add a game manually', { exact: true }).click();
  await page.locator('.my-games-editor:visible').getByLabel('Game title', { exact: true }).fill('My historical game');
  await page.locator('.my-games-editor:visible').getByLabel('Year (optional)', { exact: false }).fill('1962');
  await page.getByRole('button', { name: 'Add to my ranking', exact: true }).click();
  await expect(page.locator('.my-games-editor:visible .personal-row')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'I have played it: My historical game', exact: true })).not.toBeChecked();
  const score = page.getByRole('spinbutton', { name: 'Your rating / 10 for My historical game', exact: true });
  await score.fill('9.4');
  await score.press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(9.4);
  await page.locator('.ranking-note summary').click();
  await page.getByRole('textbox', { name: 'Your note for My historical game', exact: true }).fill('Ranked for historical importance, not personal play experience.');
  await page.getByRole('textbox', { name: 'Your note for My historical game', exact: true }).press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.note).toContain('not personal play experience');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Your rating / 10 for My historical game', exact: true })).toHaveValue('9.4');
  const saved = await readLibrary(page);
  const id = saved.ranking[0]?.id;
  if (!id) throw new Error('Personal game missing.');
  expect(saved.records[id]?.year).toBe(1962);
  expect(saved.progress[id]?.played ?? false).toBe(false);
  await page.getByLabel('Progress', { exact: true }).selectOption('any-played');
  await expect(page.locator('.my-games-editor:visible .personal-row')).toHaveCount(0);
  expect((await readLibrary(page)).ranking).toHaveLength(1);
});

test('backup export and validated replacement restore queue and private rankings', async ({ page }) => {
  await seedLegacy(page);
  await page.goto('/my-rankings');
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  await page.getByRole('button', { name: 'Add Red Dead Redemption 2 to ranking', exact: true }).click();
  await expect(page.locator('.my-games-editor:visible .personal-row')).toHaveCount(1);
  await openSettings(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my library', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('Backup download missing.');
  const bytes = await readFile(path);
  const backup = JSON.parse(bytes.toString('utf8'));
  expect(backup.formatVersion).toBe(3);
  expect(backup.library.queueOrder).toEqual([first, second, third]);
  expect(backup.library.ranking[0].id).toBe(first);
  await page.getByRole('button', { name: 'Reset device data', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, reset device data', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([]);
  await page.getByLabel('Import personal library backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: bytes });
  await expect(page.locator('.restore-preview')).toContainText('3 games, 3 queued, 1 ranked');
  await page.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([first, second, third]);
  expect((await readLibrary(page)).ranking[0]?.id).toBe(first);
  await page.getByLabel('Import personal library backup file').setInputFiles({ name: 'corrupt.json', mimeType: 'application/json', buffer: Buffer.from('{"formatVersion":2,"library":{"bad":true}}') });
  await expect(page.locator('.backup-panel .inline-error')).toContainText('No data was changed');
  expect((await readLibrary(page)).queueOrder).toEqual([first, second, third]);
});

test('catalog results are explicitly imported and upstream errors remain recoverable', async ({ page }) => {
  const item = { id: 'wikidata:Q100', title: 'Catalog game for verification', year: 2020, studio: 'A source studio', genre: 'Adventure', source: 'wikidata', sourceId: 'Q100', sourceUrl: 'https://www.wikidata.org/wiki/Q100', collectionRank: null };
  await page.route('**/api/catalog?**', (route) => {
    const url = new URL(route.request().url());
    const source = url.searchParams.get('source');
    const found = source === 'wikidata' ? [item] : [];
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ source, query: url.searchParams.get('q') ?? '', items: found, total: found.length, offset: 0, nextOffset: null, notices: source === 'wikidata' ? ['Data from Wikidata, CC0.'] : [] }),
    });
  });
  await page.goto('/discover');
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill('Catalog');
  const results = page.getByRole('list', { name: 'Discovered games', exact: true });
  await expect(results.locator(':scope > li')).toHaveCount(1);
  expect(Object.keys((await readLibrary(page)).records)).toHaveLength(0);
  const card = results.locator(`[data-unranked-id="${item.id}"]`);
  await card.getByText('Actions & source', { exact: true }).click();
  await card.getByRole('button', { name: `Play later: ${item.title}`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder).toEqual([item.id]);
  await card.getByRole('button', { name: 'Add to ranking', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.length).toBe(1);
  await expect(card.getByRole('button', { name: 'In your ranking', exact: true })).toBeDisabled();
  await page.goto('/my-library?list=later');
  await expect(page.getByRole('button', { name: item.title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: item.title, exact: true })).toBeVisible();
  await page.goto('/discover');
  await page.unroute('**/api/catalog?**');
  await page.route('**/api/catalog?**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The catalog is busy. Try again later.' }) }));
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill('Catalog outage');
  const errors = page.getByRole('group', { name: 'Online catalog status', exact: true }).getByRole('alert');
  await expect(errors).toHaveCount(2);
  for (const error of await errors.all()) await expect(error).toContainText('The catalog is busy');
  await expect(page.getByRole('button', { name: 'Retry Wikidata', exact: true })).toBeVisible();
  await expect(page.getByText('Add a game manually', { exact: true })).toBeVisible();
});
test('IndexedDB denial is explicit and never claims a durable save', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => { throw new DOMException('IndexedDB denied', 'SecurityError'); } });
  });
  await page.goto('/');
  await expect(page.locator('.storage-banner')).toContainText('this tab only');
  await page.locator(`[data-game="${first}"] .save-game`).click();
  await expect(page.locator(`[data-game="${first}"] .save-game`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.toast')).toContainText('This tab only');
  await page.reload();
  await expect(page.locator(`[data-game="${first}"] .save-game`)).toHaveAttribute('aria-pressed', 'false');
});

test('the untouched original Excel is also a real exact-byte download', async ({ page }) => {
  await page.goto('/');
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Or download the untouched original Excel', exact: true }).click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toBe('AAA_games_u_have_to_play_list_top_100.xlsx');
  const file = await downloaded.path();
  if (!file) throw new Error('Original workbook download missing.');
  expect((await readFile(file)).equals(await readFile(new URL('../public/downloads/AAA_games_u_have_to_play_list_top_100.xlsx', import.meta.url)))).toBe(true);
});

test('catalog endpoint rejects writes and arbitrary proxy targets', async ({ request }) => {
  const post = await request.post('/api/catalog', { data: { example: 'Synthetic write attempt; must not be stored.' } });
  expect(post.status()).toBe(405);
  expect(post.headers().allow).toBe('GET');
  for (const query of ['source=steam', 'source=wikidata&offset=-1', `source=wikidata&q=${'x'.repeat(81)}`, 'source=wikidata&url=https%3A%2F%2Fexample.com']) {
    const response = await request.get(`/api/catalog?${query}`);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain('supported source');
  }
});

test('table, populated queue, personal ranking and discover remain accessible and responsive', async ({ page }) => {
  await seedLegacy(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/?view=table', '/my-library?list=later', '/my-rankings', '/discover']) {
    await page.goto(route);
    await expect(page.locator('.page-loading')).toHaveCount(0);
    if (route.startsWith('/?')) await expect(page.getByRole('table')).toBeVisible();
    else await expect(page.locator('[data-page-heading]')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations, route).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
});

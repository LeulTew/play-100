import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readLibrary } from './library-helpers';
import { catalogRecord, respondWithCatalog } from './catalog-helpers';

const a = { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2' };
const b = { id: 'mass-effect-2', title: 'Mass Effect 2' };

async function prepareRanking(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('link', { name: 'Ranking', exact: true }).click();
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  for (const game of [a, b]) {
    await page.getByRole('button', { name: `Add ${game.title} to ranking`, exact: true }).click();
    await expect.poll(async () => (await readLibrary(page)).ranking.some((entry) => entry.id === game.id)).toBe(true);
  }
  await page.getByRole('button', { name: 'Close game picker', exact: true }).click();
  const input = page.getByRole('spinbutton', { name: `Your rating / 10 for ${a.title}`, exact: true });
  await input.fill('5');
  await input.press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === a.id)?.score).toBe(5);
}

async function pauseAutosave(page: Page) {
  await page.clock.install({ time: new Date('2026-09-14T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-14T12:00:10Z'));
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const field of ['score', 'note'] as const) {
  test(`browser Back flushes a pending ${field} exactly once without needing its debounce or blur`, async ({ page }) => {
    await prepareRanking(page);
    const before = await readLibrary(page);
    await pauseAutosave(page);
    if (field === 'score') {
      await page.getByRole('spinbutton', { name: `Your rating / 10 for ${a.title}`, exact: true }).fill('9.25');
    } else {
      await page.locator(`[data-record-id="${a.id}"] .ranking-note summary`).click();
      await page.getByRole('textbox', { name: `Your note for ${a.title}`, exact: true }).fill('A pending note, saved when I go Back.');
    }
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === a.id)?.[field])
      .toBe(field === 'score' ? 9.25 : 'A pending note, saved when I go Back.');
    expect((await readLibrary(page)).revision).toBe(before.revision + 1);
    await page.clock.runFor(1500);
    expect((await readLibrary(page)).revision).toBe(before.revision + 1);
  });
}

test('original-game details accept a separate personal rating and bind pending edits to the correct next game', async ({ page }) => {
  await page.goto(`/?game=${b.id}`);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${b.title}`, exact: true }).fill('4');
  await dialog.getByRole('spinbutton').press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === b.id)?.score).toBe(4);
  await page.goto(`/?game=${a.id}`);
  await expect(dialog.locator('.author-rating-detail')).toContainText('10.0');
  await expect(dialog.getByRole('spinbutton')).toHaveValue('');
  await pauseAutosave(page);
  await dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${a.title}`, exact: true }).fill('8.75');
  await dialog.getByRole('button', { name: 'Next game', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: b.title, exact: true })).toBeVisible();
  await expect(dialog.getByRole('spinbutton')).toHaveValue('4');
  await expect.poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === a.id)?.score).toBe(8.75);
  await dialog.getByRole('spinbutton').fill('6.25');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === b.id)?.score).toBe(6.25);
  const state = await readLibrary(page);
  expect(state.progress).toEqual({});
  expect(state.records[a.id]?.collectionRank).toBe(1);
  expect(state.records[b.id]?.collectionRank).toBe(2);
});

test('Escape from an unranked preview commits a pending rating and metadata without marking it played', async ({ page }) => {
  const record = catalogRecord('wikidata', 'Q990020', 'Exit draft example');
  await page.route('**/api/catalog?**', (route) => respondWithCatalog(route, route.request().url().includes('source=wikidata') ? [record] : []));
  await page.goto('/?q=exit&view=table');
  await page.locator('[data-unranked-id]').getByRole('button', { name: record.title, exact: true }).click();
  await pauseAutosave(page);
  await page.getByRole('dialog').getByRole('spinbutton').fill('7.75');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === record.id)?.score).toBe(7.75);
  expect((await readLibrary(page)).records[record.id]).toEqual(record);
  expect((await readLibrary(page)).progress[record.id]).toBeUndefined();
  const saved = page.locator('[data-unranked-id]').getByRole('button', { name: `In My games: ${record.title}`, exact: true });
  await expect(saved).toHaveText('In My games');
  await expect(saved).toBeDisabled();
});

test('leaving after a failed autosave does not retry the rejected edit or overwrite the committed score', async ({ page }) => {
  await prepareRanking(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      document.documentElement.dataset.exitWriteAttempts = String(Number(document.documentElement.dataset.exitWriteAttempts ?? 0) + 1);
      if (document.documentElement.dataset.rejectExitSave === 'yes') throw new DOMException('Storage full', 'QuotaExceededError');
      return put.apply(this, args);
    };
    document.documentElement.dataset.rejectExitSave = 'yes';
  });
  await page.getByRole('spinbutton', { name: `Your rating / 10 for ${a.title}`, exact: true }).fill('9');
  await expect(page.locator('.ranking-row-content .inline-error')).toContainText('could not be saved');
  const attempts = await page.evaluate(() => document.documentElement.dataset.exitWriteAttempts);
  await page.goBack();
  await expect(page.locator('.storage-banner')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => document.documentElement.dataset.exitWriteAttempts)).toBe(attempts);
  expect((await readLibrary(page)).ranking.find((entry) => entry.id === a.id)?.score).toBe(5);
});

test('library removal requires confirmation, deletes all selected private state and keeps the public game', async ({ page }) => {
  await prepareRanking(page);
  await page.goto('/my-library');
  await page.getByRole('button', { name: `Play later: ${a.title}`, exact: true }).click();
  await page.getByRole('button', { name: `Completed: ${a.title}`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).progress[a.id]?.completed).toBe(true);
  const before = await readLibrary(page);
  const remove = page.getByRole('button', { name: `Remove ${a.title} from my library`, exact: true });
  await remove.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Keep games', exact: true })).toBeFocused();
  await expect(dialog).toContainText('personal ratings and notes');
  await dialog.getByRole('button', { name: 'Keep games', exact: true }).click();
  expect(await readLibrary(page)).toEqual(before);
  await expect(remove).toBeFocused();
  await remove.click();
  await dialog.getByRole('button', { name: 'Remove 1 game', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(`[data-record-id="${a.id}"]`)).toHaveCount(0);
  const after = await readLibrary(page);
  expect(after.records[a.id]).toBeUndefined();
  expect(after.progress[a.id]).toBeUndefined();
  expect(after.ranking.map((entry) => entry.id)).toEqual([b.id]);
  expect(after.queueOrder).toEqual([]);
  expect(after.records[b.id]).toEqual(before.records[b.id]);
  await page.goto('/');
  await expect(page.locator(`[data-game="${a.id}"] .cover-rank`)).toHaveText('01');
  await expect(page.locator(`[data-game="${a.id}"] [data-played-id] input`)).not.toBeChecked();
  await expect(page.locator(`[data-game="${a.id}"] .author-rating-card`)).toContainText('10.0');
});

test('bulk removal handles mixed imported and original games without deleting an unselected game', async ({ page }) => {
  await prepareRanking(page);
  await page.goto('/my-library');
  const manualTitle = 'A private game \u2014 \u4e16\u754c \u2014 ' + 'long title '.repeat(10);
  const editor = page.locator('.my-games-editor:visible');
  await editor.locator('.manual-add summary').click();
  await editor.getByLabel('Game title', { exact: true }).fill(manualTitle);
  await page.getByRole('button', { name: 'Add to my library', exact: true }).click();
  await expect.poll(async () => Object.values((await readLibrary(page)).records).some((record) => record.title === manualTitle.trim())).toBe(true);
  const manual = Object.values((await readLibrary(page)).records).find((record) => record.title === manualTitle.trim());
  if (!manual) throw new Error('The manual fixture did not persist.');
  await expect(editor.locator('.drag-handle, .move-buttons')).toHaveCount(0);
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await page.getByRole('checkbox', { name: `Select ${a.title}`, exact: true }).check();
  await page.getByRole('checkbox', { name: `Select ${manual.title}`, exact: true }).check();
  await page.getByRole('button', { name: 'Remove from my library', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.removal-games li')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Remove 2 games', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor.locator('[data-record-id]')).toHaveCount(1);
  expect(Object.keys((await readLibrary(page)).records)).toEqual([b.id]);
  await page.reload();
  await expect(editor.locator('[data-record-id]')).toHaveCount(1);
});

test('a failed private deletion stays recoverable in its confirmation without removing any state', async ({ page }) => {
  await prepareRanking(page);
  await page.goto('/my-library');
  const before = await readLibrary(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (document.documentElement.dataset.rejectRemoval === 'yes') throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return put.apply(this, args);
    };
    document.documentElement.dataset.rejectRemoval = 'yes';
  });
  await page.getByRole('button', { name: `Remove ${a.title} from my library`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove 1 game', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Nothing was removed');
  expect(await readLibrary(page)).toEqual(before);
  await page.evaluate(() => { document.documentElement.dataset.rejectRemoval = 'no'; });
  await page.getByRole('dialog').getByRole('button', { name: 'Remove 1 game', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await readLibrary(page)).records[a.id]).toBeUndefined();
});

test('private removal updates peer tabs and the refined library and details remain accessible', async ({ page, context }, testInfo) => {
  await prepareRanking(page);
  const peer = await context.newPage();
  await peer.goto('/my-rankings');
  await expect(peer.locator('.my-games-editor:visible [data-record-id]')).toHaveCount(2);
  await page.goto('/my-library');
  await page.getByRole('button', { name: `Remove ${a.title} from my library`, exact: true }).click();
  const confirmation = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(confirmation.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('private-removal.png'), fullPage: true });
  await page.getByRole('dialog').getByRole('button', { name: 'Remove 1 game', exact: true }).click();
  await expect(peer.locator(`[data-record-id="${a.id}"]`)).toHaveCount(0);
  await expect(peer.locator(`.my-games-editor:visible [data-record-id="${b.id}"]`)).toHaveCount(1);
  for (const width of [320, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  const library = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(library.violations).toEqual([]);
  await page.goto(`/?game=${b.id}`);
  const detail = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(detail.violations).toEqual([]);
  await peer.close();
});

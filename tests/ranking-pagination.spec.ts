import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installGuestLibrary } from './library-pagination-helpers';
import { rankingFixture } from './ranking-pagination-helpers';
import { readLibrary } from './library-helpers';

const views = (page: Page) => page.getByRole('navigation', { name: 'My games views', exact: true });
const pager = (page: Page) => page.getByRole('navigation', { name: 'Ranking pages', exact: true });
const rows = (page: Page) => page.locator('.ranking-row-content');
const recordId = (position: number) => `manual:perf-ranking-${String(position).padStart(5, '0')}`;
const row = (page: Page, position: number) =>
  page
    .getByRole('list', { name: 'Your ranked games', exact: true })
    .locator(`[data-record-id="${recordId(position)}"]`);

async function openRanking(page: Page) {
  await installGuestLibrary(page, rankingFixture());
  await views(page).getByRole('button', { name: /^Ranking,/ }).click();
  await expect(rows(page)).toHaveCount(25);
}

async function rejectWrites(page: Page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (document.documentElement.dataset.rejectRankingWrite === 'yes') {
        throw new DOMException('Synthetic ranking write failure.', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
    document.documentElement.dataset.rejectRankingWrite = 'yes';
  });
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Ranking pagination uses only a synthetic loopback library.');
  }
  const origin = new URL(baseURL).origin;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) {
      return route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } });
    }
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('120 ranked games mount at most 25 rows, with absolute positions and no paging writes', async ({ page }) => {
  await openRanking(page);
  const before = await readLibrary(page);
  for (let pageNumber = 1; pageNumber <= 5; pageNumber += 1) {
    await pager(page).getByRole('combobox').selectOption(String(pageNumber));
    await expect(rows(page)).toHaveCount(pageNumber === 5 ? 20 : 25);
    const first = (pageNumber - 1) * 25 + 1;
    await expect(row(page, first)).toHaveAttribute('aria-posinset', String(first));
    await expect(row(page, first)).toHaveAttribute('aria-setsize', '120');
    await expect(row(page, first).locator('.personal-position')).toContainText(`Position ${first}`);
  }
  await expect(pager(page)).toContainText('101–120 of 120 ranked games');
  expect(await readLibrary(page)).toEqual(before);
});

test('a boundary move up and down changes the global slot and follows the game across pages', async ({ page }) => {
  await openRanking(page);
  await pager(page).getByRole('combobox').selectOption('2');
  await row(page, 26).getByRole('button', { name: /up in ranking$/ }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(row(page, 26)).toHaveAttribute('aria-posinset', '25');
  await expect(row(page, 26).locator('.record-title')).toBeFocused();
  await row(page, 26).getByRole('button', { name: /down in ranking$/ }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(row(page, 26)).toHaveAttribute('aria-posinset', '26');
  await expect(row(page, 26).locator('.record-title')).toBeFocused();
  const state = await readLibrary(page);
  expect(state.ranking[25]?.id).toBe(recordId(26));
  expect(state.ranking[25]?.manualPosition).toBe(26);
  expect(state.ranking[25]?.note).toBe(rankingFixture().ranking[25]?.note);
  expect(state.progress).toEqual({});
});

test('an explicit manual position moves across several pages and focuses the saved game', async ({ page }) => {
  await openRanking(page);
  await row(page, 1).locator('.ranking-position-control > summary').click();
  await row(page, 1).getByRole('spinbutton', { name: /^Position for / }).fill('103');
  await row(page, 1).getByRole('button', { name: 'Move', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('5');
  await expect(rows(page)).toHaveCount(20);
  await expect(row(page, 1)).toHaveAttribute('aria-posinset', '103');
  await expect(row(page, 1).locator('.record-title')).toBeFocused();
  expect((await readLibrary(page)).ranking[102]?.id).toBe(recordId(1));
});

test('keyboard sorting is page-local but announces and saves absolute positions', async ({ page }) => {
  await openRanking(page);
  await pager(page).getByRole('combobox').selectOption('2');
  const handle = row(page, 26).getByRole('button', { name: /^Drag .* to reorder your ranking$/ });
  await handle.focus();
  await handle.press('Space', { delay: 70 });
  await expect(page.locator('.drag-preview')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[id^="DndLiveRegion-"]')).toContainText('Over position 27');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await readLibrary(page)).ranking[26]?.id).toBe(recordId(26));
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(rows(page)).toHaveCount(25);
});

test('an invalid rating blocks paging and tab exit, retaining the same focused editor', async ({ page }) => {
  await openRanking(page);
  const input = row(page, 1).getByRole('spinbutton', { name: /^Your rating/ });
  await input.fill('11');
  await input.press('Tab');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.evaluate((element) => {
    element.dataset.retainedRankingDraft = 'yes';
  });
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(input).toHaveValue('11');
  await expect(input).toBeFocused();
  await views(page).getByRole('button', { name: /^Library,/ }).click();
  await expect(views(page).getByRole('button', { name: /^Ranking,/ })).toHaveAttribute('aria-current', 'page');
  await expect(input).toHaveAttribute('data-retained-ranking-draft', 'yes');
  await expect(input).toBeFocused();
  await expect(rows(page)).toHaveCount(25);
  expect((await readLibrary(page)).ranking[0]?.score).toBe(7);
});

test('valid pending rating and note edits flush before their page is removed', async ({ page }) => {
  await openRanking(page);
  await row(page, 1).getByRole('spinbutton', { name: /^Your rating/ }).fill('9.3');
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  expect((await readLibrary(page)).ranking[0]?.score).toBe(9.3);
  await row(page, 26).locator('.ranking-note > summary').click();
  await row(page, 26).getByRole('textbox', { name: /^Your note/ }).fill('Saved before paging away.');
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('3');
  expect((await readLibrary(page)).ranking[25]?.note).toBe('Saved before paging away.');
});

test('clean tab exits mount zero hidden Ranking rows while retaining the lightweight page', async ({
  page,
}) => {
  await openRanking(page);
  await pager(page).getByRole('combobox').selectOption('3');
  await views(page).getByRole('button', { name: /^Library,/ }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('#ranking-search')).toHaveCount(0);
  await views(page).getByRole('button', { name: /^Ranking,/ }).click();
  await expect(rows(page)).toHaveCount(25);
  await expect(pager(page).getByRole('combobox')).toHaveValue('3');
  await views(page).getByRole('button', { name: /^Library,/ }).click();
  await expect(rows(page)).toHaveCount(0);
});

test('an unsubmitted manual draft remains mounted for reload guards until its title and year are cleared', async ({
  page,
}) => {
  await openRanking(page);
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  const ranking = page.locator('.my-games-editor:visible');
  await ranking.locator('.manual-add > summary').click();
  await ranking.getByLabel('Game title', { exact: true }).fill('Unsubmitted synthetic title');
  await ranking.getByLabel('Year', { exact: false }).fill('1999');
  await views(page).getByRole('button', { name: /^Library,/ }).click();
  await expect(page.locator('[hidden] .ranking-row-content')).toHaveCount(25);
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLFormElement>('[hidden] form')].some((form) =>
        [...form.elements].some(
          (field) => field instanceof HTMLInputElement && field.value === 'Unsubmitted synthetic title',
        ),
      ),
    ),
  ).toBe(true);
  await views(page).getByRole('button', { name: /^Ranking,/ }).click();
  await expect(ranking.getByLabel('Game title', { exact: true })).toHaveValue('Unsubmitted synthetic title');
  await expect(ranking.getByLabel('Year', { exact: false })).toHaveValue('1999');
  await ranking.getByLabel('Game title', { exact: true }).fill('');
  await ranking.getByLabel('Year', { exact: false }).fill('');
  await views(page).getByRole('button', { name: /^Library,/ }).click();
  await expect(rows(page)).toHaveCount(0);
});

test('Back retains only the dirty page until the original editor is corrected, then releases it', async ({
  page,
}) => {
  await openRanking(page);
  const input = row(page, 1).getByRole('spinbutton', { name: /^Your rating/ });
  await input.fill('11');
  await input.press('Tab');
  await page.goBack();
  await expect(views(page).getByRole('button', { name: /^Library,/ })).toHaveAttribute('aria-current', 'page');
  await expect(rows(page)).toHaveCount(25);
  await expect(page.locator('[hidden] .ranking-row-content')).toHaveCount(25);
  await views(page).getByRole('button', { name: /^Ranking,/ }).click();
  await expect(input).toHaveValue('11');
  await expect(input).toBeFocused();
  await input.fill('7');
  await input.press('Tab');
  await views(page).getByRole('button', { name: /^Library,/ }).click();
  await expect(rows(page)).toHaveCount(0);
});

test('a rejected cross-page position write keeps the original page, order and opinions', async ({ page }) => {
  await openRanking(page);
  await pager(page).getByRole('combobox').selectOption('2');
  const before = await readLibrary(page);
  await rejectWrites(page);
  await row(page, 26).getByRole('button', { name: /up in ranking$/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The position could not be saved' })).toBeVisible();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(row(page, 26)).toHaveAttribute('aria-posinset', '26');
  expect(await readLibrary(page)).toEqual(before);
});

test('score reordering cannot evict a failed note editor from the bounded page', async ({ page }) => {
  const fixture = rankingFixture();
  fixture.ranking = fixture.ranking.map((entry) => ({ ...entry, manualPosition: null }));
  await installGuestLibrary(page, fixture);
  await views(page).getByRole('button', { name: /^Ranking,/ }).click();
  await row(page, 25).locator('.ranking-note > summary').click();
  const note = row(page, 25).getByRole('textbox', { name: /^Your note/ });
  await rejectWrites(page);
  await note.fill('Still unsaved after the score moves.');
  await note.press('Tab');
  await expect(note).toHaveAttribute('aria-invalid', 'true');
  await page.evaluate(() => {
    delete document.documentElement.dataset.rejectRankingWrite;
  });
  const rating = row(page, 25).getByRole('spinbutton', { name: /^Your rating/ });
  await rating.fill('0');
  await rating.press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking.at(-1)?.id).toBe(recordId(25));
  await expect(note).toHaveValue('Still unsaved after the score moves.');
  await expect(note).toHaveAttribute('aria-invalid', 'true');
  await expect(rows(page)).toHaveCount(25);
  await note.fill('The saved note follows the reordered game.');
  await note.press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking.at(-1)?.note).toBe(
    'The saved note follows the reordered game.',
  );
  await expect(row(page, 25)).toHaveCount(0);
});

test('Use rating order still releases manual slots across the entire ranking', async ({ page }) => {
  const fixture = rankingFixture();
  fixture.ranking[119]!.score = 10;
  await installGuestLibrary(page, fixture);
  await views(page).getByRole('button', { name: /^Ranking,/ }).click();
  await page.getByRole('button', { name: 'Use rating order for all', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.id).toBe(recordId(120));
  expect((await readLibrary(page)).ranking.every((entry) => entry.manualPosition === null)).toBe(true);
  await expect(rows(page)).toHaveCount(25);
});

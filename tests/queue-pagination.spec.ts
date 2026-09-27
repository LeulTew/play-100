import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { applyPersonalAction, emptyPersonalLibrary, parsePersonalLibrary } from '../src/lib/personal-library';
import { MAX_LIBRARY_RECORDS } from '../src/lib/personal-types';
import type { LibraryRecord } from '../src/lib/personal-types';
import { installGuestLibrary } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

const recordId = (position: number) => `manual:queue-page-${String(position).padStart(5, '0')}`;
const queue = (page: Page) => page.getByRole('list', { name: 'Your play order', exact: true });
const row = (page: Page, position: number) => queue(page).locator(`[data-record-id="${recordId(position)}"]`);
const pager = (page: Page) => page.getByRole('navigation', { name: 'Queue pages', exact: true });
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search your queue', exact: true });
const views = (page: Page) => page.getByRole('navigation', { name: 'My games views', exact: true });

function queueFixture(total = 60) {
  const records: LibraryRecord[] = Array.from({ length: total }, (_, index) => ({
    id: recordId(index + 1),
    source: 'manual',
    sourceId: `queue-page-${String(index + 1).padStart(5, '0')}`,
    title: `Synthetic queued game ${String(index + 1).padStart(5, '0')}`,
    year: 2020,
    studio: null,
    genre: null,
    collectionRank: null,
    sourceUrl: null,
  }));
  return parsePersonalLibrary({
    ...emptyPersonalLibrary(),
    revision: 1,
    motion: 'lite',
    records: Object.fromEntries(records.map((record) => [record.id, record])),
    queueOrder: records.map((record) => record.id),
    progress: Object.fromEntries(
      records.map((record, index) => [record.id, { later: true, played: index % 2 === 1, completed: index % 2 === 1 }]),
    ),
  });
}

async function openQueue(page: Page, total = 60) {
  await installGuestLibrary(page, queueFixture(total));
  await views(page)
    .getByRole('button', { name: /^Queue,/ })
    .click();
  await expect(queue(page).locator('.personal-row')).toHaveCount(Math.min(total, 25));
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Queue pagination uses only a synthetic loopback library.');
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

for (const view of ['Library', 'Queue'] as const) {
  test(`${view} bottom pager continues from page 2 to page 3 and returns focus to the results`, async ({ page }) => {
    const isQueue = view === 'Queue';
    if (isQueue) await openQueue(page);
    else await installGuestLibrary(page, queueFixture(), '/my-games?catalogs=off&page=2');
    const top = page.getByRole('navigation', { name: `${view} pages`, exact: true });
    const bottom = page.getByRole('navigation', { name: `${view} pages, end of list`, exact: true });
    const heading = page.getByRole('heading', { name: `Your ${view.toLowerCase()} results`, exact: true });
    const itemLabel = isQueue ? 'queued games' : 'matching games';
    if (isQueue) await top.getByRole('combobox').selectOption('2');
    await expect(top).toHaveCount(1);
    await expect(bottom).toHaveCount(1);
    await expect(bottom.getByRole('combobox')).toHaveValue('2');
    await expect(bottom).toContainText(`26–50 of 60 ${itemLabel}`);
    const before = await readLibrary(page);
    const lastRow = page.locator('.personal-row').last();
    await lastRow.scrollIntoViewIfNeeded();
    await bottom.scrollIntoViewIfNeeded();
    const rowBounds = await lastRow.boundingBox();
    const pagerBounds = await bottom.boundingBox();
    if (!rowBounds || !pagerBounds) throw new Error('Continuation pager or final record is missing.');
    expect(pagerBounds.y).toBeGreaterThanOrEqual(rowBounds.y + rowBounds.height);
    await bottom.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(top.getByRole('combobox')).toHaveValue('3');
    await expect(bottom.getByRole('combobox')).toHaveValue('3');
    await expect(top).toContainText(`51–60 of 60 ${itemLabel}`);
    await expect(bottom).toContainText(`51–60 of 60 ${itemLabel}`);
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect(page.locator('.personal-row')).toHaveCount(10);
    await expect(bottom.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    expect(new URL(page.url()).searchParams.get('page')).toBe(isQueue ? null : '3');
    expect(await readLibrary(page)).toEqual(before);
    await page.getByRole('searchbox', { name: `Search your ${view.toLowerCase()}`, exact: true }).fill('00060');
    await expect(page.locator('.personal-row')).toHaveCount(1);
    await expect(top).toHaveCount(0);
    await expect(bottom).toHaveCount(0);
  });
}

test('10,000 queued games stay bounded through last-page navigation, boundary moves and search', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  expect(MAX_LIBRARY_RECORDS).toBe(10000);
  await installGuestLibrary(page, queueFixture(10000));
  const before = await readLibrary(page);
  const openStarted = performance.now();
  await views(page)
    .getByRole('button', { name: /^Queue,/ })
    .click();
  await expect(page.locator('.personal-row')).toHaveCount(25);
  await expect(pager(page)).toContainText('1–25 of 10000 queued games');
  const openMs = performance.now() - openStarted;
  await pager(page).getByRole('button', { name: 'Last', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('400');
  await expect(page.getByRole('heading', { name: 'Your queue results', exact: true })).toBeFocused();
  await expect(page.locator('.personal-row')).toHaveCount(25);
  await expect(row(page, 10000)).toHaveAttribute('aria-posinset', '10000');
  await expect(row(page, 10000)).toHaveAttribute('aria-setsize', '10000');
  await expect(row(page, 10000).getByRole('button', { name: /down in queue$/ })).toBeDisabled();
  expect(await readLibrary(page)).toEqual(before);

  await pager(page).getByRole('combobox').selectOption('2');
  const moveStarted = performance.now();
  await row(page, 26)
    .getByRole('button', { name: /up in queue$/ })
    .click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(row(page, 26)).toHaveAttribute('aria-posinset', '25');
  await expect(row(page, 26).locator('.record-title')).toBeFocused();
  await expect(page.locator('.personal-row')).toHaveCount(25);
  const moveMs = performance.now() - moveStarted;
  const moved = await readLibrary(page);
  const expectedOrder = [...before.queueOrder];
  expectedOrder.splice(24, 2, recordId(26), recordId(25));
  expect(moved.queueOrder).toEqual(expectedOrder);
  expect(moved.records).toEqual(before.records);
  expect(moved.progress).toEqual(before.progress);
  expect(moved.ranking).toEqual(before.ranking);
  await row(page, 26)
    .getByRole('button', { name: /down in queue$/ })
    .click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(row(page, 26)).toHaveAttribute('aria-posinset', '26');
  await expect(row(page, 26).locator('.record-title')).toBeFocused();
  await expect(page.locator('.personal-row')).toHaveCount(25);
  expect((await readLibrary(page)).queueOrder).toEqual(before.queueOrder);

  await pager(page).getByRole('button', { name: 'Last', exact: true }).click();
  const filterStarted = performance.now();
  await search(page).fill('Synthetic queued game 000');
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(pager(page)).toContainText('1–25 of 99 queued games');
  await expect(page.locator('.personal-row')).toHaveCount(25);
  await expect(row(page, 1)).toBeVisible();
  const filterMs = performance.now() - filterStarted;
  await expect(row(page, 1).getByRole('button', { name: /up in queue$/ })).toBeDisabled();
  await expect(row(page, 1).getByRole('button', { name: /^Drag / })).toBeDisabled();
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  expect((await readLibrary(page)).queueOrder).toEqual(before.queueOrder);
  await info.attach('dense-queue-latency', {
    contentType: 'application/json',
    body: JSON.stringify({
      records: 10000,
      project: info.project.name,
      measurement: 'Wall time from Playwright action to committed rows/focus; fixture installation excluded.',
      openMs,
      filterMs,
      moveMs,
      mountedRows: await page.locator('.personal-row').count(),
      lastPage: 400,
    }),
  });
  for (const elapsed of [openMs, filterMs, moveMs]) expect(elapsed).toBeLessThan(60000);
});

test('keyboard Queue sorting stays page-local and announces global positions', async ({ page }) => {
  await openQueue(page);
  await pager(page).getByRole('combobox').selectOption('2');
  const handle = row(page, 26).getByRole('button', { name: /^Drag / });
  await handle.focus();
  await handle.press('Space', { delay: 70 });
  await expect(page.locator('.drag-preview')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[id^="DndLiveRegion-"]')).toContainText('Over position 27');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await readLibrary(page)).queueOrder[26]).toBe(recordId(26));
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(queue(page).locator('.personal-row')).toHaveCount(25);
  await expect(row(page, 26)).toHaveAttribute('aria-posinset', '27');
});

test('mouse and touch Queue sorting work within page 2', async ({ page, isMobile, context }) => {
  await openQueue(page);
  await pager(page).getByRole('combobox').selectOption('2');
  const handle = row(page, 26).getByRole('button', { name: /^Drag / });
  await page.evaluate(() => document.fonts.ready);
  await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox();
  const source = await row(page, 26).boundingBox();
  const target = await row(page, 27).boundingBox();
  if (!start || !source || !target) throw new Error('Queue page 2 drag targets are missing.');
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  const endY = y + target.y + target.height / 2 - (source.y + source.height / 2);
  if (isMobile) {
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(220);
      for (let step = 1; step <= 8; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + ((endY - y) * step) / 8 }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, endY, { steps: 12 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await readLibrary(page)).queueOrder[26]).toBe(recordId(26));
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(queue(page).locator('.personal-row')).toHaveCount(25);
});

test('Queue filtering resets the page and selection spans all matching pages without a paging write', async ({
  page,
}) => {
  await openQueue(page);
  const before = await readLibrary(page);
  await pager(page).getByRole('combobox').selectOption('3');
  await page.getByLabel('Progress', { exact: true }).selectOption('completed');
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(pager(page)).toContainText('1–25 of 30 queued games');
  await expect(row(page, 2)).toBeVisible();
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await page.getByRole('button', { name: 'Select all 30 matching games (all 2 pages)', exact: true }).click();
  const selection = page.getByRole('region', { name: 'Bulk game actions' });
  await expect(selection.getByRole('status')).toHaveText('30 selected');
  await pager(page).getByRole('combobox').selectOption('2');
  await expect(queue(page).locator('.select-control input:checked')).toHaveCount(5);
  await search(page).fill('00060');
  await expect(pager(page)).toHaveCount(0);
  await expect(queue(page).locator('.personal-row')).toHaveCount(1);
  await expect(selection.getByRole('status')).toHaveText('0 selected');
  await search(page).fill('');
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  expect(await readLibrary(page)).toEqual(before);
});

test('a rejected boundary move retains the original Queue page and retries without losing order', async ({ page }) => {
  await openQueue(page);
  await pager(page).getByRole('combobox').selectOption('2');
  const before = await readLibrary(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (document.documentElement.dataset.rejectQueueWrite === 'yes') {
        throw new DOMException('Synthetic queue write failure.', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
    document.documentElement.dataset.rejectQueueWrite = 'yes';
  });
  await row(page, 26)
    .getByRole('button', { name: /up in queue$/ })
    .click();
  await expect(page.getByRole('alert').filter({ hasText: 'The position could not be saved' })).toBeVisible();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(row(page, 26)).toHaveAttribute('aria-posinset', '26');
  expect(await readLibrary(page)).toEqual(before);
  await page.evaluate(() => {
    document.documentElement.dataset.rejectQueueWrite = 'no';
  });
  await row(page, 26)
    .getByRole('button', { name: /up in queue$/ })
    .click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(row(page, 26).locator('.record-title')).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: 'The position could not be saved' })).toHaveCount(0);
});

test('removing the last Queue page clamps its view without removing the stored game', async ({ page }) => {
  await openQueue(page, 26);
  await pager(page).getByRole('button', { name: 'Last', exact: true }).click();
  await expect(queue(page).locator('.personal-row')).toHaveCount(1);
  await row(page, 26)
    .getByRole('button', { name: /^Remove from queue:/ })
    .click();
  await expect(queue(page).locator('.personal-row')).toHaveCount(25);
  await expect(pager(page)).toHaveCount(0);
  const saved = await readLibrary(page);
  expect(saved.queueOrder).toHaveLength(25);
  expect(saved.records[recordId(26)]).toBeDefined();
  expect(Object.keys(saved.records)).toHaveLength(26);
});

test('Queue removal preserves every non-queue field, while Library removal still confirms full deletion', async ({
  page,
}) => {
  const fixture = queueFixture(3);
  const id = recordId(2);
  const record = fixture.records[id]!;
  fixture.ranking = [{ id, manualPosition: 1, score: 8.5, note: 'Keep this private opinion and fixed position.' }];
  await installGuestLibrary(page, fixture, '/my-games?tab=queue&catalogs=off');
  const before = await readLibrary(page);
  const remove = row(page, 2).getByRole('button', { name: `Remove from queue: ${record.title}`, exact: true });
  await expect(remove).toHaveAttribute('title', 'Remove from queue');
  await expect(row(page, 2).getByRole('button', { name: /^Play later:/ })).toHaveCount(0);
  await expect(row(page, 2).getByRole('button', { name: /from my library$/ })).toHaveCount(0);
  const bounds = await remove.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await remove.click();
  const expected = applyPersonalAction(before, { type: 'set-progress', records: [record], key: 'later', value: false });
  await expect.poll(() => readLibrary(page)).toEqual(expected);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(page, 2)).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('1 game updated in your play queue.');
  const removedFromQueue = await readLibrary(page);
  expect(removedFromQueue.records).toEqual(before.records);
  expect(removedFromQueue.ranking).toEqual(before.ranking);
  expect(removedFromQueue.progress[id]).toEqual({ ...before.progress[id], later: false });

  await views(page)
    .getByRole('button', { name: /^Library,/ })
    .click();
  const libraryRow = page.locator(`.my-games-editor:visible [data-record-id="${id}"]`);
  await libraryRow.getByRole('button', { name: `Remove ${record.title} from my library`, exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Remove this game?', exact: true });
  await expect(confirmation).toBeVisible();
  expect(await readLibrary(page)).toEqual(removedFromQueue);
  await confirmation.getByRole('button', { name: 'Remove 1 game', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect
    .poll(() => readLibrary(page))
    .toEqual(applyPersonalAction(removedFromQueue, { type: 'remove-records', ids: [id] }));
});

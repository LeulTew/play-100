import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { applyPersonalAction } from '../src/lib/personal-library';
import { readLibrary } from './library-helpers';
import {
  installGuestLibrary,
  libraryFixture,
  libraryGeometry,
  loadedExitSaveModule,
  rankedRecords,
} from './library-pagination-helpers';

const libraryRows = (page: Page) => page.locator('ul.personal-records > .personal-row-static');
const pager = (page: Page) => page.getByRole('navigation', { name: 'Library pages', exact: true });
const results = (page: Page) => page.getByRole('heading', { name: 'Your library results', exact: true });
const tab = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'My games views', exact: true })
    .getByRole('button', { name: new RegExp(`^${name}, \\d+$`) });
const query = (page: Page) => page.getByRole('searchbox', { name: 'Search your library', exact: true });

async function selectPage(page: Page, value: number) {
  await pager(page).getByRole('combobox').selectOption(String(value));
  await expect(pager(page).getByRole('combobox')).toHaveValue(String(value));
}

const rankingEditors = (page: Page) => page.locator('.ranking-row-content');

// Ranking mounts on its first visit and is then retained for the workspace, so visit it once before relying on its editors.
async function retainRanking(page: Page, count = 3) {
  await expect(rankingEditors(page)).toHaveCount(0);
  await tab(page, 'Ranking').click();
  await expect(tab(page, 'Ranking')).toHaveAttribute('aria-current', 'page');
  await expect(rankingEditors(page)).toHaveCount(count);
  await tab(page, 'Library').click();
  await expect(tab(page, 'Library')).toHaveAttribute('aria-current', 'page');
  await expect(rankingEditors(page)).toHaveCount(count);
}

async function heldEditor(page: Page) {
  await page.evaluate(
    async (path) => {
      const { registerPendingEditor }: typeof import('../src/hooks/useExitSave') = await import(path);
      document.documentElement.dataset.libraryEditorModule = path;
      let dirty = true;
      let resolve: (value: boolean) => void = () => {
        throw new Error('Held edit was not initialized.');
      };
      let reject: (reason: Error) => void = () => {
        throw new Error('Held edit was not initialized.');
      };
      const waiting = new Promise<boolean>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      document.documentElement.dataset.libraryFlushCount = '0';
      const release = registerPendingEditor({
        pending: () => dirty,
        flush: () => {
          document.documentElement.dataset.libraryFlushCount = String(
            Number(document.documentElement.dataset.libraryFlushCount) + 1,
          );
          return waiting;
        },
      });
      window.addEventListener(
        'library-proof:finish',
        (event) => {
          const result = (event as CustomEvent<{ saved: boolean; thrown: boolean }>).detail;
          if (result.saved) dirty = false;
          if (result.thrown) reject(new Error('Synthetic pending-edit failure.'));
          else resolve(result.saved);
        },
        { once: true },
      );
      window.addEventListener(
        'library-proof:release',
        () => {
          dirty = false;
          void release();
        },
        { once: true },
      );
    },
    await loadedExitSaveModule(page),
  );
}

async function finishEditor(page: Page, saved = true, thrown = false) {
  await page.evaluate(
    (detail) => {
      window.dispatchEvent(new CustomEvent('library-proof:finish', { detail }));
    },
    { saved, thrown },
  );
}

async function releaseEditor(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('library-proof:release'));
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = document.documentElement.dataset.libraryEditorModule;
        if (!path) throw new Error('The held editor module identity is missing.');
        const { hasPendingEdits }: typeof import('../src/hooks/useExitSave') = await import(path);
        return hasPendingEdits();
      }),
    )
    .toBe(false);
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
    throw new Error('Library paging fixtures require a loopback app.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== new URL(baseURL).origin) return route.abort('blockedbyclient');
    return route.continue();
  });
});

test('all 20 pages keep 25 Library rows and 3 retained Ranking editors without writing the 500-record guest', async ({
  page,
}, info) => {
  const fixture = libraryFixture();
  await installGuestLibrary(page, fixture);
  await expect(libraryRows(page)).toHaveCount(25);
  await retainRanking(page);
  await expect(libraryRows(page)).toHaveCount(25);
  const before = await readLibrary(page);
  const sorted = Object.values(before.records).sort((a, b) => a.title.localeCompare(b.title));
  const privateRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/catalog|identitytoolkit|securetoken|firestore/.test(request.url())) privateRequests.push(request.url());
  });
  const navigation = await page.evaluate(() => ({ href: location.href, length: history.length }));
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    document.documentElement.dataset.libraryPagingWrites = '0';
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      document.documentElement.dataset.libraryPagingWrites = String(
        Number(document.documentElement.dataset.libraryPagingWrites) + 1,
      );
      return put.apply(this, args);
    };
  });
  await page.evaluate(() => document.fonts.ready);
  const firstGeometry = await libraryGeometry(page);
  await page.screenshot({ path: info.outputPath('library-page-1.png') });
  for (let value = 1; value <= 20; value += 1) {
    if (value > 1) await selectPage(page, value);
    await expect(libraryRows(page)).toHaveCount(25);
    expect(
      await libraryRows(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-record-id'))),
    ).toEqual(sorted.slice((value - 1) * 25, value * 25).map((record) => record.id));
    await expect(rankingEditors(page)).toHaveCount(3);
  }
  await expect(pager(page)).toContainText('476–500 of 500 matching games');
  await expect(pager(page).getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(pager(page).getByRole('button', { name: 'Last', exact: true })).toBeDisabled();
  await pager(page).getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('19');
  await pager(page).getByRole('button', { name: 'Last', exact: true }).click();
  await pager(page).getByRole('button', { name: 'First', exact: true }).click();
  await pager(page).getByRole('button', { name: 'Next', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(results(page)).toBeFocused();
  const focus = await results(page).evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    headerBottom: document.querySelector('.site-header')!.getBoundingClientRect().bottom,
    outline: getComputedStyle(element).outlineWidth,
  }));
  expect(focus.top).toBeGreaterThanOrEqual(focus.headerBottom);
  expect(focus.outline).toBe('3px');
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  expect(await page.evaluate(() => history.length)).toBeGreaterThan(navigation.length);
  expect([...new URL(page.url()).searchParams.keys()]).toEqual(['catalogs', 'page']);
  expect(await page.evaluate(() => document.documentElement.dataset.libraryPagingWrites)).toBe('0');
  expect(await readLibrary(page)).toEqual(before);
  expect(privateRequests).toEqual([]);
  await tab(page, 'Ranking').click();
  await expect(page.locator('[hidden] ul.personal-records > .personal-row-static')).toHaveCount(25);
  const hiddenGeometry = await libraryGeometry(page);
  await tab(page, 'Library').click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  expect(await readLibrary(page)).toEqual(before);
  await info.attach('500-record-page-proof', {
    contentType: 'application/json',
    body: JSON.stringify({
      firstGeometry,
      hiddenGeometry,
      storedRecords: Object.keys(before.records).length,
      storedRankings: before.ranking.length,
      zeroPagingWrites: true,
      privateRequests,
      unchangedStoredState: true,
    }),
  });
});

test('0, 1, 25 and 26 matches use the shared exact boundaries and existing empty recovery', async ({ page }) => {
  for (const total of [0, 1, 25, 26]) {
    await installGuestLibrary(page, libraryFixture(total));
    await expect(libraryRows(page)).toHaveCount(Math.min(total, 25));
    await expect(page.locator('.library-results-boundary [role="status"]')).toHaveText(
      `Showing ${total ? 1 : 0}–${Math.min(total, 25)} of ${total} matching games`,
    );
    if (total === 0) {
      await expect(page.getByRole('heading', { name: 'No games yet', exact: true })).toBeVisible();
      await expect(query(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Select games', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Choose from the 100', exact: true })).toBeVisible();
    }
    if (total <= 25) {
      await expect(pager(page)).toHaveCount(0);
      await expect(page.locator('.library-results-count')).toBeVisible();
    } else {
      await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
      await expect(libraryRows(page)).toHaveCount(1);
      await expect(pager(page)).toContainText('26–26 of 26 matching games');
    }
  }
});

test('filtering searches the full Library and resets the page without moving input focus', async ({ page }) => {
  await installGuestLibrary(page);
  const before = await readLibrary(page);
  const sorted = Object.values(before.records).sort((a, b) => a.title.localeCompare(b.title));
  const target = sorted[490]!;
  await selectPage(page, 10);
  await query(page).fill(target.title);
  await expect(query(page)).toBeFocused();
  const matches = sorted.filter((record) =>
    record.title.toLocaleLowerCase().includes(target.title.toLocaleLowerCase()),
  );
  await expect(libraryRows(page)).toHaveCount(matches.length);
  await expect(page.locator(`ul.personal-records [data-record-id="${target.id}"]`)).toBeVisible();
  await expect(pager(page)).toHaveCount(0);
  await query(page).fill('');
  await selectPage(page, 20);
  await page.getByLabel('Progress', { exact: true }).focus();
  await page.getByLabel('Progress', { exact: true }).selectOption('completed');
  await expect(page.getByLabel('Progress', { exact: true })).toBeFocused();
  await expect(libraryRows(page)).toHaveCount(1);
  await expect(libraryRows(page).first()).toHaveAttribute('data-record-id', rankedRecords[1]!.id);
  await expect(pager(page)).toHaveCount(0);
  await page.getByLabel('Progress', { exact: true }).selectOption('all');
  await expect(libraryRows(page)).toHaveCount(25);
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  expect(await readLibrary(page)).toEqual(before);
});

test('first-run add choices yield to useful tools without remounting a draft or losing filtered-empty recovery', async ({
  page,
}) => {
  await installGuestLibrary(page, libraryFixture(0));
  const library = page.locator('.my-games-editor').filter({ has: page.locator('#library-title') });
  await expect(query(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Discover more games', exact: true })).toBeVisible();
  await library.locator('.manual-add > summary').click();
  const title = library.getByLabel('Game title', { exact: true });
  await title.fill('Keep this manual draft');
  await title.evaluate((element) => {
    element.dataset.uxDraftIdentity = 'retained';
  });
  await page.evaluate(async (record) => {
    const path = '/src/lib/personal-db.ts';
    const { commitPersonalAction }: typeof import('../src/lib/personal-db') = await import(path);
    await commitPersonalAction({ type: 'add-records', records: [record] });
  }, rankedRecords[0]!);
  await expect(query(page)).toBeVisible();
  await expect(libraryRows(page)).toHaveCount(1);
  await expect(pager(page)).toHaveCount(0);
  await expect(title).toHaveValue('Keep this manual draft');
  await expect(title).toHaveAttribute('data-ux-draft-identity', 'retained');
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await libraryRows(page)
    .getByRole('checkbox', { name: /^Select / })
    .check();
  await query(page).fill('No game has this exact name');
  await expect(query(page)).toBeFocused();
  await expect(page.getByRole('heading', { name: 'No matches', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bulk game actions' }).getByRole('status')).toHaveText('0 selected');
  await expect(page.getByRole('button', { name: 'Exit selection', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exit selection', exact: true })).not.toHaveAttribute('aria-pressed');
  await page.getByRole('button', { name: 'Clear search and progress filter', exact: true }).click();
  await expect(libraryRows(page)).toHaveCount(1);
  await expect(query(page)).toHaveValue('');
  await expect(title).toHaveValue('Keep this manual draft');
  await expect(title).toHaveAttribute('data-ux-draft-identity', 'retained');
});

test('selection survives pages and the explicit all-matching action covers all 500 exact IDs once', async ({
  page,
}, info) => {
  await installGuestLibrary(page);
  const before = await readLibrary(page);
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  const selection = page.getByRole('region', { name: 'Bulk game actions' });
  await expect(selection).toContainText(
    'Selection includes matching games on other pages. Changing filters or tabs clears it.',
  );
  const first = libraryRows(page)
    .first()
    .getByRole('checkbox', { name: /^Select / });
  await first.check();
  await selectPage(page, 2);
  await libraryRows(page)
    .first()
    .getByRole('checkbox', { name: /^Select / })
    .check();
  await expect(selection.getByRole('status')).toHaveText('2 selected');
  await selectPage(page, 1);
  await expect(first).toBeChecked();
  await selectPage(page, 20);
  await expect(selection.getByRole('status')).toHaveText('2 selected');
  await selection.getByRole('button', { name: 'Select all 500 matching games (all 20 pages)', exact: true }).click();
  await expect(selection.getByRole('status')).toHaveText('500 selected');
  await page.screenshot({ path: info.outputPath('library-all-pages-selection.png') });
  await selection.getByRole('button', { name: 'Mark played', exact: true }).click();
  const expected = applyPersonalAction(before, {
    type: 'set-progress',
    records: Object.values(before.records).sort((a, b) => a.title.localeCompare(b.title)),
    key: 'played',
    value: true,
  });
  await expect.poll(() => readLibrary(page)).toEqual(expected);
  await expect(selection.getByRole('status')).toHaveText('0 selected');
  expect(Object.keys((await readLibrary(page)).progress)).toHaveLength(500);
  await libraryRows(page)
    .first()
    .getByRole('checkbox', { name: /^Select / })
    .check();
  await tab(page, 'Ranking').click();
  await tab(page, 'Library').click();
  await expect(selection.getByRole('status')).toHaveText('0 selected');
  await libraryRows(page)
    .first()
    .getByRole('checkbox', { name: /^Select / })
    .check();
  await query(page).fill('Mass Effect');
  await expect(selection.getByRole('status')).toHaveText('0 selected');
  await expect(pager(page)).toHaveCount(0);
  const chosen = await libraryRows(page).evaluateAll((rows) =>
    rows.slice(0, 2).map((row) => row.getAttribute('data-record-id')!),
  );
  await libraryRows(page)
    .nth(0)
    .getByRole('checkbox', { name: /^Select / })
    .check();
  await libraryRows(page)
    .nth(1)
    .getByRole('checkbox', { name: /^Select / })
    .check();
  const beforePeerDelete = await readLibrary(page);
  await page.evaluate(async (id) => {
    const path = '/src/lib/personal-db.ts';
    const { commitPersonalAction }: typeof import('../src/lib/personal-db') = await import(path);
    await commitPersonalAction({ type: 'remove-records', ids: [id] });
  }, chosen[0]!);
  await expect(selection.getByRole('status')).toHaveText('1 selected');
  await selection.getByRole('button', { name: 'Mark completed', exact: true }).click();
  const afterPeerDelete = applyPersonalAction(beforePeerDelete, { type: 'remove-records', ids: [chosen[0]!] });
  await expect
    .poll(() => readLibrary(page))
    .toEqual(
      applyPersonalAction(afterPeerDelete, {
        type: 'set-progress',
        records: [afterPeerDelete.records[chosen[1]!]!],
        key: 'completed',
        value: true,
      }),
    );
});

test('manual form and hidden Ranking nodes survive paging and tabs; detail Back and reload preserve the page', async ({
  page,
}) => {
  await installGuestLibrary(page);
  const before = await readLibrary(page);
  await retainRanking(page);
  const library = page.locator('.my-games-editor').filter({ has: page.locator('#library-search') });
  await library.locator('.manual-add > summary').click();
  const title = library.getByLabel('Game title', { exact: true });
  await title.fill('Unsubmitted Library page draft');
  await library.getByLabel('Year', { exact: false }).fill('2004');
  await title.evaluate((element) => {
    element.dataset.preservedLibraryForm = 'yes';
  });
  await page
    .locator('.ranking-row-content input[type="number"]')
    .first()
    .evaluate((element) => {
      element.dataset.preservedRankingEditor = 'yes';
    });
  await selectPage(page, 2);
  await expect(title).toHaveValue('Unsubmitted Library page draft');
  await expect(title).toHaveAttribute('data-preserved-library-form', 'yes');
  await tab(page, 'Ranking').click();
  await expect(page.locator('.ranking-row-content input[type="number"]').first()).toHaveAttribute(
    'data-preserved-ranking-editor',
    'yes',
  );
  await tab(page, 'Library').click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(title).toHaveValue('Unsubmitted Library page draft');
  const opener = libraryRows(page).first().locator('.record-title');
  const target = await libraryRows(page).first().getAttribute('data-record-id');
  await opener.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(libraryRows(page).first()).toHaveAttribute('data-record-id', target!);
  await expect(title).toHaveValue('Unsubmitted Library page draft');
  expect(await readLibrary(page)).toEqual(before);
  await page.reload();
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(title).toHaveValue('');
  await page.goto('/my-library?list=later');
  await expect(tab(page, 'Queue')).toHaveAttribute('aria-current', 'page');
  await expect(pager(page)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Your play order' }).locator('.personal-row')).toHaveCount(3);
  await page.goto('/my-rankings');
  await expect(tab(page, 'Ranking')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.ranking-row-content')).toHaveCount(3);
  await page.goto('/my-library?list=completed');
  await expect(libraryRows(page)).toHaveCount(1);
  expect(await readLibrary(page)).toEqual(before);
});

test('a deferred editor ACK serializes repeated page requests and preserves rows, selection and form until it settles', async ({
  page,
}) => {
  await installGuestLibrary(page);
  const before = await readLibrary(page);
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  await libraryRows(page)
    .first()
    .getByRole('checkbox', { name: /^Select / })
    .check();
  await heldEditor(page);
  await pager(page)
    .getByRole('button', { name: 'Next', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
      button.click();
    });
  await expect(pager(page).getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(page.getByRole('region', { name: 'Bulk game actions' }).getByRole('status')).toHaveText('1 selected');
  expect(await page.evaluate(() => document.documentElement.dataset.libraryFlushCount)).toBe('1');
  expect(await readLibrary(page)).toEqual(before);
  await finishEditor(page);
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(results(page)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.dataset.libraryFlushCount)).toBe('1');
  await releaseEditor(page);
  expect(await readLibrary(page)).toEqual(before);
});

for (const outcome of ['rejected', 'thrown'] as const) {
  test(`${outcome} pending edit keeps the old page, selection and explicit recoverable error`, async ({ page }) => {
    await installGuestLibrary(page);
    const before = await readLibrary(page);
    await selectPage(page, 2);
    await page.getByRole('button', { name: 'Select games', exact: true }).click();
    await libraryRows(page)
      .first()
      .getByRole('checkbox', { name: /^Select / })
      .check();
    await heldEditor(page);
    await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
    const scrollContext = await pager(page).evaluate((element) => ({
      scroll: scrollY,
      viewportTop: element.getBoundingClientRect().top,
      documentTop: element.getBoundingClientRect().top + scrollY,
    }));
    await finishEditor(page, false, outcome === 'thrown');
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: outcome === 'thrown' ? 'Your edit could not be saved' : 'Your edit has not saved' }),
    ).toBeVisible();
    await expect(pager(page).getByRole('combobox')).toHaveValue('2');
    await expect(page.getByRole('region', { name: 'Bulk game actions' }).getByRole('status')).toHaveText('1 selected');
    const afterContext = await pager(page).evaluate((element) => ({
      scroll: scrollY,
      viewportTop: element.getBoundingClientRect().top,
      documentTop: element.getBoundingClientRect().top + scrollY,
    }));
    // Native scroll anchoring may compensate for the inserted error, not navigate elsewhere.
    const errorShift = afterContext.documentTop - scrollContext.documentTop;
    expect(errorShift).toBeGreaterThanOrEqual(0);
    expect(Math.abs(afterContext.scroll - scrollContext.scroll)).toBeLessThanOrEqual(errorShift);
    expect(Math.abs(afterContext.viewportTop - scrollContext.viewportTop)).toBeLessThanOrEqual(errorShift);
    await expect(results(page)).not.toBeFocused();
    expect(await readLibrary(page)).toEqual(before);
    await expect(pager(page).getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    await releaseEditor(page);
  });
}

test('a real hidden invalid ranking draft blocks paging and remains the same editor until corrected', async ({
  page,
}) => {
  await installGuestLibrary(page);
  await selectPage(page, 3);
  await tab(page, 'Ranking').click();
  const rating = page.locator(`[data-record-id="${rankedRecords[0]!.id}"] .personal-score input`);
  await rating.fill('11');
  await page.goBack();
  await expect(tab(page, 'Library')).toHaveAttribute('aria-current', 'page');
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your edit has not saved' })).toBeVisible();
  await expect(pager(page).getByRole('combobox')).toHaveValue('3');
  await expect(rating).toHaveValue('11');
  expect((await readLibrary(page)).ranking[0]?.score).toBe(8.5);
  await page.goForward();
  await expect(rating).toHaveValue('11');
  await rating.fill('8.75');
  await tab(page, 'Library').click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('3');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(8.75);
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('4');
});

test('Library-Ranking-Library history A-B-A invalidates a pending page request without a late focus or offset change', async ({
  page,
}) => {
  await installGuestLibrary(page);
  await tab(page, 'Ranking').click();
  await tab(page, 'Library').click();
  await selectPage(page, 3);
  await heldEditor(page);
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(pager(page).getByRole('combobox')).toBeDisabled();
  await page.goBack();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await page.goBack();
  await expect(tab(page, 'Ranking')).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(tab(page, 'Library')).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(pager(page).getByRole('combobox')).toHaveValue('3');
  await query(page).focus();
  await finishEditor(page);
  await releaseEditor(page);
  await expect(pager(page).getByRole('combobox')).toHaveValue('3');
  await expect(query(page)).toBeFocused();
  expect(await readLibrary(page)).toEqual(JSON.parse(JSON.stringify(libraryFixture())));
});

test('query changes and a workspace remount invalidate an awaited page change', async ({ page }) => {
  await installGuestLibrary(page);
  await selectPage(page, 3);
  await heldEditor(page);
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await query(page).fill('Mass');
  await query(page).fill('');
  await finishEditor(page);
  await releaseEditor(page);
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(query(page)).toBeFocused();
  await page.locator('.wordmark').click();
  await expect(page).toHaveURL((url) => url.pathname === '/' && url.searchParams.get('catalogs') === 'off');
  await page.goBack();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await heldEditor(page);
  await pager(page).getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.wordmark').click();
  await expect(page).toHaveURL((url) => url.pathname === '/my-games');
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await page.goForward();
  await expect(page).toHaveURL((url) => url.pathname === '/' && url.searchParams.get('catalogs') === 'off');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.focus();
  await finishEditor(page);
  await releaseEditor(page);
  await expect(page.getByRole('heading', { name: 'Your library results', exact: true })).toHaveCount(0);
  await expect(menu).toBeFocused();
  expect(await readLibrary(page)).toEqual(JSON.parse(JSON.stringify(libraryFixture())));
});

test('confirmed last-row deletion clamps the final page and focuses results; passive shrink never steals focus', async ({
  page,
}) => {
  await installGuestLibrary(page, libraryFixture(26));
  await selectPage(page, 2);
  const before = await readLibrary(page);
  const id = (await libraryRows(page).first().getAttribute('data-record-id'))!;
  await query(page).focus();
  const remove = libraryRows(page).getByRole('button', {
    name: `Remove ${before.records[id]!.title} from my library`,
    exact: true,
  });
  await remove.evaluate((element) =>
    element.addEventListener('mousedown', (event) => event.preventDefault(), { once: true }),
  );
  await remove.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove 1 game', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pager(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await expect(libraryRows(page)).toHaveCount(25);
  await expect(results(page)).toBeFocused();
  expect(await readLibrary(page)).toEqual(applyPersonalAction(before, { type: 'remove-records', ids: [id] }));
  await installGuestLibrary(page, libraryFixture(26));
  await selectPage(page, 2);
  const removedId = (await libraryRows(page).first().getAttribute('data-record-id'))!;
  await query(page).focus();
  await page.evaluate(async (id) => {
    const path = '/src/lib/personal-db.ts';
    const { commitPersonalAction }: typeof import('../src/lib/personal-db') = await import(path);
    await commitPersonalAction({ type: 'remove-records', ids: [id] });
  }, removedId);
  await expect(pager(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await expect(libraryRows(page)).toHaveCount(25);
  await expect(query(page)).toBeFocused();
});

test('detail pagination abandons an awaited save after Back closes the game, without stealing focus', async ({
  page,
}) => {
  await installGuestLibrary(page, libraryFixture(3));
  await page.goto('/?catalogs=off');
  await page.locator('.game-card .game-link').first().click();
  await expect(page.locator('#game-title')).toBeVisible();
  await heldEditor(page);
  await page.getByRole('button', { name: 'Next game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next game', exact: true })).toBeDisabled();
  await page.goBack();
  await expect(page.locator('#game-title')).toHaveCount(0);
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.focus();
  await finishEditor(page);
  await releaseEditor(page);
  expect(new URL(page.url()).searchParams.has('game')).toBe(false);
  await expect(page.locator('#game-title')).toHaveCount(0);
  await expect(menu).toBeFocused();
});

test('Queue remains an unpaged full list beyond 25 and retains existing arrow order', async ({ page }) => {
  let fixture = libraryFixture(26);
  fixture = applyPersonalAction(fixture, {
    type: 'set-progress',
    records: Object.values(fixture.records),
    key: 'later',
    value: true,
  });
  await installGuestLibrary(page, fixture);
  await retainRanking(page);
  await selectPage(page, 2);
  await tab(page, 'Queue').click();
  const queue = page.getByRole('list', { name: 'Your play order', exact: true });
  await expect(queue.locator('.personal-row')).toHaveCount(26);
  await expect(pager(page)).toHaveCount(0);
  const first = fixture.records[fixture.queueOrder[0]!]!;
  await queue.getByRole('button', { name: `Move ${first.title} down in queue`, exact: true }).click();
  await expect
    .poll(() => readLibrary(page))
    .toEqual(
      applyPersonalAction(fixture, { type: 'move-item', list: 'queue', id: first.id, overId: fixture.queueOrder[1]! }),
    );
  await tab(page, 'Library').click();
  await expect(pager(page).getByRole('combobox')).toHaveValue('1');
  await expect(libraryRows(page)).toHaveCount(25);
  await expect(rankingEditors(page)).toHaveCount(3);
});

test('320px Library pager and results are keyboard reachable, 44px, contained and accessible', async ({
  page,
}, info) => {
  await installGuestLibrary(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await pager(page).getByRole('button', { name: 'Next', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(pager(page).getByRole('combobox')).toHaveValue('2');
  await expect(results(page)).toBeFocused();
  const measures = await pager(page)
    .locator('button,select')
    .evaluateAll((controls) =>
      controls.map((element) => ({
        label: element.textContent,
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
    );
  for (const control of measures) {
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect((await new AxeBuilder({ page }).include('.my-games-workspace').analyze()).violations).toEqual([]);
  const geometry = await libraryGeometry(page);
  await page.screenshot({ path: info.outputPath('library-page-320.png') });
  await info.attach('narrow-library-geometry', {
    contentType: 'application/json',
    body: JSON.stringify({ geometry, measures }),
  });
});

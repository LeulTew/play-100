import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parseCollection } from '../src/lib/collection';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { applyPersonalAction, emptyPersonalLibrary } from '../src/lib/personal-library';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../src/lib/personal-db';
import { recordFromGame } from '../src/lib/personal-types';
import type { LibraryRecord, PersonalAction } from '../src/lib/personal-types';
import { readLibrary } from './library-helpers';

const games = parseCollection(
  JSON.parse(readFileSync(new URL('../public/data/collection.json', import.meta.url), 'utf8')),
).games;
const catalog = parseDiscoveryCatalog(
  JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')),
);
const canonical = recordFromGame(games[0]!);
const other = recordFromGame(games[1]!);
const provider = catalog.items.find((item) => item.record.id === 'wikidata:Q27438121')!.record;
const row = (page: Page, record = canonical) =>
  page.getByRole('list', { name: 'Your ranked games', exact: true }).locator(`[data-record-id="${record.id}"]`);
const confirmation = (page: Page, record = canonical) =>
  page.getByRole('dialog', { name: `Remove ${record.title} from ranking?`, exact: true });
const views = (page: Page) => page.getByRole('navigation', { name: 'My games views', exact: true });

async function seed(page: Page) {
  const actions: PersonalAction[] = [
    { type: 'add-ranking', records: [canonical, other, provider] },
    {
      type: 'edit-ranking',
      id: canonical.id,
      score: 8.5,
      note: 'Synthetic private note: remove only after my confirmation.',
    },
    { type: 'edit-ranking', id: other.id, score: 9, note: 'Keep this other opinion.' },
    { type: 'edit-ranking', id: provider.id, score: 4.25, note: 'Keep this independent provider opinion.' },
    { type: 'move-item', list: 'ranking', id: canonical.id, overId: other.id },
    { type: 'set-progress', records: [canonical, other, provider], key: 'later', value: true },
    { type: 'set-progress', records: [canonical], key: 'completed', value: true },
    { type: 'set-progress', records: [provider], key: 'played', value: true },
    { type: 'set-motion', motion: 'lite' },
  ];
  const state = actions.reduce(applyPersonalAction, emptyPersonalLibrary());
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
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, key: STATE_KEY, state },
  );
  await page.goto('/my-games?tab=ranking&catalogs=off');
  await expect(page.getByRole('list', { name: 'Your ranked games' }).locator('.personal-row')).toHaveCount(3);
  return state;
}

async function openRemoval(page: Page, record: LibraryRecord = canonical) {
  const trigger = row(page, record).getByRole('button', {
    name: `Remove ${record.title} from my ranking`,
    exact: true,
  });
  await trigger.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await trigger.click();
  await expect(confirmation(page, record)).toBeVisible();
  return trigger;
}

async function pauseAutosave(page: Page) {
  await page.clock.install({ time: new Date('2026-09-20T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-20T12:00:10Z'));
}

async function holdPendingEditor(page: Page) {
  await page.evaluate(async () => {
    const path = '/src/hooks/useExitSave.ts';
    const loaded = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .findLast((value) => new URL(value).pathname === path);
    if (!loaded) throw new Error('The active app editor registry was not loaded.');
    const { registerPendingEditor }: typeof import('../src/hooks/useExitSave') = await import(loaded);
    let dirty = true;
    let finish: (saved: boolean) => void = () => {
      throw new Error('Pending editor is not initialized.');
    };
    const waiting = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const release = registerPendingEditor({
      pending: () => dirty,
      flush: () => {
        document.documentElement.dataset.rankingFlushStarted = 'yes';
        return waiting;
      },
    });
    window.addEventListener(
      'ranking-safety:finish-edit',
      () => {
        dirty = false;
        finish(true);
        void release();
      },
      { once: true },
    );
  });
}

async function finishPendingEditor(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('ranking-safety:finish-edit'));
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/hooks/useExitSave.ts';
        const loaded = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .findLast((value) => new URL(value).pathname === path);
        if (!loaded) throw new Error('The active app editor registry was not loaded.');
        const { hasPendingEdits }: typeof import('../src/hooks/useExitSave') = await import(loaded);
        return hasPendingEdits();
      }),
    )
    .toBe(false);
}

async function instrumentWrites(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    document.documentElement.dataset.rankingWriteAttempts = '0';
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      document.documentElement.dataset.rankingWriteAttempts = String(
        Number(document.documentElement.dataset.rankingWriteAttempts) + 1,
      );
      if (document.documentElement.dataset.rejectRankingWrite === 'yes')
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/catalog?**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic offline catalog.' } }),
  );
});

test('saved opinion survives Keep and Escape; confirmation removes it once and re-add starts empty', async ({
  page,
}, info) => {
  const before = await seed(page);
  await row(page).locator('.ranking-note summary').click();
  await expect(row(page).getByRole('spinbutton')).toHaveValue('8.5');
  await expect(row(page).getByRole('textbox')).toHaveValue(before.ranking[0]!.note);
  await expect(row(page).locator('.manual-rank')).toContainText('Fixed at #1');
  await page.screenshot({ path: info.outputPath('ranking-saved.png'), fullPage: true });
  const trigger = await openRemoval(page);
  const dialog = confirmation(page);
  await expect(dialog).toContainText('rating, note and ranking position');
  await expect(dialog).toContainText('The game stays in your Library. Played, Completed and Queue stay unchanged.');
  await expect(dialog.getByRole('button', { name: 'Keep ranking', exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).include('.ranking-removal-dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('ranking-confirmation.png') });
  await dialog.getByRole('button', { name: 'Keep ranking', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await readLibrary(page)).toEqual(before);
  await openRemoval(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await readLibrary(page)).toEqual(before);
  await openRemoval(page);
  await dialog.getByRole('button', { name: 'Remove from ranking', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page)).toHaveCount(0);
  const expected = {
    ...before,
    revision: before.revision + 1,
    ranking: before.ranking.filter((entry) => entry.id !== canonical.id),
  };
  expect(await readLibrary(page)).toEqual(expected);
  await page.reload();
  await expect(row(page)).toHaveCount(0);
  expect(await readLibrary(page)).toEqual(expected);
  await views(page)
    .getByRole('button', { name: /^Library, / })
    .click();
  const libraryRow = page.locator(`.my-games-editor:visible [data-record-id="${canonical.id}"]`);
  await libraryRow.getByRole('button', { name: `Add ${canonical.title} to my ranking`, exact: true }).click();
  await expect
    .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === canonical.id))
    .toEqual({ id: canonical.id, score: null, note: '', manualPosition: null });
  const readded = await readLibrary(page);
  expect(readded.records).toEqual(before.records);
  expect(readded.progress).toEqual(before.progress);
  expect(readded.queueOrder).toEqual(before.queueOrder);
  expect(readded.ranking.filter((entry) => entry.id !== canonical.id)).toEqual(expected.ranking);
  expect(readded.version).toBe(3);
});

test('the provider copy is removed by its exact saved ID, never its canonical twin', async ({ page }) => {
  const before = await seed(page);
  await openRemoval(page, provider);
  await confirmation(page, provider).getByRole('button', { name: 'Remove from ranking', exact: true }).click();
  await expect(row(page, provider)).toHaveCount(0);
  expect(await readLibrary(page)).toEqual({
    ...before,
    revision: before.revision + 1,
    ranking: before.ranking.filter((entry) => entry.id !== provider.id),
  });
  await page.reload();
  await expect(row(page).getByRole('spinbutton')).toHaveValue('8.5');
  expect((await readLibrary(page)).ranking[0]).toEqual(before.ranking[0]);
});

test('a rejected removal remains recoverable; rapid confirmation retries commit only once', async ({ page }, info) => {
  const before = await seed(page);
  await instrumentWrites(page);
  await page.evaluate(() => {
    document.documentElement.dataset.rejectRankingWrite = 'yes';
  });
  await openRemoval(page);
  const dialog = confirmation(page);
  await dialog.getByRole('button', { name: 'Remove from ranking', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('This ranking was not removed');
  await expect(dialog.getByRole('button', { name: 'Keep ranking', exact: true })).toBeEnabled();
  expect(await readLibrary(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.dataset.rankingWriteAttempts)).toBe('1');
  await page.screenshot({ path: info.outputPath('ranking-storage-failure.png') });
  await page.evaluate(() => {
    document.documentElement.dataset.rejectRankingWrite = 'no';
  });
  await dialog
    .getByRole('button', { name: 'Remove from ranking', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
      button.click();
    });
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.rankingWriteAttempts)).toBe('2');
  expect(await readLibrary(page)).toEqual({
    ...before,
    revision: before.revision + 1,
    ranking: before.ranking.filter((entry) => entry.id !== canonical.id),
  });
});

test('an invalid rating blocks deletion without losing its draft or saved opinion', async ({ page }) => {
  const before = await seed(page);
  const rating = row(page).getByRole('spinbutton');
  await rating.fill('11');
  await openRemoval(page);
  await confirmation(page).getByRole('button', { name: 'Remove from ranking', exact: true }).click();
  await expect(confirmation(page).getByRole('alert')).toContainText('Your edit has not saved');
  expect(await readLibrary(page)).toEqual(before);
  await confirmation(page).getByRole('button', { name: 'Keep ranking', exact: true }).click();
  await expect(rating).toHaveValue('11');
  await expect(row(page).getByRole('alert')).toContainText('0 to 10');
  await rating.fill('8.75');
  await openRemoval(page);
  await confirmation(page).getByRole('button', { name: 'Keep ranking', exact: true }).click();
  await expect(rating).toHaveValue('8.75');
  await expect.poll(async () => (await readLibrary(page)).ranking[0]?.score).toBe(8.75);
  expect((await readLibrary(page)).ranking[0]?.note).toBe(before.ranking[0]?.note);
});

for (const field of ['score', 'note'] as const) {
  test(`a pending ${field} survives cancellation and cannot be exit-saved after confirmed deletion`, async ({
    page,
  }) => {
    const before = await seed(page);
    await pauseAutosave(page);
    if (field === 'note') await row(page).locator('.ranking-note summary').click();
    const editor = row(page).getByRole(field === 'score' ? 'spinbutton' : 'textbox');
    const draft = field === 'score' ? '8.75' : 'My pending private note must not disappear on cancellation.';
    await editor.fill(draft);
    await openRemoval(page);
    await confirmation(page).getByRole('button', { name: 'Keep ranking', exact: true }).click();
    await expect(editor).toHaveValue(draft);
    await expect
      .poll(async () => (await readLibrary(page)).ranking[0]?.[field])
      .toBe(field === 'score' ? Number(draft) : draft);
    const saved = await readLibrary(page);
    await openRemoval(page);
    await confirmation(page).getByRole('button', { name: 'Remove from ranking', exact: true }).click();
    await expect(row(page)).toHaveCount(0);
    await page.clock.runFor(1500);
    await views(page)
      .getByRole('button', { name: /^Library, / })
      .click();
    await views(page)
      .getByRole('button', { name: /^Ranking, / })
      .click();
    expect(await readLibrary(page)).toEqual({
      ...saved,
      revision: saved.revision + 1,
      ranking: saved.ranking.filter((entry) => entry.id !== canonical.id),
    });
    expect((await readLibrary(page)).ranking.find((entry) => entry.id === provider.id)).toEqual(
      before.ranking.find((entry) => entry.id === provider.id),
    );
  });
}

test('a failed pending note is retained and is not silently retried by removal', async ({ page }) => {
  const before = await seed(page);
  await instrumentWrites(page);
  await page.evaluate(() => {
    document.documentElement.dataset.rejectRankingWrite = 'yes';
  });
  await row(page).locator('.ranking-note summary').click();
  const note = row(page).getByRole('textbox');
  await note.fill('Keep this unsaved note available to copy or retry.');
  await openRemoval(page);
  await expect(row(page).getByRole('alert')).toContainText('The note could not be saved');
  await confirmation(page).getByRole('button', { name: 'Remove from ranking', exact: true }).click();
  await expect(confirmation(page).getByRole('alert')).toContainText('Your edit has not saved');
  expect(await page.evaluate(() => document.documentElement.dataset.rankingWriteAttempts)).toBe('1');
  expect(await readLibrary(page)).toEqual(before);
  await confirmation(page).getByRole('button', { name: 'Keep ranking', exact: true }).click();
  await expect(note).toHaveValue('Keep this unsaved note available to copy or retry.');
});

for (const cancel of ['Keep', 'Escape', 'Back'] as const) {
  test(`${cancel} cancels a pending flush without letting its late result remove the ranking`, async ({ page }) => {
    const before = await seed(page);
    await views(page)
      .getByRole('button', { name: /^Library, / })
      .click();
    await views(page)
      .getByRole('button', { name: /^Ranking, / })
      .click();
    await holdPendingEditor(page);
    await openRemoval(page);
    await confirmation(page).getByRole('button', { name: 'Remove from ranking', exact: true }).click();
    await expect(confirmation(page).getByRole('button', { name: 'Checking edits…', exact: true })).toBeDisabled();
    await expect(confirmation(page).getByRole('button', { name: 'Keep ranking', exact: true })).toBeEnabled();
    if (cancel === 'Keep') await confirmation(page).getByRole('button', { name: 'Keep ranking', exact: true }).click();
    else if (cancel === 'Escape') await page.keyboard.press('Escape');
    else await page.goBack();
    await expect(confirmation(page)).toHaveCount(0);
    await finishPendingEditor(page);
    expect(await readLibrary(page)).toEqual(before);
    if (cancel === 'Back') {
      await expect(views(page).getByRole('button', { name: /^Library, / })).toHaveAttribute('aria-current', 'page');
      await page.goForward();
      await expect(row(page)).toBeVisible();
      await expect(confirmation(page)).toHaveCount(0);
    }
    expect(await readLibrary(page)).toEqual(before);
  });
}

test('a removed then re-added target cannot be deleted by a stale pending confirmation', async ({ page }) => {
  await seed(page);
  await holdPendingEditor(page);
  await openRemoval(page);
  await confirmation(page).getByRole('button', { name: 'Remove from ranking', exact: true }).click();
  await expect(confirmation(page).getByRole('button', { name: 'Checking edits…', exact: true })).toBeDisabled();
  await page.evaluate(async (id) => {
    const path = '/src/lib/personal-db.ts';
    const { commitPersonalAction }: typeof import('../src/lib/personal-db') = await import(path);
    await commitPersonalAction({ type: 'remove-ranking', ids: [id] });
  }, canonical.id);
  await expect(confirmation(page)).toHaveCount(0);
  await page.evaluate(async (record) => {
    const path = '/src/lib/personal-db.ts';
    const { commitPersonalAction }: typeof import('../src/lib/personal-db') = await import(path);
    await commitPersonalAction({ type: 'rate-game', record, score: 6.5 });
  }, canonical);
  const replacement = await readLibrary(page);
  await finishPendingEditor(page);
  await expect(row(page).getByRole('spinbutton')).toHaveValue('6.5');
  expect(await readLibrary(page)).toEqual(replacement);
});

test('history-hidden ranking editors retain invalid input until corrected, and never resurrect a removed opinion', async ({
  page,
}) => {
  const before = await seed(page);
  await views(page)
    .getByRole('button', { name: /^Library, / })
    .click();
  await views(page)
    .getByRole('button', { name: /^Ranking, / })
    .click();
  await row(page).getByRole('spinbutton').fill('11');
  await page.goBack();
  await expect(views(page).getByRole('button', { name: /^Library, / })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator(`[hidden] [data-record-id="${canonical.id}"] .personal-score input`)).toHaveValue('11');
  expect(await readLibrary(page)).toEqual(before);
  await page.goForward();
  await expect(row(page).getByRole('spinbutton')).toHaveValue('11');
  await openRemoval(page);
  await confirmation(page).getByRole('button', { name: 'Remove from ranking', exact: true }).click();
  await expect(confirmation(page).getByRole('alert')).toContainText('Your edit has not saved');
  await page.keyboard.press('Escape');
  await row(page).getByRole('spinbutton').fill('8.75');
  await openRemoval(page);
  await confirmation(page).getByRole('button', { name: 'Remove from ranking', exact: true }).click();
  await expect(row(page)).toHaveCount(0);
  const removed = await readLibrary(page);
  await views(page)
    .getByRole('button', { name: /^Library, / })
    .click();
  await views(page)
    .getByRole('button', { name: /^Ranking, / })
    .click();
  expect(await readLibrary(page)).toEqual(removed);
  expect(removed.ranking.some((entry) => entry.id === canonical.id)).toBe(false);
});

test('320px order help stays optional, recovery stays available, and the confirmation fits', async ({ page }, info) => {
  await seed(page);
  await page.setViewportSize({ width: 320, height: 800 });
  const help = page.locator('.ranking-order-help');
  await expect(help).not.toHaveAttribute('open');
  await expect(page.locator('.ranking-order-copy > p')).toHaveText('1 fixed position. Other games follow ratings.');
  await expect(page.getByRole('button', { name: 'Use rating order for all', exact: true })).toBeVisible();
  await expect(help.locator('p')).not.toBeVisible();
  await help.locator('summary').click();
  await expect(help.locator('p')).toContainText('Unrated comes last, not zero.');
  await expect(help.locator('p')).toContainText('Ranking or rating never marks a game played.');
  await help.locator('summary').click();
  await page.getByRole('searchbox', { name: 'Search your ranking' }).fill('Red Dead');
  await expect(page.locator('.ranking-order-copy > p')).toContainText('Clear search and filters to reorder.');
  await expect(
    row(page).getByRole('button', { name: `Move ${canonical.title} down in ranking`, exact: true }),
  ).toBeDisabled();
  await page.getByRole('searchbox', { name: 'Search your ranking' }).fill('');
  await page.screenshot({ path: info.outputPath('ranking-320-order-help.png'), fullPage: true });
  await openRemoval(page);
  const keep = confirmation(page).getByRole('button', { name: 'Keep ranking', exact: true });
  await expect(keep).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const geometry = await keep.boundingBox();
  expect(geometry).not.toBeNull();
  expect(geometry!.height).toBeGreaterThanOrEqual(44);
  expect(geometry!.width).toBeGreaterThanOrEqual(44);
  expect(geometry!.x).toBeGreaterThanOrEqual(0);
  expect(geometry!.x + geometry!.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: info.outputPath('ranking-320-confirmation.png') });
});

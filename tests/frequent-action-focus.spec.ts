import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { installGuestLibrary, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';
import { emptyPersonalLibrary } from '../src/lib/personal-library';
import { applyPersonalAction } from '../src/lib/personal-library';
import { catalogFixture, discoveryFixture } from '../src/lib/discovery-test-fixtures';

const game = libraryRecords[0]!;
const provider = discoveryFixture.record;

async function holdWrite(page: Page, rejected: boolean) {
  return page.evaluateHandle((rejected) => {
    const put = IDBObjectStore.prototype.put;
    const state = { attempts: 0, held: false };
    let finish: (() => void) | null = null;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.transaction.db.name === 'play100-personal' && this.name === 'library' && args[1] === 'state') {
        state.attempts += 1;
        if (state.attempts === 1) {
          const transaction = this.transaction;
          const name = rejected ? 'onabort' : 'oncomplete';
          const callback = transaction[name];
          if (!callback) throw new Error('Missing native transaction completion.');
          transaction[name] = (event) => {
            state.held = true;
            finish = () => {
              state.held = false;
              transaction[name] = callback;
              callback.call(transaction, event);
            };
          };
        }
        if (rejected) throw new DOMException('Synthetic action refusal', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
    return {
      state,
      release() {
        if (!finish) throw new Error('No held action.');
        const complete = finish;
        finish = null;
        complete();
      },
      restore() {
        IDBObjectStore.prototype.put = put;
        finish?.();
        finish = null;
      },
    };
  }, rejected);
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Loopback only.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, json: { error: 'Offline fixture' } }));
  await page.route('**/data/discovery/catalog.v1.json', (route) => route.fulfill({ json: catalogFixture }));
});

type Surface =
  | 'card'
  | 'detail later'
  | 'detail completed'
  | 'detail rank'
  | 'discover add'
  | 'discover later'
  | 'discover rank'
  | 'library later'
  | 'library rank'
  | 'table'
  | 'rating order';
async function openControl(page: Page, surface: Surface): Promise<Locator> {
  const seed = {
    ...emptyPersonalLibrary(),
    motion: 'lite' as const,
    records: Object.fromEntries(libraryRecords.slice(0, 3).map((record) => [record.id, record])),
  };
  if (surface === 'rating order') seed.ranking = [{ id: game.id, score: 7, note: '', manualPosition: 1 }];
  await installGuestLibrary(page, seed);
  if (surface.startsWith('discover')) {
    await page.goto('/discover?catalogs=off');
    const card = page.locator(`[data-catalog-id="${provider.id}"]`);
    if (surface === 'discover add')
      return card.getByRole('button', { name: `Add to My games: ${provider.title}`, exact: true });
    await card.getByText('More actions', { exact: true }).click();
    return card.getByRole('button', {
      name: surface === 'discover later' ? `Play later: ${provider.title}` : 'Add to ranking',
      exact: true,
    });
  }
  if (surface.startsWith('library')) {
    const row = page.locator(`[data-record-id="${game.id}"]`);
    return row.getByRole('button', {
      name: surface === 'library later' ? `Play later: ${game.title}` : `Add ${game.title} to my ranking`,
      exact: true,
    });
  }
  if (surface === 'rating order') {
    await page
      .getByRole('navigation', { name: 'My games views' })
      .getByRole('button', { name: /^Ranking,/ })
      .click();
    return page.getByRole('button', { name: `Use rating order for ${game.title}`, exact: true });
  }
  await page.goto(surface === 'table' ? '/?view=table&catalogs=off' : '/?catalogs=off');
  if (surface.startsWith('detail')) {
    await page.locator(`[data-game="${game.id}"] .game-link`).click();
    return page.getByRole('dialog').getByRole('button', {
      name:
        surface === 'detail later' ? 'Play later' : surface === 'detail completed' ? 'Completed' : 'Add to my ranking',
      exact: true,
    });
  }
  return page
    .locator(surface === 'table' ? '.ratings-table' : `[data-game="${game.id}"]`)
    .getByRole('button', { name: `Play later: ${game.title}`, exact: true });
}

for (const surface of [
  'card',
  'detail later',
  'detail completed',
  'detail rank',
  'discover add',
  'discover later',
  'discover rank',
  'library later',
  'library rank',
  'table',
  'rating order',
] as const) {
  for (const rejected of [false, true]) {
    test(`${surface} Enter keeps the same focused control through ${rejected ? 'rejection' : 'saving'}`, async ({
      page,
    }) => {
      const control = await openControl(page, surface);
      const before = await readLibrary(page);
      const handle = await control.elementHandle();
      if (!handle) throw new Error('Missing action control.');
      const held = await holdWrite(page, rejected);
      try {
        await control.focus();
        await control.press('Enter');
        await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
        await expect(control).toBeFocused();
        await expect(control).toHaveAttribute('aria-disabled', 'true');
        await expect(control).not.toHaveAttribute('disabled');
        await page.keyboard.press('Enter');
        expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
        await held.evaluate((probe) => probe.release());
        await expect(
          page
            .locator('[role="status"],[role="alert"]')
            .filter({
              hasText: rejected ? 'Device storage is full' : /updated|added to|marked|follows rating order/,
            })
            .first(),
        ).toBeVisible();
        await expect
          .poll(() => handle.evaluate((element) => element.isConnected && document.activeElement === element))
          .toBe(true);
        if (rejected) expect(await readLibrary(page)).toEqual(before);
        else await expect.poll(async () => (await readLibrary(page)).revision).toBe(before.revision + 1);
      } finally {
        await held.evaluate((probe) => probe.restore());
        await held.dispose();
        await handle.dispose();
      }
    });
  }
}

for (const name of [
  'Add to Play later',
  'Mark played',
  'Mark completed',
  'Add to my ranking',
  'Remove from Play later',
  'Unmark completed',
]) {
  test(`bulk ${name} Enter returns focus to Select all after completion`, async ({ page }) => {
    await installGuestLibrary(page);
    await page.getByRole('button', { name: 'Select games', exact: true }).click();
    const bar = page.getByRole('region', { name: 'Bulk game actions' });
    await bar.getByRole('button', { name: /^Select all/ }).click();
    const control = bar.getByRole('button', { name, exact: true });
    const held = await holdWrite(page, false);
    try {
      await control.focus();
      await control.press('Enter');
      await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
      await expect(control).toBeFocused();
      await control.press('Enter');
      expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
      await held.evaluate((probe) => probe.release());
      await expect(bar.getByRole('status')).toHaveText('0 selected');
      await expect(bar.getByRole('button', { name: /^Select all/ })).toBeFocused();
    } finally {
      await held.evaluate((probe) => probe.restore());
      await held.dispose();
    }
  });
}

test('Enter in the ranking position field preserves its focused input through saving', async ({ page }) => {
  await openControl(page, 'rating order');
  const row = page.getByRole('list', { name: 'Your ranked games' }).locator(`[data-record-id="${game.id}"]`);
  await row.getByText('Move to position', { exact: true }).click();
  const input = row.getByRole('spinbutton', { name: `Position for ${game.title}`, exact: true });
  await input.fill('1');
  const held = await holdWrite(page, false);
  try {
    await input.press('Enter');
    await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('readonly');
    await input.press('Enter');
    expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
    await held.evaluate((probe) => probe.release());
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
  } finally {
    await held.evaluate((probe) => probe.restore());
    await held.dispose();
  }
});

test('a ranking note remains focusable and read-only while its save is pending', async ({ page }) => {
  await openControl(page, 'rating order');
  const row = page.getByRole('list', { name: 'Your ranked games' }).locator(`[data-record-id="${game.id}"]`);
  await row.getByText('Add a note', { exact: true }).click();
  const note = row.getByRole('textbox', { name: `Your note for ${game.title}` });
  await note.fill('Kept opinion');
  const held = await holdWrite(page, false);
  try {
    await note.press('Tab');
    await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
    await note.focus();
    await expect(note).toBeFocused();
    await expect(note).toHaveAttribute('readonly');
    await note.press('Enter');
    await expect(note).toHaveValue('Kept opinion');
    await held.evaluate((probe) => probe.release());
    await expect(note).not.toHaveAttribute('readonly');
    await expect(note).toBeFocused();
    await expect(note).toHaveValue('Kept opinion');
  } finally {
    await held.evaluate((probe) => probe.restore());
    await held.dispose();
  }
});

test('bulk feedback counts only changed memberships and single toggles name their direction', async ({ page }) => {
  const records = libraryRecords.slice(0, 102);
  const seed = applyPersonalAction(emptyPersonalLibrary(), { type: 'add-records', records });
  const before = applyPersonalAction(seed, {
    type: 'set-progress',
    records: records.slice(0, 6),
    key: 'later',
    value: true,
  });
  await installGuestLibrary(page, before);
  await page.getByRole('button', { name: 'Select games', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Bulk game actions' });
  await bar.getByRole('button', { name: /^Select all/ }).click();
  await bar.getByRole('button', { name: 'Add to Play later', exact: true }).press('Enter');
  await expect(page.locator('.toast-visible')).toContainText('96 games added to Play later; 6 were already there.');
  await expect(bar.getByRole('button', { name: /^Select all/ })).toBeFocused();
  await bar.getByRole('button', { name: 'Done selecting' }).click();
  await page.goto('/?catalogs=off');
  const later = page.locator(`[data-game="${game.id}"]`).getByRole('button', { name: `Play later: ${game.title}` });
  await later.press('Enter');
  await expect(page.locator('.toast-visible')).toContainText(`${game.title} removed from Play later.`);
  await later.press('Enter');
  await expect(page.locator('.toast-visible')).toContainText(`${game.title} added to Play later.`);
});

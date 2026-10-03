import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecord, libraryRecords } from './library-pagination-helpers';
import { holdLibraryWrite as holdWrite, readLibrary } from './library-helpers';
import { createLibraryBackup, emptyPersonalLibrary } from '../src/lib/personal-library';
import { applyPersonalAction } from '../src/lib/personal-library';
import { catalogFixture, discoveryFixture } from '../src/lib/discovery-test-fixtures';
import { compareTrayStorageKey, serializeCompareTray } from '../src/lib/compare-tray';
import { withActionCleanup } from './action-cleanup';

const game = libraryRecord(0);
const provider = discoveryFixture.record;

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Loopback only.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, json: { error: 'Offline fixture' } }));
  await page.route('**/data/discovery/catalog.v1.json', (route) => route.fulfill({ json: catalogFixture }));
});

for (const action of ['restore', 'cancel'] as const) {
  test(`backup ${action} returns focus to Import backup inside Settings`, async ({ page }) => {
    await installGuestLibrary(page);
    const before = await readLibrary(page);
    await page.goto('/?catalogs=off&info=settings');
    const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
    const trigger = settings.getByRole('button', { name: 'Import backup', exact: true });
    await expect(trigger).toBeVisible();
    await expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
    await settings.getByLabel('Import personal library backup file').setInputFiles({
      name: 'focus-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(createLibraryBackup(emptyPersonalLibrary()))),
    });
    const control = settings.getByRole('button', {
      name: action === 'restore' ? 'Replace with this backup' : 'Cancel import',
      exact: true,
    });
    await expect(settings.locator('.restore-preview')).toBeVisible();
    await expect(control).toBeVisible();
    await expect(control).not.toHaveAttribute('aria-disabled', 'true');
    const held = action === 'restore' ? await holdWrite(page, false) : null;
    await withActionCleanup(
      async () => {
        await control.focus();
        await control.press('Enter');
        if (held) {
          await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
          await expect(control).toBeFocused();
          await expect(control).toHaveAttribute('aria-disabled', 'true');
          await control.press('Enter');
          expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
          await held.evaluate((probe) => probe.release());
          await expect(settings.locator('.backup-panel').getByRole('status')).toHaveText(
            'Your backup was restored and saved on this device.',
          );
        } else expect(await readLibrary(page)).toEqual(before);
        await expect(settings.locator('.restore-preview')).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expect(trigger).toBeInViewport();
        expect(
          await trigger.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
          }),
        ).toBe(true);
        await expect(settings).toBeVisible();
      },
      held ? [() => held.evaluate((probe) => probe.restore()), () => held.dispose()] : [],
    );
  });
}

for (const [count, index] of [
  [1, 0],
  [3, 1],
  [26, 25],
] as const) {
  for (const rejected of [false, true]) {
    for (const newerFocus of [false, true]) {
      test(`queue removal ${index + 1}/${count} ${rejected ? 'refuses' : 'saves'} with ${newerFocus ? 'newer focus' : 'an owning handoff'}`, async ({
        page,
      }) => {
        const seed = applyPersonalAction(libraryFixture(count), {
          type: 'set-progress',
          records: libraryRecords.slice(0, count),
          key: 'later',
          value: true,
        });
        await installGuestLibrary(page, seed, '/my-games?tab=queue&catalogs=off');
        if (count > 25)
          await page
            .getByRole('navigation', { name: 'Play later pages', exact: true })
            .getByRole('button', { name: 'Last', exact: true })
            .press('Enter');
        const record = libraryRecord(index);
        const list = page.getByRole('list', { name: 'Your Play later games', exact: true });
        const row = list.locator(`[data-record-id="${record.id}"]`);
        const action = row.getByRole('button', { name: `Remove from Play later: ${record.title}`, exact: true });
        const other = page.getByRole('searchbox', { name: 'Search Play later', exact: true });
        const before = await readLibrary(page);
        const held = await holdWrite(page, rejected);
        await withActionCleanup(async () => {
          await action.focus();
          await page.keyboard.press('Enter');
          await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
          await expect(action).toBeFocused();
          await expect(action).toHaveAttribute('aria-disabled', 'true');
          await expect(action).not.toHaveAttribute('disabled');
          await page.keyboard.press('Enter');
          expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
          if (newerFocus) await other.focus();
          await held.evaluate((probe) => probe.release());
          if (rejected) {
            await expect(page.getByRole('alert').filter({ hasText: 'Device storage is full' }).first()).toBeVisible();
            expect(await readLibrary(page)).toEqual(before);
            await expect(newerFocus ? other : action).toBeFocused();
          } else {
            await expect(row).toHaveCount(0);
            const neighbor = libraryRecord(index + 1 < count ? index + 1 : Math.max(0, index - 1));
            const target = newerFocus
              ? other
              : count === 1
                ? page.getByRole('heading', { name: 'Play later results', exact: true })
                : list.getByRole('button', { name: `Remove from Play later: ${neighbor.title}`, exact: true });
            await expect(target).toBeFocused();
            await expect(target).toBeInViewport();
            expect(await readLibrary(page)).toEqual(
              applyPersonalAction(before, {
                type: 'set-progress',
                records: [record],
                key: 'later',
                value: false,
              }),
            );
            expect((await readLibrary(page)).records[record.id]).toEqual(record);
          }
        }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
      });
    }
  }
}

for (const rejected of [false, true]) {
  for (const next of ['title', 'newer focus', 'edited year'] as const) {
    test(`manual keyboard add ${rejected ? 'refuses' : 'saves'} with ${next} preserved`, async ({ page }) => {
      await installGuestLibrary(page, libraryFixture(3));
      await page.getByText('Add a game manually', { exact: true }).click();
      const form = page.locator('.manual-add');
      const title = form.getByRole('textbox', { name: 'Game title', exact: true });
      const year = form.getByRole('spinbutton', { name: 'Year (optional)', exact: true });
      const add = form.getByRole('button', { name: 'Add to My games', exact: true });
      const other = page.getByRole('searchbox', { name: 'Search your library', exact: true });
      await title.fill('Second Local Adventure');
      await year.fill('1997');
      await year.press('Tab');
      await expect(add).toBeFocused();
      const before = await readLibrary(page);
      const held = await holdWrite(page, rejected);
      await withActionCleanup(async () => {
        await page.keyboard.press('Enter');
        await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
        await expect(add).toBeFocused();
        await expect(add).toHaveAttribute('aria-disabled', 'true');
        await expect(add).not.toHaveAttribute('disabled');
        await page.keyboard.press('Enter');
        expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
        if (next === 'newer focus') await other.focus();
        if (next === 'edited year') await year.fill('1998');
        await held.evaluate((probe) => probe.release());
        if (rejected) {
          await expect(form.getByRole('alert')).toBeVisible();
          expect(await readLibrary(page)).toEqual(before);
          await expect(title).toHaveValue('Second Local Adventure');
        } else {
          await expect
            .poll(async () => Object.keys((await readLibrary(page)).records).length)
            .toBe(Object.keys(before.records).length + 1);
          const added = Object.values((await readLibrary(page)).records).find(
            (item) => item.title === 'Second Local Adventure',
          );
          expect(added?.year).toBe(1997);
          await expect(title).toHaveValue(next === 'edited year' ? 'Second Local Adventure' : '');
        }
        await expect(
          next === 'newer focus' ? other : next === 'edited year' ? year : rejected ? add : title,
        ).toBeFocused();
        if (next === 'edited year') await expect(year).toHaveValue('1998');
      }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
    });
  }
}

for (const tab of ['library', 'queue']) {
  test(`short ${tab} record titles keep the 44px floor at compact widths`, async ({ page }) => {
    const record = libraryRecords.find((item) => item.title === 'Halo 3');
    if (!record) throw new Error('The canonical short-title fixture is missing.');
    const seed = applyPersonalAction(emptyPersonalLibrary(), {
      type: 'set-progress',
      records: [record],
      key: 'later',
      value: true,
    });
    await installGuestLibrary(page, seed, `/my-games?tab=${tab}&catalogs=off`);
    const title = page.getByRole('button', { name: 'Halo 3', exact: true });
    for (const width of [320, 360, 393, 720]) {
      await page.setViewportSize({ width, height: 851 });
      const box = await title.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      await expect(title).toHaveCSS('overflow-wrap', 'anywhere');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}

for (const pins of [0, 6]) {
  test(`Reset device data clears the confirmed library and its ${pins} Compare pins, including after reload`, async ({
    page,
  }) => {
    await installGuestLibrary(page, libraryFixture(6));
    await page.goto('/?catalogs=off');
    for (const record of libraryRecords.slice(0, pins))
      await page.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true }).click();
    const otherKey = compareTrayStorageKey('account:demo-play100:other');
    const otherPins = serializeCompareTray('account:demo-play100:other', [game]);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: otherKey, raw: otherPins });
    const pinKey = compareTrayStorageKey('guest');
    const savedPins = await page.evaluate((key) => localStorage.getItem(key), pinKey);
    await page.goto('/?catalogs=off&info=settings');
    const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
    const trigger = settings.getByRole('button', { name: 'Reset device data', exact: true });
    await trigger.click();
    await expect(settings.locator('.reset-confirmation')).toContainText('Compare pins');
    await settings.getByRole('button', { name: 'Keep my data', exact: true }).press('Enter');
    await expect(trigger).toBeFocused();
    expect(await page.evaluate((key) => localStorage.getItem(key), pinKey)).toBe(savedPins);
    await trigger.press('Enter');
    const reset = settings.getByRole('button', { name: 'Yes, reset device data', exact: true });
    const held = await holdWrite(page, false);
    await withActionCleanup(async () => {
      await reset.focus();
      await reset.press('Enter');
      await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
      await expect(reset).toBeFocused();
      expect(await page.evaluate((key) => localStorage.getItem(key), pinKey)).toBe(savedPins);
      await held.evaluate((probe) => probe.release());
      await expect(settings.locator('.device-settings').getByRole('status')).toHaveText(
        'Your active library, Play later, ranking, Compare pins and preferences have been reset.',
      );
      await expect(trigger).toBeFocused();
      expect(await page.evaluate((key) => localStorage.getItem(key), pinKey)).toBeNull();
      expect(await page.evaluate((key) => localStorage.getItem(key), otherKey)).toBe(otherPins);
    }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.game-card')).toHaveCount(24);
    await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
    expect((await readLibrary(page)).records).toEqual({});
  });
}

test('a rejected library reset leaves its Compare pins intact', async ({ page }) => {
  await installGuestLibrary(page, libraryFixture(3));
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: `Pin for comparison: ${game.title}`, exact: true }).click();
  const key = compareTrayStorageKey('guest');
  const before = await readLibrary(page);
  const pins = await page.evaluate((key) => localStorage.getItem(key), key);
  await page.goto('/?catalogs=off&info=settings');
  await page.getByRole('button', { name: 'Reset device data', exact: true }).click();
  const held = await holdWrite(page, true);
  await withActionCleanup(async () => {
    await page.getByRole('button', { name: 'Yes, reset device data', exact: true }).click();
    await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
    await held.evaluate((probe) => probe.release());
    const resetAlert = page.locator('.device-settings').getByRole('alert');
    await expect(resetAlert).toHaveCount(1);
    await expect(resetAlert).toHaveText(
      'Reset failed. Your saved data has not been removed. Device storage is full. Your changes were not saved. Free some space and try again.',
    );
    expect(await readLibrary(page)).toEqual(before);
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(pins);
  }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
});

test('reset reports uncleared saved Compare pins instead of claiming complete removal', async ({ page }) => {
  await installGuestLibrary(page, libraryFixture(3));
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: `Pin for comparison: ${game.title}`, exact: true }).click();
  const key = compareTrayStorageKey('guest');
  const pins = await page.evaluate((key) => localStorage.getItem(key), key);
  await page.goto('/?catalogs=off&info=settings');
  const removal = await page.evaluateHandle((key) => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (target: string) {
      if (target === key) throw new DOMException('Synthetic pin removal refusal', 'SecurityError');
      return remove.call(this, target);
    };
    return {
      restore: () => {
        Storage.prototype.removeItem = remove;
      },
    };
  }, key);
  await withActionCleanup(async () => {
    for (const retry of [false, true]) {
      if (retry) await removal.evaluate((probe) => probe.restore());
      await page.getByRole('button', { name: 'Reset device data', exact: true }).click();
      await page.getByRole('button', { name: 'Yes, reset device data', exact: true }).click();
      const result = page.locator('.device-settings').getByRole(retry ? 'status' : 'alert');
      await expect(result).toHaveText(
        retry
          ? 'Your active library, Play later, ranking, Compare pins and preferences have been reset.'
          : 'Your library and preferences were reset, but saved Compare pins could not be cleared. Allow storage and try Reset again.',
      );
      expect((await readLibrary(page)).records).toEqual({});
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(retry ? null : pins);
      await expect(page.getByRole('button', { name: 'Reset device data', exact: true })).toBeFocused();
    }
  }, [() => removal.evaluate((probe) => probe.restore()), () => removal.dispose()]);
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
      name: surface === 'discover later' ? `Play later: ${provider.title}` : 'Add to my ranking',
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
    test(`${surface} Enter keeps action focus through ${rejected ? 'rejection' : 'saving'}`, async ({ page }) => {
      const control = await openControl(page, surface);
      const before = await readLibrary(page);
      const handle = await control.elementHandle();
      if (!handle) throw new Error('Missing action control.');
      const held = await holdWrite(page, rejected);
      await withActionCleanup(async () => {
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
        if (surface === 'library rank' && !rejected) {
          await expect(page.getByRole('link', { name: /^Ranked #1:.*\. Open in Ranking$/ })).toBeFocused();
          expect(await handle.evaluate((element) => element.isConnected)).toBe(false);
        } else {
          await expect
            .poll(() => handle.evaluate((element) => element.isConnected && document.activeElement === element))
            .toBe(true);
        }
        if (rejected) expect(await readLibrary(page)).toEqual(before);
        else await expect.poll(async () => (await readLibrary(page)).revision).toBe(before.revision + 1);
      }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose(), () => handle.dispose()]);
    });
  }
}

test('a saved library Rank does not steal a newer focus when its Ranked link appears', async ({ page }) => {
  const control = await openControl(page, 'library rank');
  const before = await readLibrary(page);
  const held = await holdWrite(page, false);
  await withActionCleanup(async () => {
    await control.focus();
    await control.press('Enter');
    await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
    const next = page.getByRole('searchbox', { name: 'Search your library', exact: true });
    await next.focus();
    await held.evaluate((probe) => probe.release());
    await expect(page.getByRole('link', { name: /^Ranked #1:.*\. Open in Ranking$/ })).toBeVisible();
    await expect(next).toBeFocused();
    await expect.poll(async () => (await readLibrary(page)).revision).toBe(before.revision + 1);
  }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
});

for (const name of [
  'Add to Play later',
  'Mark played',
  'Mark completed',
  'Add to my ranking',
  'Remove from Play later',
  'Mark not completed',
]) {
  test(`bulk ${name} Enter returns focus to Select all after completion`, async ({ page }) => {
    await installGuestLibrary(page);
    await page.getByRole('button', { name: 'Select games', exact: true }).click();
    const bar = page.getByRole('region', { name: 'Bulk game actions' });
    await bar.getByRole('button', { name: /^Select all/ }).click();
    const control = bar.getByRole('button', { name, exact: true });
    const held = await holdWrite(page, false);
    await withActionCleanup(async () => {
      await control.focus();
      await control.press('Enter');
      await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
      await expect(control).toBeFocused();
      await control.press('Enter');
      expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
      await held.evaluate((probe) => probe.release());
      await expect(bar.getByRole('status')).toHaveText('0 selected');
      await expect(bar.getByRole('button', { name: /^Select all/ })).toBeFocused();
    }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
  });
}

test('Enter in the ranking position field preserves its focused input through saving', async ({ page }) => {
  await openControl(page, 'rating order');
  const row = page.getByRole('list', { name: 'Your ranked games' }).locator(`[data-record-id="${game.id}"]`);
  await row.getByText('Move to position', { exact: true }).click();
  const input = row.getByRole('spinbutton', { name: `Position for ${game.title}`, exact: true });
  await input.fill('1');
  const held = await holdWrite(page, false);
  await withActionCleanup(async () => {
    await input.press('Enter');
    await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('readonly');
    await input.press('Enter');
    expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
    await held.evaluate((probe) => probe.release());
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
  }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
});

test('a ranking note remains focusable and read-only while its save is pending', async ({ page }) => {
  await openControl(page, 'rating order');
  const row = page.getByRole('list', { name: 'Your ranked games' }).locator(`[data-record-id="${game.id}"]`);
  await row.getByText('Add a note', { exact: true }).click();
  const note = row.getByRole('textbox', { name: `Your note for ${game.title}` });
  await note.fill('Kept opinion');
  const held = await holdWrite(page, false);
  await withActionCleanup(async () => {
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
  }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
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
  await page.getByRole('button', { name: 'Done selecting', exact: true }).click();
  await page.goto('/?catalogs=off');
  const later = page.locator(`[data-game="${game.id}"]`).getByRole('button', { name: `Play later: ${game.title}` });
  // A cold navigation reads the library again, and the toggle ignores activation until it has (GameCard).
  await expect(later).not.toHaveAttribute('aria-disabled', 'true');
  await expect(later).toHaveAttribute('aria-pressed', 'true');
  await later.press('Enter');
  await expect(page.locator('.toast-visible')).toContainText(`${game.title} removed from Play later.`);
  await expect(later).toHaveAttribute('aria-pressed', 'false');
  await later.press('Enter');
  await expect(page.locator('.toast-visible')).toContainText(`${game.title} added to Play later.`);
  await expect(later).toHaveAttribute('aria-pressed', 'true');
});

for (const [position, rejected, moveFocus] of [
  [1, false, false],
  [1, true, false],
  [2, false, false],
  [2, true, false],
  [2, false, true],
  [2, true, true],
] as const) {
  test(`numeric Move button from ${position} ${moveFocus ? 'respects newer focus' : 'keeps visible focus on its moved record'} after ${rejected ? 'refusal' : 'saving'}`, async ({
    page,
  }) => {
    const records = libraryRecords.slice(0, 3);
    const ranked = applyPersonalAction(emptyPersonalLibrary(), { type: 'add-ranking', records });
    const seed = applyPersonalAction(ranked, { type: 'move-item', list: 'ranking', id: game.id, position });
    await installGuestLibrary(page, seed);
    await page
      .getByRole('navigation', { name: 'My games views' })
      .getByRole('button', { name: /^Ranking,/ })
      .click();
    const row = page.getByRole('list', { name: 'Your ranked games' }).locator(`[data-record-id="${game.id}"]`);
    await expect(row).toHaveAttribute('aria-posinset', String(position));
    await row.getByText('Move to position', { exact: true }).click();
    const input = row.getByRole('spinbutton', { name: `Position for ${game.title}`, exact: true });
    const move = row.getByRole('button', { name: 'Move', exact: true });
    await input.fill('3');
    await input.press('Tab');
    await expect(move).toBeFocused();
    await expect(move).toBeInViewport();
    const before = await readLibrary(page);
    const held = await holdWrite(page, rejected);
    await withActionCleanup(async () => {
      await page.keyboard.press('Enter');
      await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
      await expect(move).toBeFocused();
      await expect(move).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Enter');
      expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
      const otherControl = page.getByRole('button', { name: 'Add games', exact: true });
      if (moveFocus) await otherControl.focus();
      await held.evaluate((probe) => probe.release());
      if (rejected) {
        await expect(page.getByRole('alert').filter({ hasText: 'The position could not be saved' })).toBeVisible();
        expect(await readLibrary(page)).toEqual(before);
        await expect(input).toHaveValue('3');
      } else {
        await expect(row).toHaveAttribute('aria-posinset', '3');
        await expect(input).toHaveValue('');
        await expect.poll(async () => (await readLibrary(page)).ranking[2]?.id).toBe(game.id);
      }
      const target = moveFocus ? otherControl : move;
      await expect(target).toBeFocused();
      await expect(target).toBeVisible();
      await expect(target).toBeInViewport();
      await expect(move).not.toHaveAttribute('aria-disabled', 'true');
      expect(
        await target.evaluate((element) => ({
          focused: document.activeElement === element,
          record: element.closest('[data-record-id]')?.getAttribute('data-record-id'),
          focusRing: element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none',
        })),
      ).toEqual({ focused: true, record: moveFocus ? undefined : game.id, focusRing: true });
    }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
  });
}

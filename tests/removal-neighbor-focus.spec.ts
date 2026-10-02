import { expect, test } from '@playwright/test';
import { applyPersonalAction } from '../src/lib/personal-library';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { holdLibraryWrite, readLibrary } from './library-helpers';
import { withActionCleanup } from './action-cleanup';

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Loopback only.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }),
  );
});

for (const view of ['library', 'ranking'] as const) {
  for (const [count, position] of [
    [8, 4],
    [8, 7],
    [26, 25],
    [1, 0],
  ] as const) {
    test(`${view}: removing row ${position + 1}/${count} returns to the adjacent title, not the page top`, async ({
      page,
    }) => {
      const seed = applyPersonalAction(libraryFixture(count), {
        type: 'add-ranking',
        records: libraryRecords.slice(0, count),
      });
      const records =
        view === 'ranking'
          ? seed.ranking.map((entry) => seed.records[entry.id]!)
          : Object.values(seed.records).sort((a, b) => a.title.localeCompare(b.title));
      const record = records[position]!;
      const neighbor = records[position + 1] ?? records[position - 1];
      await installGuestLibrary(page, seed);
      if (view === 'ranking')
        await page
          .getByRole('navigation', { name: 'My games views' })
          .getByRole('button', { name: /^Ranking,/ })
          .click();
      if (count > 25)
        await page
          .getByRole('navigation', { name: view === 'library' ? 'Library pages' : 'Ranking pages', exact: true })
          .getByRole('button', { name: 'Last', exact: true })
          .click();
      const list = page.getByRole('list', {
        name: view === 'library' ? 'Your games' : 'Your ranked games',
        exact: true,
      });
      const row = list.locator(`[data-record-id="${record.id}"]`);
      const remove = row.getByRole('button', { name: `Remove ${record.title} from my ${view}`, exact: true });
      await remove.scrollIntoViewIfNeeded();
      await remove.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await dialog
        .getByRole('button', { name: view === 'library' ? 'Keep game' : 'Keep ranking', exact: true })
        .press('Enter');
      await expect(remove).toBeFocused();
      const before = await readLibrary(page);
      await remove.press('Enter');
      await dialog
        .getByRole('button', {
          name: view === 'library' ? 'Remove 1 game' : 'Remove from ranking',
          exact: true,
        })
        .press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(row).toHaveCount(0);
      const target = neighbor
        ? list.getByRole('button', { name: neighbor.title, exact: true })
        : page.getByRole('heading', {
            name: view === 'library' ? 'Your library results' : 'Your ranking results',
            exact: true,
          });
      await expect(target).toBeFocused();
      await expect(target).toBeInViewport();
      const after = await readLibrary(page);
      expect(after).toEqual(
        applyPersonalAction(before, {
          type: view === 'library' ? 'remove-records' : 'remove-ranking',
          ids: [record.id],
        }),
      );
      if (neighbor && position > 0) expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
      if (view === 'ranking') expect(after.records).toEqual(before.records);
    });
  }

  test(`${view}: a refused removal stays in its dialog and cancellation returns to the unchanged action`, async ({
    page,
  }) => {
    const seed = applyPersonalAction(libraryFixture(8), { type: 'add-ranking', records: libraryRecords.slice(0, 8) });
    await installGuestLibrary(page, seed);
    if (view === 'ranking')
      await page
        .getByRole('navigation', { name: 'My games views' })
        .getByRole('button', { name: /^Ranking,/ })
        .click();
    const list = page.getByRole('list', { name: view === 'library' ? 'Your games' : 'Your ranked games', exact: true });
    const row = list.locator('[data-record-id]').nth(4);
    const remove = row.getByRole('button', { name: new RegExp(`^Remove .+ from my ${view}$`) });
    await remove.focus();
    await page.keyboard.press('Enter');
    const held = await holdLibraryWrite(page, true);
    const before = await readLibrary(page);
    await withActionCleanup(async () => {
      const dialog = page.getByRole('dialog');
      await dialog
        .getByRole('button', { name: view === 'library' ? 'Remove 1 game' : 'Remove from ranking', exact: true })
        .press('Enter');
      await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
      await held.evaluate((probe) => probe.release());
      await expect(dialog.getByRole('alert')).toBeVisible();
      expect(await readLibrary(page)).toEqual(before);
      await dialog
        .getByRole('button', { name: view === 'library' ? 'Keep game' : 'Keep ranking', exact: true })
        .press('Enter');
      await expect(remove).toBeFocused();
    }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
  });
}

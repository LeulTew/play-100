import { expect, test } from '@playwright/test';
import { installGuestLibrary, libraryFixture } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';
import { emptyCatalogs } from './catalog-helpers';

for (const surface of [
  { name: 'The 100', path: '/?catalogs=off', entry: 'Select multiple games' },
  { name: 'Discover', path: '/discover?catalogs=off', entry: 'Select games' },
  { name: 'My games', path: '/my-games?tab=library&catalogs=off', entry: 'Select games' },
]) {
  test(`${surface.name} has one focus-preserving Done selecting control`, async ({ page }) => {
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installGuestLibrary(page, libraryFixture(3));
    await page.goto(surface.path);
    const before = await readLibrary(page);
    const start = page.getByRole('button', { name: surface.entry, exact: true });
    await start.focus();
    const original = await start.elementHandle();
    if (!original) throw new Error('Selection needs a mounted entry control.');
    await start.press('Enter');
    const done = page.getByRole('button', { name: 'Done selecting', exact: true });
    const bar = page.getByRole('region', { name: 'Bulk game actions', exact: true });
    await expect(done).toHaveCount(1);
    await expect(done).toBeFocused();
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Done selecting', exact: true })).toHaveCount(0);
    expect(await original.evaluate((node) => node.isConnected && node === document.activeElement)).toBe(true);
    await bar.getByRole('button', { name: /^Select all/ }).click();
    await expect(bar.getByRole('status')).not.toHaveText('0 selected');
    await done.focus();
    await done.press('Enter');
    await expect(bar).toHaveCount(0);
    await expect(start).toBeFocused();
    await start.press('Enter');
    await expect(done).toHaveCount(1);
    await expect(bar.getByRole('status')).toHaveText('0 selected');
    expect(await readLibrary(page)).toEqual(before);
    await original.dispose();
  });
}

test('Completed has a specific empty heading', async ({ page }) => {
  await emptyCatalogs(page);
  await installGuestLibrary(page, libraryFixture(0));
  await page.goto('/?list=completed&catalogs=off');
  await expect(page.getByRole('heading', { name: 'No completed games yet', exact: true })).toBeVisible();
});

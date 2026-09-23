import { expect, test } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';
import { expectReadableSurface, textSpacingCSS } from './readability-helpers';

for (const forcedColors of ['none', 'active'] as const) {
  test(`Ranking completed controls reflow within 320px under text spacing (${forcedColors})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors });
    await installGuestLibrary(page, libraryFixture(3));
    await page.addStyleTag({ content: textSpacingCSS });
    await page.getByRole('navigation', { name: 'My games views' }).getByRole('button', { name: /^Ranking/ }).click();
    await expectReadableSurface(page, 'Ranking completed controls', true);
    const buttons = page.locator('.my-games-editor:visible .played-check .completed-toggle');
    await expect(buttons).toHaveCount(3);
    const geometry = await buttons.evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      const parent = element.parentElement!.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right, parentLeft: parent.left, parentRight: parent.right };
    }));
    for (const bounds of geometry) {
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.left).toBeGreaterThanOrEqual(bounds.parentLeft);
      expect(bounds.right).toBeLessThanOrEqual(bounds.parentRight + .5);
      expect(bounds.right).toBeLessThanOrEqual(320);
    }
    const before = await readLibrary(page);
    const first = libraryRecords[0];
    const toggle = page.getByRole('button', { name: `Mark ${first.title} completed`, exact: true });
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await toggle.press('Space');
    await expect(page.getByRole('button', { name: `Unmark ${first.title} completed`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    const after = await readLibrary(page);
    expect(after.progress[first.id]).toEqual({ ...before.progress[first.id], played: true, completed: true });
    expect(after.records).toEqual(before.records);
    expect(after.queueOrder).toEqual(before.queueOrder);
    expect(after.ranking).toEqual(before.ranking);
    await expectReadableSurface(page, 'Ranking after completion', true);
  });
}

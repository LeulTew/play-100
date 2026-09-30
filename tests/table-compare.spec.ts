import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

// Whether each visible row's Your list cell lies whole inside the table's scrollport and is drawn at both inner edges,
// and whether the first row's pin is the control drawn at its centre. The scrollport is the padding box, not
// `clientWidth`: `scrollbar-gutter: stable` keeps a scrollbar's width out of clientWidth even where none is drawn
// (headless Chromium hides scrollbars). That empty gutter stays visible, and the frozen cell then reaches the padding
// edge. Where a scrollbar is drawn, it covers the gutter, and a cell under it fails the edge hit test.
async function yourListInView(page: Page) {
  // Bring the first rows below the sticky header by scrolling the page only; the table keeps its own scroll.
  await page
    .locator('.ratings-table tbody tr')
    .first()
    .evaluate((row) => window.scrollBy({ top: row.getBoundingClientRect().top - 300, behavior: 'instant' }));
  return page.locator('.ratings-scroll').evaluate((port) => {
    const bounds = port.getBoundingClientRect();
    const style = getComputedStyle(port);
    const left = bounds.left + parseFloat(style.borderLeftWidth);
    const right = bounds.right - parseFloat(style.borderRightWidth);
    const rows = Array.from(port.querySelectorAll('.ratings-table tr')).slice(0, 4);
    const pin = port.querySelector<HTMLElement>('tbody tr .table-progress button[aria-label*="comparison:"]')!;
    const box = pin.getBoundingClientRect();
    return {
      whole: rows.every((row) => {
        const cell = row.lastElementChild!;
        const rect = cell.getBoundingClientRect();
        const middle = rect.top + rect.height / 2;
        return (
          rect.left >= left - 0.5 &&
          rect.right <= right + 0.5 &&
          [rect.left + 1, rect.right - 1].every((x) => cell.contains(document.elementFromPoint(x, middle)))
        );
      }),
      pinOnTop: pin.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
    };
  });
}

// Whether a control is the element drawn at its own centre, not something painted over it.
function drawnAtCentre(control: Element) {
  const box = control.getBoundingClientRect();
  return control.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
}

async function openTable(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installGuestLibrary(page, libraryFixture(0));
  await page.goto('/?view=table&catalogs=off');
  // The deferred table's hidden fallback frame renders the same rows first; measure the table that replaces it.
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('.ratings-table tbody tr')).toHaveCount(24);
  await page.evaluate(() => document.fonts.ready);
  return page.locator('.ratings-scroll');
}

test('at 1440px the table fits its scrollport, and with selection its Your list column stays whole', async ({
  page,
}) => {
  const port = await openTable(page, 1440);
  expect(await port.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await yourListInView(page)).toEqual({ whole: true, pinOnTop: true });
  const pin = page.locator('.ratings-table tbody tr').first().locator('.compare-pin');
  const title = libraryRecords[0].title;
  await expect(pin).toHaveAccessibleName(`Pin for comparison: ${title}`);
  await expect(pin).toHaveText('');
  const pinBox = await pin.boundingBox();
  if (!pinBox) throw new Error('The compact table Pin must have a visible target.');
  expect(pinBox.width).toBe(44);
  expect(pinBox.height).toBe(44);
  await pin.focus();
  await pin.press('Enter');
  await expect(pin).toHaveAccessibleName(`Pinned for comparison: ${title}`);
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(pin).toBeFocused();
  await expect(pin).toHaveText('');
  expect(await port.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  // The selection column widens every row; any scores it pushes past the window scroll beneath Your list.
  await page.getByRole('button', { name: 'Select multiple games', exact: true }).click();
  await expect(page.locator('.ratings-table tbody .selection-column')).toHaveCount(24);
  expect(await yourListInView(page)).toEqual({ whole: true, pinOnTop: true });
  const selectionOverflow = await port.evaluate((element) => element.scrollWidth - element.clientWidth);
  const selectedPinBox = await pin.boundingBox();
  expect(selectedPinBox?.width).toBe(pinBox.width);
  expect(selectedPinBox?.height).toBe(pinBox.height);
  await pin.focus();
  await pin.press('Enter');
  await expect(pin).toHaveAccessibleName(`Pin for comparison: ${title}`);
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await expect(pin).toBeFocused();
  expect(await port.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(selectionOverflow);
  expect(await yourListInView(page)).toEqual({ whole: true, pinOnTop: true });
});

test('at 1280px the scores scroll beneath a Your list column that is never cut', async ({ page }) => {
  const port = await openTable(page, 1280);
  const overflow = await port.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeGreaterThan(1);
  for (const scroll of [0, Math.round(overflow / 2), overflow]) {
    await port.evaluate((element, left) => {
      element.scrollLeft = left;
    }, scroll);
    expect(await yourListInView(page), `scrollLeft ${scroll}`).toEqual({ whole: true, pinOnTop: true });
  }
});

for (const width of [1024, 1280]) {
  test(`at ${width}px keyboard focus moves each score heading out from under the frozen columns`, async ({ page }) => {
    await openTable(page, width);
    const headings = page.locator('.ratings-table thead th:not(.table-rank, .table-game) .table-sort');
    await expect(headings).toHaveCount(8);
    // The focused heading becomes the control drawn at its own centre, not a frozen cell painted over it.
    const expectDrawn = async (index: number) => {
      const heading = headings.nth(index);
      await expect(heading).toBeFocused();
      await expect.poll(() => heading.evaluate(drawnAtCentre), { message: `score heading ${index + 1}` }).toBe(true);
    };
    await page.locator('.ratings-table thead .table-game .table-sort').focus();
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab');
      await expectDrawn(index);
    }
    // Shift+Tab returns along the same headings, now from the right, clear of Rank and Game.
    for (let index = 6; index >= 0; index--) {
      await page.keyboard.press('Shift+Tab');
      await expectDrawn(index);
    }
  });
}

test('a confirmation a table row opens leaves the table where it was', async ({ page }) => {
  // Below 1024px Your list scrolls with the scores, so the row's own controls take part in focus scrolling.
  const port = await openTable(page, 900);
  const row = page.locator('.ratings-table tbody tr').first();
  const played = row.getByRole('checkbox', { name: /^Played: / });
  const completed = row.getByRole('button', { name: /^Completed: / });
  await played.click();
  await expect(played).toBeChecked();
  await expect(played).not.toHaveAttribute('aria-disabled', 'true');
  await completed.click();
  await expect(completed).toHaveAttribute('aria-pressed', 'true');
  await expect(played).not.toHaveAttribute('aria-disabled', 'true');
  await played.scrollIntoViewIfNeeded();
  const before = await port.evaluate((element) => element.scrollLeft);
  const nextFrames = () =>
    page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await played.click();
  const confirmation = page.getByRole('dialog', { name: /^Mark .+ not played\?$/ });
  await expect(confirmation.getByRole('button', { name: 'Keep completed', exact: true })).toBeFocused();
  await nextFrames();
  expect(await port.evaluate((element) => element.scrollLeft)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(played).toBeFocused();
  await nextFrames();
  expect(await port.evaluate((element) => element.scrollLeft)).toBe(before);
  await expect(played).toBeChecked();
});

test('table rows expose the same bounded metadata-only comparison path', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installGuestLibrary(page, libraryFixture(0));
  await page.goto('/?view=table&catalogs=off');
  await expect(page.locator('.ratings-table tbody tr')).toHaveCount(24);
  await expect(page.locator('.table-progress button[aria-label^="Pin "]')).toHaveCount(24);
  const before = await readLibrary(page);
  for (const record of libraryRecords.slice(0, 7)) {
    const pin = page
      .locator('.ratings-table')
      .getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true });
    await pin.click();
  }
  await expect(page.locator('.compare-tray-dock')).toContainText('6 games');
  await expect(page.locator('.compare-tray-dock .compare-tray-error')).toContainText('six games');
  const remove = page
    .locator('.ratings-table')
    .getByRole('button', { name: `Pinned for comparison: ${libraryRecords[0].title}`, exact: true });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await remove.focus();
  await remove.press('Enter');
  await expect(page.locator('.compare-tray-error')).toHaveCount(0);
  await expect(page.locator('.compare-tray-dock')).toContainText('5 games');
  await page
    .locator('.ratings-table')
    .getByRole('button', { name: `Pin for comparison: ${libraryRecords[6].title}`, exact: true })
    .click();
  await expect(page.locator('.compare-tray-dock')).toContainText('6 games');
  expect(await readLibrary(page)).toEqual(before);
});

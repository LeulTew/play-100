import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { canonicalCatalogId } from '../src/lib/catalog-identity';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { emptyCatalogs } from './catalog-helpers';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { openMenu } from './readability-helpers';

const catalog = parseDiscoveryCatalog(
  JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')),
);
const provider = catalog.items.find(
  (item) => item.artwork && item.artwork.credit.length > 200 && canonicalCatalogId(item.record.id) === item.record.id,
);
if (!provider) throw new Error('Close reachability requires the existing long-credit local catalog fixture.');
const providerRecord = provider.record;

async function prepare(page: Page, mode: 'full' | 'lite' | 'reduced' = 'reduced') {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
  const state = libraryFixture(0);
  state.motion = mode === 'lite' ? 'lite' : 'full';
  await installGuestLibrary(page, state);
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expect(page.locator('html')).toHaveAttribute('data-motion', mode === 'full' ? 'on' : 'off');
  await page.evaluate(() => document.fonts.ready);
}

async function expectReachableClose(dialog: Locator) {
  const close = dialog.getByRole('button', { name: 'Close dialog', exact: true });
  await expect(close).toHaveCount(1);
  await expect
    .poll(() =>
      close.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
          nativeModal: button.closest('dialog')?.matches(':modal') === true,
          target: rect.width >= 44 && rect.height >= 44,
          inside: rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth,
          hit: hit !== null && button.contains(hit),
        };
      }),
    )
    .toEqual({ nativeModal: true, target: true, inside: true, hit: true });
  return close;
}

async function scrollToEnd(dialog: Locator) {
  expect(await dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(1);
  await dialog.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await expect
    .poll(() =>
      dialog.evaluate(
        (element) =>
          element.scrollTop > 0 && Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 1,
      ),
    )
    .toBe(true);
}

async function closeFromEnd(page: Page, dialog: Locator, opener: Locator) {
  await scrollToEnd(dialog);
  const close = await expectReachableClose(dialog);
  const position = await dialog.evaluate((element) => element.scrollTop);
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect(position).toBeGreaterThan(0);
}

for (const game of [
  { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2' },
  { id: 'resident-evil-requiem', title: 'Resident Evil Requiem' },
]) {
  for (const mode of ['full', 'lite', 'reduced'] as const) {
    test(`mobile ${game.title}: Close remains reachable at the bottom in ${mode}`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'Mobile close rail; desktop placement has a separate unchanged-position check.');
      await prepare(page, mode);
      await page.goto(`/?q=${encodeURIComponent(game.title)}&catalogs=off`);
      const opener = page.locator(`.game-card[data-game="${game.id}"] .game-link`);
      await opener.focus();
      await opener.press('Enter');
      const dialog = page.getByRole('dialog', { name: game.title, exact: true });
      await expect(dialog.locator('#game-title')).toBeFocused();
      await expect(dialog).toHaveAttribute('data-motion-owned', 'true');
      const clearance = await dialog.evaluate((element) => {
        const rail = element.querySelector('.dialog-close-rail');
        const content = element.querySelector('.detail-top');
        if (!rail || !content) throw new Error('The close rail and detail content must both be present.');
        const bounds = rail.getBoundingClientRect();
        return {
          railHeight: bounds.height,
          contentTop: content.getBoundingClientRect().top,
          railBottom: bounds.bottom,
          scrollPadding: parseFloat(getComputedStyle(element).scrollPaddingTop),
          topPadding: parseFloat(getComputedStyle(rail).paddingTop),
        };
      });
      expect(clearance.contentTop).toBeGreaterThanOrEqual(clearance.railBottom);
      expect(clearance.scrollPadding).toBeGreaterThanOrEqual(clearance.railHeight);
      expect(clearance.topPadding).toBeGreaterThanOrEqual(8);
      await page.keyboard.press('Shift+Tab');
      const close = dialog.getByRole('button', { name: 'Close dialog', exact: true });
      await expect(close).toBeFocused();
      const outline = await close.evaluate((element) => ({
        style: getComputedStyle(element).outlineStyle,
        width: parseFloat(getComputedStyle(element).outlineWidth),
      }));
      expect(outline.style).toBe('solid');
      expect(outline.width).toBeGreaterThanOrEqual(2);
      const rating = dialog.getByRole('spinbutton');
      await rating.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await rating.focus();
      const focusClearance = await rating.evaluate((element) => {
        const rail = element.closest('dialog')?.querySelector('.dialog-close-rail');
        if (!rail) throw new Error('The focused editor must share the close rail scrollport.');
        return element.getBoundingClientRect().top - rail.getBoundingClientRect().bottom;
      });
      expect(focusClearance).toBeGreaterThanOrEqual(0);
      await closeFromEnd(page, dialog, opener);
      expect(new URL(page.url()).searchParams.has('game')).toBe(false);
    });
  }
}

test('mobile provider detail keeps Close reachable after expanding the complete artwork credit', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile long-dialog reachability.');
  await prepare(page);
  await page.goto(`/discover?catalogs=off&q=${encodeURIComponent(providerRecord.title)}`);
  const opener = page.locator('.discovery-card h3').getByRole('button', { name: providerRecord.title, exact: true });
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.locator('.catalog-detail-dialog[open]');
  await expect(dialog.locator('#catalog-game-title')).toBeFocused();
  await dialog.locator('.catalog-detail-art-credits summary').click();
  await expect(dialog.locator('.catalog-detail-art-credits details')).toHaveAttribute('open', '');
  await closeFromEnd(page, dialog, opener);
});

for (const panel of [
  { action: 'Settings & backups', title: '#settings-title', content: '.backup-panel' },
  { action: 'About & credits', title: '#about-title', content: '.credits' },
]) {
  test(`mobile ${panel.action} keeps Close reachable through its long content`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile utility dialog scrollport.');
    await prepare(page);
    const opener = page.getByRole('button', { name: 'Menu', exact: true });
    await openMenu(page);
    await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: panel.action }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.locator(panel.title)).toBeFocused();
    await expect(dialog.locator(panel.content)).toBeVisible();
    await closeFromEnd(page, dialog, opener);
  });
}

test('mobile Compare tray keeps both close and sheet actions reachable in a short viewport', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile bottom-sheet close and scroll clearance.');
  await page.setViewportSize({ width: 393, height: 640 });
  await prepare(page);
  for (const record of libraryRecords.slice(0, 6)) {
    await page.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true }).click();
  }
  const opener = page.locator('.compare-tray-expand');
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Compare tray', exact: true });
  await expect(dialog.locator('[data-autofocus]')).toBeFocused();
  await scrollToEnd(dialog);
  const close = await expectReachableClose(dialog);
  const sheet = await dialog.boundingBox();
  const actions = await dialog.locator('.compare-tray-sheet-actions').boundingBox();
  const rail = await dialog.locator('.dialog-close-rail').boundingBox();
  if (!sheet || !actions || !rail) throw new Error('The sheet and both tray rails must be laid out.');
  expect(sheet.x).toBeCloseTo(0, 1);
  expect(sheet.width).toBeCloseTo(393, 1);
  expect(sheet.y + sheet.height).toBeCloseTo(640, 1);
  expect(actions.y).toBeGreaterThanOrEqual(rail.y + rail.height);
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('mobile Menu retains its existing non-scrolling heading and Close while its directory scrolls', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Menu already has its own mobile scrollport.');
  await prepare(page);
  const opener = page.getByRole('button', { name: 'Menu', exact: true });
  await openMenu(page);
  const dialog = page.getByRole('dialog', { name: 'Menu', exact: true });
  const close = await expectReachableClose(dialog);
  const before = await close.boundingBox();
  if (!before) throw new Error('Menu Close must be laid out.');
  const scroller = dialog.locator('.menu-scroll');
  await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectReachableClose(dialog);
  const after = await close.boundingBox();
  if (!after) throw new Error('Menu Close must remain laid out.');
  expect(after).toEqual(before);
  await expect(dialog.locator('.dialog-close-rail')).toHaveCSS('display', 'contents');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('desktop original detail preserves the existing absolute Close offsets and browser Back', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop geometry remains unchanged by the mobile close rail.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  const opener = page.locator('.game-card[data-game="red-dead-redemption-2"] .game-link');
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.locator('.game-dialog[open]');
  await expect(dialog.locator('#game-title')).toBeFocused();
  const geometry = await dialog.evaluate((element) => {
    const inner = element.querySelector('.dialog-inner');
    const close = element.querySelector<HTMLElement>('.dialog-close');
    const rail = element.querySelector('.dialog-close-rail');
    if (!inner || !close || !rail) throw new Error('The native close layout must be present.');
    const frame = inner.getBoundingClientRect();
    const button = close.getBoundingClientRect();
    return {
      top: button.top - frame.top,
      right: frame.right - button.right,
      width: button.width,
      height: button.height,
      position: getComputedStyle(close).position,
      railDisplay: getComputedStyle(rail).display,
      sameContainingBlock: close.offsetParent === inner,
    };
  });
  expect(geometry).toEqual({
    top: 17,
    right: 21,
    width: 44,
    height: 44,
    position: 'absolute',
    railDisplay: 'contents',
    sameContainingBlock: true,
  });
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

for (const mode of ['full', 'lite', 'reduced'] as const) {
  test(`short landscape keeps game, Menu and Settings Close reachable in ${mode}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Rotated-phone viewport; normal desktop offsets are checked separately.');
    await page.setViewportSize({ width: 851, height: 393 });
    await prepare(page, mode);
    expect(
      await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        coarse: matchMedia('(pointer: coarse)').matches,
      })),
    ).toEqual({ width: 851, height: 393, coarse: true });

    const gameLink = page.locator('.game-card[data-game="red-dead-redemption-2"] .game-link');
    await gameLink.focus();
    await gameLink.press('Enter');
    const detail = page.locator('.game-dialog[open]');
    await expect(detail.locator('#game-title')).toBeFocused();
    await expect(detail.locator('.dialog-close-rail')).toHaveCSS('position', 'sticky');
    await closeFromEnd(page, detail, gameLink);

    const menuOpener = page.getByRole('button', { name: 'Menu', exact: true });
    await openMenu(page);
    const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
    const close = await expectReachableClose(menu);
    // Full motion is still settling the Menu's entrance; measure its resting position.
    await menu.evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((item) => item.finished)),
    );
    const before = await close.boundingBox();
    if (!before) throw new Error('Landscape Menu Close must be laid out.');
    const scroller = menu.locator('.menu-scroll');
    await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expectReachableClose(menu);
    expect(await close.boundingBox()).toEqual(before);
    await expect(menu.locator('.dialog-close-rail')).toHaveCSS('display', 'contents');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(menuOpener).toBeFocused();

    await openMenu(page);
    await page
      .getByRole('dialog', { name: 'Menu', exact: true })
      .getByRole('button', { name: 'Settings & backups', exact: true })
      .click();
    const settings = page.locator('.settings-dialog[open]');
    await expect(settings.locator('#settings-title')).toBeFocused();
    await expect(settings.getByRole('heading', { name: 'Backups', exact: true })).toBeVisible();
    await expect(settings.locator('.dialog-close-rail')).toHaveCSS('position', 'sticky');
    await closeFromEnd(page, settings, menuOpener);
  });
}

import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 320, height: 568 },
  { width: 851, height: 393 },
]) {
  test(`table pin keeps tray and next action clear at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await emptyCatalogs(page);
    await page.goto('/?view=table&catalogs=off');
    const rows = page.locator('.ratings-table tbody > tr');
    await expect(rows).toHaveCount(24);
    await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
    const first = rows.nth(0).getByRole('button', { name: /^(Pin for|Unpin from) comparison:/ });
    const second = rows.nth(1).getByRole('button', { name: /^(Pin for|Unpin from) comparison:/ });
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    const tray = page.locator('.ratings-tray-strip .compare-tray-dock');
    await expect(page.locator('.compare-tray-dock')).toHaveCount(1);
    await expect(tray).toHaveAttribute('data-layout', 'inline');
    await expect
      .poll(() =>
        tray.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const header = document.querySelector('.site-header')?.getBoundingClientRect();
          const navigation = document.querySelector('.mobile-nav')?.getBoundingClientRect();
          const table = element.closest('.ratings-mode')?.querySelector('.ratings-scroll')?.getBoundingClientRect();
          return {
            inside:
              bounds.top >= (header?.bottom ?? 0) &&
              bounds.left >= 0 &&
              bounds.right <= innerWidth &&
              bounds.bottom <= (navigation?.height ? navigation.top : innerHeight),
            belowTable: table !== undefined && table.bottom <= bounds.top,
          };
        }),
      )
      .toEqual({ inside: true, belowTable: true });
    // This must succeed before Playwright can scroll or wait for an obscuring dock to move.
    expect(
      await second.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return element.contains(hit);
      }),
    ).toBe(true);
    await second.click();
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect(tray.locator('.compare-tray-expand')).toContainText('2 games');
    const pins = await page.evaluate(() => {
      const raw = localStorage.getItem('play100:compare-tray:v1:guest');
      if (!raw) throw new Error('Accepted table pins must be stored in the guest tray.');
      return JSON.parse(raw).items.map((record: { id: string }) => record.id);
    });
    expect(pins).toEqual(libraryRecords.slice(0, 2).map((record) => record.id));
  });
}

for (const viewport of [
  { width: 393, height: 851 },
  { width: 1440, height: 900 },
]) {
  test(`table save toast clears the inline strip throughout its entrance at ${viewport.width}px`, async ({
    page,
    isMobile,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await emptyCatalogs(page);
    const library = libraryFixture(0);
    library.motion = 'full';
    await installGuestLibrary(page, library);
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    for (const record of libraryRecords.slice(0, 2)) {
      await page.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Ratings table view', exact: true }).click();
    const scrollport = page.locator('.ratings-scroll');
    const tray = page.locator('.ratings-tray-strip .compare-tray-dock');
    await expect(tray).toHaveAttribute('data-layout', 'inline');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
    await expect(page.locator('.toast-visible')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await scrollport.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    const later = page
      .locator('.ratings-table tbody tr')
      .first()
      .getByRole('button', { name: `Play later: ${libraryRecords[0].title}`, exact: true });
    await later.scrollIntoViewIfNeeded();
    await expect(later).toHaveAttribute('aria-pressed', 'false');
    const before = await scrollport.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      horizontal: element.scrollLeft,
      tray: document.querySelector('.ratings-tray-strip .compare-tray-dock')!.getBoundingClientRect().toJSON(),
    }));
    if (viewport.width === 393) expect(before.horizontal).toBeGreaterThan(0);
    const observation = await page.evaluateHandle(() => {
      const toast = document.querySelector<HTMLElement>('.toast');
      const tray = document.querySelector<HTMLElement>('.ratings-tray-strip .compare-tray-dock');
      const table = document.querySelector<HTMLElement>('.ratings-scroll');
      if (!toast || !tray || !table) throw new Error('The table, inline strip and notification must be mounted.');
      const samples: Array<{ intersects: boolean; running: boolean; translated: boolean; tableHeight: number }> = [];
      let frame = 0;
      const finished = new Promise<typeof samples>((resolve, reject) => {
        const sample = () => {
          if (!toast.classList.contains('toast-visible')) {
            if (samples.length) {
              reject(new Error('The save notification disappeared before its entrance finished.'));
              return;
            }
          } else {
            const notice = toast.getBoundingClientRect();
            const strip = tray.getBoundingClientRect();
            const running = toast.getAnimations().some((animation) => animation.playState === 'running');
            samples.push({
              intersects:
                notice.left < strip.right &&
                notice.right > strip.left &&
                notice.top < strip.bottom &&
                notice.bottom > strip.top,
              running,
              translated: new DOMMatrixReadOnly(getComputedStyle(toast).transform).m42 > 0,
              tableHeight: table.getBoundingClientRect().height,
            });
            if (!running && samples.length > 1) {
              resolve(samples);
              return;
            }
          }
          frame = requestAnimationFrame(sample);
        };
        frame = requestAnimationFrame(sample);
      });
      return { finished, stop: () => cancelAnimationFrame(frame) };
    });
    try {
      if (isMobile) await later.tap();
      else await later.click();
      await expect(page.locator('.toast-visible')).toContainText('Your library is updated.');
      const samples = await observation.evaluate((probe) => probe.finished);
      expect(samples.some((sample) => sample.running && sample.translated)).toBe(true);
      expect(
        samples.every((sample) => !sample.intersects),
        JSON.stringify(samples),
      ).toBe(true);
      if (viewport.width === 1440) {
        expect(samples.every((sample) => Math.abs(sample.tableHeight - before.height) <= 1)).toBe(true);
        expect(await tray.evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(before.tray);
      }
      await expect(later).toHaveAttribute('aria-pressed', 'true');
      expect((await readLibrary(page)).progress[libraryRecords[0].id]?.later).toBe(true);
      expect(await tray.evaluate((element) => element.closest('.ratings-scroll'))).toBeNull();
      await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
      await expect(page.locator('.toast-visible')).toHaveCount(0);
      expect(await scrollport.evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(
        before.height,
        1,
      );
    } finally {
      await observation.evaluate((probe) => probe.stop());
      await observation.dispose();
    }
  });
}

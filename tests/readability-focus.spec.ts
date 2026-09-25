import { expect, test } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import {
  closeDialog,
  expectReadableSurface,
  openMenu,
  stubClipboardShare,
  textSpacingCSS,
} from './readability-helpers';

for (const mode of ['full', 'lite', 'reduced'] as const) {
  for (const width of [320, 393]) {
    test(`text spacing keeps live toast, dock and native focus clear at ${width}px ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 852 });
      await page.emulateMedia({ reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
      await stubClipboardShare(page);
      const fixture = libraryFixture(3);
      fixture.motion = mode === 'lite' ? 'full' : 'lite';
      await installGuestLibrary(page, fixture);
      await page.goto('/?catalogs=off');
      await expect(page.locator('.game-card')).toHaveCount(24);
      await page
        .locator('.game-card')
        .first()
        .getByRole('button', { name: `Pin for comparison: ${libraryRecords[0].title}`, exact: true })
        .click();
      await page.evaluate(() => document.fonts.ready);
      const normal = await page.locator('.mobile-nav').evaluate((element) => ({
        nav: element.getBoundingClientRect().height,
        gap:
          element.getBoundingClientRect().top -
          document.querySelector('.compare-tray-dock')!.getBoundingClientRect().bottom,
      }));
      expect(normal.nav).toBe(66);
      expect(normal.gap).toBe(12);
      await page.addStyleTag({ content: textSpacingCSS });
      await openMenu(page);
      await page
        .getByRole('dialog', { name: 'Menu', exact: true })
        .getByRole('button', { name: 'Settings & backups', exact: true })
        .click();
      const settings = page.locator('.settings-dialog');
      await expect(settings.locator('#settings-title')).toBeFocused();
      const preference = settings.getByRole('radio', { name: mode === 'lite' ? /^Lite/ : /^Full/ });
      await preference.click();
      await expect(preference).toBeChecked();
      await expect(page.locator('html')).toHaveAttribute('data-motion', mode === 'full' ? 'on' : 'off');
      // Settings announces its own saves inside the modal; the page toast comes from sharing this view.
      await expect(settings.getByRole('status').filter({ hasText: 'Visual preference saved.' })).toBeVisible();
      await expect(page.locator('.toast-visible')).toHaveCount(0);
      await closeDialog(page);
      await page.getByRole('button', { name: 'Share this view', exact: true }).click();
      await expect(page.locator('.toast-visible')).toContainText('Link copied.');
      const started = Date.now();
      const live = await page.evaluate(() => {
        const dock = document.querySelector('.compare-tray-dock')!;
        const action = dock.querySelector('.compare-tray-action')!;
        const nav = document.querySelector('.mobile-nav')!;
        const toast = document.querySelector('.toast')!;
        const dismiss = toast.querySelector('button')!;
        const hit = (element: Element) => {
          const bounds = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        };
        return {
          visible: toast.classList.contains('toast-visible'),
          navHeight: nav.getBoundingClientRect().height,
          gap: nav.getBoundingClientRect().top - dock.getBoundingClientRect().bottom,
          toastBottom: toast.getBoundingClientRect().bottom,
          dockTop: dock.getBoundingClientRect().top,
          compareHit: hit(action),
          dismissHit: hit(dismiss),
          padding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
          occupied: innerHeight - toast.getBoundingClientRect().top,
        };
      });
      expect(Date.now() - started).toBeLessThan(4000);
      expect(live.visible).toBe(true);
      expect(live.navHeight).toBeGreaterThanOrEqual(66);
      expect(live.gap).toBe(12);
      expect(live.toastBottom).toBeLessThanOrEqual(live.dockTop - 8);
      expect(live.compareHit).toBe(true);
      expect(live.dismissHit).toBe(true);
      expect(live.padding).toBeGreaterThan(live.occupied);
      // Native Tab must reveal a card action above the still-active overlays.
      const link = page.locator('.game-card .game-link').nth(8);
      await link.focus();
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const element = document.activeElement!;
        const bounds = element.getBoundingClientRect();
        const toast = document.querySelector('.toast')!;
        return {
          inCard: Boolean(element.closest('.game-card')),
          visibleToast: toast.classList.contains('toast-visible'),
          top: bounds.top,
          bottom: bounds.bottom,
          headerBottom: document.querySelector('.site-header')!.getBoundingClientRect().bottom,
          toastTop: toast.getBoundingClientRect().top,
          hit: element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)),
        };
      });
      expect(Date.now() - started).toBeLessThan(4000);
      expect(focus.inCard).toBe(true);
      expect(focus.visibleToast).toBe(true);
      expect(focus.top).toBeGreaterThanOrEqual(focus.headerBottom);
      expect(focus.bottom).toBeLessThanOrEqual(focus.toastTop);
      expect(focus.hit).toBe(true);
      await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
      await expect(page.locator('.toast-visible')).toHaveCount(0);
      await expectReadableSurface(page, `${width}px ${mode} after notification dismissal`, true);
      await page.locator('.compare-tray-expand').click();
      await page
        .getByRole('dialog', { name: 'Compare tray', exact: true })
        .getByRole('button', { name: 'Clear all', exact: true })
        .click();
      await closeDialog(page);
      await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--compare-tray-height'))).toBe(
        '',
      );
      expect(
        await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom)),
      ).toBeGreaterThanOrEqual(
        await page.locator('.mobile-nav').evaluate((element) => element.getBoundingClientRect().height),
      );
    });
  }
}

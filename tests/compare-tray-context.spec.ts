import { expect, test } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';
import { closeDialog } from './readability-helpers';
import { emptyCatalogs } from './catalog-helpers';

const browsingTargets =
  ':is(.game-card, .discovery-card, .personal-row-static) :is(h3, button, a[href], input, select, textarea, summary)';

for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 393, height: 851 },
  { width: 768, height: 1024 },
  { width: 851, height: 393 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
]) {
  for (const route of [
    { url: '/?catalogs=off', rows: '.game-card' },
    { url: '/discover?catalogs=off', rows: '.discovery-cards > .discovery-card' },
    { url: '/my-games?tab=library&catalogs=off', rows: '.personal-row-static' },
  ]) {
    test(`Compare stays outside browsing at ${viewport.width}x${viewport.height} on ${route.url}`, async ({
      page,
      isMobile,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await emptyCatalogs(page);
      await installGuestLibrary(page, libraryFixture(100));
      await page.evaluate(
        (items) => {
          localStorage.setItem('play100:compare-tray:v1:guest', JSON.stringify({ version: 1, scope: 'guest', items }));
        },
        libraryRecords.slice(0, 3),
      );
      await page.goto(route.url);
      const rows = page.locator(route.rows);
      await expect(rows).toHaveCount(route.url.startsWith('/my-games') ? 25 : 24);
      await page.evaluate(() => document.fonts.ready);
      const chip = page.getByRole('button', { name: '3 games in Compare tray', exact: true });
      await expect(chip).toBeVisible();
      const before = await readLibrary(page);
      for (const index of [0, 12, 23]) {
        await rows.nth(index).evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
        );
        const geometry = await page.evaluate((selector) => {
          const dock = document.querySelector('.compare-tray-dock')!.getBoundingClientRect();
          const header = document.querySelector('.site-header')!.getBoundingClientRect();
          const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
          const floor = nav.height ? nav.top : innerHeight;
          const intersects = (box: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>) =>
            box.left < dock.right && box.right > dock.left && box.top < dock.bottom && box.bottom > dock.top;
          const visible = [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (element) =>
              !element.closest('[hidden], [inert], dialog:not([open]), .sr-only') &&
              element.checkVisibility({ checkVisibilityCSS: true }),
          );
          // The existing header/nav bands are not browsing space. Compare may share that band, never its links.
          const painted = visible
            .map((element) => {
              const box = element.getBoundingClientRect();
              return {
                name: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 90),
                left: Math.max(0, box.left),
                right: Math.min(innerWidth, box.right),
                top: Math.max(header.bottom, box.top),
                bottom: Math.min(floor, box.bottom),
              };
            })
            .filter((box) => box.right > box.left && box.bottom > box.top);
          return {
            inspected: painted.length,
            collisions: painted.filter(intersects),
            navigationCollisions: [...document.querySelectorAll('.mobile-nav > *')]
              .filter((element) => element.checkVisibility())
              .map((element) => element.getBoundingClientRect())
              .filter(intersects).length,
            headerCollisions: [...document.querySelectorAll('.site-header :is(a, button)')]
              .filter((element) => !element.closest('.compare-tray-anchor') && element.checkVisibility())
              .map((element) => element.getBoundingClientRect())
              .filter(intersects).length,
            chipFits:
              dock.left >= 0 &&
              dock.right <= innerWidth &&
              dock.bottom <= innerHeight &&
              (nav.height ? dock.top >= header.bottom : dock.top >= header.top && dock.bottom <= header.bottom),
            sharesNavBand: !nav.height || dock.top >= nav.top,
            overflow: document.documentElement.scrollWidth > innerWidth,
            padding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
            navHeight: nav.height,
          };
        }, browsingTargets);
        expect(geometry.inspected).toBeGreaterThan(0);
        expect(geometry.collisions).toEqual([]);
        expect(geometry.navigationCollisions).toBe(0);
        expect(geometry.headerCollisions).toBe(0);
        expect(geometry.chipFits).toBe(true);
        expect(geometry.sharesNavBand).toBe(true);
        expect(geometry.overflow).toBe(false);
        expect(geometry.padding).toBeGreaterThanOrEqual(geometry.navHeight);

        const controls = page.locator(browsingTargets).filter({ visible: true });
        const first = await controls.evaluateAll((elements) => {
          const top = document.querySelector('.site-header')!.getBoundingClientRect().bottom;
          const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
          return elements.findIndex((element) => {
            const box = element.getBoundingClientRect();
            return (
              element.matches('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary') &&
              !element.closest('[aria-hidden="true"]') &&
              box.top >= top &&
              box.bottom <= (nav.height ? nav.top : innerHeight)
            );
          });
        });
        expect(first).toBeGreaterThanOrEqual(0);
        await controls.nth(first).focus();
        let checkedFocus = 0;
        for (let step = 0; step < 6; step++) {
          const focused = await page.evaluate(() => {
            const target = document.activeElement;
            if (!(target instanceof HTMLElement)) throw new Error('A real control must own keyboard focus.');
            const box = target.getBoundingClientRect();
            const dock = document.querySelector('.compare-tray-dock')!.getBoundingClientRect();
            const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
            const header = document.querySelector('.site-header')!.getBoundingClientRect();
            return {
              browsing: Boolean(target.closest('.game-card, .discovery-card, .personal-row-static')),
              name: target.getAttribute('aria-label') || target.textContent?.trim(),
              bounds: box.toJSON(),
              headerBottom: header.bottom,
              floor: nav.height ? nav.top : innerHeight,
              visible:
                box.top >= header.bottom &&
                box.bottom <= (nav.height ? nav.top : innerHeight) &&
                box.left >= 0 &&
                box.right <= innerWidth,
              clear:
                box.right <= dock.left || box.left >= dock.right || box.bottom <= dock.top || box.top >= dock.bottom,
              hit: target.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
            };
          });
          if (!focused.browsing) break;
          expect(focused.visible, JSON.stringify(focused)).toBe(true);
          expect(focused.clear).toBe(true);
          expect(focused.hit).toBe(true);
          checkedFocus += 1;
          await page.keyboard.press('Tab');
        }
        expect(checkedFocus).toBeGreaterThan(0);
      }
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const end = await page.evaluate((rowSelector) => {
        const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
        const last = [...document.querySelectorAll(rowSelector)].at(-1)!.getBoundingClientRect();
        return { last: last.bottom, floor: nav.height ? nav.top : innerHeight };
      }, route.rows);
      expect(end.last).toBeLessThanOrEqual(end.floor);
      if (isMobile) await chip.tap();
      else await chip.click();
      await expect(page.getByRole('dialog', { name: 'Compare tray', exact: true })).toBeVisible();
      await expect(page.locator('.compare-tray-games > li')).toHaveCount(3);
      await closeDialog(page);
      await expect(chip).toBeFocused();
      expect(await readLibrary(page)).toEqual(before);
    });
  }
}

for (const narrow of [false, true]) {
  for (const occupied of [false, true]) {
    for (const activation of ['keyboard', 'pointer'] as const) {
      const title = `table switch keeps ${activation} focus visible with ${occupied ? 'six pins' : 'no pins'}`;
      const viewport = narrow ? '320px' : 'project viewport';
      test(`${title} at ${viewport}`, async ({ page }) => {
        if (narrow) await page.setViewportSize({ width: 320, height: 851 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await installGuestLibrary(page, libraryFixture(0));
        await page.goto('/?catalogs=off&view=list');
        await expect(page.locator('.game-card')).toHaveCount(24);
        if (occupied) {
          for (const record of libraryRecords.slice(0, 6)) {
            await page.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true }).click();
          }
          await expect(page.locator('.compare-tray-expand')).toContainText('6 games');
        }
        const pins = await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'));
        const before = await readLibrary(page);
        const switcher = page.getByRole('button', { name: 'Ratings table view', exact: true });
        if (activation === 'keyboard') {
          await page.getByRole('button', { name: 'List view', exact: true }).focus();
          await page.keyboard.press('Tab');
          await expect(switcher).toBeFocused();
          await page.keyboard.press('Enter');
        } else {
          await switcher.click();
        }
        await expect(page.locator('.ratings-table tbody > tr')).toHaveCount(24);
        await expect(switcher).toHaveAttribute('aria-pressed', 'true');
        await expect(switcher).toBeFocused();
        // Measure before any subsequent Playwright action can scroll the control back into view.
        expect(
          await switcher.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const header = document.querySelector('.site-header')!.getBoundingClientRect();
            const navigation = document.querySelector('.mobile-nav')?.getBoundingClientRect();
            return (
              bounds.top >= header.bottom &&
              bounds.bottom <= (navigation?.height ? navigation.top : innerHeight) &&
              bounds.left >= 0 &&
              bounds.right <= innerWidth &&
              element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
            );
          }),
        ).toBe(true);
        await expect(page.locator('.compare-tray-dock')).toHaveCount(occupied ? 1 : 0);
        if (occupied) {
          const tray = page.locator('.ratings-tray-strip .compare-tray-dock');
          await expect(tray).toHaveAttribute('data-layout', 'inline');
          await tray.locator('.compare-tray-expand').click();
          await expect(page.getByRole('dialog', { name: 'Compare tray', exact: true })).toBeVisible();
          await expect(page.locator('.compare-tray-games > li')).toHaveCount(6);
          await closeDialog(page);
          await expect(tray.locator('.compare-tray-expand')).toBeFocused();
          await expect(tray.locator('.compare-tray-expand')).toBeInViewport({ ratio: 1 });
        }
        expect(await readLibrary(page)).toEqual(before);
        expect(await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'))).toBe(pins);
      });
    }
  }
}

for (const narrow of [false, true]) {
  for (const view of ['List', 'Grid'] as const) {
    for (const activation of ['keyboard', 'pointer'] as const) {
      const viewport = narrow ? '320px' : 'project viewport';
      test(`${activation} return to ${view} view anchors the switch with six pins at ${viewport}`, async ({ page }) => {
        if (narrow) await page.setViewportSize({ width: 320, height: 851 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await installGuestLibrary(page, libraryFixture(0));
        await page.goto('/?catalogs=off&view=list');
        await expect(page.locator('.game-card')).toHaveCount(24);
        for (const record of libraryRecords.slice(0, 6)) {
          await page.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true }).click();
        }
        const pins = await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'));
        const before = await readLibrary(page);
        const tableSwitch = page.getByRole('button', { name: 'Ratings table view', exact: true });
        await tableSwitch.click();
        await expect(page.locator('.ratings-table tbody > tr')).toHaveCount(24);
        await expect(page.locator('section.hero')).toHaveCount(0);
        const switcher = page.getByRole('button', { name: `${view} view`, exact: true });
        if (activation === 'keyboard') {
          await tableSwitch.focus();
          await page.keyboard.press('Shift+Tab');
          if (view === 'Grid') await page.keyboard.press('Shift+Tab');
          await expect(switcher).toBeFocused();
        }
        await switcher.evaluate((element) =>
          window.scrollBy({ top: element.getBoundingClientRect().top - 200, behavior: 'instant' }),
        );
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        const previousTop = await switcher.evaluate((element) => element.getBoundingClientRect().top);
        if (activation === 'keyboard') await page.keyboard.press('Enter');
        else await switcher.click();
        await expect(page.locator('section.hero')).toHaveCount(1);
        await expect(page.locator('.game-card')).toHaveCount(24);
        await expect(switcher).toHaveAttribute('aria-pressed', 'true');
        await expect(switcher).toBeFocused();
        // Nothing after activation may scroll to repair the switch before these measurements.
        const position = await switcher.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const header = document.querySelector('.site-header')!.getBoundingClientRect();
          const navigation = document.querySelector('.mobile-nav')?.getBoundingClientRect();
          return {
            top: bounds.top,
            visible:
              bounds.top >= header.bottom &&
              bounds.bottom <= (navigation?.height ? navigation.top : innerHeight) &&
              bounds.left >= 0 &&
              bounds.right <= innerWidth &&
              element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)),
          };
        });
        expect(position.visible).toBe(true);
        expect(Math.abs(position.top - previousTop)).toBeLessThanOrEqual(1);
        await expect(page.locator('.compare-tray-dock')).toHaveAttribute('data-layout', 'dock');
        expect(await readLibrary(page)).toEqual(before);
        expect(await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'))).toBe(pins);
      });
    }
  }
}

for (const width of [320, 393, 768, 1440]) {
  test(`tray feedback and contextual chip leave page-end actions clear at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installGuestLibrary(page, libraryFixture(0));
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    for (const record of libraryRecords.slice(0, 7)) {
      await page.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true }).click();
    }

    const dock = page.locator('.compare-tray-dock');
    await expect(page.locator('.toast-visible')).toContainText('six games');
    const failedPin = page.getByRole('button', { name: `Pin for comparison: ${libraryRecords[6].title}`, exact: true });
    await expect(failedPin).toBeFocused();
    const failedHit = await failedPin.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    });
    expect(failedHit).toBe(true);
    const action = dock.locator('.compare-tray-expand');
    await expect(action).toBeVisible();
    const errorBounds = await dock.evaluate((element) => {
      const dock = element.getBoundingClientRect();
      const error = document.querySelector('.toast-visible')!.getBoundingClientRect();
      const reserve = document.querySelector('.compare-tray-reserve')!.getBoundingClientRect();
      return {
        errorVisible: error.top >= 0 && error.bottom <= innerHeight,
        clear:
          error.right <= dock.left || error.left >= dock.right || error.bottom <= dock.top || error.top >= dock.bottom,
        reserve: reserve.height,
        occupied: document.querySelector('.mobile-nav')!.getBoundingClientRect().height,
      };
    });
    expect(errorBounds.errorVisible).toBe(true);
    expect(errorBounds.clear).toBe(true);
    expect(errorBounds.reserve).toBeGreaterThanOrEqual(errorBounds.occupied);
    const completed = page
      .locator('.game-card')
      .nth(6)
      .getByRole('button', { name: /completed/i });
    await completed.focus();
    const hit = await completed.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    });
    expect(hit).toBe(true);
    await completed.press('Enter');
    await expect(completed).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
    await expect(page.locator('.toast-visible')).not.toContainText('six games');
    const pins = await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'));
    const before = await readLibrary(page);
    for (const route of [
      '/my-games?tab=queue&catalogs=off',
      '/my-games?tab=library&catalogs=off',
      '/?q=NoMatchContextFixture&catalogs=off',
    ]) {
      await page.goto(route);
      // Measure the rendered page, not the lazy route's loading shell, which has its own heading and height.
      await expect(
        page.locator(route.startsWith('/my-games') ? '#my-games-title' : '.empty-state, .curated-empty'),
      ).toBeVisible();
      await expect(page.locator('.compare-tray-expand')).toBeVisible();
      await expect(page.locator('.compare-tray-action')).toBeHidden();
      await expect(page.locator('.compare-tray-stack')).toBeHidden();
      await expect(page.locator('.compare-tray-expand')).toContainText('Compare tray');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const geometry = await page.evaluate(() => {
        const footer = document.querySelector('.site-footer')!.getBoundingClientRect();
        const button = document.querySelector('.compare-tray-expand')!.getBoundingClientRect();
        const manual = document.querySelector('.manual-add summary')?.getBoundingClientRect();
        const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
        return {
          floor: nav.height ? nav.top : innerHeight,
          footerBottom: footer.bottom,
          manualBottom: manual?.bottom,
          buttonWidth: button.width,
          buttonHeight: button.height,
          width: document.documentElement.scrollWidth,
          viewport: innerWidth,
        };
      });
      expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.floor);
      if (geometry.manualBottom !== undefined) expect(geometry.manualBottom).toBeLessThanOrEqual(geometry.floor);
      expect(geometry.buttonWidth).toBeGreaterThanOrEqual(44);
      expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44);
      expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
      await page.locator('.compare-tray-expand').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Compare tray', exact: true })).toBeVisible();
      await expect(page.locator('.compare-tray-games > li')).toHaveCount(6);
      await closeDialog(page);
      await expect(page.locator('.compare-tray-expand')).toBeFocused();
    }
    expect(await readLibrary(page)).toEqual(before);
    expect(await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:guest'))).toBe(pins);
  });
}

for (const width of [320, 393]) {
  test(`ready sign-in returns to the visible contextual chip at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/*', (route) =>
      ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
        ? route.continue()
        : route.abort('blockedbyclient'),
    );
    await installGuestLibrary(page, libraryFixture(3));
    test.skip(
      (await page.locator('.account-nav').count()) === 0,
      'Requires the centrally configured online build; no remote account requests are allowed.',
    );
    await page.goto('/?catalogs=off');
    await page.getByRole('button', { name: `Pin for comparison: ${libraryRecords[0].title}`, exact: true }).click();
    const before = await readLibrary(page);
    for (const route of ['/my-games?tab=library&catalogs=off', '/?q=NoMatchContextFixture&catalogs=off']) {
      await page.goto(route);
      const chip = page.locator('.compare-tray-expand');
      await expect(chip).toBeVisible();
      await expect(page.locator('.compare-tray-action')).toBeHidden();
      await page.locator('.account-nav').click();
      const signIn = page.getByRole('dialog', { name: 'Sign in', exact: true });
      await expect(signIn.locator('#account-signin-title')).toBeFocused();
      await expect(page.locator('.account-nav')).toHaveAccessibleName('Account Device only');
      await signIn.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await expect(signIn).toHaveCount(0);
      await chip.focus();
      await chip.press('Enter');
      await page
        .getByRole('dialog', { name: 'Compare tray', exact: true })
        .getByRole('button', { name: 'Choose friends', exact: true })
        .click();
      await expect(signIn.locator('#account-signin-title')).toBeFocused();
      await signIn.getByRole('button', { name: 'Keep using this device', exact: true }).click();
      await expect(signIn).toHaveCount(0);
      await expect(chip).toBeFocused();
      expect(
        await chip.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        }),
      ).toBe(true);
    }
    expect(await readLibrary(page)).toEqual(before);
  });
}

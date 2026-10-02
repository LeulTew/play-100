import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PERSONAL_RATING_DEBOUNCE_MS } from '../src/components/personal/PersonalRatingInput';
import { installGuestLibrary, libraryFixture, libraryRecord } from './library-pagination-helpers';
import { holdLibraryWrite, readLibrary } from './library-helpers';
import { withActionCleanup } from './action-cleanup';

const game = libraryRecord(0);

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Loopback only.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } }),
  );
});

async function openRating(page: Page, surface: 'detail' | 'ranking') {
  await installGuestLibrary(page, libraryFixture(3));
  if (surface === 'detail') await page.goto(`/?catalogs=off&game=${game.id}`);
  else
    await page
      .getByRole('navigation', { name: 'My games views' })
      .getByRole('button', { name: /^Ranking,/ })
      .click();
  const scope =
    surface === 'detail'
      ? page.getByRole('dialog', { name: game.title, exact: true })
      : page.getByRole('list', { name: 'Your ranked games', exact: true });
  const rating = scope.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true });
  await expect(rating).not.toHaveAttribute('readonly');
  return rating;
}

for (const surface of ['detail', 'ranking'] as const) {
  for (const event of ['visibilitychange', 'pagehide'] as const) {
    test(`${surface}: ${event} saves a focused draft without waiting for blur or debounce`, async ({ page }) => {
      const rating = await openRating(page, surface);
      await page.clock.install({ time: new Date('2026-10-02T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-02T12:00:10Z'));
      const before = await readLibrary(page);
      const held = await holdLibraryWrite(page);
      await withActionCleanup(async () => {
        await rating.fill('7.25');
        await expect(rating).toBeFocused();
        await page.evaluate((event) => {
          if (event === 'visibilitychange') {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
            document.dispatchEvent(new Event(event));
          } else dispatchEvent(new PageTransitionEvent(event));
        }, event);
        await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
        await expect(rating).toBeFocused();
        expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
        await held.evaluate((probe) => probe.release());
        await expect
          .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score)
          .toBe(7.25);
        await expect(rating).toBeFocused();
        expect((await readLibrary(page)).revision).toBe(before.revision + 1);
      }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
    });
  }

  test(`${surface}: navigation immediately after typing flushes the focused draft`, async ({ page }) => {
    const rating = await openRating(page, surface);
    await page.clock.install({ time: new Date('2026-10-02T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-02T12:00:10Z'));
    const before = await readLibrary(page);
    await rating.fill('7.25');
    await expect(rating).toBeFocused();
    if (surface === 'detail') {
      await page.keyboard.press('Escape');
      await expect(page.locator('.game-dialog')).toHaveCount(0);
    } else {
      await page.locator('.wordmark').evaluate((element: HTMLAnchorElement) => element.click());
      await expect(page).toHaveURL((url) => url.pathname === '/');
    }
    await expect
      .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score)
      .toBe(7.25);
    expect((await readLibrary(page)).revision).toBe(before.revision + 1);
  });

  test(`${surface}: staying after an unsaved close lets the rating save before leaving`, async ({ page, context }) => {
    const rating = await openRating(page, surface);
    const observer = await context.newPage();
    await observer.goto(new URL('/favicon.svg', page.url()).href);
    await page.bringToFront();
    await rating.click();
    await rating.fill('7.25');
    await expect(rating).toBeFocused();
    const warned = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const warning = await warned;
    expect(warning.type()).toBe('beforeunload');
    await warning.dismiss();
    expect(page.isClosed()).toBe(false);
    await expect(rating).toHaveValue('7.25');
    await expect
      .poll(async () => (await readLibrary(observer)).ranking.find((entry) => entry.id === game.id)?.score)
      .toBe(7.25);
    await page.close();
    await expect
      .poll(async () => (await readLibrary(observer)).ranking.find((entry) => entry.id === game.id)?.score)
      .toBe(7.25);
    await observer.close();
  });

  test(`${surface}: a pause between 7 and .5 keeps focus and saves the complete decimal`, async ({
    page,
    isMobile,
  }) => {
    const rating = await openRating(page, surface);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(isMobile);
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const before = await readLibrary(page);
    const held = await holdLibraryWrite(page);
    await withActionCleanup(async () => {
      await rating.fill('7');
      await page.clock.runFor(PERSONAL_RATING_DEBOUNCE_MS - 1);
      expect(await held.evaluate((probe) => probe.state.attempts)).toBe(0);
      await page.clock.runFor(1);
      if (isMobile) {
        await page.clock.runFor(PERSONAL_RATING_DEBOUNCE_MS * 2);
        expect(await held.evaluate((probe) => probe.state.attempts)).toBe(0);
        expect(await readLibrary(page)).toEqual(before);
      } else {
        await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
        await expect(rating).toBeFocused();
        await expect(rating).toHaveAttribute('readonly');
        await expect(rating).toHaveAttribute('aria-disabled', 'true');
        await expect(rating).not.toHaveAttribute('disabled');
        await held.evaluate((probe) => probe.release());
        await expect(rating).not.toHaveAttribute('readonly');
        await expect(rating).toBeFocused();
      }

      await rating.press('End');
      await page.keyboard.type('.5');
      await expect(rating).toHaveValue('7.5');
      await expect(rating).toBeFocused();
      if (isMobile) {
        await page.clock.runFor(PERSONAL_RATING_DEBOUNCE_MS * 2);
        expect(await held.evaluate((probe) => probe.state.attempts)).toBe(0);
        await rating.press('Tab');
        await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
        await held.evaluate((probe) => probe.release());
      } else await page.clock.runFor(PERSONAL_RATING_DEBOUNCE_MS);
      await expect
        .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score)
        .toBe(7.5);
      if (!isMobile) await expect(rating).toBeFocused();
      expect((await readLibrary(page)).revision).toBe(before.revision + (isMobile ? 1 : 2));
    }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
  });

  for (const rejected of [false, true]) {
    test(`${surface}: Enter ${rejected ? 'refusal' : 'save'} preserves the same focused rating field`, async ({
      page,
    }) => {
      const rating = await openRating(page, surface);
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      const before = await readLibrary(page);
      const held = await holdLibraryWrite(page, rejected);
      await withActionCleanup(async () => {
        await rating.fill('7.5');
        const source = await rating.elementHandle();
        if (!source) throw new Error('Missing rating input.');
        try {
          await page.keyboard.press('Enter');
          await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
          await expect(rating).toBeFocused();
          await expect(rating).toHaveAttribute('readonly');
          await expect(rating).not.toHaveAttribute('disabled');
          await page.keyboard.press('Enter');
          expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
          await held.evaluate((probe) => probe.release());
          await expect(rating).not.toHaveAttribute('readonly');
          await expect(rating).toBeFocused();
          expect(await source.evaluate((node) => node === document.activeElement)).toBe(true);
          await expect(rating).toHaveValue('7.5');
          if (rejected) {
            await expect(rating).toHaveAttribute('aria-invalid', 'true');
            expect(await readLibrary(page)).toEqual(before);
          } else
            await expect
              .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score)
              .toBe(7.5);
          await page.clock.runFor(PERSONAL_RATING_DEBOUNCE_MS * 3);
          expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
        } finally {
          await source.dispose();
        }
      }, [() => held.evaluate((probe) => probe.restore()), () => held.dispose()]);
    });
  }
}

test('a nested share dialog flushes the still-focused rating without a timed save', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new DOMException('Synthetic clipboard refusal', 'NotAllowedError')),
      },
    });
  });
  const rating = await openRating(page, 'detail');
  await page.clock.install({ time: new Date('2026-10-02T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-02T12:00:10Z'));
  await rating.fill('7.25');
  await expect(rating).toBeFocused();
  await page
    .getByRole('button', { name: `Share ${game.title}`, exact: true })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.getByRole('dialog', { name: 'Copy this link', exact: true })).toBeVisible();
  await expect
    .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score)
    .toBe(7.25);
});

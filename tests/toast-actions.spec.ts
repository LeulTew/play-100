import { expect, test } from '@playwright/test';
import { readLibrary } from './library-helpers';

test('a visible success toast passes a rapid second card action through while its dismiss control works', async ({
  page,
  baseURL,
  isMobile,
}) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Toast action fixtures require the owned local preview.');
  }
  await page.setViewportSize({ width: isMobile ? 393 : 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.evaluate(() => document.fonts.ready);
  const completed = page.getByRole('button', { name: 'Completed: Red Dead Redemption 2', exact: true });
  const pin = page.getByRole('button', { name: /^(Pin for|Unpin from) comparison: Mass Effect 2$/ });
  await completed.click();
  const toast = page.locator('.toast-visible');
  await expect(toast).toContainText('1 game updated in your play history.');
  await expect(toast).toHaveAttribute('role', 'status');
  await expect(toast).toHaveAttribute('aria-live', 'polite');
  await expect(toast).toHaveAttribute('aria-atomic', 'true');
  await expect(completed).toBeFocused();

  // Put the second real action beneath the non-interactive part of the live toast, without moving the toast.
  await pin.evaluate((element) => {
    const overlay = document.querySelector('.toast-visible')!.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    window.scrollBy({
      top: target.top + target.height / 2 - (overlay.top + overlay.height / 2),
      behavior: 'instant',
    });
  });
  const point = await pin.evaluate((element) => {
    const overlay = document.querySelector('.toast-visible')!;
    const bounds = overlay.getBoundingClientRect();
    const dismiss = overlay.querySelector('button')!.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    const left = Math.max(target.left + 2, bounds.left + 2);
    const right = Math.min(target.right - 2, dismiss.left - 2);
    if (right <= left) throw new Error('The second action must overlap the non-button portion of the real toast.');
    const x = (left + right) / 2;
    const y = target.top + target.height / 2;
    return {
      x,
      y,
      overlaps: y > bounds.top && y < bounds.bottom,
      receivesPointer: element.contains(document.elementFromPoint(x, y)),
      visible: overlay.classList.contains('toast-visible'),
    };
  });
  expect(point).toMatchObject({ overlaps: true, receivesPointer: true, visible: true });
  if (isMobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(toast).toBeVisible();
  expect((await readLibrary(page)).progress['red-dead-redemption-2']?.completed).toBe(true);
  await expect(page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true })).toBeVisible();
  const dismiss = toast.getByRole('button', { name: 'Dismiss notification', exact: true });
  await expect(dismiss).toHaveCSS('pointer-events', 'auto');
  await dismiss.click();
  await expect(page.locator('.toast-visible')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unpin from comparison: Mass Effect 2', exact: true })).toBeEnabled();
});

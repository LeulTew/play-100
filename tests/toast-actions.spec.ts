import { expect, test } from '@playwright/test';
import { readLibrary } from './library-helpers';

const trayName = (count: number, label = 'Compare tray') => `${count} ${count === 1 ? 'game' : 'games'} in ${label}`;

test('a visible success toast passes a rapid second card action through while its dismiss control works', async ({
  page,
  baseURL,
  isMobile,
}, info) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Toast action fixtures require the owned local preview.');
  }
  await page.setViewportSize({ width: isMobile ? 393 : 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.evaluate(() => document.fonts.ready);
  const completed = page.getByRole('button', { name: 'Completed: Red Dead Redemption 2', exact: true });
  const pin = page.getByRole('button', { name: /^Pin for comparison: Mass Effect 2$/ });
  await completed.click();
  const toast = page.locator('.toast-visible');
  await expect(toast).toContainText('Red Dead Redemption 2 marked completed.');
  await expect(toast).toHaveAttribute('role', 'status');
  await expect(toast).toHaveAttribute('aria-live', 'polite');
  await expect(toast).toHaveAttribute('aria-atomic', 'true');
  await expect(completed).toBeFocused();

  // Align with the measured toast, then search its whole overlap: mobile may leave space after Dismiss.
  const point = await pin.evaluate(async (element) => {
    const overlay = document.querySelector('.toast-visible')!.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    window.scrollBy({
      top: target.top + target.height / 2 - (overlay.top + overlay.height / 2),
      behavior: 'instant',
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const toast = document.querySelector('.toast-visible');
    if (!toast) throw new Error('The success toast must still be visible before the second action.');
    const bounds = toast.getBoundingClientRect();
    const action = element.getBoundingClientRect();
    const controls = [...toast.querySelectorAll('button, a[href]')].map((control) => control.getBoundingClientRect());
    const left = Math.max(action.left, bounds.left, 0) + 2;
    const right = Math.min(action.right, bounds.right, innerWidth) - 2;
    const top = Math.max(action.top, bounds.top, 0) + 2;
    const bottom = Math.min(action.bottom, bounds.bottom, innerHeight) - 2;
    const xs = [left, right, ...controls.flatMap((box) => [box.left - 2, box.right + 2])]
      .filter((value) => value >= left && value <= right)
      .sort((a, b) => a - b);
    const ys = [top, bottom, ...controls.flatMap((box) => [box.top - 2, box.bottom + 2])]
      .filter((value) => value >= top && value <= bottom)
      .sort((a, b) => a - b);
    const receipt = { toast: bounds.toJSON(), pin: action.toJSON(), controls: controls.map((box) => box.toJSON()) };
    for (let column = 1; column < xs.length; column++) {
      for (let row = 1; row < ys.length; row++) {
        const x = (xs[column - 1]! + xs[column]!) / 2;
        const y = (ys[row - 1]! + ys[row]!) / 2;
        if (
          xs[column]! - xs[column - 1]! < 2 ||
          ys[row]! - ys[row - 1]! < 2 ||
          controls.some((box) => x >= box.left - 2 && x <= box.right + 2 && y >= box.top - 2 && y <= box.bottom + 2)
        ) {
          continue;
        }
        return {
          x,
          y,
          overlaps: x > bounds.left && x < bounds.right && y > bounds.top && y < bounds.bottom,
          receivesPointer: element.contains(document.elementFromPoint(x, y)),
          visible: toast.classList.contains('toast-visible'),
          ...receipt,
        };
      }
    }
    throw new Error(`No non-interactive toast area overlaps the second action: ${JSON.stringify(receipt)}`);
  });
  await info.attach('toast-action-hit-point', { contentType: 'application/json', body: JSON.stringify(point) });
  expect(point).toMatchObject({ overlaps: true, receivesPointer: true, visible: true });
  if (isMobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(toast).toBeVisible();
  expect((await readLibrary(page)).progress['red-dead-redemption-2']?.completed).toBe(true);
  await expect(page.getByRole('button', { name: trayName(1), exact: true })).toBeVisible();
  const dismiss = toast.getByRole('button', { name: 'Dismiss notification', exact: true });
  await expect(dismiss).toHaveCSS('pointer-events', 'auto');
  await dismiss.click();
  await expect(page.locator('.toast-visible')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pin for comparison: Mass Effect 2', exact: true })).toBeEnabled();
});

test('Completed retains keyboard focus through a held save and ignores repeated activation until it settles', async ({
  page,
  baseURL,
}) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Completion focus fixtures require the owned local preview.');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?catalogs=off');
  const completed = page.getByRole('button', { name: 'Completed: Red Dead Redemption 2', exact: true });
  await expect(completed).toHaveAttribute('aria-pressed', 'false');
  await expect(completed).not.toHaveAttribute('aria-disabled', 'true');
  const before = await readLibrary(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    document.documentElement.dataset.completionSave = 'armed';
    // Hold only the app's completion receiver; the real IndexedDB write still commits.
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.transaction.db.name === 'play100-personal' && this.name === 'library' && args[1] === 'state') {
        IDBObjectStore.prototype.put = put;
        const transaction = this.transaction;
        const complete = transaction.oncomplete;
        if (!complete) throw new Error('The completion fixture needs the existing save receiver.');
        transaction.oncomplete = (event) => {
          document.documentElement.dataset.completionSave = 'held';
          window.addEventListener('completion:release-save', () => complete.call(transaction, event), { once: true });
        };
      }
      return put.apply(this, args);
    };
    window.addEventListener(
      'completion:restore-put',
      () => {
        IDBObjectStore.prototype.put = put;
      },
      { once: true },
    );
  });
  try {
    await completed.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-completion-save', 'held');
    await expect(completed).toHaveAttribute('aria-disabled', 'true');
    await expect(completed).not.toHaveAttribute('disabled');
    await expect(completed).toBeFocused();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    expect((await readLibrary(page)).revision).toBe(before.revision + 1);
    await expect(completed).toBeFocused();
    await page.evaluate(() => window.dispatchEvent(new Event('completion:release-save')));
    await expect(completed).not.toHaveAttribute('aria-disabled', 'true');
    await expect(completed).toHaveAttribute('aria-pressed', 'true');
    await expect(completed).toBeFocused();
    await page.keyboard.press('Space');
    await expect(completed).toHaveAttribute('aria-pressed', 'false');
    await expect(completed).toBeFocused();
    const saved = await readLibrary(page);
    expect(saved.revision).toBe(before.revision + 2);
    expect(saved.progress['red-dead-redemption-2']).toMatchObject({ played: true, completed: false });
  } finally {
    await page.evaluate(() => {
      window.dispatchEvent(new Event('completion:restore-put'));
      window.dispatchEvent(new Event('completion:release-save'));
    });
  }
});

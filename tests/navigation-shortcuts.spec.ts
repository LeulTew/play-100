import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

type Shortcut = 'header Play later' | 'ranked detail';
const game = libraryRecords[0]!;

async function openShortcut(page: Page, shortcut: Shortcut) {
  await installGuestLibrary(page, libraryFixture(3));
  if (shortcut === 'header Play later') {
    await page.goto('/discover?include100=on&catalogs=off');
    await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill(game.title);
    const card = page.locator(`[data-catalog-id="${game.id}"]`);
    await card.locator('.discovery-card-details > summary').click();
    return {
      input: card.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true }),
      target: page.getByRole('button', { name: /^Play later, \d+ games?$/ }),
      tab: 'queue',
    };
  }
  await page.goto('/?catalogs=off');
  await page.locator(`.game-card[data-game="${game.id}"] .game-link`).click();
  const dialog = page.getByRole('dialog', { name: game.title, exact: true });
  await expect(dialog).toBeVisible();
  return {
    input: dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true }),
    target: dialog.getByRole('button', { name: 'Your rank: #1', exact: true }),
    tab: 'ranking',
  };
}

async function expectRecovered(input: Locator) {
  await expect(input).toBeFocused();
  await expect(input).toBeEnabled();
  const position = await input.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom, height: innerHeight };
  });
  expect(position.top).toBeGreaterThanOrEqual(0);
  expect(position.bottom).toBeLessThanOrEqual(position.height);
}

async function interceptSave(page: Page, mode: 'reject' | 'hold') {
  await page.evaluate((mode) => {
    const original = IDBObjectStore.prototype.put;
    const root = document.documentElement;
    root.dataset.shortcutWrites = '0';
    root.dataset.shortcutSave = 'armed';
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.transaction.db.name === 'play100-personal' && this.name === 'library' && args[1] === 'state') {
        root.dataset.shortcutWrites = String(Number(root.dataset.shortcutWrites) + 1);
        if (mode === 'reject') throw new DOMException('Synthetic shortcut write refusal.', 'QuotaExceededError');
        if (root.dataset.shortcutSave === 'armed') {
          root.dataset.shortcutSave = 'waiting';
          const transaction = this.transaction;
          const complete = transaction.oncomplete;
          if (!complete) throw new Error('The held shortcut save has no completion receiver.');
          transaction.oncomplete = (event) => {
            root.dataset.shortcutSave = 'held';
            window.addEventListener(
              'shortcut:release',
              () => {
                root.dataset.shortcutSave = 'released';
                transaction.oncomplete = complete;
                complete.call(transaction, event);
              },
              { once: true },
            );
          };
        }
      }
      return original.apply(this, args);
    };
    window.addEventListener(
      'shortcut:restore',
      () => {
        IDBObjectStore.prototype.put = original;
      },
      { once: true },
    );
  }, mode);
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Shortcut edit fixtures require a fresh loopback profile.');
  }
  const origin = new URL(baseURL).origin;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) {
      return route.fulfill({ status: 503, json: { error: 'Synthetic offline metadata.' } });
    }
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  await page.evaluate(() => {
    if (document.documentElement.dataset.shortcutSave === 'held') window.dispatchEvent(new Event('shortcut:release'));
    window.dispatchEvent(new Event('shortcut:restore'));
  });
});

for (const shortcut of ['header Play later', 'ranked detail'] as const) {
  for (const rejection of ['invalid input', 'rejected storage'] as const) {
    test(`${shortcut} preserves and focuses ${rejection} without retrying or changing routes`, async ({ page }) => {
      const { input, target, tab } = await openShortcut(page, shortcut);
      await expect(input).toBeEnabled();
      const originalUrl = page.url();
      const before = await readLibrary(page);
      if (rejection === 'rejected storage') await interceptSave(page, 'reject');
      const draft = rejection === 'invalid input' ? '11' : '9.3';
      await input.fill(draft);
      await input.press('Tab');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      const failure =
        rejection === 'invalid input'
          ? 'Use a rating from 0 to 10, or leave it blank.'
          : 'The rating could not be saved. Your previous rating is unchanged. Press Enter in this field to retry.';
      await expect(input).toHaveAccessibleDescription(failure);
      await input.evaluate((element) => {
        element.dataset.shortcutEditor = 'original';
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await target.click();
        await expect(page).toHaveURL(originalUrl);
        await expect(input).toHaveValue(draft);
        await expect(input).toHaveAttribute('data-shortcut-editor', 'original');
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(input).toHaveAccessibleDescription(failure);
        await expectRecovered(input);
        if (shortcut === 'ranked detail') await expect(page.getByRole('dialog', { name: game.title })).toBeVisible();
      }
      expect(await readLibrary(page)).toEqual(before);
      if (rejection === 'rejected storage') {
        expect(await page.locator('html').getAttribute('data-shortcut-writes')).toBe('1');
        await page.evaluate(() => window.dispatchEvent(new Event('shortcut:restore')));
      }
      await input.fill('9.1');
      await input.press('Enter');
      await expect
        .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score)
        .toBe(9.1);
      await target.click();
      await expect(page).toHaveURL((url) => url.pathname === '/my-games' && url.searchParams.get('tab') === tab);
      expect((await readLibrary(page)).revision).toBe(before.revision + 1);
    });
  }

  test(`${shortcut} waits for an in-flight blur save and then follows the requested destination`, async ({ page }) => {
    const { input, target, tab } = await openShortcut(page, shortcut);
    const originalUrl = page.url();
    const before = await readLibrary(page);
    await interceptSave(page, 'hold');
    await input.fill('9.3');
    await target.click();
    await expect(page.locator('html')).toHaveAttribute('data-shortcut-save', 'held');
    await expect(page).toHaveURL(originalUrl);
    await expect(input).toHaveValue('9.3');
    await page.evaluate(() => window.dispatchEvent(new Event('shortcut:release')));
    await expect(page).toHaveURL((url) => url.pathname === '/my-games' && url.searchParams.get('tab') === tab);
    expect((await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score).toBe(9.3);
    expect((await readLibrary(page)).revision).toBe(before.revision + 1);
    expect(await page.locator('html').getAttribute('data-shortcut-writes')).toBe('1');
  });

  test(`${shortcut} cancels a pending destination after native Back and does not steal focus`, async ({ page }) => {
    const { input, target } = await openShortcut(page, shortcut);
    await interceptSave(page, 'hold');
    await input.fill('9.3');
    await target.click();
    await expect(page.locator('html')).toHaveAttribute('data-shortcut-save', 'held');
    await page.goBack();
    const retainedUrl = page.url();
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.focus();
    await page.evaluate(() => window.dispatchEvent(new Event('shortcut:release')));
    await expect(page.locator('html')).toHaveAttribute('data-shortcut-save', 'released');
    await expect
      .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score)
      .toBe(9.3);
    await expect(page).toHaveURL(retainedUrl);
    await expect(menu).toBeFocused();
  });
}

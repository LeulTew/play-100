import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';
import { textSpacingCSS } from './readability-helpers';

const views = (page: Page) => page.getByRole('navigation', { name: 'My games views', exact: true });
const libraryPager = (page: Page) => page.getByRole('navigation', { name: 'Library pages', exact: true });

async function expectEditorInView(input: Locator) {
  await expect(input).toBeFocused();
  const bounds = await input.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const inDialog = element.closest('dialog[open]');
    return {
      top: box.top,
      bottom: box.bottom,
      ceiling: inDialog ? 0 : (document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0),
      floor: inDialog ? innerHeight : document.querySelector('.mobile-nav')?.getBoundingClientRect().top || innerHeight,
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.ceiling);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.floor);
}

async function applyTextSpacing(page: Page) {
  await page.evaluate((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, textSpacingCSS);
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('R9 My games fixtures require the integrator-owned loopback app.');
  }
  const origin = new URL(baseURL).origin;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) {
      return route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } });
    }
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const rejection of ['invalid value', 'rejected storage write'] as const) {
  test(`detail Previous and Next preserve and focus a rating with ${rejection}`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await installGuestLibrary(page, libraryFixture(3));
    const game = libraryRecords[1]!;
    await page.goto(`/?game=${game.id}&catalogs=off`);
    const input = page.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true });
    await expect(input).toBeEnabled();
    const before = await readLibrary(page);
    if (rejection === 'rejected storage write') {
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
          if (document.documentElement.dataset.rejectR9Write === 'yes') {
            throw new DOMException('Synthetic R9 rating write failure.', 'QuotaExceededError');
          }
          return original.apply(this, args);
        };
        document.documentElement.dataset.rejectR9Write = 'yes';
      });
    }
    const draft = rejection === 'invalid value' ? '11' : '9.3';
    await input.fill(draft);
    await input.press('Tab');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await input.evaluate((element) => {
      element.dataset.r9DraftIdentity = 'original';
    });
    for (const direction of ['Next game', 'Previous game']) {
      await page.getByRole('button', { name: direction, exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get('game') === game.id);
      await expect(input).toHaveValue(draft);
      await expect(input).toHaveAttribute('data-r9-draft-identity', 'original');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expectEditorInView(input);
      await expect(page.locator('.catalog-detail-rating .inline-error')).toContainText(
        rejection === 'invalid value' ? '0 to 10' : 'could not be saved',
      );
    }
    expect(await readLibrary(page)).toEqual(before);
    await page.evaluate(() => {
      delete document.documentElement.dataset.rejectR9Write;
    });
    await input.fill('9.1');
    await input.press('Tab');
    await expect
      .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score)
      .toBe(9.1);
    await page.getByRole('button', { name: 'Next game', exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('game') === libraryRecords[2]!.id);
  });
}

test('a blocked mobile Ranking tab change returns focus and viewport to the rejected editor', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  const fixture = libraryFixture(100);
  fixture.ranking = libraryRecords.slice(0, 20).map((record, index) => ({
    id: record.id,
    score: 7,
    note: '',
    manualPosition: index + 1,
  }));
  await installGuestLibrary(page, fixture);
  await views(page)
    .getByRole('button', { name: /^Ranking,/ })
    .click();
  const game = libraryRecords[19]!;
  const input = page.getByRole('spinbutton', { name: `Your rating / 10 for ${game.title}`, exact: true });
  await input.fill('11');
  await input.press('Tab');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await views(page)
    .getByRole('button', { name: /^Library,/ })
    .click();
  await expect(views(page).getByRole('button', { name: /^Ranking,/ })).toHaveAttribute('aria-current', 'page');
  await expect(input).toHaveValue('11');
  await expectEditorInView(input);
  expect((await readLibrary(page)).ranking.find((entry) => entry.id === game.id)?.score).toBe(7);
});

test('100 played games keep Library pages 2 and 4 through Back, Forward and reload', async ({ page }) => {
  const fixture = libraryFixture(100);
  fixture.progress = Object.fromEntries(
    Object.values(fixture.records).map((record) => [
      record.id,
      { played: true, completed: false, later: fixture.queueOrder.includes(record.id) },
    ]),
  );
  await installGuestLibrary(page, fixture, '/my-games?catalogs=off&progress=any-played');
  const before = await readLibrary(page);
  const results = page.getByRole('heading', { name: 'Your library results', exact: true });
  await libraryPager(page).getByRole('combobox').selectOption('2');
  await expect(results).toBeFocused();
  await libraryPager(page).getByRole('combobox').selectOption('4');
  await expect(libraryPager(page)).toContainText('76–100 of 100 matching games');
  await page.goBack();
  await expect(libraryPager(page).getByRole('combobox')).toHaveValue('2');
  await expect(libraryPager(page)).toContainText('26–50 of 100 matching games');
  await expect(results).toBeFocused();
  await page.goForward();
  await expect(libraryPager(page).getByRole('combobox')).toHaveValue('4');
  await expect(libraryPager(page)).toContainText('76–100 of 100 matching games');
  await page.reload();
  await expect(libraryPager(page).getByRole('combobox')).toHaveValue('4');
  await expect(libraryPager(page)).toContainText('76–100 of 100 matching games');
  expect(new URL(page.url()).searchParams.get('page')).toBe('4');
  expect([...new URL(page.url()).searchParams.keys()]).toEqual(['catalogs', 'progress', 'page']);
  await page.getByLabel('Progress', { exact: true }).selectOption('completed');
  await expect(libraryPager(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await page.goBack();
  await expect(libraryPager(page).getByRole('combobox')).toHaveValue('4');
  await expect(libraryPager(page)).toContainText('76–100 of 100 matching games');
  expect(await readLibrary(page)).toEqual(before);
});

for (const spacing of ['default', 'WCAG text spacing'] as const) {
  test(`the 320px six-game tray count stays on one line with ${spacing}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 851 });
    await installGuestLibrary(page, libraryFixture(0));
    await page.goto('/?catalogs=off');
    for (const record of libraryRecords.slice(0, 6)) {
      await page.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true }).click();
    }
    if (spacing === 'WCAG text spacing') await applyTextSpacing(page);
    await page.evaluate(() => document.fonts.ready);
    const dock = page.locator('.compare-tray-dock');
    await expect(dock.locator('.compare-tray-expand strong')).toHaveText('6 games');
    await expect(dock.locator('.compare-tray-stack')).toBeHidden();
    const geometry = await dock.evaluate((element) => {
      const dock = element.getBoundingClientRect();
      const count = element.querySelector('.compare-tray-expand strong')!;
      const countRange = document.createRange();
      countRange.selectNodeContents(count);
      const overflows: string[] = [];
      const buttons = [...element.querySelectorAll('button')];
      for (const button of buttons) {
        const box = button.getBoundingClientRect();
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const text = walker.currentNode;
          if (!text.textContent?.trim() || !text.parentElement?.checkVisibility()) continue;
          const range = document.createRange();
          range.selectNodeContents(text);
          if (
            [...range.getClientRects()].some(
              (rect) =>
                rect.left < box.left - 1 ||
                rect.right > box.right + 1 ||
                rect.top < box.top - 1 ||
                rect.bottom > box.bottom + 1,
            )
          ) {
            overflows.push(text.textContent);
          }
        }
      }
      return {
        lines: new Set(
          [...countRange.getClientRects()].filter((rect) => rect.width).map((rect) => Math.round(rect.top)),
        ).size,
        height: dock.height,
        bottom: dock.bottom,
        navTop: document.querySelector('.mobile-nav')!.getBoundingClientRect().top,
        targets: buttons.map((button) => button.getBoundingClientRect().height),
        overflows,
        width: document.documentElement.scrollWidth,
      };
    });
    expect(geometry.lines).toBe(1);
    expect(geometry.overflows).toEqual([]);
    expect(geometry.height).toBeLessThanOrEqual(spacing === 'default' ? 72 : 112);
    expect(geometry.bottom).toBeLessThan(geometry.navTop);
    expect(geometry.targets.every((height) => height >= 44)).toBe(true);
    expect(geometry.width).toBe(320);
  });
}

for (const surface of ['Library', 'Discover'] as const) {
  test(`${surface} pager labels do not split words at 320px, including text spacing`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 851 });
    await installGuestLibrary(page, libraryFixture(100));
    if (surface === 'Discover') await page.goto('/discover?catalogs=off');
    const pager = page.getByRole('navigation', {
      name: surface === 'Library' ? 'Library pages' : 'Catalog pages',
      exact: true,
    });
    await expect(pager).toBeVisible();
    for (const spaced of [false, true]) {
      if (spaced) await applyTextSpacing(page);
      await page.evaluate(() => document.fonts.ready);
      const labels = await pager.locator('button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const range = document.createRange();
          range.selectNodeContents(button);
          const box = button.getBoundingClientRect();
          const rects = [...range.getClientRects()].filter((rect) => rect.width);
          return {
            label: button.textContent,
            lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
            height: box.height,
            contained: rects.every((rect) => rect.left >= box.left && rect.right <= box.right),
          };
        }),
      );
      expect(labels.map((entry) => entry.label)).toEqual(['First', 'Previous', 'Next', 'Last']);
      for (const label of labels) {
        expect(label.lines).toBe(1);
        expect(label.height).toBeGreaterThanOrEqual(44);
        expect(label.contained).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    }
  });
}

test('the ratings-table footnote links to Ranking through client-side navigation', async ({ page }) => {
  await page.goto('/?view=table&catalogs=off');
  const footnote = page.locator('.table-footnote');
  await expect(footnote).toContainText(
    'Your ratings are separate from these source values. Edit them in My games → Ranking.',
  );
  const link = footnote.getByRole('link', { name: 'My games → Ranking', exact: true });
  await expect(link).toHaveAttribute('href', '/my-games?tab=ranking');
  await page.evaluate(() => {
    document.documentElement.dataset.r9RouterDocument = 'retained';
  });
  await link.click();
  await expect(page).toHaveURL((url) => url.pathname === '/my-games' && url.searchParams.get('tab') === 'ranking');
  expect(await page.evaluate(() => document.documentElement.dataset.r9RouterDocument)).toBe('retained');
});

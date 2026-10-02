import { expect, test } from '@playwright/test';
import { openBrowsingFilters } from './browsing-helpers';
import { installGuestLibrary, libraryFixture } from './library-pagination-helpers';
import { rankingFixture } from './ranking-pagination-helpers';
import { readLibrary } from './library-helpers';

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
    throw new Error('Layout fixtures require a loopback origin.');
  const origin = new URL(baseURL).origin;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const width of [320, 393]) {
  for (const surface of ['collection', 'discover']) {
    test(`${surface} bulk actions keep whole words and a two-column grid at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 851 });
      await page.goto(
        surface === 'collection' ? '/?catalogs=off' : '/discover?source=collection&include100=on&catalogs=off',
      );
      await page
        .getByRole('button', {
          name: surface === 'collection' ? 'Select multiple games' : 'Select games',
          exact: true,
        })
        .click();
      const bar = page.getByRole('region', { name: 'Bulk game actions', exact: true });
      await expect(bar).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await bar.scrollIntoViewIfNeeded();
      const geometry = await bar.locator('.selection-actions .button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          const words: { word: string; lines: number; contained: boolean }[] = [];
          while ((node = walker.nextNode())) {
            for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              const rects = [...range.getClientRects()];
              words.push({
                word: match[0],
                lines: rects.length,
                contained: rects.every(
                  (rect) =>
                    rect.left >= box.left &&
                    rect.right <= box.right &&
                    rect.top >= box.top &&
                    rect.bottom <= box.bottom,
                ),
              });
            }
          }
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            words,
            icons: [...button.querySelectorAll('svg')].map((icon) => getComputedStyle(icon).display),
          };
        }),
      );
      expect(geometry).toHaveLength(4);
      expect(geometry[0]!.x).toBeCloseTo(geometry[2]!.x);
      expect(geometry[1]!.x).toBeCloseTo(geometry[3]!.x);
      expect(geometry[0]!.y).toBeCloseTo(geometry[1]!.y);
      expect(geometry[2]!.y).toBeGreaterThan(geometry[0]!.y);
      for (const button of geometry) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.words.length).toBeGreaterThan(1);
        for (const word of button.words) {
          expect(word.lines, word.word).toBe(1);
          expect(word.contained, word.word).toBe(true);
        }
        if (width <= 380) expect(button.icons.every((display) => display === 'none')).toBe(true);
      }
      await info.attach(`${surface}-${width}-bulk`, { body: await bar.screenshot(), contentType: 'image/png' });
    });
  }
}

test('The 100 offers genre families and preserves old exact-genre URLs', async ({ page }) => {
  await page.goto('/?genre=RPG&catalogs=off');
  await openBrowsingFilters(page);
  await expect(page.getByLabel('Exact genre label', { exact: true })).toHaveValue('RPG');
  await expect(page.locator('.result-summary strong')).toHaveText('1');
  const family = page.getByLabel('Genre', { exact: true });
  await family.selectOption('role-playing');
  await expect(page).toHaveURL(/genreFamily=role-playing/);
  expect(new URL(page.url()).searchParams.has('genre')).toBe(false);
  await expect(page.locator('[data-game="mass-effect-2"]')).toBeVisible();
  await expect(page.locator('[data-game="red-dead-redemption-2"]')).toHaveCount(0);
  expect(Number(await page.locator('.result-summary strong').textContent())).toBeGreaterThan(1);
  await page.reload();
  await openBrowsingFilters(page);
  await expect(page.getByLabel('Genre', { exact: true })).toHaveValue('role-playing');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.result-summary strong')).toHaveText('100');
});

test('a pinned tray leaves a one-line active mobile label and named 44px navigation targets at 320px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 851 });
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: 'Pin for comparison: Red Dead Redemption 2', exact: true }).click();
  await expect(page.locator('.compare-tray-reserve')).toBeAttached();
  const nav = page.locator('.mobile-nav');
  for (const destination of ['The 100', 'My games', 'Discover']) {
    await nav.getByRole('link', { name: destination, exact: true }).click();
    await expect(nav.getByRole('link', { name: destination, exact: true })).toHaveAttribute('aria-current', 'page');
    await page.evaluate(() => document.fonts.ready);
    for (const control of await nav.locator(':scope > *').all()) await expect(control).toHaveAccessibleName(/.+/);
    const geometry = await nav.evaluate((element) =>
      [...element.children].map((control) => {
        const box = control.getBoundingClientRect();
        const label = control.querySelector('span');
        if (!label) throw new Error('Navigation label missing.');
        const range = document.createRange();
        range.selectNodeContents(label);
        return {
          width: box.width,
          height: box.height,
          right: box.right,
          active: control.hasAttribute('aria-current'),
          lines: range.getClientRects().length,
          visibleAtCenter: control.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
        };
      }),
    );
    for (const control of geometry) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.right).toBeLessThanOrEqual(320);
      expect(control.visibleAtCenter).toBe(true);
      if (control.active) expect(control.lines).toBe(1);
    }
    await info.attach(`pinned-navigation-320-${destination}`, {
      body: await nav.screenshot(),
      contentType: 'image/png',
    });
  }
});

test('Ranked links reach the actual game on a later ranking page without changing stored data', async ({ page }) => {
  await installGuestLibrary(page, rankingFixture(30));
  await page.getByRole('searchbox', { name: 'Search your library', exact: true }).fill('00026');
  const link = page.getByRole('link', {
    name: 'Ranked #26: Synthetic ranked game 00026. Open in Ranking',
    exact: true,
  });
  await expect(link).toHaveText('Ranked #26');
  const before = await readLibrary(page);
  await link.click();
  const row = page.locator('[data-record-id="manual:perf-ranking-00026"]');
  await expect(page.getByRole('navigation', { name: 'Ranking pages', exact: true }).getByRole('combobox')).toHaveValue(
    '2',
  );
  await expect(row.locator('.record-title')).toBeFocused();
  await expect(row.locator('.record-title')).toBeInViewport();
  await expect(page.locator('.ranking-row-content')).toHaveCount(5);
  expect(await readLibrary(page)).toEqual(before);
});

test('library action columns align across all three progress labels', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await installGuestLibrary(page, libraryFixture(3));
  const rows = page.locator('.library-row-content');
  await expect(rows).toHaveCount(3);
  const columns = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const actions = element.querySelector('.record-actions')!.getBoundingClientRect();
      const state = element.querySelector('.play-state')!.getBoundingClientRect();
      const rank = element.querySelector('.record-tail')!.getBoundingClientRect();
      return { actions: actions.left, state: state.left, rank: rank.left };
    }),
  );
  for (const column of columns) {
    expect(column.actions).toBeCloseTo(columns[0]!.actions);
    expect(column.state).toBeCloseTo(columns[0]!.state);
    expect(column.rank).toBeCloseTo(columns[0]!.rank);
  }
});

test('ratings intro keeps its link inline with a padded touch target at 393px', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto('/?view=table&catalogs=off');
  const link = page.locator('.ratings-explainer').getByRole('link', { name: 'My games → Ranking', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveCSS('display', 'inline');
  const targets = await link.evaluate((element) =>
    [...element.getClientRects()].map((rect) => ({ height: rect.height, width: rect.width })),
  );
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) expect(target.height).toBeGreaterThanOrEqual(44);
});

test('Menu shows a visible external-destination cue for Data use', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: 'Menu', exact: true }).filter({ visible: true }).click();
  const link = page.getByRole('dialog').getByRole('link', { name: 'Data use (opens in a new tab)', exact: true });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link.locator('svg')).toBeVisible();
});

test('guest Community states its purpose and retains one publish action during request failure', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByText('Browse rankings people chose to list publicly.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Publish (a )?ranking$/ })).toHaveCount(1);
});

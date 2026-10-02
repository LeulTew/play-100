import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../../lib/test-server-ports';

declare global {
  interface Window {
    myGamesFixture: {
      exits: string[];
      saves: string[];
      accept(value: boolean): void;
      holdEditor(): void;
      releaseEditor(): void;
      finishEditor(saved: boolean): void;
      hasUnsubmittedForm(): boolean;
      holdMoves(): void;
      finishMove(saved: boolean): void;
      moveCount(): number;
      holdQueueRemovals(): void;
      finishQueueRemoval(saved: boolean): void;
      queueRemovalCount(): number;
    };
    myGamesPaging: { arm(): void; settled(): Promise<PagingTurn> };
  }
}

/** A layout-reading call during a page turn: its receiver's text, pending DOM writes, and the first row. */
interface PagingRead {
  api: string;
  target: string | null;
  dirty: boolean;
  row: string | null;
}
interface PagingTurn {
  commits: number;
  reads: PagingRead[];
  mutationsAfterReads: number;
  row: string | null;
  focused: string | null;
}

// Keep the isolated Vite/Playwright harness: @vitest/browser-playwright is not installed.
// The external fixture module is checked by TypeScript and ESLint without adding a dependency.
const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>My games exit guard fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module" src="/src/components/personal/MyGamesPage.browser-fixture.tsx"></script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-my-games-guard-tests',
        logLevel: 'error',
        appType: 'custom',
        optimizeDeps: {
          noDiscovery: true,
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            '@dnd-kit/core',
            '@dnd-kit/sortable',
            '@dnd-kit/utilities',
          ],
        },
        plugins: [
          react(),
          {
            name: 'my-games-guard-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url?.split('?')[0] !== '/my-games') return next();
                void vite.transformIndexHtml('/my-games', fixture).then((html) => {
                  response.setHeader('Content-Type', 'text/html');
                  response.end(html);
                }, next);
              });
            },
          },
        ],
        server: {
          host: '127.0.0.1',
          port: Number(process.env.PLAY100_BROWSER_UNIT_PORT ?? 0),
          strictPort: true,
          watch: null,
        },
      }),
    )
  ).server;
  expect(server.config.optimizeDeps.noDiscovery).toBe(true);
  expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-my-games-guard-tests$/);
  expect(server.config.server.watch).toBeNull();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('My games fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

async function withPage(work: (page: Page) => Promise<void>, view = 'ranking', query = '', width = 1280) {
  if (!browser) throw new Error('My games fixture browser unavailable.');
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
  );
  try {
    await page.goto(`${origin}/my-games?view=${view}${query}`);
    await browserExpect(page.getByRole('heading', { name: 'My games', level: 1 })).toBeVisible();
    await work(page);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

// The Library pane stays mounted (hidden) and renders the same .personal-row rows, so ranking locators are scoped.
const rankedRow = (page: Page, id: string) =>
  page.getByRole('list', { name: 'Your ranked games', exact: true }).locator(`.personal-row[data-record-id="${id}"]`);
const rankingStatus = (page: Page) => page.locator('.personal-tools:has(#ranking-search) [role="status"]');
const exits = (page: Page) => page.evaluate(() => [...window.myGamesFixture.exits]);
const blocked = 'Your edit has not saved. Fix the highlighted field or retry before changing views.';
const held = 'Search waits for your unsaved edit. Fix the highlighted field or retry.';

async function expectGuardedExits(page: Page, keep: () => Promise<void>) {
  await page.getByRole('button', { name: 'Find games', exact: true }).click();
  await browserExpect(page.getByRole('alert').filter({ hasText: blocked })).toBeVisible();
  await keep();
  await page.getByRole('button', { name: 'Publish a ranking', exact: true }).click();
  await keep();
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  await page.getByRole('button', { name: 'Discover games beyond The 100', exact: true }).click();
  await keep();
  expect(await exits(page)).toEqual([]);
  await page.getByRole('searchbox', { name: 'Search your ranking' }).fill('Beta');
  await browserExpect(rankingStatus(page)).toHaveText(held);
  await browserExpect(rankedRow(page, 'alpha')).toHaveCount(1);
  await keep();
  expect(await exits(page)).toEqual([]);
}

describe('My games exit guard', () => {
  for (const view of ['library', 'queue']) {
    it(`short titles keep a 44px opening target in compact ${view} rows`, async () => {
      await withPage(
        async (page) => {
          const title = page.getByRole('button', { name: 'Halo 3', exact: true });
          for (const width of [320, 360, 393, 720, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            await browserExpect(title).toHaveCSS('min-inline-size', '44px');
            await browserExpect(title).toHaveCSS('overflow-wrap', 'anywhere');
            const bounds = await title.boundingBox();
            expect(bounds?.width).toBeGreaterThanOrEqual(44);
            expect(bounds?.height).toBeGreaterThanOrEqual(44);
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          }
        },
        view,
        '&moves&short-title',
      );
    });
  }

  for (const width of [393, 1280]) {
    for (const count of [1, 3, 26]) {
      for (const saved of [false, true]) {
        it(`${width}px queue removal of ${count === 1 ? 'the last row' : count === 26 ? 'the last page' : 'a middle row'} ${saved ? 'hands off after saving' : 'keeps focus after refusal'}`, async () => {
          await withPage(
            async (page) => {
              const list = page.getByRole('list', { name: 'Your Play later games', exact: true });
              if (count > 25)
                await page
                  .getByRole('navigation', { name: 'Play later pages', exact: true })
                  .getByRole('button', { name: 'Last', exact: true })
                  .click();
              const id = count === 1 ? 'alpha' : count === 3 ? 'beta' : 'manual:024';
              const row = list.locator(`[data-record-id="${id}"]`);
              const action = row.getByRole('button', { name: /^Remove from Play later:/ });
              await page.evaluate(() => window.myGamesFixture.holdQueueRemovals());
              await action.focus();
              await page.keyboard.press('Enter');
              await browserExpect.poll(() => page.evaluate(() => window.myGamesFixture.queueRemovalCount())).toBe(1);
              await browserExpect(action).toBeFocused();
              await page.keyboard.press('Enter');
              expect(await page.evaluate(() => window.myGamesFixture.queueRemovalCount())).toBe(1);
              await page.evaluate((value) => window.myGamesFixture.finishQueueRemoval(value), saved);
              if (saved) {
                await browserExpect(row).toHaveCount(0);
                const target =
                  count === 1
                    ? page.getByRole('heading', { name: 'Play later results', exact: true })
                    : list.locator(
                        `[data-record-id="${count === 3 ? 'manual:001' : 'manual:023'}"] .remove-library-action`,
                      );
                await browserExpect(target).toBeFocused();
                await browserExpect(target).toBeInViewport();
              } else await browserExpect(action).toBeFocused();
            },
            'queue',
            `&moves&records=${Math.max(0, count - 2)}&queue-count=${count}`,
            width,
          );
        });
      }
    }
    for (const saved of [false, true]) {
      for (const next of ['focus', 'tab', 'page'] as const) {
        it(`${width}px queue completion (${saved}) respects a newer ${next}`, async () => {
          await withPage(
            async (page) => {
              const action = page
                .getByRole('list', { name: 'Your Play later games', exact: true })
                .locator('[data-record-id="alpha"] .remove-library-action');
              await page.evaluate(() => window.myGamesFixture.holdQueueRemovals());
              await action.focus();
              await page.keyboard.press('Enter');
              await browserExpect.poll(() => page.evaluate(() => window.myGamesFixture.queueRemovalCount())).toBe(1);
              const target =
                next === 'tab'
                  ? page.getByRole('button', { name: /^Library,/ })
                  : next === 'page'
                    ? page.getByRole('heading', { name: 'Play later results', exact: true })
                    : page.getByRole('button', { name: 'Find games', exact: true });
              if (next === 'tab') await target.press('Enter');
              else if (next === 'page')
                await page
                  .getByRole('navigation', { name: 'Play later pages', exact: true })
                  .getByRole('button', { name: 'Last', exact: true })
                  .press('Enter');
              else await target.focus();
              await browserExpect(target).toBeFocused();
              await page.evaluate((value) => window.myGamesFixture.finishQueueRemoval(value), saved);
              if (saved)
                await browserExpect(page.getByRole('button', { name: 'Play later, 26', exact: true })).toBeVisible();
              await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
              await browserExpect(target).toBeFocused();
            },
            'queue',
            '&moves&records=25',
            width,
          );
        });
      }
    }
  }

  for (const view of ['queue', 'ranking'] as const) {
    it(`${view} move arrows retain focus while saving, at edges, and after a refused save`, async () => {
      await withPage(
        async (page) => {
          const list = page.getByRole('list', {
            name: view === 'queue' ? 'Your Play later games' : 'Your ranked games',
          });
          const beta = list.locator('[data-record-id="beta"]');
          const up = beta.locator('[data-move-direction="up"]');
          const down = beta.locator('[data-move-direction="down"]');
          await page.evaluate(() => window.myGamesFixture.holdMoves());
          await up.focus();
          await up.press('Enter');
          await browserExpect(up).toHaveAttribute('aria-disabled', 'true');
          await browserExpect(up).toBeFocused();
          await up.press('Enter');
          expect(await page.evaluate(() => window.myGamesFixture.moveCount())).toBe(1);
          await page.evaluate(() => window.myGamesFixture.finishMove(true));
          await browserExpect(beta).toHaveAttribute('aria-posinset', '1');
          await browserExpect(down).toBeFocused();
          await down.press('Enter');
          await browserExpect(down).toBeFocused();
          await page.evaluate(() => window.myGamesFixture.finishMove(true));
          await browserExpect(beta).toHaveAttribute('aria-posinset', '2');
          await browserExpect(down).toBeFocused();
          await down.press('Enter');
          await page.evaluate(() => window.myGamesFixture.finishMove(true));
          await browserExpect(beta).toHaveAttribute('aria-posinset', '3');
          await browserExpect(up).toBeFocused();
          await up.press('Enter');
          await page.evaluate(() => window.myGamesFixture.finishMove(false));
          await browserExpect(page.getByRole('alert')).toContainText('could not be saved');
          await browserExpect(up).toBeFocused();
          await browserExpect(beta).toHaveAttribute('aria-posinset', '3');
        },
        view,
        '&records=1&moves',
      );
    });
  }

  it('keeps a failed note draft through Find games, Publish, Discover and a row-hiding search', async () => {
    await withPage(async (page) => {
      await rankedRow(page, 'alpha').locator('.ranking-note > summary').click();
      const note = rankedRow(page, 'alpha').locator('#note-alpha');
      await note.fill('Unsaved draft');
      await note.press('Tab');
      const failure = page.getByRole('alert').filter({ hasText: 'The note could not be saved.' });
      await browserExpect(failure).toBeVisible();
      await note.evaluate((element) => {
        element.dataset.failedEditorIdentity = 'original-note';
      });
      await note.focus();
      await note.press('Tab');
      await expectGuardedExits(page, async () => {
        await browserExpect(note).toHaveValue('Unsaved draft');
        await browserExpect(note).toHaveAttribute('data-failed-editor-identity', 'original-note');
        await browserExpect(failure).toBeVisible();
        await browserExpect(note).toBeEnabled();
        expect(await page.evaluate(() => [...window.myGamesFixture.saves])).toEqual([
          JSON.stringify({ id: 'alpha', note: 'Unsaved draft' }),
        ]);
      });
      // Only the draft's failed save was attempted; no guarded exit retried or discarded it.
      expect(await page.evaluate(() => [...window.myGamesFixture.saves])).toEqual([
        JSON.stringify({ id: 'alpha', note: 'Unsaved draft' }),
      ]);

      await page.evaluate(() => window.myGamesFixture.accept(true));
      await note.fill('Saved draft');
      await note.press('Tab');
      await browserExpect(failure).toHaveCount(0);
      // The held search applies once the edit has saved.
      await browserExpect(rankingStatus(page)).toHaveText('1 ranked game in this view');
      await browserExpect(rankedRow(page, 'alpha')).toHaveCount(0);
      expect(await page.evaluate(() => [...window.myGamesFixture.saves])).toEqual([
        JSON.stringify({ id: 'alpha', note: 'Unsaved draft' }),
        JSON.stringify({ id: 'alpha', note: 'Saved draft' }),
      ]);
      await page.getByRole('button', { name: 'Find games', exact: true }).click();
      await browserExpect.poll(() => exits(page)).toEqual(['discover']);
    });
  });

  it('keeps a failed rating draft through the same exits and search', async () => {
    await withPage(async (page) => {
      const rating = rankedRow(page, 'alpha').getByRole('spinbutton', { name: 'Your rating / 10 for Alpha game' });
      await rating.fill('9');
      await rating.press('Tab');
      const failure = page.getByRole('alert').filter({ hasText: 'The rating could not be saved.' });
      await browserExpect(failure).toBeVisible();
      await browserExpect(failure).toHaveText(
        'The rating could not be saved. Your previous rating is unchanged. Press Enter in this field to retry.',
      );
      await rating.evaluate((element) => {
        element.dataset.failedEditorIdentity = 'original-rating';
      });
      await rating.focus();
      await rating.press('Tab');
      await expectGuardedExits(page, async () => {
        await browserExpect(rating).toHaveValue('9');
        await browserExpect(rating).toHaveAttribute('data-failed-editor-identity', 'original-rating');
        await browserExpect(failure).toBeVisible();
        expect(await page.evaluate(() => [...window.myGamesFixture.saves])).toEqual([
          JSON.stringify({ id: 'alpha', score: 9 }),
        ]);
      });
      expect(await page.evaluate(() => [...window.myGamesFixture.saves])).toEqual([
        JSON.stringify({ id: 'alpha', score: 9 }),
      ]);

      await page.evaluate(() => window.myGamesFixture.accept(true));
      await rating.press('Enter');
      await browserExpect(failure).toHaveCount(0);
      await browserExpect(rankingStatus(page)).toHaveText('1 ranked game in this view');
      await browserExpect(rankedRow(page, 'alpha')).toHaveCount(0);
      expect(await page.evaluate(() => [...window.myGamesFixture.saves])).toEqual([
        JSON.stringify({ id: 'alpha', score: 9 }),
        JSON.stringify({ id: 'alpha', score: 9 }),
      ]);
    });
  });

  it('explains invalid number input without clearing or saving the previous rating', async () => {
    await withPage(async (page) => {
      const rating = rankedRow(page, 'alpha').getByRole('spinbutton', { name: 'Your rating / 10 for Alpha game' });
      await rating.focus();
      await rating.press('ControlOrMeta+A');
      await rating.press('e');
      expect(await rating.evaluate((element) => element instanceof HTMLInputElement && element.validity.badInput)).toBe(
        true,
      );
      await rating.press('Tab');
      const failure = page.getByRole('alert').filter({ hasText: 'Enter a rating from 0 to 10' });
      await browserExpect(failure).toHaveText(
        'Enter a rating from 0 to 10, or clear the field to remove your rating. Your saved rating is unchanged.',
      );
      expect(await page.evaluate(() => [...window.myGamesFixture.saves])).toEqual([]);

      await rating.fill('7');
      await rating.press('Enter');
      await browserExpect(failure).toHaveCount(0);
      await browserExpect(rating).toHaveValue('7');
      expect(await page.evaluate(() => [...window.myGamesFixture.saves])).toEqual([]);
    });
  });
});

describe('My games Ranking pane mounting', () => {
  it('releases a clean Ranking pane but preserves its lightweight search state', async () => {
    await withPage(async (page) => {
      const search = page.getByRole('searchbox', { name: 'Search your ranking' });
      await browserExpect(page.getByRole('list', { name: 'Your games', exact: true })).toBeVisible();
      // The unvisited Ranking pane mounts no rows, editors or search.
      await browserExpect(page.locator('#note-alpha')).toHaveCount(0);
      await browserExpect(page.locator('#ranking-search')).toHaveCount(0);
      await page.getByRole('button', { name: 'Ranking, 2', exact: true }).click();
      await browserExpect(page.getByRole('list', { name: 'Your ranked games', exact: true })).toBeVisible();
      await browserExpect(page.getByRole('button', { name: 'Ranking, 2', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await search.fill('Alpha');
      await browserExpect(rankedRow(page, 'alpha')).toHaveCount(1);
      await browserExpect(rankedRow(page, 'beta')).toHaveCount(0);
      await page.getByRole('button', { name: 'Library, 2', exact: true }).click();
      await browserExpect(page.getByRole('list', { name: 'Your ranked games', exact: true })).toHaveCount(0);
      await browserExpect(page.locator('#ranking-search')).toHaveCount(0);
      await page.getByRole('button', { name: 'Ranking, 2', exact: true }).click();
      await browserExpect(search).toBeVisible();
      await browserExpect(search).toHaveValue('Alpha');
      await browserExpect(rankedRow(page, 'alpha')).toHaveCount(1);
      await browserExpect(rankedRow(page, 'beta')).toHaveCount(0);
      expect(await exits(page)).toEqual([]);
    }, 'library');
  });

  it('keeps a hidden manual draft visible to the existing unsubmitted-form reload guard', async () => {
    await withPage(async (page) => {
      await page.getByRole('button', { name: 'Add games', exact: true }).click();
      const ranking = page.locator('.my-games-editor:visible');
      await ranking.locator('.manual-add > summary').click();
      await ranking.getByLabel('Game title', { exact: true }).fill('Guarded manual draft');
      await page.getByRole('button', { name: 'Close game picker', exact: true }).click();
      await page.getByRole('button', { name: 'Library, 2', exact: true }).click();
      await browserExpect(page.locator('[hidden] .ranking-row-content')).toHaveCount(2);
      expect(await page.evaluate(() => window.myGamesFixture.hasUnsubmittedForm())).toBe(true);
      await page.getByRole('button', { name: 'Ranking, 2', exact: true }).click();
      await page.getByRole('button', { name: 'Add games', exact: true }).click();
      await ranking.getByLabel('Game title', { exact: true }).fill('');
      await page.getByRole('button', { name: 'Library, 2', exact: true }).click();
      await browserExpect(page.locator('.ranking-row-content')).toHaveCount(0);
    });
  });
});

describe('My games Library paging', () => {
  // Two collection games and 53 added by the user make three Library pages; Next stays enabled on page 2.
  it('turns a page with nothing to save in one commit and one forced layout, after the new rows', async () => {
    await withPage(
      async (page) => {
        const pager = page.getByRole('navigation', { name: 'Library pages', exact: true });
        await browserExpect(pager.locator('p')).toHaveText('1–25 of 55 matching games');
        // The collection thumbnails 404 here; once they fall back, only the page turn writes the DOM.
        await browserExpect(page.locator('.record-thumb img')).toHaveCount(0);
        await page.evaluate(() => window.myGamesPaging.arm());
        await pager.getByRole('button', { name: 'Next', exact: true }).click();
        const turn = await page.evaluate(() => window.myGamesPaging.settled());
        expect(turn.row).toBe('manual:024');
        // One render commit: no disabled-then-enabled pass around a save with nothing to save.
        expect(turn.commits).toBe(1);
        // The only read that finds DOM writes pending, and so forces style and layout, is the results focus,
        // and it already sees the new rows. The scroll reuses that layout, and nothing writes the DOM after it.
        const results = 'Your library results';
        expect(turn.reads.filter((read) => read.dirty)).toEqual([
          { api: 'focus', target: results, dirty: true, row: 'manual:024' },
        ]);
        expect(turn.reads.filter((read) => read.api === 'scrollIntoView')).toEqual([
          { api: 'scrollIntoView', target: results, dirty: false, row: 'manual:024' },
        ]);
        expect(turn.mutationsAfterReads).toBe(0);
        expect(turn.focused).toBe(results);
        await browserExpect(pager.locator('p')).toHaveText('26–50 of 55 matching games');
        await browserExpect(pager.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
        expect(await exits(page)).toEqual([]);
      },
      'library',
      '&records=53&probe',
    );
  });

  it('leaves the workspace enabled when a pending save is superseded by a turn with nothing to save', async () => {
    await withPage(
      async (page) => {
        const pager = page.getByRole('navigation', { name: 'Library pages', exact: true });
        const next = pager.getByRole('button', { name: 'Next', exact: true });
        const ranking = page.getByRole('button', { name: 'Ranking, 2', exact: true });
        await browserExpect(pager.locator('p')).toHaveText('1–25 of 55 matching games');
        await page.evaluate(() => window.myGamesFixture.holdEditor());
        await next.click();
        // The first request waits for the held save with the workspace controls disabled.
        await browserExpect(next).toBeDisabled();
        await browserExpect(ranking).toBeDisabled();
        // A history change supersedes it, and the edit stops being pending before its save settles.
        await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
        await browserExpect(next).toBeEnabled();
        await page.evaluate(() => window.myGamesFixture.releaseEditor());
        await next.click();
        await browserExpect(pager.locator('p')).toHaveText('26–50 of 55 matching games');
        await page.evaluate(() => window.myGamesFixture.finishEditor(true));
        // The superseded request settles without turning the page again or leaving anything disabled.
        await browserExpect(pager.locator('p')).toHaveText('26–50 of 55 matching games');
        await browserExpect(next).toBeEnabled();
        await browserExpect(ranking).toBeEnabled();
        await browserExpect(page.getByRole('alert')).toHaveCount(0);
        expect(await exits(page)).toEqual([]);
      },
      'library',
      '&records=53',
    );
  });
});

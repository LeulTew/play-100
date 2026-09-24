import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../../lib/test-server-ports';

declare global {
  interface Window {
    myGamesFixture: { exits: string[]; saves: string[]; accept(value: boolean): void };
  }
}

const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>My games exit guard fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module">
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import MyGamesPage from '/src/components/personal/MyGamesPage.tsx';
import { emptyPersonalLibrary } from '/src/lib/personal-library.ts';
import '/src/styles.css';
import '/src/shared-ui.css';
const record = (id, title, collectionRank) => ({ id, source: 'collection', sourceId: id, title, year: 2020, collectionRank, sourceUrl: null, studio: null, genre: null });
const alpha = record('alpha', 'Alpha game', 1);
const beta = record('beta', 'Beta game', 2);
const initial = {
  ...emptyPersonalLibrary(), records: { alpha, beta },
  ranking: [{ id: 'alpha', note: 'Saved note', score: 7, manualPosition: null }, { id: 'beta', note: '', score: 5, manualPosition: null }],
};
const filters = { q: '', genre: 'all', year: 'all', tier: 'all', list: 'all', sort: 'rank', view: 'grid', direction: 'auto', catalogs: 'on' };
const exits = [], saves = [];
let accept = false;
function App() {
  const [state, setState] = useState(initial);
  const [view, setView] = useState(new URLSearchParams(location.search).get('view') ?? 'ranking');
  return h(MyGamesPage, {
    scope: 'guest', view, onViewChange: setView, state, filters, busy: false, animate: false, persistent: true,
    availableRecords: [alpha, beta], onOpen() {},
    onFilters: () => exits.push('filters'), onDiscover: () => exits.push('discover'),
    onBrowse: () => exits.push('browse'), onPublish: () => exits.push('publish'),
    async onAction(action) {
      if (action.type !== 'edit-ranking') return true;
      saves.push(JSON.stringify({ id: action.id, note: action.note, score: action.score }));
      if (!accept) return false;
      setState(prior => ({ ...prior, ranking: prior.ranking.map(entry => entry.id !== action.id ? entry : {
        ...entry, ...(action.note !== undefined ? { note: action.note } : {}), ...(action.score !== undefined ? { score: action.score } : {}),
      }) }));
      return true;
    },
  });
}
window.myGamesFixture = { exits, saves, accept: value => { accept = value; } };
createRoot(document.getElementById('mount')).render(h(App));
</script></body></html>`;

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
                if (request.url?.split('?')[0] !== '/__my-games-guard') return next();
                void vite.transformIndexHtml('/__my-games-guard', fixture).then((html) => {
                  response.setHeader('Content-Type', 'text/html');
                  response.end(html);
                }, next);
              });
            },
          },
        ],
        server: { host: '127.0.0.1', port: 0, watch: null },
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

async function withPage(work: (page: Page) => Promise<void>, view = 'ranking') {
  if (!browser) throw new Error('My games fixture browser unavailable.');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
  );
  try {
    await page.goto(`${origin}/__my-games-guard?view=${view}`);
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
  await page.getByRole('button', { name: 'Discover games beyond the 100', exact: true }).click();
  await keep();
  expect(await exits(page)).toEqual([]);
  await page.getByRole('searchbox', { name: 'Search your ranking' }).fill('Beta');
  await browserExpect(rankingStatus(page)).toHaveText(held);
  await browserExpect(rankedRow(page, 'alpha')).toHaveCount(1);
  await keep();
  expect(await exits(page)).toEqual([]);
}

describe('My games exit guard', () => {
  it('keeps a failed note draft through Find games, Publish, Discover and a row-hiding search', async () => {
    await withPage(async (page) => {
      await rankedRow(page, 'alpha').locator('summary').click();
      const note = rankedRow(page, 'alpha').locator('#note-alpha');
      await note.fill('Unsaved draft');
      await note.press('Tab');
      const failure = page.getByRole('alert').filter({ hasText: 'The note could not be saved.' });
      await browserExpect(failure).toBeVisible();
      await expectGuardedExits(page, async () => {
        await browserExpect(note).toHaveValue('Unsaved draft');
        await browserExpect(failure).toBeVisible();
        await browserExpect(note).toBeEnabled();
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
      await expectGuardedExits(page, async () => {
        await browserExpect(rating).toHaveValue('9');
        await browserExpect(failure).toBeVisible();
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
  it('mounts Ranking on its first visit and keeps it mounted afterwards', async () => {
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
      await browserExpect(page.getByRole('list', { name: 'Your ranked games', exact: true })).toBeHidden();
      // Leaving Ranking keeps its subtree, so its search and filtered rows survive the round trip.
      await browserExpect(page.locator('#ranking-search')).toHaveValue('Alpha');
      await page.getByRole('button', { name: 'Ranking, 2', exact: true }).click();
      await browserExpect(search).toBeVisible();
      await browserExpect(search).toHaveValue('Alpha');
      await browserExpect(rankedRow(page, 'alpha')).toHaveCount(1);
      await browserExpect(rankedRow(page, 'beta')).toHaveCount(0);
      expect(await exits(page)).toEqual([]);
    }, 'library');
  });
});

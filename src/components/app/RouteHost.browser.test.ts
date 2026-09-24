import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../../lib/test-server-ports';

declare global {
  interface Window { routeHostFixture: { routes: string[] } }
}

// Mirrors App: /my-library renders route 'library'; switching tabs navigates to /my-games (route 'games').
const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Route host workspace fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module">
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouteHost } from '/src/components/app/RouteHost.tsx';
import { emptyPersonalLibrary } from '/src/lib/personal-library.ts';
import '/src/styles.css';
import '/src/shared-ui.css';
const record = (id, title, collectionRank) => ({ id, source: 'collection', sourceId: id, title, year: 2020, collectionRank, sourceUrl: null, studio: null, genre: null });
const alpha = record('alpha', 'Alpha game', 1);
const state = { ...emptyPersonalLibrary(), records: { alpha }, ranking: [{ id: 'alpha', note: '', score: null, manualPosition: null }] };
const filters = { q: '', genre: 'all', year: 'all', tier: 'all', list: 'all', sort: 'rank', view: 'grid', direction: 'auto', catalogs: 'on' };
const routes = [];
function App() {
  const [route, setRoute] = useState('library');
  const [view, setView] = useState('library');
  routes.push(route);
  const props = {
    scope: 'guest', view, onViewChange(next) { setView(next); setRoute('games'); }, state, filters, busy: false, animate: false,
    persistent: true, availableRecords: [alpha], onOpen() {}, onFilters() {}, onDiscover() {}, onBrowse() {},
    async onAction() { return true; },
  };
  return h(RouteHost, { route, scope: 'guest', online: null, content: { kind: 'personal', props } });
}
window.routeHostFixture = { routes };
createRoot(document.getElementById('mount')).render(h(App));
</script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (await createFetchSafeViteServer(() => createServer({
    configFile: false, root: process.cwd(), cacheDir: 'node_modules/.vite-route-host-tests',
    logLevel: 'error', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'] },
    plugins: [react(), {
      name: 'route-host-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== '/__route-host') return next();
          void vite.transformIndexHtml('/__route-host', fixture).then(html => {
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          }, next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0, watch: null },
  }))).server;
  expect(server.config.optimizeDeps.noDiscovery).toBe(true);
  expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-route-host-tests$/);
  expect(server.config.server.watch).toBeNull();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Route host fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => { await browser?.close(); await server?.close(); }, 60_000);

describe('RouteHost My games workspace', () => {
  it('keeps an open manual draft when a legacy library link moves to the My games route', async () => {
    if (!browser) throw new Error('Route host fixture browser unavailable.');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort('blockedbyclient'));
    try {
      await page.goto(`${origin}/__route-host`);
      await browserExpect(page.getByRole('heading', { name: 'My games', level: 1 })).toBeVisible();
      const library = page.locator('.my-games-editor:visible');
      const view = (label: string) => page.getByRole('navigation', { name: 'My games views', exact: true })
        .getByRole('button', { name: new RegExp(`^${label}\\b`) });
      await library.locator('.manual-add > summary').click();
      const title = library.getByLabel('Game title', { exact: true });
      await title.fill('Unsubmitted manual draft');
      const titleId = await title.getAttribute('id');
      await view('Ranking').click();
      await browserExpect(page.getByRole('list', { name: 'Your ranked games', exact: true })).toBeVisible();
      await view('Library').click();
      await browserExpect(library.locator('.manual-add')).toHaveJSProperty('open', true);
      await browserExpect(library.getByLabel('Game title', { exact: true })).toHaveValue('Unsubmitted manual draft');
      // The same input element identity (useId) proves the workspace was not remounted.
      await browserExpect(library.getByLabel('Game title', { exact: true })).toHaveAttribute('id', titleId ?? '');
      const routes = await page.evaluate(() => window.routeHostFixture.routes);
      expect(routes).toContain('library');
      expect(routes.at(-1)).toBe('games');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 60_000);
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../../lib/test-server-ports';

declare global {
  interface Window {
    onlineRouteFixture: { renders: string[]; bump: () => void };
  }
}

const STUB = '\0online-controller-stub';
// Records each render and the URL it read, as OnlineController reads ?group= and /friends/:uid during render.
const stub = `import { createElement as h } from 'react';
export default function OnlineController() {
  window.onlineRouteFixture.renders.push(location.search);
  return h('p', { id: 'online-url' }, location.search || 'none');
}`;

// Mirrors App: stable online props, and other state (a notice, a panel, the tray) that changes around the route.
const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><title>Online route fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module">
import { createElement as h, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouteHost } from '/src/components/app/RouteHost.tsx';
const renders = [];
let bump = () => {};
function App() {
  const [other, setOther] = useState(0);
  bump = () => setOther((count) => count + 1);
  const online = useMemo(() => ({ onDevice() {}, onFailedChange() {}, fallback: null, props: {} }), []);
  return h('div', null, h('span', { id: 'other' }, String(other)),
    h(RouteHost, { route: 'compare', scope: 'guest', online, content: null }));
}
window.onlineRouteFixture = { renders, bump: () => bump() };
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
        cacheDir: 'node_modules/.vite-online-route-tests',
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
          {
            name: 'online-controller-stub',
            enforce: 'pre',
            resolveId: (source) => (source.endsWith('/cloud/OnlineController') ? STUB : undefined),
            load: (id) => (id === STUB ? stub : undefined),
          },
          react(),
          {
            name: 'online-route-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url?.split('?')[0] !== '/__online-route') return next();
                void vite.transformIndexHtml('/__online-route', fixture).then((html) => {
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
  expect(server.config.server.watch).toBeNull();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Online route fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

describe('RouteHost online route', () => {
  it('renders the controller again on every navigation, and not for the state around it', async () => {
    if (!browser) throw new Error('Online route fixture browser unavailable.');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
    );
    const renders = () => page.evaluate(() => window.onlineRouteFixture.renders.length);
    try {
      await page.goto(`${origin}/__online-route?group=a`);
      const url = page.locator('#online-url');
      await browserExpect(url).toHaveText('?group=a');
      const settled = await renders();
      await page.evaluate(() => {
        for (let count = 0; count < 3; count += 1) window.onlineRouteFixture.bump();
      });
      await browserExpect(page.locator('#other')).toHaveText('3');
      expect(await renders()).toBe(settled);
      // Choose friends pushes a new comparison on the same route, then Back returns to the group.
      await page.evaluate(() => {
        history.pushState(null, '', '/__online-route?catalogs=x');
        window.dispatchEvent(new Event('play100:navigate'));
      });
      await browserExpect(url).toHaveText('?catalogs=x');
      await page.goBack();
      await browserExpect(url).toHaveText('?group=a');
      const navigated = await renders();
      await page.evaluate(() => window.onlineRouteFixture.bump());
      await browserExpect(page.locator('#other')).toHaveText('4');
      expect(await renders()).toBe(navigated);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);
});

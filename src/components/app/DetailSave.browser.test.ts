import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../../lib/test-server-ports';

declare global {
  interface Window {
    detailSaveFixture: { saves: string[]; signOutElsewhere: () => void };
  }
}

// Keep the isolated Vite/Playwright harness: @vitest/browser-playwright is not installed.
// The external fixture module is checked by TypeScript and ESLint without adding a dependency.
const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><title>Detail save fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module" src="/src/components/app/DetailSave.browser-fixture.tsx"></script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-detail-save-tests',
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
            name: 'detail-save-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url?.split('?')[0] !== '/__detail-save') return next();
                void vite.transformIndexHtml('/__detail-save', fixture).then((html) => {
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
  if (!address || typeof address === 'string') throw new Error('Detail save fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

describe('the detail dialog save', () => {
  it('keeps a held detail rating on the account it was typed for when another tab signs out', async () => {
    if (!browser) throw new Error('Detail save fixture browser unavailable.');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
    );
    try {
      await page.goto(`${origin}/__detail-save`);
      // Hold the field's 650 ms debounced save, so only the dialog's exit saves the draft.
      await page.evaluate(() => {
        const schedule = window.setTimeout.bind(window);
        window.setTimeout = ((handler: TimerHandler, timeout?: number, ...rest: unknown[]) =>
          timeout === 650 ? 0 : schedule(handler, timeout, ...rest)) as typeof window.setTimeout;
      });
      await page.getByRole('spinbutton').fill('8.3');
      await page.evaluate(() => window.detailSaveFixture.signOutElsewhere());
      await browserExpect(page.locator('#scope')).toHaveText('guest');
      await browserExpect(page.getByRole('spinbutton')).toHaveCount(0);
      await browserExpect.poll(() => page.evaluate(() => window.detailSaveFixture.saves)).toEqual(['account:a:8.3']);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../../lib/test-server-ports';

declare global {
  interface Window {
    appDetailSave: { accountSaves: string[]; signOutElsewhere: () => void };
  }
}

// Mounts the real App (REL-01b): only cloud/OnlineController is replaced, by a typed stub that reports an account and
// then a cross-tab sign-out. The emulator mode makes online tools available without Firebase ever loading.
const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><title>App detail save fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="root"></div><script type="module" src="/src/components/app/AppDetailSave.browser-fixture.tsx"></script></body></html>`;
const STUB = path.resolve('src/components/app/AppDetailSave.browser-stub.tsx');

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        mode: 'cloud-test',
        define: { 'import.meta.env.VITE_USE_FIREBASE_EMULATORS': JSON.stringify('true') },
        cacheDir: 'node_modules/.vite-app-detail-save-tests',
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
          },
          react(),
          {
            name: 'app-detail-save-fixture',
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
        server: { host: '127.0.0.1', port: 0, watch: null },
      }),
    )
  ).server;
  expect(server.config.optimizeDeps.noDiscovery).toBe(true);
  expect(server.config.server.watch).toBeNull();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('App detail save fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 60_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

describe("App's catalog-detail save", () => {
  it('keeps a held detail rating on the account it was typed for when another tab signs out', async () => {
    if (!browser) throw new Error('App detail save fixture browser unavailable.');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
    );
    // A remembered account: App mounts the online controller as soon as it starts.
    await context.addInitScript(() => localStorage.setItem('play100.online-requested.v1', 'yes'));
    try {
      await page.goto(`${origin}/my-games?game=${encodeURIComponent('manual:held')}`);
      const rating = page.getByRole('dialog').getByRole('spinbutton');
      await browserExpect(rating).toBeVisible({ timeout: 30_000 });
      // Hold the field's 650 ms debounced save, so only the dialog's exit saves the draft.
      await page.evaluate(() => {
        const schedule = window.setTimeout.bind(window);
        window.setTimeout = ((handler: TimerHandler, timeout?: number, ...rest: unknown[]) =>
          timeout === 650 ? 0 : schedule(handler, timeout, ...rest)) as typeof window.setTimeout;
      });
      await rating.fill('8.3');
      await page.evaluate(() => window.appDetailSave.signOutElsewhere());
      await browserExpect(rating).toHaveCount(0);
      await browserExpect
        .poll(() => page.evaluate(() => window.appDetailSave.accountSaves))
        .toEqual(['manual:held:8.3']);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 90_000);
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';

declare global {
  interface Window {
    friendShelfCardFixture: { title: string; saved: string[]; pinned: string[]; opened: string[] };
  }
}

// Keep the isolated Vite/Playwright harness: @vitest/browser-playwright is not installed.
// The external fixture module is checked by TypeScript and ESLint without adding a dependency.
const fixture = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Friend shelf title fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module" src="/src/cloud/FriendShelfCards.browser-fixture.tsx"></script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-friend-shelf-card-tests',
        logLevel: 'error',
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
        plugins: [
          react(),
          {
            name: 'friend-shelf-card-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url?.split('?')[0] !== '/__friend-shelf-card') return next();
                void vite.transformIndexHtml('/__friend-shelf-card', fixture).then((html) => {
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
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Friend shelf fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => {
  const results = await Promise.allSettled([browser?.close(), server?.close()]);
  const failures = results.filter((result) => result.status === 'rejected').map((result): unknown => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Friend shelf fixture cleanup failed.');
}, 60_000);

describe('friend shelf title announcements', () => {
  for (const paged of [false, true]) {
    it.each([
      ['Chrono Trigger', 'Chrono Trigger'],
      ['Game\u202E title\u202C\u200B', 'Game title'],
    ])(`keeps Save/Pin text safe without rewriting the title (paged=${paged}, title=%s)`, async (title, label) => {
      if (!browser) throw new Error('Friend shelf fixture browser is unavailable.');
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
      );
      try {
        const query = new URLSearchParams({ title, paged: String(paged) });
        await page.goto(`${origin}/__friend-shelf-card?${query}`);
        const cards = page.locator('.friend-shelf-cards');
        const heading = cards.locator('h3');
        await browserExpect(heading).toBeVisible();
        expect(await heading.textContent()).toBe(title);
        const pin = cards.getByRole('button', { name: `Pin ${label}`, exact: true });
        await browserExpect(pin).toHaveAttribute('aria-label', `Pin ${label}`);
        expect(await pin.getAttribute('aria-label')).not.toMatch(/\p{Cf}/u);
        await pin.click();
        const notice = cards.getByRole('status');
        await browserExpect(notice).toHaveText(`${label} pinned.`);
        expect(await notice.textContent()).not.toMatch(/\p{Cf}/u);
        await cards.getByRole('button', { name: 'Save', exact: true }).click();
        await browserExpect(notice).toHaveText(`${label} added to My games.`);
        expect(await notice.textContent()).not.toMatch(/\p{Cf}/u);
        await heading.locator('button').click();
        expect(await heading.textContent()).toBe(title);
        expect(await page.evaluate(() => window.friendShelfCardFixture)).toEqual({
          title,
          saved: [title],
          pinned: [title],
          opened: [title],
        });
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

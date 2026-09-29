import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';
import type { AccountWriterFixture } from './useAccountLibrary.browser-fixture';

declare global {
  interface Window { accountWriterFixture: AccountWriterFixture }
}

const fixture = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Account writer fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module" src="/src/hooks/useAccountLibrary.browser-fixture.tsx"></script></body></html>`;
let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;
beforeAll(async () => {
  server = (await createFetchSafeViteServer(() => createServer({
    configFile: false, root: process.cwd(), cacheDir: 'node_modules/.vite-account-writer-tests',
    logLevel: 'error', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
    plugins: [react(), {
      name: 'account-writer-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== '/__account-writer') return next();
          void vite.transformIndexHtml('/__account-writer', fixture).then((html) => {
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          }, next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0, watch: null },
  }))).server;
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Account writer fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

async function twoTabs(work: (remover: Page, editor: Page) => Promise<void>) {
  if (!browser) throw new Error('Account writer fixture browser unavailable.');
  const context = await browser.newContext();
  const errors: string[] = [];
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
  );
  try {
    const remover = await context.newPage();
    const editor = await context.newPage();
    for (const page of [remover, editor]) {
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/__account-writer`);
      await browserExpect(page.getByRole('status')).toHaveText('ready');
    }
    await work(remover, editor);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

describe('cross-tab account writer retirement', () => {
  it('refuses a held direct canonical rate-game save after removal completes', async () => {
    await twoTabs(async (remover, editor) => {
      await editor.evaluate(() => window.accountWriterFixture.holdRating(9));
      expect(await remover.evaluate(() => window.accountWriterFixture.signOut(true))).toBe(true);
      await browserExpect(remover.getByRole('status')).toHaveText('Signed out');
      await editor.evaluate(() => window.accountWriterFixture.refresh());
      expect(await editor.evaluate(() => window.accountWriterFixture.release())).toBe(false);
      await browserExpect(editor.getByRole('status')).toContainText('device copy was removed');
      expect(await remover.evaluate(() => window.accountWriterFixture.inspect())).toEqual({
        present: false, score: null, guestRecords: 0, hint: null, pins: null,
      });
    });
  });

  it('keeps old callbacks retired when another tab explicitly opens a new generation', async () => {
    await twoTabs(async (remover, editor) => {
      await editor.evaluate(() => window.accountWriterFixture.holdRating(9));
      expect(await remover.evaluate(() => window.accountWriterFixture.signOut(true))).toBe(true);
      await remover.evaluate(() => window.accountWriterFixture.reopen());
      await browserExpect(remover.getByRole('status')).toHaveText('ready');
      expect(await remover.evaluate(() => window.accountWriterFixture.save(4))).toBe(true);
      expect(await editor.evaluate(() => window.accountWriterFixture.release())).toBe(false);
      expect(await remover.evaluate(() => window.accountWriterFixture.inspect())).toMatchObject({
        present: true, score: 4, guestRecords: 0,
      });
    });
  });

  it('preserves held account edits on ordinary sign-out and keeps command bindings stable within a generation', async () => {
    await twoTabs(async (remover, editor) => {
      await editor.evaluate(() => window.accountWriterFixture.holdRating(8));
      expect(await editor.evaluate(() => window.accountWriterFixture.save(5))).toBe(true);
      await editor.evaluate(() => window.accountWriterFixture.refresh());
      expect(await editor.evaluate(() => window.accountWriterFixture.commandsStable())).toBe(true);
      expect(await remover.evaluate(() => window.accountWriterFixture.signOut(false))).toBe(true);
      expect(await editor.evaluate(() => window.accountWriterFixture.release())).toBe(true);
      expect(await remover.evaluate(() => window.accountWriterFixture.inspect())).toMatchObject({
        present: true, score: 8, guestRecords: 0,
      });
    });
  });
});

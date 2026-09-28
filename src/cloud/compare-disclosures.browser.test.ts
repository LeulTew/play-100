import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';

declare global {
  interface Window {
    comparePeopleDisclosureFixture: {
      chooser: HTMLDetailsElement;
      /** The chooser's `open` as each of its toggle events was delivered. */
      toggles: boolean[];
      /** Commits this many chosen people, in the calling task. */
      choose: (count: number) => void;
      /** Commits a render that changes nothing the chooser follows, in the calling task. */
      rerender: () => void;
      /** Resolves once every details toggle event queued before the call has been delivered. */
      afterQueuedToggles: () => Promise<void>;
    };
  }
}

// The isolated Vite/Playwright harness the other browser tests use; the fixture module is typed and linted.
const fixture = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Compare people chooser fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module" src="/src/cloud/compare-disclosures.browser-fixture.tsx"></script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-compare-disclosure-tests',
        logLevel: 'error',
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client'] },
        plugins: [
          react(),
          {
            name: 'compare-disclosure-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url?.split('?')[0] !== '/__compare-disclosures') return next();
                void vite.transformIndexHtml('/__compare-disclosures', fixture).then((html) => {
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
  if (!address || typeof address === 'string') throw new Error('Compare disclosure fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => {
  const results = await Promise.allSettled([browser?.close(), server?.close()]);
  const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Compare disclosure fixture cleanup failed.');
}, 60_000);

describe("Compare's people chooser", () => {
  it('reopens for fewer than two people while a close is still on its way, and keeps a close made after', async () => {
    if (!browser) throw new Error('Compare disclosure fixture browser is unavailable.');
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
    );
    try {
      await page.goto(`${origin}/__compare-disclosures`);
      const chooser = page.locator('#chooser');
      const state = page.locator('#chooser-state');
      await browserExpect(state).toHaveAttribute('data-open', 'false');
      // Two people are chosen, and the user opens the chooser.
      await chooser.locator('summary').click();
      await browserExpect(state).toHaveAttribute('data-open', 'true');
      // In one task, the user closes the chooser, which queues its toggle event, and one person is left, committed
      // before that event can be delivered: a revocation's render that lands first.
      const race = await page.evaluate(async () => {
        const fixture = window.comparePeopleDisclosureFixture;
        const delivered = fixture.toggles.length;
        fixture.chooser.querySelector('summary')?.click();
        const closed = !fixture.chooser.open;
        fixture.choose(1);
        const pending = fixture.toggles.length === delivered;
        await fixture.afterQueuedToggles();
        return { closed, pending, late: fixture.toggles.slice(delivered), open: fixture.chooser.open };
      });
      expect(race).toMatchObject({ closed: true, pending: true, open: true });
      // The late event, if the browser still delivers it, reports the chooser open, so it cannot close it again.
      expect(race.late).not.toContain(false);
      await browserExpect(chooser).toHaveJSProperty('open', true);
      await browserExpect(state).toHaveAttribute('data-open', 'true');
      // A close after that sticks, through later renders too.
      await chooser.locator('summary').click();
      await page.evaluate(() => window.comparePeopleDisclosureFixture.afterQueuedToggles());
      await browserExpect(state).toHaveAttribute('data-open', 'false');
      await page.evaluate(() => window.comparePeopleDisclosureFixture.rerender());
      await browserExpect(chooser).toHaveJSProperty('open', false);
      await browserExpect(state).toHaveAttribute('data-open', 'false');
      // Two people leave it closed, and the next drop below two opens it again.
      await page.evaluate(() => window.comparePeopleDisclosureFixture.choose(2));
      await browserExpect(chooser).toHaveJSProperty('open', false);
      await page.evaluate(() => window.comparePeopleDisclosureFixture.choose(1));
      await browserExpect(chooser).toHaveJSProperty('open', true);
      await browserExpect(state).toHaveAttribute('data-open', 'true');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);
});

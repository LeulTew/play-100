import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';

declare global {
  interface Window {
    compareDisclosureFixture: {
      chooser: HTMLDetailsElement;
      coverage: HTMLDetailsElement;
      /** The chooser's `open` as each of its toggle events was delivered. */
      toggles: boolean[];
      /** Commits this many chosen people, in the calling task. */
      choose: (count: number) => void;
      /** Commits these failed reads (people joined with `|`, empty for none), in the calling task. */
      fail: (problems: string) => void;
      /** Clicks Review coverage and recovery and commits it, in the calling task. */
      review: () => void;
      /** Commits a render that changes nothing either disclosure follows, in the calling task. */
      rerender: () => void;
      /** Resolves once every details toggle event queued before the call has been delivered. */
      afterQueuedToggles: () => Promise<void>;
    };
  }
}

// The isolated Vite/Playwright harness the other browser tests use; the fixture module is typed and linted.
const fixture = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Compare disclosure fixture</title><link rel="icon" href="/favicon.svg">
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

async function withFixture(run: (page: Page) => Promise<void>) {
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
    await run(page);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

describe("Compare's disclosures", () => {
  it('reopen the people chooser for fewer than two people while a close is on its way, and keep a later close', async () => {
    await withFixture(async (page) => {
      const chooser = page.locator('#chooser');
      const state = page.locator('#chooser-state');
      await browserExpect(state).toHaveAttribute('data-open', 'false');
      // Two people are chosen, and the user opens the chooser.
      await chooser.locator('summary').click();
      await browserExpect(state).toHaveAttribute('data-open', 'true');
      // In one task, the user closes the chooser, which queues its toggle event, and one person is left, committed
      // before that event can be delivered: a revocation's render that lands first.
      const race = await page.evaluate(async () => {
        const fixture = window.compareDisclosureFixture;
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
      await page.evaluate(() => window.compareDisclosureFixture.afterQueuedToggles());
      await browserExpect(state).toHaveAttribute('data-open', 'false');
      await page.evaluate(() => window.compareDisclosureFixture.rerender());
      await browserExpect(chooser).toHaveJSProperty('open', false);
      await browserExpect(state).toHaveAttribute('data-open', 'false');
      // Two people leave it closed, and the next drop below two opens it again.
      await page.evaluate(() => window.compareDisclosureFixture.choose(2));
      await browserExpect(chooser).toHaveJSProperty('open', false);
      await page.evaluate(() => window.compareDisclosureFixture.choose(1));
      await browserExpect(chooser).toHaveJSProperty('open', true);
      await browserExpect(state).toHaveAttribute('data-open', 'true');
    });
  }, 60_000);

  it('reopen coverage for a new failed read or a review while a close is on its way, and keep a later close', async () => {
    await withFixture(async (page) => {
      const coverage = page.locator('#coverage');
      const state = page.locator('#coverage-state');
      await browserExpect(state).toHaveAttribute('data-open', 'false');
      await page.evaluate(() => window.compareDisclosureFixture.fail('alpha'));
      await browserExpect(coverage).toHaveJSProperty('open', true);
      await browserExpect(state).toHaveAttribute('data-open', 'true');
      // In one task, the user closes coverage, which queues its toggle event, and then another read fails, or the
      // user asks to review coverage, committed before that event can be delivered.
      for (const reopen of ['fail', 'review'] as const) {
        const race = await page.evaluate(async (by) => {
          const fixture = window.compareDisclosureFixture;
          fixture.coverage.querySelector('summary')?.click();
          const closed = !fixture.coverage.open;
          if (by === 'fail') fixture.fail('alpha|beta');
          else fixture.review();
          await fixture.afterQueuedToggles();
          return { closed, open: fixture.coverage.open };
        }, reopen);
        expect(race, reopen).toEqual({ closed: true, open: true });
        await browserExpect(state).toHaveAttribute('data-open', 'true');
      }
      // A close after that sticks while the same reads stay failed.
      await coverage.locator('summary').click();
      await page.evaluate(() => window.compareDisclosureFixture.afterQueuedToggles());
      await browserExpect(state).toHaveAttribute('data-open', 'false');
      await page.evaluate(() => window.compareDisclosureFixture.fail('alpha|beta'));
      await page.evaluate(() => window.compareDisclosureFixture.rerender());
      await browserExpect(coverage).toHaveJSProperty('open', false);
      await browserExpect(state).toHaveAttribute('data-open', 'false');
    });
  }, 60_000);
});

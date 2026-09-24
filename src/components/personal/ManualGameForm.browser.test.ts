import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';

declare global {
  interface Window {
    manualFormFixture: { added: string[]; pending(): number; finish(result: boolean | 'reject'): void };
  }
}

const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manual game form fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module">
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import ManualGameForm from '/src/components/personal/ManualGameForm.tsx';
import '/src/styles.css';
import '/src/shared-ui.css';
const added = [], waiting = [];
window.manualFormFixture = {
  added, pending: () => waiting.length,
  finish(result) { const next = waiting.shift(); if (next) next(result); },
};
createRoot(document.getElementById('mount')).render(h(ManualGameForm, {
  busy: false, actionLabel: 'Add to my library',
  onAdd: record => new Promise((resolve, reject) => {
    added.push(record.title + '|' + record.year);
    waiting.push(result => result === 'reject' ? reject(new Error('Synthetic add rejection')) : resolve(result));
  }),
}));
</script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = await createServer({
    configFile: false, root: process.cwd(), cacheDir: 'node_modules/.vite-manual-form-tests',
    logLevel: 'error', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
    plugins: [react(), {
      name: 'manual-form-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== '/__manual-form') return next();
          void vite.transformIndexHtml('/__manual-form', fixture).then(html => {
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          }, next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0, watch: null },
  });
  expect(server.config.optimizeDeps.noDiscovery).toBe(true);
  expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-manual-form-tests$/);
  expect(server.config.server.watch).toBeNull();
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Manual form fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => { await browser?.close(); await server?.close(); }, 60_000);

async function withForm(work: (page: Page) => Promise<void>) {
  if (!browser) throw new Error('Manual form fixture browser unavailable.');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort('blockedbyclient'));
  try {
    await page.goto(`${origin}/__manual-form`);
    await page.getByText('Add a game manually').click();
    await work(page);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
}

const title = (page: Page) => page.getByRole('textbox', { name: 'Game title' });
const year = (page: Page) => page.getByRole('spinbutton', { name: 'Year (optional)' });
const submit = async (page: Page, name: string, value: string) => {
  await title(page).fill(name);
  await year(page).fill(value);
  await page.getByRole('button', { name: 'Add to my library' }).click();
  await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(1);
};
const finish = (page: Page, result: boolean | 'reject') => page.evaluate(value => window.manualFormFixture.finish(value), result);

describe('manual game form', () => {
  it('clears the submitted draft after an ordinary success', async () => {
    await withForm(async page => {
      await submit(page, 'Game A', '2001');
      await finish(page, true);
      await browserExpect(title(page)).toHaveValue('');
      await browserExpect(year(page)).toHaveValue('');
      expect(await page.evaluate(() => [...window.manualFormFixture.added])).toEqual(['Game A|2001']);
    });
  });

  it('keeps a newer draft typed while the earlier add was saving', async () => {
    await withForm(async page => {
      await submit(page, 'Game A', '2001');
      await title(page).fill('Game B');
      await year(page).fill('2002');
      await finish(page, true);
      await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(0);
      await browserExpect(title(page)).toHaveValue('Game B');
      await browserExpect(year(page)).toHaveValue('2002');
      await browserExpect(page.getByRole('alert')).toHaveCount(0);
    });
  });

  it('keeps the draft after a refused or rejected add', async () => {
    await withForm(async page => {
      await submit(page, 'Game A', '2001');
      await finish(page, false);
      await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(0);
      await browserExpect(title(page)).toHaveValue('Game A');
      await browserExpect(year(page)).toHaveValue('2001');
      await page.getByRole('button', { name: 'Add to my library' }).click();
      await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(1);
      await finish(page, 'reject');
      await browserExpect(page.getByRole('alert')).toHaveText('The game could not be added. Your entry is unchanged; try again.');
      await browserExpect(title(page)).toHaveValue('Game A');
      await browserExpect(year(page)).toHaveValue('2001');
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../../lib/test-server-ports';

declare global {
  interface Window {
    manualFormFixture: {
      added: string[];
      pending(): number;
      finish(result: boolean | 'reject'): void;
      unmount(): void;
    };
  }
}

// Keep the isolated Vite/Playwright harness: @vitest/browser-playwright is not installed.
// The external fixture module is checked by TypeScript and ESLint without adding a dependency.
const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manual game form fixture</title><link rel="icon" href="/favicon.svg">
</head><body><button id="another-action">Another action</button><div id="mount"></div><script type="module" src="/src/components/personal/ManualGameForm.browser-fixture.tsx"></script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-manual-form-tests',
        logLevel: 'error',
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
        plugins: [
          react(),
          {
            name: 'manual-form-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url !== '/__manual-form') return next();
                void vite.transformIndexHtml('/__manual-form', fixture).then((html) => {
                  response.setHeader('Content-Type', 'text/html');
                  response.end(html);
                }, next);
              });
            },
          },
        ],
        server: {
          host: '127.0.0.1',
          port: Number(process.env.PLAY100_BROWSER_UNIT_PORT ?? 0),
          strictPort: true,
          watch: null,
        },
      }),
    )
  ).server;
  expect(server.config.optimizeDeps.noDiscovery).toBe(true);
  expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-manual-form-tests$/);
  expect(server.config.server.watch).toBeNull();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Manual form fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

async function withForm(work: (page: Page) => Promise<void>, width = 1280) {
  if (!browser) throw new Error('Manual form fixture browser unavailable.');
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
  );
  try {
    await page.goto(`${origin}/__manual-form`);
    await page.getByText('Add a game manually').click();
    await work(page);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

const title = (page: Page) => page.getByRole('textbox', { name: 'Game title' });
const year = (page: Page) => page.getByRole('spinbutton', { name: 'Year (optional)' });
const submit = async (page: Page, name: string, value: string) => {
  await title(page).fill(name);
  await year(page).fill(value);
  await page.getByRole('button', { name: 'Add to my library' }).click();
  await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(1);
};
const finish = (page: Page, result: boolean | 'reject') =>
  page.evaluate((value) => window.manualFormFixture.finish(value), result);

describe('manual game form', () => {
  for (const width of [393, 1280]) {
    for (const outcome of [true, false, 'reject'] as const) {
      it(`${width}px keyboard add ${String(outcome)} preserves focus and guards repeated submission`, async () => {
        await withForm(async (page) => {
          await title(page).fill('Keyboard game');
          await year(page).fill('1997');
          await year(page).press('Tab');
          const add = page.getByRole('button', { name: 'Add to my library' });
          await browserExpect(add).toBeFocused();
          await page.keyboard.press('Enter');
          await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(1);
          await browserExpect(add).toBeFocused();
          await browserExpect(add).toHaveAttribute('aria-disabled', 'true');
          await browserExpect(add).not.toHaveAttribute('disabled');
          await page.keyboard.press('Enter');
          expect(await page.evaluate(() => window.manualFormFixture.added.length)).toBe(1);
          await finish(page, outcome);
          if (outcome === true) {
            await browserExpect(title(page)).toHaveValue('');
            await browserExpect(title(page)).toBeFocused();
          } else {
            await browserExpect(page.getByRole('alert')).toBeVisible();
            await browserExpect(title(page)).toHaveValue('Keyboard game');
            await browserExpect(add).toBeFocused();
          }
        }, width);
      });
    }
    for (const next of ['action', 'edit', 'navigate', 'unmount'] as const) {
      it(`${width}px successful add respects ${next} while saving`, async () => {
        await withForm(async (page) => {
          await submit(page, 'Game A', '2001');
          const other = page.getByRole('button', { name: 'Another action', exact: true });
          if (next === 'edit') await year(page).fill('2002');
          else await other.focus();
          if (next === 'navigate')
            await page.evaluate(() => {
              history.pushState({}, '', '/elsewhere');
              dispatchEvent(new PopStateEvent('popstate'));
            });
          if (next === 'unmount') await page.evaluate(() => window.manualFormFixture.unmount());
          await finish(page, true);
          await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(0);
          if (next === 'edit') {
            await browserExpect(year(page)).toBeFocused();
            await browserExpect(title(page)).toHaveValue('Game A');
            await browserExpect(year(page)).toHaveValue('2002');
          } else {
            if (next !== 'unmount') await browserExpect(title(page)).toHaveValue('');
            await browserExpect(other).toBeFocused();
          }
        }, width);
      });
    }
  }

  it('clears the submitted draft after an ordinary success', async () => {
    await withForm(async (page) => {
      await submit(page, 'Game A', '2001');
      await finish(page, true);
      await browserExpect(title(page)).toHaveValue('');
      await browserExpect(year(page)).toHaveValue('');
      expect(await page.evaluate(() => [...window.manualFormFixture.added])).toEqual(['Game A|2001']);
    });
  });

  it('keeps a newer draft typed while the earlier add was saving', async () => {
    await withForm(async (page) => {
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
    await withForm(async (page) => {
      await submit(page, 'Game A', '2001');
      await finish(page, false);
      await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(0);
      await browserExpect(page.getByRole('alert')).toHaveText(
        'The game could not be added. Your entry is unchanged; try again.',
      );
      await browserExpect(page.locator('.manual-add')).toHaveAttribute('open', '');
      await browserExpect(title(page)).toHaveValue('Game A');
      await browserExpect(year(page)).toHaveValue('2001');
      await page.getByRole('button', { name: 'Add to my library' }).click();
      await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(1);
      await finish(page, 'reject');
      await browserExpect(page.getByRole('alert')).toHaveText(
        'The game could not be added. Your entry is unchanged; try again.',
      );
      await browserExpect(title(page)).toHaveValue('Game A');
      await browserExpect(year(page)).toHaveValue('2001');
      await page.getByRole('button', { name: 'Add to my library' }).click();
      await browserExpect.poll(() => page.evaluate(() => window.manualFormFixture.pending())).toBe(1);
      await finish(page, true);
      await browserExpect(page.getByRole('alert')).toHaveCount(0);
      await browserExpect(title(page)).toHaveValue('');
      await browserExpect(year(page)).toHaveValue('');
      await browserExpect(page.locator('.manual-add')).toHaveAttribute('open', '');
    });
  });
});

import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { afterAll, beforeAll, expect, it } from 'vitest';

let server: ViteDevServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  server = await createServer({
    mode: 'cloud-test',
    cacheDir: 'node_modules/.vite-online-config-tests',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'online-config-fixture-watch',
      config(config) {
        // Vite's config merge skips null overrides; mutate watch directly.
        config.server = { ...config.server, watch: null };
      },
    }],
    define: {
      'import.meta.env.VITE_USE_FIREBASE_EMULATORS': JSON.stringify('false'),
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('invalid-config-fixture'),
    },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
}, 60_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  const results = await Promise.allSettled([browser?.close(), server?.close()]);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Online-config fixture teardown failed.');
}, 60_000);

it('keeps actual guest browsing and saving usable with invalid optional online configuration', async () => {
  if (!server || !browser) throw new Error('The isolated config fixture is unavailable.');
  let page: Page | undefined;
  try {
    expect(server.config.server.watch).toBeNull();
    expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-online-config-tests$/);
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('The isolated config test server did not start.');
    page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.locator('.game-card').first().waitFor();
    expect(await page.locator('.game-card').count()).toBe(24);
    expect(await page.getByRole('alert').innerText()).toContain('public configuration is incomplete or invalid');
    await page.locator('.save-game').first().click();
    await page.waitForFunction(() => document.querySelector('.save-game')?.getAttribute('aria-pressed') === 'true');
    expect(await page.locator('.author-footer').isVisible()).toBe(true);
    expect(errors).toEqual([]);
  } finally { await page?.close(); }
}, 60000);

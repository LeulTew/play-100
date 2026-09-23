import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { expect, it } from 'vitest';

it('keeps actual guest browsing and saving usable with invalid optional online configuration', async () => {
  const server = await createServer({
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
  const browser = await chromium.launch({ headless: true });
  try {
    expect(server.config.server.watch).toBeNull();
    expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-online-config-tests$/);
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('The isolated config test server did not start.');
    const page = await browser.newPage({ reducedMotion: 'reduce' });
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
  } finally { await browser.close(); await server.close(); }
}, 60000);

import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { expect, it } from 'vitest';

it('keeps actual guest browsing and saving usable with invalid optional online configuration', async () => {
  const server = await createServer({
    mode: 'cloud-test',
    server: { host: '127.0.0.1', port: 0 },
    define: {
      'import.meta.env.VITE_USE_FIREBASE_EMULATORS': JSON.stringify('false'),
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('invalid-config-fixture'),
    },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
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

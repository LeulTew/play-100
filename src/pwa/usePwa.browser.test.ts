import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';

declare global {
  interface Window {
    releasePwaControls(): void;
    pwaControlLoads(): number;
  }
}

const fixture = `<!doctype html><html><head><title>Direct Settings controls</title></head><body>
<div id="root"></div><script type="module">
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePwa } from '/src/pwa/usePwa.ts';
import { pwaClientModule } from '/src/pwa/deferred-controller.ts';
import { SettingsPanel } from '/src/components/app/SettingsPanel.tsx';
import { emptyPersonalLibrary } from '/src/lib/personal-library.ts';
window.requestIdleCallback = () => 1;
window.cancelIdleCallback = () => {};
let loads = 0;
const held = new Promise(resolve => { window.releasePwaControls = resolve; });
const actualLoad = pwaClientModule.load;
pwaClientModule.load = () => { loads++; return held.then(actualLoad); };
window.pwaControlLoads = () => loads;
function Harness() {
  const [settings, showSettings] = useState(false);
  const pwa = usePwa({ enabled: true, wantControls: settings });
  return h('main', null,
    h('button', { onClick: () => showSettings(true) }, 'Open Settings directly'),
    settings && h(SettingsPanel, {
      settings: {
        motion: 'auto', reducedMotion: true, constrained: false, saved: 0, completed: 0, warning: null,
        onMotion: async () => true, onReset: async () => true, state: emptyPersonalLibrary(), persistent: true,
        busy: false, onRestore: async () => true, onAbout() {}, onClose: () => showSettings(false)
      },
      offline: { pwa, open: true, onUpdate: async () => false }
    })
  );
}
createRoot(document.getElementById('root')).render(h(Harness));
</script></body></html>`;

let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = (await createFetchSafeViteServer(() => createServer({
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
    configFile: false, root: process.cwd(), cacheDir: 'node_modules/.vite-pwa-controls-tests',
    appType: 'custom',
    plugins: [react(), {
      name: 'direct-settings-pwa-fixture',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url !== '/pwa-controls-fixture') return next();
          void server.transformIndexHtml('/pwa-controls-fixture', fixture).then(html => {
            response.setHeader('Content-Type', 'text/html'); response.end(html);
          }).catch(next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0, watch: null },
  }))).server;
  expect(server.config.server.watch).toBeNull();
  expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-pwa-controls-tests$/);
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('PWA controls fixture did not bind a port.');
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
}, 60_000);
// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  const results = await Promise.allSettled([browser?.close(), server?.close()]);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, 'PWA fixture teardown failed.');
}, 60_000);

describe('direct Settings PWA connection', () => {
  it('connects without Menu or idle and explains the pending disabled control inside the native dialog', async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${base}/pwa-controls-fixture`);
      await browserExpect(page.getByRole('button', { name: 'Open Settings directly' })).toBeVisible();
      expect(await page.evaluate(() => window.pwaControlLoads())).toBe(0);
      await page.getByRole('button', { name: 'Open Settings directly' }).click();
      const dialog = page.locator('dialog[aria-labelledby="settings-title"]');
      await browserExpect.poll(() => page.evaluate(() => window.pwaControlLoads())).toBe(1);
      await browserExpect(dialog.getByRole('status').filter({ hasText: 'Loading offline controls…' })).toBeVisible();
      await browserExpect(dialog.getByRole('button', { name: 'Enable offline access', exact: true })).toBeDisabled();
      await browserExpect(dialog.locator('#settings-title')).toBeFocused();
      await page.evaluate(() => window.releasePwaControls());
      await browserExpect(dialog.getByRole('button', { name: 'Enable offline access', exact: true })).toBeEnabled();
      await browserExpect(dialog.getByRole('status').filter({ hasText: 'Loading offline controls…' })).toHaveCount(0);
      await browserExpect(dialog.locator('#settings-title')).toBeFocused();
    } finally { await page.close(); expect(errors).toEqual([]); }
  });
});

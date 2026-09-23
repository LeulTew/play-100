import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';

const fixture = `<!doctype html><html><head><title>Panel guard fixture</title></head><body>
<div id="root"></div><script type="module">
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppPanel } from '/src/hooks/useAppPanel.ts';
window.requestIdleCallback = () => 1;
window.cancelIdleCallback = () => {};
let scope = 'guest', generation = 0, opening = false;
const capture = () => { const start = generation; return () => generation === start; };
const root = createRoot(document.getElementById('root'));
function Harness() {
  const result = useAppPanel(capture, scope, opening);
  return h('main', null,
    h('output', { id: 'panel' }, result.panel || 'none'),
    h('output', { id: 'message' }, result.panelMessage),
    ...['menu', 'about', 'settings', null].map(panel => h('button', {
      key: panel || 'close', onClick: () => result.setPanel(panel)
    }, panel || 'close')),
    h('button', { onClick: () => { scope = 'account:two'; generation++; render(); } }, 'scope'),
    h('button', { onClick: () => { opening = true; render(); } }, 'opening'),
    h('button', { onClick: () => window.dispatchEvent(new Event('play100:navigate')) }, 'navigate')
  );
}
function render() { root.render(h(Harness)); }
render();
</script></body></html>`;

let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false, plugins: [react(), {
      name: 'panel-guard-fixture',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!request.url?.startsWith('/__panel-guard')) return next();
          void server.transformIndexHtml('/__panel-guard', fixture).then(html => {
            response.setHeader('Content-Type', 'text/html'); response.end(html);
          }).catch(next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Panel fixture did not bind a port.');
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

describe('secondary panel guard through the real hook', () => {
  it.each(['close', 'scope', 'opening', 'navigate', 'Escape'])('does not open a late module after %s', async cancellation => {
    const page = await browser.newPage();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const requested = new Set<string>();
    const finished = new Set<string>();
    page.on('requestfinished', request => {
      if (request.url().includes('/SettingsPanel.tsx')) finished.add(request.url());
    });
    await page.route('**/src/components/app/SettingsPanel.tsx', async route => {
      requested.add(route.request().url());
      await held;
      await route.continue();
    });
    try {
      await page.goto(`${base}/__panel-guard`);
      await page.getByRole('button', { name: 'settings', exact: true }).click();
      await browserExpect(page.locator('#message')).toContainText('Opening Settings');
      await browserExpect.poll(() => requested.size).toBe(1);
      if (cancellation === 'Escape') await page.keyboard.press('Escape');
      else await page.getByRole('button', { name: cancellation, exact: true }).click();
      release();
      await browserExpect.poll(() => finished.size).toBe(1);
      await page.evaluate(async moduleURL => {
        const { settingsDialogModule } = await import(moduleURL);
        await settingsDialogModule.load();
      }, `${base}/src/lib/secondary-dialogs.ts`);
      await browserExpect(page.locator('#panel')).toHaveText('none');
      await page.getByRole('button', { name: 'settings', exact: true }).click();
      await browserExpect(page.locator('#panel')).toHaveText('settings');
      expect(requested.size).toBe(1);
    } finally { release(); await page.close(); }
  });
});

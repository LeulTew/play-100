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
import { aboutDialogModule, settingsDialogModule } from '/src/lib/secondary-dialogs.ts';
window.waitForSettings = async () => {
  await settingsDialogModule.load();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};
window.waitForAbout = async () => {
  await aboutDialogModule.load();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};
window.requestIdleCallback = () => 1;
window.cancelIdleCallback = () => {};
let scope = 'guest', opening = true;
const root = createRoot(document.getElementById('root'));
function Harness() {
  const result = useAppPanel(scope);
  return h('main', null,
    h('output', { id: 'panel' }, result.panel || 'none'),
    h('output', { id: 'message' }, result.panelMessage),
    h('output', { id: 'message-state' }, JSON.stringify({ text: result.panelMessage, error: result.panelMessageError })),
    h('output', { id: 'opening' }, String(opening)),
    ...['menu', 'about', 'settings', null].map(panel => h('button', {
      key: panel || 'close', onClick: () => result.setPanel(panel)
    }, panel || 'close')),
    h('button', { onClick: () => { scope = 'account:two'; render(); } }, 'scope'),
    h('button', { onClick: () => { opening = !opening; render(); } }, 'opening'),
    h('button', { onClick: () => window.dispatchEvent(new Event('play100:navigate')) }, 'navigate'),
    h('button', { onClick: () => window.dispatchEvent(new Event('popstate')) }, 'popstate'),
    h('button', { onClick: result.dismissPanelMessage }, 'dismiss')
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
    optimizeDeps: { include: ['react', 'react-dom/client'] },
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
  const warmup = await browser.newPage();
  try {
    await warmup.goto(`${base}/__panel-guard`);
    await warmup.getByRole('button', { name: 'settings', exact: true }).waitFor();
    await warmup.evaluate('window.waitForSettings()');
    await warmup.evaluate('window.waitForAbout()');
  } finally { await warmup.close(); }
}, 60_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

describe('secondary panel guard through the real hook', () => {
  it.each(['scope', 'opening'])('retains an explicit failed intent across %s changes', async boundary => {
    const page = await browser.newPage();
    await page.route('**/src/components/app/SettingsPanel.tsx', route => route.abort('failed'));
    try {
      await page.goto(`${base}/__panel-guard`);
      await page.getByRole('button', { name: 'settings', exact: true }).click();
      const failure = JSON.stringify({ text: "Settings didn't load.", error: true });
      await browserExpect(page.locator('#message-state')).toHaveText(failure);
      await page.getByRole('button', { name: boundary, exact: true }).click();
      await browserExpect(page.locator('#message-state')).toHaveText(failure);
    } finally { await page.close(); }
  });

  it.each([
    ['credits', 'opening'], ['credits', 'held'], ['about', 'opening'],
    ['about', 'scope'], ['settings', 'opening'], ['settings', 'scope'],
  ])('keeps %s intent while account opening is %s', async (intent, boundary) => {
    const about = intent !== 'settings';
    const page = await browser.newPage();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(about ? '**/src/components/AboutDialog.tsx' : '**/src/components/app/SettingsPanel.tsx', async route => {
      await held;
      await route.continue();
    });
    try {
      await page.goto(`${base}/__panel-guard${intent === 'credits' ? '?info=credits' : ''}`);
      if (intent !== 'credits') await page.getByRole('button', { name: intent, exact: true }).click();
      await browserExpect(page.locator('#opening')).toHaveText('true');
      await browserExpect(page.locator('#message')).toHaveText(about ? 'Opening credits...' : 'Opening Settings...');
      if (boundary !== 'held') await page.getByRole('button', { name: boundary, exact: true }).click();
      release();
      await page.evaluate(about ? 'window.waitForAbout()' : 'window.waitForSettings()');
      await browserExpect(page.locator('#panel')).toHaveText(about ? 'about' : 'settings');
      await browserExpect(page.locator('#message')).toBeEmpty();
      await page.getByRole('button', { name: 'close', exact: true }).click();
      expect(new URL(page.url()).searchParams.has('info')).toBe(false);
    } finally { release(); await page.close(); }
  });

  it.each(['Escape', 'navigate', 'popstate', 'scope', 'close'])('consumes and cancels a held URL intent on %s', async cancellation => {
    const page = await browser.newPage();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/src/components/AboutDialog.tsx', async route => { await held; await route.continue(); });
    try {
      await page.goto(`${base}/__panel-guard?info=credits`);
      await browserExpect(page.locator('#message')).toHaveText('Opening credits...');
      if (cancellation === 'Escape') await page.keyboard.press('Escape');
      else await page.getByRole('button', { name: cancellation, exact: true }).click();
      expect(new URL(page.url()).searchParams.has('info')).toBe(false);
      release();
      await page.evaluate('window.waitForAbout()');
      await browserExpect(page.locator('#panel')).toHaveText('none');
    } finally { release(); await page.close(); }
  });

  it.each(['Escape', 'popstate', 'navigate', 'dismiss', 'close'])('atomically clears failed notice state after %s', async clear => {
    const page = await browser.newPage();
    await page.route('**/src/components/app/SettingsPanel.tsx', route => route.abort('failed'));
    try {
      await page.goto(`${base}/__panel-guard`);
      await page.getByRole('button', { name: 'settings', exact: true }).click();
      await browserExpect(page.locator('#message-state')).toHaveText(JSON.stringify({
        text: "Settings didn't load.", error: true,
      }));
      if (clear === 'Escape') await page.keyboard.press('Escape');
      else await page.getByRole('button', { name: clear, exact: true }).click();
      await browserExpect(page.locator('#message-state')).toHaveText(JSON.stringify({ text: '', error: false }));
    } finally { await page.close(); }
  });

  it.each(['close', 'navigate', 'Escape'])('does not open a late module after %s', async cancellation => {
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
      await page.evaluate('window.waitForSettings()');
      await browserExpect(page.locator('#panel')).toHaveText('none');
      await page.getByRole('button', { name: 'settings', exact: true }).click();
      await browserExpect(page.locator('#panel')).toHaveText('settings');
      expect(requested.size).toBe(1);
    } finally { release(); await page.close(); }
  });
});

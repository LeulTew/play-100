import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, BrowserContext, BrowserServer, Page } from '@playwright/test';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFile } from 'node:fs/promises';
import type { MotionPreference } from '../../lib/types';

interface CounterControls { to: number; preference: MotionPreference; scope: string }
interface CounterFixture {
  set(patch: Partial<CounterControls>): void;
  destroy(): void;
  detach(): void;
  frames(count: number): Promise<void>;
  stats(): { pending: number; requested: number; canceled: number };
}
declare global { interface Window { counterFixture: CounterFixture } }

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg">
<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}</style></head><body><div id="root"></div>
<script type="module">
import React from '/node_modules/.vite-countup-tests/deps/react.js';
import ReactDom from '/node_modules/.vite-countup-tests/deps/react-dom_client.js';
import CountUp from '/src/components/bits/CountUp.tsx';
import { useCapabilities } from '/src/hooks/useCapabilities.ts';
const nativeFrame = requestAnimationFrame.bind(window);
const nativeCancel = cancelAnimationFrame.bind(window);
const pending = new Set();
let requested = 0, canceled = 0;
window.requestAnimationFrame = callback => {
  requested += 1;
  const id = nativeFrame(time => { pending.delete(id); callback(time); });
  pending.add(id);
  return id;
};
window.cancelAnimationFrame = id => { canceled += 1; pending.delete(id); nativeCancel(id); };
const container = document.getElementById('root');
const root = ReactDom.createRoot(container);
let controls = { to: 42, preference: 'full', scope: 'guest' };
function Fixture() {
  const policy = useCapabilities(controls.preference);
  return React.createElement(React.Fragment, null,
    React.createElement('label', null, 'Retained field', React.createElement('input', { 'aria-label': 'Retained field', defaultValue: '' })),
    React.createElement(CountUp, { key: controls.scope, to: controls.to, animate: policy.animate, className: 'saved-count' }));
}
function render() { root.render(React.createElement(React.StrictMode, null, React.createElement(Fixture))); }
window.counterFixture = {
  set(patch) { controls = { ...controls, ...patch }; render(); },
  destroy() { root.unmount(); },
  detach() { container.remove(); },
  frames(count) { return new Promise(resolve => { const next = () => { if (--count <= 0) resolve(); else nativeFrame(next); }; nativeFrame(next); }); },
  stats() { return { pending: pending.size, requested, canceled }; },
};
render();
</script></body></html>`;

let server: ViteDevServer | undefined;
let browserServer: BrowserServer | undefined;
let browser: Browser | undefined;
let context: BrowserContext;
let page: Page;
let origin: string;
let errors: string[];
let receipt: { origin: string; runnerPid: number; chromePid: number | undefined; browserVersion: string; headless: boolean; startedAt: string; closedAt: string | null } | undefined;
const receiptPath = process.env.PLAY100_COUNTER_FIXTURE_RECEIPT;
const headed = process.env.PLAY100_COUNTER_HEADED === 'true';

beforeAll(async () => {
  server = await createServer({
    configFile: false, root: process.cwd(), cacheDir: 'node_modules/.vite-countup-tests',
    logLevel: 'error', appType: 'custom', optimizeDeps: { include: ['react', 'react-dom/client'] },
    plugins: [react(), {
      name: 'native-countup-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== '/__countup-test') return next();
          void vite.transformIndexHtml('/__countup-test', fixture).then(html => {
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          }, next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 4204, strictPort: true, watch: null },
  });
  await server.listen();
  origin = 'http://127.0.0.1:4204';
  browserServer = await chromium.launchServer({ channel: 'chrome', headless: !headed });
  browser = await chromium.connect(browserServer.wsEndpoint());
  receipt = { origin, runnerPid: process.pid, chromePid: browserServer.process().pid, browserVersion: browser.version(), headless: !headed, startedAt: new Date().toISOString(), closedAt: null };
  console.info(`Native counter fixture: ${origin}; runner ${receipt.runnerPid}; Chrome ${receipt.chromePid}`);
  if (receiptPath) await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  await browser?.close();
  await browserServer?.close();
  await server?.close();
  if (receiptPath && receipt) await writeFile(receiptPath, JSON.stringify({ ...receipt, closedAt: new Date().toISOString() }, null, 2));
}, 60_000);

beforeEach(async () => {
  if (!browser) throw new Error('No owned counter browser.');
  context = await browser.newContext({ reducedMotion: 'no-preference' });
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort('blockedbyclient'));
  page = await context.newPage();
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/__countup-test`);
  await browserExpect(page.locator('.saved-count [aria-hidden="true"]')).toHaveText('42');
});

afterEach(async () => {
  await context.close();
  expect(errors).toEqual([]);
});

const stats = () => page.evaluate(() => window.counterFixture.stats());
const visual = () => page.locator('.saved-count [aria-hidden="true"]');
const accessible = () => page.locator('.saved-count .sr-only');
const patch = (value: Partial<CounterControls>) => page.evaluate(value => window.counterFixture.set(value), value);

describe('native CountUp lifetime', () => {
  it('starts exact, unchanged renders stay idle, and the accessible count is always current', async () => {
    expect(await stats()).toEqual({ pending: 0, requested: 0, canceled: 0 });
    await patch({ to: 42 });
    await page.evaluate(() => window.counterFixture.frames(3));
    expect((await stats()).requested).toBe(0);
    await patch({ to: 10000 });
    await browserExpect(accessible()).toHaveText('10000');
    await browserExpect.poll(async () => (await stats()).pending).toBe(1);
    await browserExpect(visual()).toHaveText('10000');
    await browserExpect.poll(async () => (await stats()).pending).toBe(0);
    const settled = await stats();
    await page.evaluate(() => window.counterFixture.frames(3));
    expect(await stats()).toEqual(settled);
  });

  it('does not flash the final target before its first frame and retargets without stale completion', async () => {
    await patch({ to: 10000 });
    await browserExpect(accessible()).toHaveText('10000');
    const first = Number(await visual().textContent());
    expect(first).toBeGreaterThanOrEqual(42);
    expect(first).toBeLessThan(10000);
    await patch({ to: 0 });
    await browserExpect(accessible()).toHaveText('0');
    await patch({ to: 7 });
    await browserExpect(accessible()).toHaveText('7');
    await browserExpect(visual()).toHaveText('7');
    await browserExpect.poll(async () => (await stats()).pending).toBe(0);
  });

  it('Lite jumps immediately, cancels its frame, and returning to Full never replays', async () => {
    await patch({ to: 10000 });
    await browserExpect.poll(async () => (await stats()).pending).toBe(1);
    await patch({ preference: 'lite', to: 0 });
    await browserExpect(visual()).toHaveText('0');
    await browserExpect.poll(async () => (await stats()).pending).toBe(0);
    const stopped = await stats();
    await patch({ preference: 'full' });
    await page.evaluate(() => window.counterFixture.frames(3));
    expect(await stats()).toEqual(stopped);
  });

  it('live OS reduction cancels Full immediately and does not restart the old count', async () => {
    await patch({ to: 10000 });
    await browserExpect.poll(async () => (await stats()).pending).toBe(1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await browserExpect(visual()).toHaveText('10000');
    await browserExpect.poll(async () => (await stats()).pending).toBe(0);
    const stopped = await stats();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.counterFixture.frames(3));
    expect(await stats()).toEqual(stopped);
  });

  it('a scope key snaps to its own initial count without remounting a sibling editor', async () => {
    const field = page.getByRole('textbox', { name: 'Retained field', exact: true });
    await field.fill('Keep this exact field');
    await field.evaluate(element => { element.dataset.sameField = 'yes'; });
    await patch({ to: 10000 });
    await browserExpect.poll(async () => (await stats()).pending).toBe(1);
    await patch({ scope: 'account:synthetic:new', to: 3 });
    await browserExpect(visual()).toHaveText('3');
    await browserExpect(accessible()).toHaveText('3');
    await browserExpect.poll(async () => (await stats()).pending).toBe(0);
    await browserExpect(field).toHaveAttribute('data-same-field', 'yes');
    await browserExpect(field).toHaveValue('Keep this exact field');
    await browserExpect(field).toBeFocused();
  });

  it('detachment and unmount leave no queued counter frame', async () => {
    await patch({ to: 10000 });
    await browserExpect.poll(async () => (await stats()).pending).toBe(1);
    await page.evaluate(() => window.counterFixture.detach());
    await page.evaluate(() => window.counterFixture.frames(3));
    expect((await stats()).pending).toBe(0);
    await page.evaluate(() => window.counterFixture.destroy());
    const stopped = await stats();
    await page.evaluate(() => window.counterFixture.frames(3));
    expect(await stats()).toEqual(stopped);
  });

  it.skipIf(!headed)('a native hidden window snaps and releases its frame without replay (owned headed Chrome)', async () => {
    const cdp = await context.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    try {
      // Playwright forces focus by default; native visibility needs that override disabled.
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      await patch({ to: 10000 });
      await browserExpect.poll(async () => (await stats()).pending).toBe(1);
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await browserExpect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
      await browserExpect(visual()).toHaveText('10000');
      await browserExpect.poll(async () => (await stats()).pending).toBe(0);
      const stopped = await stats();
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      await browserExpect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
      await page.evaluate(() => window.counterFixture.frames(3));
      expect(await stats()).toEqual(stopped);
    } finally {
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await cdp.detach();
    }
  });
});

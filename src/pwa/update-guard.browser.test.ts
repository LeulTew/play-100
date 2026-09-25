import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';

declare global {
  interface Window {
    releaseStatus(): void;
    statusRequests(): number;
    pageInstance: number;
    recoveryGuardFixture: {
      failSave(): void;
      busy(): void;
      changeScope(): void;
      saves(): number;
    };
  }
}

// Mounts the app's real input-generation hook and update guard, then drives the real
// executePwaUpdate reload path against a scripted controller whose STATUS reply is held.
const fixture = `<!doctype html><html><head><title>PWA update input guard</title></head><body>
<div id="root"></div><script type="module">
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPwaUpdateGuard, useInputGeneration } from '/src/pwa/update-guard.ts';
import { executePwaUpdate } from '/src/pwa/apply-update.ts';
import { ChunkRecovery } from '/src/components/ChunkRecovery.tsx';
import { ReloadGuardContext } from '/src/lib/reload-guard-context.ts';
import { registerPendingEditor } from '/src/hooks/useExitSave.ts';
const version = 'a'.repeat(64);
let requests = 0;
let held = [];
window.pageInstance = Math.random();
window.statusRequests = () => requests;
window.releaseStatus = () => { const replies = held; held = []; replies.forEach(reply => reply()); };
const worker = {
  scriptURL: location.origin + '/sw.js',
  postMessage(message, [port]) {
    requests++;
    held.push(() => port.postMessage({ channel: 'play100-pwa-v1', version, ready: message.type === 'STATUS' }));
  },
};
Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => worker });
function Harness() {
  const inputGeneration = useInputGeneration();
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const apply = () => {
    setState('applying'); setError('');
    const guard = createPwaUpdateGuard({ isCurrent: () => true, busy: () => false, inputGeneration });
    void executePwaUpdate(worker, true, guard, {
      isCurrent: () => true,
      waiting: () => null,
      requestedVersion: () => version,
      rememberVersion() {},
      publish: patch => { if (patch.updateState) setState(patch.updateState); if (patch.error) setError(patch.error); },
      report: message => setError(message),
    });
  };
  return h('main', null,
    h('input', { 'aria-label': 'Search games' }),
    h('button', { onClick: apply }, 'Apply update'),
    h('p', { 'data-testid': 'update-state' }, state),
    h('p', { role: 'alert' }, error),
  );
}
let scope = 0, busy = false, pendingRating = false, failSave = false, saves = 0;
registerPendingEditor({
  pending: () => pendingRating,
  flush: async () => { saves++; if (failSave) return false; pendingRating = false; return true; },
});
window.recoveryGuardFixture = {
  failSave: () => { failSave = true; },
  busy: () => { busy = true; },
  changeScope: () => { scope++; },
  saves: () => saves,
};
function RecoveryHarness() {
  const inputGeneration = useInputGeneration();
  const [draft, setDraft] = useState('');
  const capture = () => {
    const start = scope;
    return createPwaUpdateGuard({ isCurrent: () => start === scope, busy: () => busy, inputGeneration });
  };
  return h(ReloadGuardContext.Provider, { value: capture }, h('main', null,
    h('form', { onSubmit: event => event.preventDefault() },
      h('input', { 'aria-label': 'Manual title', value: draft, onChange: event => setDraft(event.target.value) })),
    h('input', { type: 'number', 'aria-label': 'Pending rating', onChange: () => { pendingRating = true; } }),
    h('input', { 'aria-label': 'Search games' }),
    h(ChunkRecovery, { message: 'Fixture module failed.' })
  ));
}
createRoot(document.getElementById('root')).render(h(
  location.pathname === '/chunk-recovery-guard-fixture' ? RecoveryHarness : Harness
));
</script></body></html>`;

let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-pwa-update-guard-tests',
        appType: 'custom',
        plugins: [
          react(),
          {
            name: 'pwa-update-guard-fixture',
            configureServer(server) {
              server.middlewares.use((request, response, next) => {
                const url = request.url;
                if (url !== '/pwa-update-guard-fixture' && url !== '/chunk-recovery-guard-fixture') return next();
                void server
                  .transformIndexHtml(url, fixture)
                  .then((html) => {
                    response.setHeader('Content-Type', 'text/html');
                    response.end(html);
                  })
                  .catch(next);
              });
            },
          },
        ],
        server: { host: '127.0.0.1', port: 0, watch: null },
      }),
    )
  ).server;
  expect(server.config.server.watch).toBeNull();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('PWA update guard fixture did not bind a port.');
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  const results = await Promise.allSettled([browser?.close(), server?.close()]);
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason);
  if (failures.length) throw new AggregateError(failures, 'PWA update guard fixture teardown failed.');
}, 60_000);

async function openFixture(page: Page) {
  await page.goto(`${base}/pwa-update-guard-fixture`);
  await browserExpect(page.getByRole('button', { name: 'Apply update' })).toBeVisible();
  return page.evaluate(() => window.pageInstance);
}

describe('mounted PWA update input guard', () => {
  it('defers the reload when the user types during an update, then reloads on a later request', async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const instance = await openFixture(page);
      await page.getByRole('button', { name: 'Apply update' }).click();
      await browserExpect.poll(() => page.evaluate(() => window.statusRequests())).toBe(1);
      await page.getByLabel('Search games').fill('zelda');
      await page.evaluate(() => window.releaseStatus());
      await browserExpect(page.getByRole('alert')).toHaveText(
        'The waiting update or current edit changed. Review it again.',
      );
      await browserExpect(page.getByTestId('update-state')).toHaveText('reload-required');
      expect(await page.evaluate(() => window.pageInstance)).toBe(instance);
      await expect(page.getByLabel('Search games').inputValue()).resolves.toBe('zelda');

      await page.getByRole('button', { name: 'Apply update' }).click();
      await browserExpect.poll(() => page.evaluate(() => window.statusRequests())).toBe(2);
      const reloaded = page.waitForEvent('load');
      await page.evaluate(() => window.releaseStatus());
      await reloaded;
      await browserExpect(page.getByRole('button', { name: 'Apply update' })).toBeVisible();
      expect(await page.evaluate(() => window.pageInstance)).not.toBe(instance);
    } finally {
      await page.close();
      expect(errors).toEqual([]);
    }
  });

  describe('chunk recovery through the shared mounted update guard', () => {
    it.each(['manual form', 'failed save'] as const)('blocks %s without a HEAD', async (reason) => {
      const page = await browser.newPage();
      let probes = 0;
      await page.route('**/*', (route) => {
        if (route.request().method() !== 'HEAD') return route.continue();
        probes++;
        return route.fulfill({ status: 200 });
      });
      try {
        await page.goto(`${base}/chunk-recovery-guard-fixture`);
        const instance = await page.evaluate(() => window.pageInstance);
        const field = page.getByLabel(reason === 'manual form' ? 'Manual title' : 'Pending rating');
        const draft = reason === 'manual form' ? 'Unsaved fixture value' : '8.5';
        if (reason === 'failed save') await page.evaluate(() => window.recoveryGuardFixture.failSave());
        await field.fill(draft);
        await page.getByRole('button', { name: 'Reload this page', exact: true }).click();
        await browserExpect(page.getByRole('status')).toContainText('Nothing was reloaded.');
        await browserExpect(page.getByRole('button', { name: 'Keep editing', exact: true })).toBeVisible();
        expect(probes).toBe(0);
        expect(await page.evaluate(() => window.pageInstance)).toBe(instance);
        await browserExpect(field).toHaveValue(draft);
        if (reason === 'failed save') expect(await page.evaluate(() => window.recoveryGuardFixture.saves())).toBe(1);
        await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
        await browserExpect(field).toHaveValue(draft);
      } finally {
        await page.close();
      }
    });

    it.each(['input', 'write', 'scope'] as const)('cancels after %s during HEAD', async (change) => {
      const page = await browser.newPage();
      let release!: () => void;
      let probes = 0;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/*', async (route) => {
        if (route.request().method() !== 'HEAD') return route.continue();
        probes++;
        await held;
        return route.fulfill({ status: 200 });
      });
      try {
        await page.goto(`${base}/chunk-recovery-guard-fixture`);
        const instance = await page.evaluate(() => window.pageInstance);
        await page.getByRole('button', { name: 'Reload this page', exact: true }).click();
        await browserExpect.poll(() => probes).toBe(1);
        if (change === 'input') await page.getByLabel('Search games').fill('Fresh input during the probe');
        else if (change === 'write') await page.evaluate(() => window.recoveryGuardFixture.busy());
        else await page.evaluate(() => window.recoveryGuardFixture.changeScope());
        release();
        await browserExpect(page.getByRole('status')).toContainText('Nothing was reloaded.');
        await browserExpect(page.getByRole('button', { name: 'Keep editing', exact: true })).toBeVisible();
        expect(await page.evaluate(() => window.pageInstance)).toBe(instance);
        if (change === 'input')
          await browserExpect(page.getByLabel('Search games')).toHaveValue('Fresh input during the probe');
      } finally {
        release();
        await page.close();
      }
    });

    it('reloads a clean page after the same guard and HEAD both succeed', async () => {
      const page = await browser.newPage();
      await page.route('**/*', (route) =>
        route.request().method() === 'HEAD' ? route.fulfill({ status: 200 }) : route.continue(),
      );
      try {
        await page.goto(`${base}/chunk-recovery-guard-fixture`);
        const instance = await page.evaluate(() => window.pageInstance);
        await Promise.all([
          page.waitForEvent('load'),
          page.getByRole('button', { name: 'Reload this page', exact: true }).click(),
        ]);
        await browserExpect(page.getByRole('button', { name: 'Reload this page', exact: true })).toBeVisible();
        expect(await page.evaluate(() => window.pageInstance)).not.toBe(instance);
      } finally {
        await page.close();
      }
    });
  });

  it('reloads when nothing is typed while the update is confirmed', async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const instance = await openFixture(page);
      await page.getByRole('button', { name: 'Apply update' }).click();
      await browserExpect.poll(() => page.evaluate(() => window.statusRequests())).toBe(1);
      const reloaded = page.waitForEvent('load');
      await page.evaluate(() => window.releaseStatus());
      await reloaded;
      await browserExpect(page.getByRole('button', { name: 'Apply update' })).toBeVisible();
      expect(await page.evaluate(() => window.pageInstance)).not.toBe(instance);
    } finally {
      await page.close();
      expect(errors).toEqual([]);
    }
  });
});

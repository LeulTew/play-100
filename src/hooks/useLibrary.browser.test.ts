import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../lib/personal-db';
import { applyPersonalAction, emptyPersonalLibrary, readLibraryBackup } from '../lib/personal-library';
import type { PersonalLibraryState } from '../lib/personal-types';
import { discoveryFixture } from '../lib/discovery-test-fixtures';

declare global {
  interface Window {
    libraryRetryBlocker: IDBDatabase;
    libraryRetryDocument: string;
    libraryRetryFixture: {
      state: () => PersonalLibraryState;
      retry: (discardRevision?: number) => Promise<boolean>;
      addTemporary: () => Promise<boolean>;
    };
  }
}

const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Library retry fixture</title>
<link rel="icon" href="/favicon.svg"></head><body><div id="mount"></div>
<script type="module" src="/src/hooks/useLibrary.browser-fixture.tsx"></script></body></html>`;
const saved = applyPersonalAction(emptyPersonalLibrary(), {
  type: 'rate-game',
  record: discoveryFixture.record,
  score: 8,
});
const extra = { account: 'Unchanged synthetic account', recovery: saved };
let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-library-retry-tests',
        logLevel: 'error',
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
        plugins: [
          react(),
          {
            name: 'library-retry-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                const path = request.url?.split('?')[0];
                if (path === '/__library-blocker') {
                  response.setHeader('Content-Type', 'text/html');
                  response.end('<!doctype html><title>Old library connection</title>');
                } else if (path === '/__library-retry') {
                  void vite.transformIndexHtml(path, fixture).then((html) => {
                    response.setHeader('Content-Type', 'text/html');
                    response.end(html);
                  }, next);
                } else next();
              });
            },
          },
        ],
        server: { host: '127.0.0.1', port: 0, watch: null },
      }),
    )
  ).server;
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Library retry fixture has no owned port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => {
  const results = await Promise.allSettled([browser?.close(), server?.close()]);
  const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, 'Library retry fixture cleanup failed.');
}, 60_000);

async function blockedFixture(mobile = false) {
  if (!browser) throw new Error('Library retry fixture browser unavailable.');
  const context = await browser.newContext({
    viewport: { width: mobile ? 393 : 1280, height: mobile ? 851 : 900 },
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
  });
  const errors: string[] = [];
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
  );
  const blocker = await context.newPage();
  await blocker.goto(`${origin}/__library-blocker`);
  await blocker.evaluate(
    ({ name, store, key, saved, extra }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name, 2);
        open.onupgradeneeded = () => open.result.createObjectStore(store);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          window.libraryRetryBlocker = db;
          db.onversionchange = () => {};
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(saved, key);
          tx.objectStore(store).put(extra, 'synthetic-extra');
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        };
      }),
    { name: DB_NAME, store: STORE_NAME, key: STATE_KEY, saved, extra },
  );
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.libraryRetryDocument = crypto.randomUUID();
  });
  await page.goto(`${origin}/__library-retry`);
  const banner = page.locator('.storage-banner[role="alert"]').filter({ hasText: /Close other Play 100 tabs/ });
  await browserExpect(banner.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
  const documentId = await page.evaluate(() => window.libraryRetryDocument);
  return { context, blocker, page, banner, errors, documentId };
}

async function readRows(page: Page, existing = false) {
  return page.evaluate(
    ({ name, store, existing }) =>
      new Promise<{ version: number; rows: unknown[] }>((resolve, reject) => {
        const read = (db: IDBDatabase) => {
          const tx = db.transaction(store, 'readonly');
          const rows = tx.objectStore(store).getAll();
          tx.oncomplete = () => {
            resolve({ version: db.version, rows: rows.result });
            if (!existing) db.close();
          };
          tx.onabort = () => {
            if (!existing) db.close();
            reject(tx.error);
          };
        };
        if (existing) read(window.libraryRetryBlocker);
        else {
          const open = indexedDB.open(name);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => read(open.result);
        }
      }),
    { name: DB_NAME, store: STORE_NAME, existing },
  );
}

async function finish(context: BrowserContext, errors: string[]) {
  await context.close();
  expect(errors).toEqual([]);
}

describe('blocked library recovery', () => {
  it.each([false, true])(
    'keeps the same retry focused through a repeated block, then reopens without reload (mobile=%s)',
    async (mobile) => {
      const { context, blocker, page, banner, errors, documentId } = await blockedFixture(mobile);
      try {
        const original = await readRows(blocker, true);
        const warning = await banner.locator('p').innerText();
        const retry = banner.getByRole('button', { name: 'Try again', exact: true });
        const element = await retry.elementHandle();
        if (!element) throw new Error('The blocked retry button is missing.');
        await retry.focus();
        await retry.press('Enter');
        await browserExpect(retry).toHaveAttribute('aria-disabled', 'true');
        await browserExpect(retry).toBeFocused();
        await browserExpect(retry).toBeEnabled({ timeout: 8_000 });
        await browserExpect(retry).toBeFocused();
        expect(await element.evaluate((node) => node.isConnected && node === document.activeElement)).toBe(true);
        expect(await banner.locator('p').innerText()).toBe(warning);
        expect(await readRows(blocker, true)).toEqual(original);
        await blocker.close();
        await retry.press('Enter');
        await browserExpect(page.locator('#library-status')).toHaveText('ready');
        await browserExpect(page.getByRole('heading', { name: 'My games', exact: true })).toBeFocused();
        await browserExpect(banner).toHaveCount(0);
        expect(await page.evaluate(() => window.libraryRetryFixture.state())).toEqual(saved);
        expect(await readRows(page)).toEqual({ version: DB_VERSION, rows: original.rows });
        expect(await page.evaluate(() => window.libraryRetryDocument)).toBe(documentId);
        await element.dispose();
      } finally {
        await finish(context, errors);
      }
    },
    30_000,
  );

  it('does not steal newer focus after a successful retry', async () => {
    const { context, blocker, page, banner, errors } = await blockedFixture();
    try {
      await blocker.close();
      await banner.getByRole('button', { name: 'Try again', exact: true }).evaluate((button) => {
        (button as HTMLButtonElement).click();
        document.getElementById('other-focus')?.focus();
      });
      await browserExpect(page.locator('#library-status')).toHaveText('ready');
      await browserExpect(page.locator('#other-focus')).toBeFocused();
    } finally {
      await finish(context, errors);
    }
  });

  it('refuses to lose temporary edits, exports them, then discards only after a confirmed successful reopen', async () => {
    const { context, blocker, page, banner, errors, documentId } = await blockedFixture();
    try {
      const original = await readRows(blocker, true);
      await page.getByRole('button', { name: 'Add temporary game', exact: true }).click();
      const temporary = await page.evaluate(() => window.libraryRetryFixture.state());
      await banner.getByRole('button', { name: 'Try again', exact: true }).click();
      await browserExpect(page.locator('.storage-banner')).toContainText('This tab has unsaved changes.');
      expect(await page.evaluate(() => window.libraryRetryFixture.state())).toEqual(temporary);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export my library', exact: true }).click();
      const path = await (await downloaded).path();
      if (!path) throw new Error('The temporary library export produced no file.');
      expect(readLibraryBackup(await readFile(path, 'utf8'))).toEqual(temporary);
      await page.getByRole('button', { name: 'Discard tab changes and try again', exact: true }).click();
      await browserExpect(page.getByRole('button', { name: 'Keep tab changes', exact: true })).toBeFocused();
      const discard = page.getByRole('button', { name: 'Discard and try again', exact: true });
      await discard.focus();
      await discard.press('Enter');
      await browserExpect(discard).toHaveAttribute('aria-disabled', 'true');
      await browserExpect(discard).toBeEnabled({ timeout: 8_000 });
      await browserExpect(discard).toBeFocused();
      expect(await page.evaluate(() => window.libraryRetryFixture.state())).toEqual(temporary);
      expect(await readRows(blocker, true)).toEqual(original);
      await blocker.close();
      await discard.press('Enter');
      await browserExpect(page.locator('#library-status')).toHaveText('ready');
      await browserExpect(page.getByRole('heading', { name: 'My games', exact: true })).toBeFocused();
      expect(await page.evaluate(() => window.libraryRetryFixture.state())).toEqual(saved);
      expect(await readRows(page)).toEqual({ version: DB_VERSION, rows: original.rows });
      expect(await page.evaluate(() => window.libraryRetryDocument)).toBe(documentId);
    } finally {
      await finish(context, errors);
    }
  }, 30_000);

  it('requires a fresh discard confirmation after another temporary edit', async () => {
    const { context, blocker, page, banner, errors } = await blockedFixture();
    try {
      await page.getByRole('button', { name: 'Add temporary game', exact: true }).click();
      await banner.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.getByRole('button', { name: 'Discard tab changes and try again', exact: true }).click();
      await page.evaluate(() => window.libraryRetryFixture.addTemporary());
      const newer = await page.evaluate(() => window.libraryRetryFixture.state());
      await blocker.close();
      await page.getByRole('button', { name: 'Discard and try again', exact: true }).click();
      await browserExpect(page.locator('#library-status')).toHaveText('temporary');
      await browserExpect(page.locator('.storage-banner')).toContainText('This tab has unsaved changes.');
      expect(await page.evaluate(() => window.libraryRetryFixture.state())).toEqual(newer);
      await page.getByRole('button', { name: 'Keep tab changes', exact: true }).click();
      await browserExpect(
        page.getByRole('button', { name: 'Discard tab changes and try again', exact: true }),
      ).toBeFocused();
    } finally {
      await finish(context, errors);
    }
  });
});

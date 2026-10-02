import { realpathSync } from 'node:fs';
import * as ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../../lib/test-server-ports';

type Fault = 'game' | 'catalog' | 'settings' | 'about' | 'menu';
declare global {
  interface Window {
    dialogHostFixture: {
      renders: { header: number; footer: number; navigation: number; banners: number; shell: number; dialogs: number };
      fault: Fault | null;
      reports: string[];
      rerender(): void;
    };
  }
}

const counters = new Map([
  ['AppHeader', 'header'],
  ['SiteFooter', 'footer'],
  ['MobileNav', 'navigation'],
  ['GlobalBanners', 'banners'],
  ['AppShell', 'shell'],
  ['AppDialogs', 'dialogs'],
]);
const faults = new Map([
  ['GameDetail', 'game'],
  ['CatalogDetail', 'catalog'],
  ['SettingsDialog', 'settings'],
  ['AboutDialog', 'about'],
  ['MenuDialog', 'menu'],
]);

// Instrument real component bodies only in this local fixture; App's wiring and error handlers are unchanged.
function instrument(source: string, id: string) {
  const file = id.split('?')[0]!.replaceAll('\\', '/');
  if (!/\/src\/(?:components\/|lib\/client-error-report\.ts)/.test(file)) return;
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const insertions = syntax.statements.flatMap((node) => {
    if (!ts.isFunctionDeclaration(node) || !node.name || !node.body) return [];
    const name = node.name.text;
    const counter = counters.get(name);
    const fault = faults.get(name);
    const body = [
      counter ? `window.dialogHostFixture.renders.${counter} += 1;` : '',
      fault
        ? `if (window.dialogHostFixture.fault === '${fault}') throw new Error('Synthetic dialog render failure.');`
        : '',
      name === 'reportClientError' ? 'window.dialogHostFixture.reports.push(area);' : '',
    ].join('\n');
    return body.trim() ? [{ index: node.body.getStart(syntax) + 1, body: `\n${body}\n` }] : [];
  });
  if (!insertions.length) return;
  let result = source;
  for (const { index, body } of insertions.reverse()) result = result.slice(0, index) + body + result.slice(index);
  return { code: result, map: null };
}

const fixture = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="/favicon.svg"><title>Dialog host fixture</title>
</head><body><div id="mount"></div>
<script type="module" src="/src/components/app/DialogHost.browser-fixture.tsx"></script></body></html>`;
let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        envDir: false,
        cacheDir: 'node_modules/.vite-dialog-host-tests',
        logLevel: 'error',
        appType: 'custom',
        optimizeDeps: {
          noDiscovery: true,
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            '@dnd-kit/core',
            '@dnd-kit/sortable',
            '@dnd-kit/utilities',
          ],
        },
        plugins: [
          { name: 'dialog-host-observer', enforce: 'pre', transform: instrument },
          react(),
          {
            name: 'dialog-host-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (!['/', '/discover', '/my-games'].includes(request.url?.split('?')[0] ?? '')) return next();
                void vite.transformIndexHtml('/', fixture).then((html) => {
                  response.setHeader('Content-Type', 'text/html');
                  response.end(html);
                }, next);
              });
            },
          },
        ],
        server: {
          host: '127.0.0.1',
          port: 0,
          watch: null,
          fs: { allow: [process.cwd(), realpathSync('node_modules')] },
        },
      }),
    )
  ).server;
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Dialog fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

async function open(page: Page, kind: Fault): Promise<Locator> {
  if (kind === 'game' || kind === 'catalog') {
    const trigger = page.locator(kind === 'game' ? '.game-card .game-link' : '.discovery-card h3 button').first();
    await trigger.focus();
    await trigger.press('Enter');
    return trigger;
  }
  const trigger = page.getByRole('button', { name: 'Menu', exact: true });
  await trigger.click();
  if (kind !== 'menu')
    await page
      .getByRole('dialog', { name: 'Menu', exact: true })
      .getByRole('button', {
        name: kind === 'settings' ? 'Settings & backups' : 'About & credits',
        exact: true,
      })
      .click();
  return trigger;
}

for (const mobile of [false, true]) {
  describe(mobile ? 'touch dialog host' : 'desktop dialog host', () => {
    async function withPage(work: (page: Page) => Promise<void>, path = '/?catalogs=off') {
      if (!browser) throw new Error('Dialog fixture browser unavailable.');
      const context = await browser.newContext({
        viewport: { width: mobile ? 393 : 1440, height: mobile ? 851 : 900 },
        hasTouch: mobile,
        isMobile: mobile,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort('blockedbyclient');
        if (url.pathname.startsWith('/api/'))
          return route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } });
        return route.continue();
      });
      await page.addInitScript(() =>
        localStorage.setItem(
          'play100.library.v1',
          JSON.stringify({
            version: 1,
            motion: 'lite',
            progress: {},
          }),
        ),
      );
      try {
        await page.goto(`${origin}${path}`);
        await browserExpect(page.locator('.site-header')).toBeVisible();
        await work(page);
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }

    it('typing and local search publication do not render the header, footer or navigation again', async () => {
      await withPage(async (page) => {
        await browserExpect(page.locator('.game-card')).toHaveCount(24);
        await page.evaluate(() => document.fonts.ready);
        const account = page.locator('.account-nav');
        if (await account.count()) await browserExpect(account).toHaveAccessibleName('Account Device only');
        const input = page.getByRole('searchbox', { name: 'Search games, studios or genres', exact: true });
        await input.focus();
        const before = await page.evaluate(() => ({ ...window.dialogHostFixture.renders }));
        for (const letter of ['g', 't', 'a']) await input.press(letter);
        await browserExpect(page.locator('.game-card')).toHaveCount(4);
        const after = await page.evaluate(() => ({ ...window.dialogHostFixture.renders }));
        for (const component of ['header', 'footer', 'navigation', 'banners'] as const) {
          expect(before[component], `observed ${component} before typing`).toBeGreaterThan(0);
          expect(after[component], component).toBe(before[component]);
        }
        const trigger = await open(page, 'game');
        await browserExpect(page.locator('.detail-pagination > span')).toHaveText('1 of 4');
        await page.keyboard.press('Escape');
        await browserExpect(page.locator('dialog[open]')).toHaveCount(0);
        await browserExpect(trigger).toBeFocused();
        const filters = page.locator('details.browse-filters');
        if ((await filters.getAttribute('open')) === null) await filters.locator(':scope > summary').click();
        await page.getByRole('checkbox', { name: 'Search public catalogs', exact: true }).check();
        await browserExpect(
          page.getByRole('navigation', { name: 'Main navigation', includeHidden: true }).getByRole('link', {
            name: 'Discover',
            exact: true,
            includeHidden: true,
          }),
        ).toHaveAttribute('href', '/discover');
      });
    }, 30_000);

    for (const kind of ['game', 'catalog', 'settings', 'about', 'menu'] as const) {
      for (const when of ['opening', 'mounted'] as const) {
        it(`${kind} ${when} render failure closes only that dialog, restores focus and allows reopening`, async () => {
          await withPage(
            async (page) => {
              await browserExpect(
                page.locator(kind === 'catalog' ? '.discovery-card' : '.game-card').first(),
              ).toBeVisible();
              if (when === 'opening' && (kind === 'game' || kind === 'catalog' || kind === 'menu'))
                await page.evaluate((value) => {
                  window.dialogHostFixture.fault = value;
                }, kind);
              let trigger: Locator;
              if (when === 'opening' && (kind === 'settings' || kind === 'about')) {
                trigger = page.getByRole('button', { name: 'Menu', exact: true });
                await trigger.click();
                await page.evaluate((value) => {
                  window.dialogHostFixture.fault = value;
                }, kind);
                await page
                  .getByRole('dialog', { name: 'Menu' })
                  .getByRole('button', {
                    name: kind === 'settings' ? 'Settings & backups' : 'About & credits',
                    exact: true,
                  })
                  .click();
              } else trigger = await open(page, kind);
              if (when === 'mounted') {
                await browserExpect(page.locator('dialog[open]')).toHaveCount(1);
                await page.evaluate((value) => {
                  window.dialogHostFixture.fault = value;
                  window.dialogHostFixture.rerender();
                }, kind);
              }
              const recovery = page.getByRole('region', { name: 'Dialog recovery', exact: true });
              await browserExpect(recovery.getByRole('alert')).toContainText(
                'The rest of Play 100 is still available.',
              );
              await browserExpect(page.locator('dialog[open]')).toHaveCount(0);
              await browserExpect(page.locator('.site-header')).toBeVisible();
              await browserExpect(page.locator('.site-footer')).toHaveCount(1);
              await browserExpect(page.locator('.app-error')).toHaveCount(0);
              await browserExpect(trigger).toBeFocused();
              expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
              expect(await page.evaluate(() => window.dialogHostFixture.reports)).toEqual(['dialog']);
              await page.evaluate(() => {
                window.dialogHostFixture.fault = null;
              });
              await open(page, kind);
              await browserExpect(page.locator('dialog[open]')).toHaveCount(1);
              await page.keyboard.press('Escape');
              await browserExpect(page.locator('dialog[open]')).toHaveCount(0);
              await recovery.getByRole('button', { name: 'Dismiss', exact: true }).click();
              await browserExpect(recovery).toHaveCount(0);
              await browserExpect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
            },
            kind === 'catalog' ? '/discover?catalogs=off&q=Among+Us' : '/?catalogs=off',
          );
        }, 30_000);
      }
    }

    it('a failed Settings overlay leaves the underlying detail locked and focused', async () => {
      await withPage(async (page) => {
        await browserExpect(page.locator('dialog[open]')).toHaveCount(2);
        await browserExpect(page.locator('#settings-title')).toBeFocused();
        await page.evaluate(() => {
          window.dialogHostFixture.fault = 'settings';
          window.dialogHostFixture.rerender();
        });
        await browserExpect(page.locator('.settings-dialog')).toHaveCount(0);
        await browserExpect(page.locator('.game-dialog[open]')).toHaveCount(1);
        await browserExpect(page.locator('#game-title')).toBeFocused();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
        expect(await page.evaluate(() => window.dialogHostFixture.reports)).toEqual(['dialog']);
        await page.keyboard.press('Escape');
        await browserExpect(page.locator('dialog[open]')).toHaveCount(0);
      }, '/?catalogs=off&game=portal-2&info=settings');
    }, 30_000);
  });
}

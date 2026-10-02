import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';

declare global {
  interface Window {
    friendMoreActionsFixture: { chosen: string[] };
  }
}

// The isolated Vite/Playwright harness the other browser tests use; the fixture module is typed and linted.
const fixture = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Friend actions fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module" src="/src/cloud/FriendMoreActions.browser-fixture.tsx"></script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-friend-more-actions-tests',
        logLevel: 'error',
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client'] },
        plugins: [
          react(),
          {
            name: 'friend-more-actions-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url?.split('?')[0] !== '/__friend-more-actions') return next();
                void vite.transformIndexHtml('/__friend-more-actions', fixture).then((html) => {
                  response.setHeader('Content-Type', 'text/html');
                  response.end(html);
                }, next);
              });
            },
          },
        ],
        server: { host: '127.0.0.1', port: 0, watch: null },
      }),
    )
  ).server;
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Friend actions fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => {
  const results = await Promise.allSettled([browser?.close(), server?.close()]);
  const failures = results.filter((result) => result.status === 'rejected').map((result): unknown => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Friend actions fixture cleanup failed.');
}, 60_000);

// A browser above the floor but before Chrome 114, Firefox 125 or Safari 17: its elements have no Popover methods, and
// matches() rejects the :popover-open selector it does not know.
function removePopover() {
  const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;
  delete prototype.showPopover;
  delete prototype.hidePopover;
  delete prototype.togglePopover;
  const matches = Element.prototype.matches;
  Element.prototype.matches = function (this: Element, selectors: string) {
    if (selectors.includes(':popover-open'))
      throw new DOMException(`'${selectors}' is not a valid selector.`, 'SyntaxError');
    return matches.call(this, selectors);
  };
}

describe.each([
  ['with the Popover API', false],
  ['without the Popover API', true],
])("a friend row's More actions %s", (_label, withoutPopover) => {
  it('open, move, close and choose by mouse and keyboard, one menu at a time, without errors', async () => {
    if (!browser) throw new Error('Friend actions fixture browser is unavailable.');
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    if (withoutPopover) await context.addInitScript(removePopover);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
    );
    try {
      await page.goto(`${origin}/__friend-more-actions`);
      const more = (name: string) => page.getByRole('button', { name: `More actions for ${name}`, exact: true });
      const menu = (name: string) => page.locator(`[role="menu"][aria-label="Actions for ${name}"]`);
      const item = (name: string, action: string) => menu(name).getByRole('menuitem', { name: action, exact: true });
      await browserExpect(more('Ada')).toBeVisible();
      await browserExpect(menu('Ada')).toBeHidden();
      await browserExpect(more('Ada')).toHaveAttribute('aria-expanded', 'false');
      expect(await menu('Ada').evaluate((element) => element.hasAttribute('popover'))).toBe(!withoutPopover);

      await more('Ada').click();
      await browserExpect(menu('Ada')).toBeVisible();
      await browserExpect(more('Ada')).toHaveAttribute('aria-expanded', 'true');
      await browserExpect(item('Ada', 'Remove friend')).toBeFocused();
      // The popover floats below its button; the disclosure opens in place, on its own line below the actions.
      expect(await menu('Ada').evaluate((element) => getComputedStyle(element).position)).toBe(
        withoutPopover ? 'static' : 'fixed',
      );
      const [button, list] = await Promise.all([more('Ada').boundingBox(), menu('Ada').boundingBox()]);
      if (!button || !list) throw new Error('The More button or its menu has no box.');
      expect(list.y).toBeGreaterThanOrEqual(button.y + button.height);
      await browserExpect(menu('Ada')).toBeInViewport();
      await page.keyboard.press('ArrowDown');
      await browserExpect(item('Ada', 'Block player')).toBeFocused();
      await page.keyboard.press('Home');
      await browserExpect(item('Ada', 'Remove friend')).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await browserExpect(item('Ada', 'Block player')).toBeFocused();
      await page.keyboard.press('Escape');
      await browserExpect(menu('Ada')).toBeHidden();
      await browserExpect(more('Ada')).toBeFocused();
      await browserExpect(more('Ada')).toHaveAttribute('aria-expanded', 'false');

      // ArrowUp opens on the last action, and Tab closes the menu and moves on from its button.
      await page.keyboard.press('ArrowUp');
      await browserExpect(item('Ada', 'Block player')).toBeFocused();
      await page.keyboard.press('Tab');
      await browserExpect(menu('Ada')).toBeHidden();
      await browserExpect(more('Grace')).toBeFocused();

      // A click elsewhere closes it.
      await more('Ada').click();
      await browserExpect(menu('Ada')).toBeVisible();
      await page.getByRole('heading', { name: 'Friends', exact: true }).click();
      await browserExpect(menu('Ada')).toBeHidden();
      // Opening another row's menu closes this one. Grace's menu opens below her row, so Ada's button stays in reach.
      await more('Grace').click();
      await browserExpect(menu('Grace')).toBeVisible();
      await more('Ada').click();
      await browserExpect(menu('Ada')).toBeVisible();
      await browserExpect(menu('Grace')).toBeHidden();
      await browserExpect(item('Ada', 'Remove friend')).toBeFocused();
      await page.keyboard.press('Escape');
      await browserExpect(menu('Ada')).toBeHidden();
      if (withoutPopover) {
        // The disclosure opens in place and pushes the rows below it down; closing it lifts them back. A click on one
        // of them still reaches the control it was aimed at, and opens Grace's menu as it closes Ada's.
        await more('Ada').click();
        await browserExpect(menu('Ada')).toBeVisible();
        await more('Grace').click();
        await browserExpect(menu('Grace')).toBeVisible();
        await browserExpect(menu('Ada')).toBeHidden();
        await browserExpect(item('Grace', 'Remove friend')).toBeFocused();
        await page.keyboard.press('Escape');
        await browserExpect(menu('Grace')).toBeHidden();
      }

      // Remove and Block close the menu, return focus to its button and reach the page.
      await more('Ada').click();
      await item('Ada', 'Remove friend').click();
      await browserExpect(menu('Ada')).toBeHidden();
      await browserExpect(more('Ada')).toBeFocused();
      await more('Grace').focus();
      await page.keyboard.press('ArrowDown');
      await browserExpect(item('Grace', 'Remove friend')).toBeFocused();
      await page.keyboard.press('End');
      await browserExpect(item('Grace', 'Block player')).toBeFocused();
      await page.keyboard.press('Enter');
      await browserExpect(menu('Grace')).toBeHidden();
      await browserExpect(more('Grace')).toBeFocused();
      expect(await page.evaluate(() => window.friendMoreActionsFixture.chosen)).toEqual(['remove Ada', 'block Grace']);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);
});

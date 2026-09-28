import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';
import sharp from 'sharp';
import type { MotionPolicy } from './types';

interface MotionFixtureStats {
  renders: number;
  sourceReads: number;
  targetReads: number;
  closeRequests: number;
  effects: Array<{ target: string; duration: number }>;
}

declare global {
  interface Window {
    motionFixture: {
      stats: MotionFixtureStats;
      prepare(): void;
      commit(): void;
      expire(): void;
      open(mode: 'anchored' | 'local' | 'static'): void;
      utility(): void;
      rerender(): void;
      hold(value: boolean): void;
      policy(patch: Partial<MotionPolicy>): void;
      revoke(): void;
      removeRecord(): void;
      returnToEditor(): void;
      scope(): void;
      navigate(): void;
      noopCapture(): boolean;
      routeAttempt(): boolean;
      failRelease(): void;
      failOpen(): void;
      staleFrame(change: 'boundary' | 'policy'): Promise<{
        aborted: boolean;
        subscriptions: number;
        flights: number;
        sourceVisible: boolean;
        targetReads: number;
      }>;
    };
  }
}

// This local-only fixture is served in memory; no test route is shipped with App.
// Keep the isolated Vite/Playwright harness: @vitest/browser-playwright is not installed.
// The external fixture module is checked by TypeScript and ESLint without adding a dependency.
const fixture = `<!doctype html><html lang="en" data-motion="on"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Native motion fixture</title>
<link rel="icon" href="/favicon.svg">
<style>
  #page-heading { margin: 16px 32px; font-size: 24px; }
  #source-trigger { position: fixed; left: 32px; top: 120px; padding: 0; border: 0; }
  #source-art { display: grid; place-items: center; width: 150px; height: 112px; background: #d3f36b; color: #20231e; }
  #editor-group { position: fixed; left: 32px; top: 320px; width: 220px; }
  #utility-trigger { position: fixed; left: 32px; top: 410px; }
  #public-target { width: 144px; height: 108px; margin: 12px 0; background: #d3f36b; }
</style></head><body><div id="mount"></div><script type="module" src="/src/motion/Dialog.browser-fixture.tsx"></script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let context: BrowserContext;
let page: Page;
let origin: string;
let errors: string[];
let externalRequests: string[];

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-motion-tests',
        logLevel: 'error',
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
        plugins: [
          react(),
          {
            name: 'native-motion-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url?.split('?')[0] !== '/__motion-test') return next();
                void vite.transformIndexHtml('/__motion-test', fixture).then((html) => {
                  response.setHeader('Content-Type', 'text/html');
                  response.end(html);
                }, next);
              });
            },
          },
        ],
        server: { host: '127.0.0.1', port: 4201, strictPort: true, watch: null },
      }),
    )
  ).server;
  expect(server.config.optimizeDeps.noDiscovery).toBe(true);
  expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-motion-tests$/);
  expect(server.config.server.watch).toBeNull();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Motion fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  console.info(`Native motion fixture: ${origin}; owner Node PID ${process.pid}.`);
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

beforeEach(async () => {
  if (!browser) throw new Error('The motion test browser is unavailable.');
  errors = [];
  externalRequests = [];
  context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  context.on('request', (request) => {
    if (!request.url().startsWith(`${origin}/`)) externalRequests.push(request.url());
  });
  await page.goto(`${origin}/__motion-test`);
  await page.getByRole('button', { name: 'Open game', exact: true }).waitFor();
});

afterEach(async () => {
  await context?.close();
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

const activeVisuals = () => page.locator('[data-motion-visual]');
const detail = () => page.getByRole('dialog', { name: 'Public game', exact: true });
const stats = () => page.evaluate(() => window.motionFixture.stats);

describe('native Dialog motion lifecycle', () => {
  it.each(['boundary', 'policy'] as const)(
    'releases an origin when %s changes before its scheduled frame',
    async (change) => {
      expect(await page.evaluate((value) => window.motionFixture.staleFrame(value), change)).toEqual({
        aborted: true,
        subscriptions: 0,
        flights: 0,
        sourceVisible: true,
        targetReads: 0,
      });
      await browserExpect(activeVisuals()).toHaveCount(0);
      await browserExpect(page.locator('dialog[open]')).toHaveCount(0);
    },
  );

  it('focuses and accepts input immediately while animation completion is held', async () => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(page.locator('#detail-title')).toBeFocused();
    await page.locator('#private-draft').fill('A new unsaved fixture value');
    await browserExpect(page.locator('#private-draft')).toHaveValue('A new unsaved fixture value');
    await browserExpect(activeVisuals()).toHaveCount(1);
    expect(await page.locator('.dialog-inner').evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    const records = await stats();
    expect(records.sourceReads).toBe(1);
    expect(
      records.effects
        .filter((effect) => effect.target.startsWith('sprite:'))
        .every((effect) => effect.duration === 240),
    ).toBe(true);
  });

  it('paints only the public primitive above the native backdrop without intercepting input', async () => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(activeVisuals()).toHaveCount(1);
    await browserExpect(page.locator('dialog > [data-motion-host="dialog"] > [data-motion-visual]')).toHaveCount(1);
    expect(
      await activeVisuals().evaluate((element) => ({
        inert: element instanceof HTMLElement && element.inert,
        pointer: getComputedStyle(element).pointerEvents,
        hidden: element.getAttribute('aria-hidden'),
        controls: element.querySelectorAll('input,button,a,textarea,[id]').length,
      })),
    ).toEqual({ inert: true, pointer: 'none', hidden: 'true', controls: 0 });
    // This 4px crop contains only the first-party public sleeve, never the form.
    const crop = await page.screenshot({ clip: { x: 40, y: 128, width: 4, height: 4 } });
    const { data } = await sharp(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[1]).toBeGreaterThan(200);
    expect(
      await page.evaluate(() => Boolean(document.elementFromPoint(40, 128)?.closest('[data-motion-visual]'))),
    ).toBe(false);
  });

  it('removes the real form and unlocks/focuses before a held public return finishes', async () => {
    await page.evaluate(() => {
      document.body.style.overflow = 'clip';
      document.body.style.paddingRight = '3px';
    });
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(page.locator('#detail-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await browserExpect(detail()).toHaveCount(0);
    await browserExpect(page.locator('#private-draft')).toHaveCount(0);
    await browserExpect(page.locator('#source-trigger')).toBeFocused();
    expect(await page.evaluate(() => [document.body.style.overflow, document.body.style.paddingRight])).toEqual([
      'clip',
      '3px',
    ]);
    await browserExpect(page.locator('[data-motion-host="root"] [data-motion-phase="return"]')).toHaveCount(1, {
      timeout: 2000,
    });
    expect((await stats()).closeRequests).toBe(1);
    expect((await stats()).effects.some((effect) => effect.target === 'sprite:return' && effect.duration === 160)).toBe(
      true,
    );
  });

  it('keeps nested body locks and Escape local to the top native dialog', async () => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await page.getByRole('button', { name: 'Open confirmation', exact: true }).click();
    await browserExpect(page.getByRole('button', { name: 'Keep fixture', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await browserExpect(page.getByRole('dialog', { name: 'Confirm fixture', exact: true })).toHaveCount(0);
    await browserExpect(detail()).toBeVisible();
    await browserExpect(page.locator('#nested-trigger')).toBeFocused();
    expect((await stats()).closeRequests).toBe(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await browserExpect(detail()).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await browserExpect(activeVisuals()).toHaveCount(0);
  });

  it('suppresses newly requested route motion while a native modal is registered', async () => {
    expect(await page.evaluate(() => window.motionFixture.routeAttempt())).toBe(true);
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(detail()).toBeVisible();
    expect(await page.evaluate(() => window.motionFixture.routeAttempt())).toBe(false);
    await page.keyboard.press('Escape');
    await browserExpect(page.locator('#source-trigger')).toBeFocused();
    expect(await page.evaluate(() => window.motionFixture.routeAttempt())).toBe(true);
  });

  it('contains a throwing motion unsubscribe without losing native cleanup or focus', async () => {
    const reports: string[] = [];
    page.removeAllListeners('console');
    page.on('console', (message) => {
      if (message.type() === 'error') reports.push(message.text());
    });
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(activeVisuals()).toHaveCount(1);
    await page.evaluate(() => window.motionFixture.failRelease());
    await page.getByRole('button', { name: 'Open confirmation', exact: true }).click();
    await browserExpect(page.getByRole('dialog', { name: 'Confirm fixture', exact: true })).toBeVisible({
      timeout: 1000,
    });
    await page.keyboard.press('Escape');
    await browserExpect(page.locator('#nested-trigger')).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await browserExpect(page.locator('#source-trigger')).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await browserExpect(activeVisuals()).toHaveCount(0);
    expect(reports).toEqual([
      'A motion cleanup failed. Remaining cleanup will continue.',
      'A motion authority cleanup failed. Remaining cleanup will continue.',
    ]);
  });

  it('always registers native cleanup even when optional motion startup throws', async () => {
    const reports: string[] = [];
    page.removeAllListeners('console');
    page.on('console', (message) => {
      if (message.type() === 'error') reports.push(message.text());
    });
    await page.evaluate(() => window.motionFixture.failOpen());
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await browserExpect(page.locator('#utility-title')).toBeFocused();
    await page.locator('#utility-draft').fill('This stays usable without the effect');
    await page.keyboard.press('Escape');
    await browserExpect(page.locator('#utility-trigger')).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(await page.evaluate(() => window.motionFixture.routeAttempt())).toBe(true);
    expect(reports).toEqual(['Dialog motion failed. Native dialog behavior remains available.']);
  });

  it('keeps utility entry stable across inline options rerenders and uses current preferred focus', async () => {
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await browserExpect(page.locator('#utility-title')).toBeFocused();
    await browserExpect.poll(async () => (await stats()).effects.length).toBeGreaterThan(0);
    const count = (await stats()).effects.length;
    const renders = (await stats()).renders;
    await page.locator('#utility-draft').fill('Keep this live draft');
    await page.evaluate(() => window.motionFixture.rerender());
    await browserExpect.poll(async () => (await stats()).renders).toBeGreaterThan(renders);
    await browserExpect(page.locator('#utility-draft')).toHaveValue('Keep this live draft');
    expect((await stats()).effects).toHaveLength(count);
    await page.evaluate(() => window.motionFixture.returnToEditor());
    await browserExpect(page.locator('#utility-draft')).toHaveCount(0);
    await browserExpect(page.locator('#editor')).toBeFocused();
    await browserExpect(activeVisuals()).toHaveCount(0);
  });

  it.each(['utility-first', 'game-first'] as const)(
    'keeps the same utility form in front without replaying its entry when %s',
    async (order) => {
      if (order === 'game-first') {
        await page.evaluate(() => window.motionFixture.open('static'));
        await browserExpect(detail()).toBeVisible();
      }
      await page.evaluate(() => window.motionFixture.utility());
      const utility = page.getByRole('dialog', { name: 'Fixture menu', exact: true });
      const input = page.locator('#utility-draft');
      await browserExpect(input).toBeVisible();
      await input.fill('Keep this mounted draft');
      const mounted = await input.elementHandle();
      if (!mounted) throw new Error('The utility editor must exist before the other dialog loads.');
      await input.evaluate((element) => {
        if (element instanceof HTMLInputElement) element.setSelectionRange(2, 6);
      });
      const scroll = await utility.evaluate((element) => {
        const inner = element.querySelector<HTMLElement>('.dialog-inner');
        if (!inner) throw new Error('The utility must retain its content scrollport.');
        inner.style.paddingBottom = '800px';
        element.scrollTop = 20;
        return element.scrollTop;
      });
      expect(scroll).toBeGreaterThan(0);
      const count = (await stats()).effects.length;
      if (order === 'utility-first') await page.evaluate(() => window.motionFixture.open('static'));
      await browserExpect(page.locator('dialog[open]')).toHaveCount(2);
      await browserExpect(input).toBeFocused();
      await browserExpect(input).toHaveValue('Keep this mounted draft');
      expect(
        await mounted.evaluate((element) => ({
          sameNode: element === document.querySelector('#utility-draft'),
          selection: element instanceof HTMLInputElement ? [element.selectionStart, element.selectionEnd] : [],
        })),
      ).toEqual({ sameNode: true, selection: [2, 6] });
      expect(await utility.evaluate((element) => element.scrollTop)).toBe(scroll);
      expect((await stats()).effects).toHaveLength(count);
      expect(
        await input.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return document
            .elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
            ?.closest('dialog')
            ?.getAttribute('aria-labelledby');
        }),
      ).toBe('utility-title');
      await page.keyboard.press('Escape');
      await browserExpect(utility).toHaveCount(0);
      await browserExpect(detail()).toBeVisible();
      await browserExpect(page.locator('#detail-title')).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
      await page.keyboard.press('Escape');
      await browserExpect(detail()).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
      await mounted.dispose();
    },
  );

  it('returns to the uncovered editor rather than a preferred page target while another modal remains', async () => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    const editor = page.locator('#private-draft');
    await editor.fill('Keep the game draft and caret');
    await editor.evaluate((element) => {
      if (element instanceof HTMLInputElement) element.setSelectionRange(3, 8);
    });
    await page.evaluate(() => window.motionFixture.utility());
    await browserExpect(page.locator('#utility-title')).toBeFocused();
    await page.evaluate(() => window.motionFixture.returnToEditor());
    await browserExpect(page.locator('#utility-title')).toHaveCount(0);
    await browserExpect(editor).toBeFocused();
    await browserExpect(editor).toHaveValue('Keep the game draft and caret');
    expect(
      await editor.evaluate((element) =>
        element instanceof HTMLInputElement ? [element.selectionStart, element.selectionEnd] : [],
      ),
    ).toEqual([3, 8]);
    await browserExpect(page.locator('#editor')).not.toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await browserExpect(detail()).toHaveCount(0);
    await browserExpect(page.locator('#source-trigger')).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  it('keeps a focused utility draft when a background game is removed', async () => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(detail()).toBeVisible();
    await page.evaluate(() => window.motionFixture.utility());
    const input = page.locator('#utility-draft');
    await input.fill('Keep this foreground draft');
    await input.evaluate((element) => {
      if (element instanceof HTMLInputElement) element.setSelectionRange(4, 9);
    });
    await page.evaluate(() => window.motionFixture.removeRecord());
    await browserExpect(detail()).toHaveCount(0);
    await browserExpect(input).toBeFocused();
    await browserExpect(input).toHaveValue('Keep this foreground draft');
    expect(
      await input.evaluate((element) =>
        element instanceof HTMLInputElement ? [element.selectionStart, element.selectionEnd] : [],
      ),
    ).toEqual([4, 9]);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await browserExpect(page.locator('#utility-title')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  it.each(['scope', 'revoke', 'removeRecord', 'navigate'] as const)(
    'never paints an exit after %s',
    async (operation) => {
      await page.getByRole('button', { name: 'Open game', exact: true }).click();
      await browserExpect(activeVisuals()).toHaveCount(1);
      await page.evaluate((method) => window.motionFixture[method](), operation);
      await browserExpect(detail()).toHaveCount(0);
      await browserExpect(activeVisuals()).toHaveCount(0);
      expect((await stats()).effects.some((effect) => effect.target === 'sprite:return')).toBe(false);
    },
  );

  it('does zero optional geometry/effect setup for Lite and stops rather than replaying on policy changes', async () => {
    await page.evaluate(() => window.motionFixture.policy({ animate: false }));
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(page.locator('#detail-title')).toBeFocused();
    expect(await stats()).toMatchObject({ sourceReads: 0, targetReads: 0, effects: [] });
    await page.evaluate(() => window.motionFixture.policy({ animate: true }));
    expect((await stats()).effects).toHaveLength(0);
    await page.keyboard.press('Escape');
    await browserExpect(detail()).toHaveCount(0);
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(activeVisuals()).toHaveCount(1);
    await page.evaluate(() => window.motionFixture.policy({ animate: false, reducedMotion: true }));
    await browserExpect(activeVisuals()).toHaveCount(0);
    await browserExpect(detail()).toBeVisible();
  });

  it('uses a no-origin public target without moving an input ancestor or constructing a ghost', async () => {
    await page.evaluate(() => window.motionFixture.open('local'));
    await browserExpect(page.locator('#detail-title')).toBeFocused();
    await browserExpect(activeVisuals()).toHaveCount(0);
    await browserExpect
      .poll(async () => (await stats()).effects.some((effect) => effect.target === 'public-target'))
      .toBe(true);
    expect((await stats()).effects.every((effect) => effect.target === 'public-target' && effect.duration <= 160)).toBe(
      true,
    );
    expect((await stats()).sourceReads).toBe(0);
    expect(await page.locator('.dialog-inner').evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  });

  it('expires a captured but unadopted source without blocking the real detail', async () => {
    await page.evaluate(() => {
      window.motionFixture.prepare();
      window.motionFixture.expire();
      window.motionFixture.commit();
    });
    await browserExpect(page.locator('#detail-title')).toBeFocused();
    await browserExpect(activeVisuals()).toHaveCount(0);
    expect((await stats()).effects.every((effect) => effect.target === 'public-target')).toBe(true);
  });

  it('does not enroll or measure a duplicate open when the URL would not change', async () => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(activeVisuals()).toHaveCount(1);
    const before = await stats();
    expect(await page.evaluate(() => window.motionFixture.noopCapture())).toBe(true);
    expect((await stats()).sourceReads).toBe(before.sourceReads);
    expect((await stats()).effects).toHaveLength(before.effects.length);
    await browserExpect(activeVisuals()).toHaveCount(1);
  });

  it('cancels on resize and does not resume an old return after the geometry changes', async () => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(activeVisuals()).toHaveCount(1);
    await page.setViewportSize({ width: 1100, height: 800 });
    await browserExpect(activeVisuals()).toHaveCount(0);
    await page.keyboard.press('Escape');
    await browserExpect(detail()).toHaveCount(0);
    await browserExpect(page.locator('#source-trigger')).toBeFocused();
    await browserExpect(activeVisuals()).toHaveCount(0);
  });

  it('finishes repeated coarse-pointer cycles without retaining visuals or animations', async () => {
    await page.evaluate(() => {
      window.motionFixture.hold(false);
      window.motionFixture.policy({ coarsePointer: true });
    });
    for (let index = 0; index < 3; index += 1) {
      await page.getByRole('button', { name: 'Open game', exact: true }).click();
      await browserExpect(page.locator('#detail-title')).toBeFocused();
      await browserExpect
        .poll(async () => (await stats()).effects.filter((effect) => effect.target === 'sprite:enter').length)
        .toBe(index + 1);
      await browserExpect(activeVisuals()).toHaveCount(0);
      await page.keyboard.press('Escape');
      await browserExpect(detail()).toHaveCount(0);
      await browserExpect
        .poll(async () => (await stats()).effects.filter((effect) => effect.target === 'sprite:return').length)
        .toBe(index + 1);
      await browserExpect(activeVisuals()).toHaveCount(0);
    }
    const effects = (await stats()).effects;
    expect(effects.some((effect) => effect.target === 'sprite:enter' && effect.duration === 220)).toBe(true);
    expect(effects.some((effect) => effect.target === 'sprite:return' && effect.duration === 160)).toBe(true);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await browserExpect(page.locator('[data-motion-host="root"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

declare global {
  interface Window {
    resizeObserverLoopErrors?: string[];
  }
}

const diagnostics = new WeakMap<Page, string[]>();
// DIAGNOSTIC ONLY: beacons the page sends by synchronous XHR, recorded here as the browser pauses each request, so they
// arrive even when the page's main thread hangs right after sending one (console messages wait for the task to end).
const beacons = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }, info) => {
  await info.attach('resize-visit-diagnostics', {
    body: JSON.stringify(diagnostics.get(page) ?? []),
    contentType: 'application/json',
  });
  await info.attach('resize-visit-beacons', {
    body: JSON.stringify(beacons.get(page) ?? []),
    contentType: 'application/json',
  });
});

/** Scrolls the whole page a half screen at a time, so every contained card renders, then back to the top. */
async function scrollThrough(page: Page) {
  const measurement = await test.step('Scroll the entire page using two animation frames per step', () =>
    page.evaluate(async () => {
      const started = performance.now();
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      let steps = 0;
      let longestFrameWait = 0;
      const report = () => ({
        path: location.pathname,
        elapsedMs: performance.now() - started,
        steps,
        top: scrollY,
        height: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        visibility: document.visibilityState,
        longestFrameWaitMs: longestFrameWait,
      });
      console.info('Resize visit scroll start', report());
      for (let top = 0; top < document.documentElement.scrollHeight; top += innerHeight / 2) {
        scrollTo(0, top);
        const waiting = performance.now();
        await frame();
        Reflect.get(window, '__p100Beacon')?.('step', steps + 1);
        longestFrameWait = Math.max(longestFrameWait, performance.now() - waiting);
        if (++steps % 10 === 0) console.info('Resize visit scroll progress', report());
      }
      scrollTo(0, 0);
      await frame();
      return report();
    }));
  console.info('Resize visit scroll complete', measurement);
  await test.info().attach('scroll-through-timing', {
    body: JSON.stringify(measurement),
    contentType: 'application/json',
  });
}

// On a Galaxy A03s (WebView Chrome 106) the landing reported "ResizeObserver loop limit exceeded" as it loaded and
// again on each route change. This replays that phone's visit (docs/performance.md, "Low-end phones") at narrow widths.
// A current Chromium no longer reports that loop (src/render-containment.css), so this guards the page's own observers.
for (const viewport of [
  { width: 412, height: 785 },
  { width: 320, height: 640 },
]) {
  test(`a visit at ${viewport.width}px reports no ResizeObserver loop and opens the first game's details`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      // That phone's browser predates URLSearchParams.size (Chrome 113), which once left a detail's URL unchanged.
      Reflect.deleteProperty(URLSearchParams.prototype, 'size');
      const beacon = (name: string, detail: unknown = '') => {
        try {
          const request = new XMLHttpRequest();
          const query = new URLSearchParams({ n: name, d: String(detail), t: String(Math.round(performance.now())) });
          request.open('GET', `/__p100diag?${query.toString()}`, false);
          request.send();
        } catch {
          // A beacon that fails says nothing; the next one may still arrive.
        }
      };
      Reflect.set(window, '__p100Beacon', beacon);
      let beats = 0;
      addEventListener('DOMContentLoaded', () => setInterval(() => beacon('hb', ++beats), 200));
      const idle = window.requestIdleCallback;
      let idles = 0;
      window.requestIdleCallback = (callback, options) =>
        idle.call(
          window,
          (deadline) => {
            const id = ++idles;
            beacon('idle-run', id);
            callback(deadline);
            beacon('idle-done', id);
          },
          options,
        );
      const errors: string[] = [];
      window.resizeObserverLoopErrors = errors;
      addEventListener('error', (event) => {
        if (/ResizeObserver/.test(event.message)) errors.push(event.message);
      });
      document.addEventListener('visibilitychange', () =>
        console.info('Resize visit visibility', { at: performance.now(), visibility: document.visibilityState }),
      );
      if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
        new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries())
            if (entry.duration >= 250)
              console.info('Resize visit long task', { at: entry.startTime, durationMs: entry.duration });
        }).observe({ type: 'longtask', buffered: true });
      const scenePhases = new Set<string>();
      const mark = performance.mark;
      performance.mark = (name, options) => {
        const result = mark.call(performance, name, options);
        const phase = /^p100:scene:(module|context|renderer|first-render)-(start|end)$/.exec(name);
        if (phase) {
          if (phase[2] === 'start') scenePhases.add(phase[1]!);
          else scenePhases.delete(phase[1]!);
          console.info('Resize visit scene mark', { name, at: result.startTime, visibility: document.visibilityState });
          beacon(name, document.visibilityState);
        }
        return result;
      };
      const getContext = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        writable: true,
        value(this: HTMLCanvasElement, kind: string, options?: unknown) {
          const measured = kind === 'webgl' || kind === 'webgl2';
          if (measured) console.info('Resize visit WebGL context start', { at: performance.now(), kind });
          beacon(`getContext-before`, kind);
          const result = getContext.call(this, kind, options);
          beacon(`getContext-after`, kind);
          if (measured)
            console.info('Resize visit WebGL context end', { at: performance.now(), kind, available: Boolean(result) });
          return result;
        },
      });
      const synchronousQueries = [
        'getProgramParameter',
        'getShaderParameter',
        'getProgramInfoLog',
        'getShaderInfoLog',
        'getActiveUniform',
        'getUniformLocation',
        'getError',
        'readPixels',
      ];
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        for (const method of ['compileShader', 'linkProgram', 'drawArrays', 'drawElements', ...synchronousQueries]) {
          const original: unknown = Reflect.get(prototype, method);
          if (typeof original !== 'function') continue;
          const observed = new WeakSet<object>();
          Object.defineProperty(prototype, method, {
            configurable: true,
            writable: true,
            value(this: WebGLRenderingContext, ...args: unknown[]) {
              const first = !observed.has(this);
              observed.add(this);
              const sampled = first || (scenePhases.size > 0 && synchronousQueries.includes(method));
              const started = performance.now();
              if (sampled) console.info(`Resize visit WebGL ${method} start`, { at: started, first });
              if (first) beacon(`gl-${method}-first`);
              let returned = false;
              try {
                const result: unknown = Reflect.apply(original, this, args);
                returned = true;
                return result;
              } finally {
                const durationMs = performance.now() - started;
                if (sampled || durationMs >= 250)
                  console.info(`Resize visit WebGL ${method} end`, { at: performance.now(), durationMs, returned });
              }
            },
          });
        }
      }
    });
    const reported: string[] = [];
    const timing: string[] = [];
    diagnostics.set(page, timing);
    const received: string[] = [];
    beacons.set(page, received);
    await page.route((url) => url.pathname === '/__p100diag', (route) => {
      const query = new URL(route.request().url()).searchParams;
      received.push(`${Date.now()} ${query.get('t')} ${query.get('n')} ${query.get('d')}`);
      return route.fulfill({ status: 204, body: '' });
    });
    page.on('console', (message) => {
      if (message.text().startsWith('Resize visit')) {
        timing.push(message.text());
        if (timing.length > 600) timing.shift();
      }
      if (message.type() === 'error' && /ResizeObserver/.test(message.text())) reported.push(message.text());
    });
    await emptyCatalogs(page);
    await page.goto('/');
    await expect(page.locator('.game-card')).toHaveCount(24);
    await scrollThrough(page);
    const navigation = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    await navigation.getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page.locator('.discovery-card')).toHaveCount(24);
    await scrollThrough(page);
    await navigation.getByRole('link', { name: 'The 100', exact: true }).click();
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(page.locator('.game-card')).toHaveCount(24);
    // As the Test Lab harness did: the document's first game link, clicked from script.
    await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href*="game="]')!.click());
    await expect(page).toHaveURL(/[?&]game=/);
    await expect(page.locator('.game-dialog[open]')).toBeVisible();
    await page.goBack();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await navigation.getByRole('link', { name: 'My games', exact: true }).click();
    await expect(page).toHaveURL(/\/my-games/);
    await expect(page.locator('#my-games-title')).toBeVisible();
    await scrollThrough(page);
    expect(await page.evaluate(() => window.resizeObserverLoopErrors)).toEqual([]);
    expect(reported).toEqual([]);
  });
}

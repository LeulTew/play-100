import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';

declare global {
  interface Window {
    motionScrollFixture: {
      start(): void;
      state(): {
        active: boolean;
        originAborted: boolean;
        reason: string | null;
        originReason: string | null;
        animation: AnimationPlayState;
        events: Array<{ target: string; trusted: boolean }>;
      };
    };
  }
}

const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Motion scroll fixture</title></head><body style="min-height:2000px">
<label>Input <input id="input" style="width:120px" value="${'Long input text '.repeat(30)}"></label>
<label>Textarea <textarea id="textarea" wrap="off" style="width:120px;height:50px">${'Long textarea line '.repeat(30)}\n${'Another line\n'.repeat(30)}</textarea></label>
<div id="container" style="height:120px;width:240px;overflow:auto">
  <button id="trigger"><span id="origin" style="display:block;width:100px;height:60px">07</span>Open game</button>
  <div style="height:500px">Scrollable public content</div>
</div>
<script type="module">
import { createMotionRuntime } from '/src/motion/runtime.ts';
const snapshot = {
  policy: { animate: true, reducedMotion: false, coarsePointer: false, hidden: false, constrained: false },
  boundary: { scopeKey: 'guest', generation: 0, blocked: false },
  location: { viewKey: '/', requestedDetailKey: null, displayedDetailKey: null, navigationGeneration: 0, overlayKey: null },
};
const runtime = createMotionRuntime(() => snapshot, () => null);
runtime.mount();
const events = [];
window.addEventListener('scroll', event => {
  events.push({ target: event.target === document ? 'document' : event.target.id, trusted: event.isTrusted });
}, true);
let session, lease, animation;
window.motionScrollFixture = {
  start() {
    const source = document.getElementById('origin');
    const hint = runtime.originHint({
      surface: 'collection', presentationId: 'game', source,
      trigger: document.getElementById('trigger'), visual: { kind: 'jacket', rank: 7 },
    });
    if (!hint) throw new Error('Visible origin did not produce a hint.');
    lease = runtime.captureOrigin(hint, { requestedDetailKey: 'game', displayedDetailKey: 'game' });
    session = runtime.startMotionSession({ channel: 'dialog' });
    if (!lease || !session) throw new Error('Motion fixture did not start.');
    animation = session.animate(source, [{ opacity: 1 }, { opacity: .5 }], { duration: 180 });
    if (!animation) throw new Error('Motion fixture did not animate.');
    animation.pause();
    animation.currentTime = 0;
  },
  state() {
    return {
      active: session.isCurrent(), originAborted: lease.signal.aborted,
      reason: session.signal.reason ?? null, originReason: lease.signal.reason ?? null,
      animation: animation.playState, events,
    };
  },
};
</script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let base: string;

beforeAll(async () => {
  server = (await createFetchSafeViteServer(() => createServer({
    configFile: false,
    root: process.cwd(),
    cacheDir: 'node_modules/.vite-motion-scroll-tests',
    logLevel: 'error',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'motion-scroll-fixture',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== '/motion-scroll-fixture') return next();
          void server.transformIndexHtml('/motion-scroll-fixture', fixture).then(html => {
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          }).catch(next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0, strictPort: true, watch: null },
  }))).server;
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Motion scroll fixture did not bind a port.');
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  const results = await Promise.allSettled([browser?.close(), server?.close()]);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Motion scroll fixture teardown failed.');
}, 60_000);

describe('native motion scroll sources', () => {
  for (const target of ['input', 'textarea', 'container', 'document'] as const) {
    it(`handles real ${target} scrolling without confusing text and anchor movement`, async () => {
      if (!browser) throw new Error('Motion scroll browser did not start.');
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      try {
        await page.goto(`${base}/motion-scroll-fixture`);
        await page.waitForFunction(() => Boolean(window.motionScrollFixture));
        await page.evaluate(() => window.motionScrollFixture.start());
        expect(await page.evaluate(() => window.motionScrollFixture.state())).toMatchObject({
          active: true, originAborted: false, reason: null, originReason: null, animation: 'paused',
        });
        const offsets = await page.evaluate(target => {
          const element = target === 'document' ? document.scrollingElement : document.getElementById(target);
          if (!(element instanceof HTMLElement)) throw new Error('Scroll target is missing.');
          const before = { left: element.scrollLeft, top: element.scrollTop };
          if (target === 'document') window.scrollTo(0, 100);
          else if (target === 'input') element.scrollLeft = 80;
          else if (target === 'textarea') { element.scrollLeft = 80; element.scrollTop = 80; }
          else element.scrollTop = 70;
          return {
            before, left: element.scrollLeft, top: element.scrollTop,
            width: element.clientWidth, scrollWidth: element.scrollWidth,
            height: element.clientHeight, scrollHeight: element.scrollHeight,
          };
        }, target);
        if (target === 'input' || target === 'textarea') {
          expect(offsets.scrollWidth).toBeGreaterThan(offsets.width);
          expect(offsets.left).toBeGreaterThan(offsets.before.left);
        }
        if (target !== 'input') {
          expect(offsets.scrollHeight).toBeGreaterThan(offsets.height);
          expect(offsets.top).toBeGreaterThan(offsets.before.top);
        }
        await browserExpect.poll(() => page.evaluate(target =>
          window.motionScrollFixture.state().events.some(event => event.target === target && event.trusted), target)).toBe(true);
        const textControl = target === 'input' || target === 'textarea';
        expect(await page.evaluate(() => window.motionScrollFixture.state())).toMatchObject({
          active: textControl, originAborted: !textControl,
          reason: textControl ? null : 'scroll', originReason: textControl ? null : 'scroll',
          animation: textControl ? 'paused' : 'idle',
        });
        if (textControl) expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 });
      } finally { await page.close(); expect(pageErrors).toEqual([]); }
    });
  }
});

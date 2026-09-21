import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
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
    };
  }
}

// This local-only fixture is served in memory; no test route is shipped with App.
const fixture = `<!doctype html><html lang="en" data-motion="on"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Native motion fixture</title>
<style>
  #page-heading { margin: 16px 32px; font-size: 24px; }
  #source-trigger { position: fixed; left: 32px; top: 120px; padding: 0; border: 0; }
  #source-art { display: grid; place-items: center; width: 150px; height: 112px; background: #d3f36b; color: #20231e; }
  #editor-group { position: fixed; left: 32px; top: 320px; width: 220px; }
  #utility-trigger { position: fixed; left: 32px; top: 410px; }
  #public-target { width: 144px; height: 108px; margin: 12px 0; background: #d3f36b; }
</style></head><body><div id="mount"></div><script type="module">
import { createElement as h, StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from '/src/components/Dialog.tsx';
import { MotionProvider, useMotionRuntime } from '/src/motion/index.ts';
import '/src/styles.css';
import '/src/motion/motion.css';

let policy = { animate: true, reducedMotion: false, coarsePointer: false, hidden: false, constrained: false };
let boundary = { scopeKey: 'guest', generation: 0, blocked: false };
let route = { viewKey: '/fixture', requestedDetailKey: null, displayedDetailKey: null, navigationGeneration: 0, overlayKey: null };
let detail = false, utility = false, nested = false, preferred = false;
let mode = 'anchored', lease, runtime, permitted = true, paused = true, offset = 0;
const guards = new Set();
const stats = { renders: 0, sourceReads: 0, targetReads: 0, closeRequests: 0, effects: [] };
const nativeNow = performance.now.bind(performance);
performance.now = () => nativeNow() + offset;
const nativeAnimate = Element.prototype.animate;
Element.prototype.animate = function(frames, options) {
  const animation = nativeAnimate.call(this, frames, options);
  stats.effects.push({
    target: this.dataset.motionVisual ? 'sprite:' + this.dataset.motionPhase : this.id || this.className,
    duration: typeof options === 'number' ? options : options.duration,
  });
  if (paused) { animation.pause(); animation.currentTime = 0; }
  return animation;
};
const nativeRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function() {
  if (this.id === 'source-art') stats.sourceReads += 1;
  if (this.id === 'public-target') stats.targetReads += 1;
  return nativeRect.call(this);
};
const root = createRoot(document.getElementById('mount'));
function prepare() {
  const hint = runtime.originHint({
    surface: 'collection', presentationId: 'game-one',
    source: document.getElementById('source-art'), trigger: document.getElementById('source-trigger'),
    visual: { kind: 'jacket', rank: 7 },
  });
  lease = hint ? runtime.captureOrigin(hint, {
    requestedDetailKey: 'game-one', displayedDetailKey: 'game-one',
    guard: { isCurrent: () => permitted, subscribe(fn) { guards.add(fn); return () => guards.delete(fn); } },
  }) ?? undefined : undefined;
}
function commit() {
  route = { ...route, requestedDetailKey: 'game-one', displayedDetailKey: 'game-one', navigationGeneration: route.navigationGeneration + 1 };
  detail = true;
  history.pushState({}, '', '/__motion-test?game=game-one');
  window.dispatchEvent(new Event('play100:navigate'));
  render();
}
function open(next) {
  mode = next;
  lease = undefined;
  if (mode === 'anchored') prepare();
  commit();
}
window.addEventListener('popstate', () => {
  route = { ...route, requestedDetailKey: null, displayedDetailKey: null, navigationGeneration: route.navigationGeneration + 1 };
  detail = false; nested = false;
  render();
});
function closeDetail() { stats.closeRequests += 1; history.back(); }
function closeUtility() { utility = false; route = { ...route, overlayKey: null }; render(); }
function utilityOpen() { preferred = false; utility = true; route = { ...route, overlayKey: 'menu' }; render(); }
function Bindings() {
  stats.renders += 1;
  runtime = useMotionRuntime();
  const target = useRef(null);
  const motion = mode === 'static' ? false : { preset: 'sheet', continuity: { target, lease } };
  return h('main', null,
    h('h1', { id: 'page-heading', 'data-page-heading': true, tabIndex: -1 }, 'Public fixture'),
    h('button', { id: 'source-trigger', onClick: () => open('anchored') },
      h('span', { id: 'source-art', 'aria-hidden': true }, '07'), 'Open game'),
    h('label', { id: 'editor-group' }, 'Underlying editor', h('input', { id: 'editor', defaultValue: 'Unsaved fixture edit' })),
    h('button', { id: 'utility-trigger', onClick: utilityOpen }, 'Open menu'),
    detail && h(Dialog, { open: true, titleId: 'detail-title', onClose: closeDetail, className: 'info-dialog', motion },
      h('h2', { id: 'detail-title', tabIndex: -1, 'data-autofocus': true }, 'Public game'),
      h('div', { id: 'public-target', ref: target, 'aria-hidden': true }, '07'),
      h('label', null, 'Private fixture draft', h('input', { id: 'private-draft', defaultValue: 'Not part of the visual' })),
      h('button', { id: 'nested-trigger', onClick: () => { nested = true; render(); } }, 'Open confirmation'),
      nested && h(Dialog, { open: true, titleId: 'nested-title', onClose: () => { nested = false; render(); }, motion: false },
        h('h2', { id: 'nested-title' }, 'Confirm fixture'),
        h('button', { 'data-autofocus': true, onClick: () => { nested = false; render(); } }, 'Keep fixture')),
    ),
    utility && h(Dialog, {
      open: true, titleId: 'utility-title', className: 'info-dialog',
      onClose: closeUtility, motion: { preset: 'dialog', enterMs: 180 },
      getReturnFocus: () => preferred ? document.getElementById('editor') : null,
    }, h('h2', { id: 'utility-title', tabIndex: -1, 'data-autofocus': true }, 'Fixture menu'),
      h('label', null, 'Utility draft', h('input', { id: 'utility-draft', defaultValue: '' }))),
  );
}
function render() {
  document.documentElement.dataset.motion = policy.animate ? 'on' : 'off';
  root.render(h(StrictMode, null, h(MotionProvider, { policy, boundary, location: route }, h(Bindings))));
}
window.motionFixture = {
  stats, prepare, commit, open, utility: utilityOpen,
  expire() { offset += 1501; },
  rerender: render,
  hold(value) { paused = value; },
  policy(patch) { policy = { ...policy, ...patch }; render(); },
  revoke() {
    permitted = false;
    for (const changed of guards) changed();
    detail = false; nested = false;
    route = { ...route, displayedDetailKey: null };
    render();
  },
  removeRecord() {
    detail = false; nested = false;
    route = { ...route, displayedDetailKey: null };
    render();
  },
  returnToEditor() { preferred = true; closeUtility(); },
  scope() {
    boundary = { scopeKey: 'account:fixture:next', generation: boundary.generation + 1, blocked: true };
    detail = false; utility = false; nested = false;
    render();
  },
  navigate() {
    route = { ...route, viewKey: '/different', requestedDetailKey: null, displayedDetailKey: null, navigationGeneration: route.navigationGeneration + 1 };
    detail = false; utility = false; nested = false;
    window.dispatchEvent(new Event('play100:navigate'));
    render();
  },
};
render();
</script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let context: BrowserContext;
let page: Page;
let origin: string;
let errors: string[];
let externalRequests: string[];

beforeAll(async () => {
  server = await createServer({
    configFile: false, root: process.cwd(), cacheDir: 'node_modules/.vite-motion-tests',
    logLevel: 'error', appType: 'custom',
    plugins: [react(), {
      name: 'native-motion-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== '/__motion-test') return next();
          void vite.transformIndexHtml('/__motion-test', fixture).then(html => {
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          }, next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0, strictPort: true, watch: null },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Motion fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => { await browser?.close(); await server?.close(); });

beforeEach(async () => {
  if (!browser) throw new Error('The motion test browser is unavailable.');
  errors = [];
  externalRequests = [];
  context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  context.on('request', request => { if (!request.url().startsWith(`${origin}/`)) externalRequests.push(request.url()); });
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
  it('focuses and accepts input immediately while animation completion is held', async () => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(page.locator('#detail-title')).toBeFocused();
    await page.locator('#private-draft').fill('A new unsaved fixture value');
    await browserExpect(page.locator('#private-draft')).toHaveValue('A new unsaved fixture value');
    await browserExpect(activeVisuals()).toHaveCount(1);
    expect(await page.locator('.dialog-inner').evaluate(element => getComputedStyle(element).transform)).toBe('none');
    const records = await stats();
    expect(records.sourceReads).toBe(1);
    expect(records.effects.filter(effect => effect.target.startsWith('sprite:')).every(effect => effect.duration === 240)).toBe(true);
  });

  it('paints only the public primitive above the native backdrop without intercepting input', async () => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(activeVisuals()).toHaveCount(1);
    await browserExpect(page.locator('dialog > [data-motion-host="dialog"] > [data-motion-visual]')).toHaveCount(1);
    expect(await activeVisuals().evaluate(element => ({
      inert: element instanceof HTMLElement && element.inert,
      pointer: getComputedStyle(element).pointerEvents,
      hidden: element.getAttribute('aria-hidden'),
      controls: element.querySelectorAll('input,button,a,textarea,[id]').length,
    }))).toEqual({ inert: true, pointer: 'none', hidden: 'true', controls: 0 });
    // This 4px crop contains only the first-party public sleeve, never the form.
    const crop = await page.screenshot({ clip: { x: 40, y: 128, width: 4, height: 4 } });
    const { data } = await sharp(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[1]).toBeGreaterThan(200);
    expect(await page.evaluate(() => Boolean(document.elementFromPoint(40, 128)?.closest('[data-motion-visual]')))).toBe(false);
  });

  it('removes the real form and unlocks/focuses before a held public return finishes', async () => {
    await page.evaluate(() => { document.body.style.overflow = 'clip'; document.body.style.paddingRight = '3px'; });
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await page.keyboard.press('Escape');
    await browserExpect(detail()).toHaveCount(0);
    await browserExpect(page.locator('#private-draft')).toHaveCount(0);
    await browserExpect(page.locator('#source-trigger')).toBeFocused();
    expect(await page.evaluate(() => [document.body.style.overflow, document.body.style.paddingRight])).toEqual(['clip', '3px']);
    await browserExpect(page.locator('[data-motion-host="root"] [data-motion-phase="return"]')).toHaveCount(1);
    expect((await stats()).closeRequests).toBe(1);
    expect((await stats()).effects.some(effect => effect.target === 'sprite:return' && effect.duration === 160)).toBe(true);
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

  it('keeps utility entry stable across inline options rerenders and uses current preferred focus', async () => {
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await browserExpect(page.locator('#utility-title')).toBeFocused();
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

  it.each(['scope', 'revoke', 'removeRecord', 'navigate'] as const)('never paints an exit after %s', async operation => {
    await page.getByRole('button', { name: 'Open game', exact: true }).click();
    await browserExpect(activeVisuals()).toHaveCount(1);
    await page.evaluate(method => window.motionFixture[method](), operation);
    await browserExpect(detail()).toHaveCount(0);
    await browserExpect(activeVisuals()).toHaveCount(0);
    expect((await stats()).effects.some(effect => effect.target === 'sprite:return')).toBe(false);
  });

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
    expect((await stats()).effects.some(effect => effect.target === 'public-target')).toBe(true);
    expect((await stats()).effects.every(effect => effect.target === 'public-target' && effect.duration <= 160)).toBe(true);
    expect((await stats()).sourceReads).toBe(0);
    expect(await page.locator('.dialog-inner').evaluate(element => getComputedStyle(element).transform)).toBe('none');
  });

  it('expires a captured but unadopted source without blocking the real detail', async () => {
    await page.evaluate(() => { window.motionFixture.prepare(); window.motionFixture.expire(); window.motionFixture.commit(); });
    await browserExpect(page.locator('#detail-title')).toBeFocused();
    await browserExpect(activeVisuals()).toHaveCount(0);
    expect((await stats()).effects.every(effect => effect.target === 'public-target')).toBe(true);
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
    await page.evaluate(() => { window.motionFixture.hold(false); window.motionFixture.policy({ coarsePointer: true }); });
    for (let index = 0; index < 3; index += 1) {
      await page.getByRole('button', { name: 'Open game', exact: true }).click();
      await browserExpect(page.locator('#detail-title')).toBeFocused();
      await browserExpect(activeVisuals()).toHaveCount(0);
      await page.keyboard.press('Escape');
      await browserExpect(detail()).toHaveCount(0);
      await browserExpect(activeVisuals()).toHaveCount(0);
    }
    const effects = (await stats()).effects;
    expect(effects.some(effect => effect.target === 'sprite:enter' && effect.duration === 180)).toBe(true);
    expect(effects.some(effect => effect.target === 'sprite:return' && effect.duration === 120)).toBe(true);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await browserExpect(page.locator('[data-motion-host="root"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
});

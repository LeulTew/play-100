import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, BrowserContext, BrowserServer, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { COMPARE_DRAG_TYPE } from '../../lib/compare-tray';
import type { MotionCancelReason } from '../../motion';

interface DragFixture {
  opens: number;
  nested: number;
  transfer: { types: string[]; values: Record<string, string> } | null;
  items(): string[];
  status(): string;
  setScope(scope: string): void;
  setEnabled(enabled: boolean): void;
  setSource(visible: boolean): void;
  setDockHidden(hidden: boolean): void;
  setMotion(animate: boolean): void;
  setModal(open: boolean): void;
  interrupt(reason: MotionCancelReason): void;
  unmount(): void;
}

declare global {
  interface Window { compareDragTest: DragFixture }
}

const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Compare source fixture</title>
<style>
body{min-height:1800px}main{margin:24px;max-width:680px;padding-bottom:180px}
h1{font-size:24px;margin-bottom:24px}
#source{border:1px solid var(--ink);padding:16px;min-height:240px}
#source-title{display:block;min-height:44px;font-size:24px;margin-bottom:12px}
#source-controls{display:flex;flex-wrap:wrap;gap:8px;margin-block:12px}
#source-controls input{width:90px;min-height:44px}
#source-controls textarea{width:100%;min-height:44px}
#wrapper-source{margin-top:28px;padding:20px;border:1px solid var(--ink)}
.mobile-nav button{min-width:44px;min-height:44px}
</style></head><body><main><h1>Compare source fixture</h1><div id="mount"></div></main>
<script type="module">
import { createElement as h, StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionProvider, useMotionRuntime } from '/src/motion/index.ts';
import { Dialog } from '/src/components/Dialog.tsx';
import { CompareTrayProvider } from '/src/components/compare-tray/CompareTrayProvider.tsx';
import { CompareTray } from '/src/components/compare-tray/CompareTray.tsx';
import { CompareDragHandle } from '/src/components/compare-tray/CompareDragHandle.tsx';
import { ComparePinButton } from '/src/components/compare-tray/ComparePinButton.tsx';
import { CompareDragSource } from '/src/components/compare-tray/CompareDragSource.tsx';
import { useCompareDragSource } from '/src/components/compare-tray/useCompareDragSource.ts';
import { useCompareTray } from '/src/components/compare-tray/compare-tray-context.ts';
import '/src/styles.css';

const record = {
  id:'manual:drag-fixture', source:'manual', sourceId:'drag-fixture',
  title:'Manual fixture title', year:2020, studio:null, genre:null,
  sourceUrl:null, collectionRank:null,
};
let scope = 'guest', generation = 0, enabled = true, sourceVisible = true, dockHidden = false, animate = false, modal = false;
const root = createRoot(document.getElementById('mount'));
window.compareDragTest = {
  opens:0, nested:0, transfer:null, items:() => [], status:() => '',
  setScope(next) { generation += 1; scope = next; render(); },
  setEnabled(next) { generation += 1; enabled = next; render(); },
  setSource(next) { sourceVisible = next; render(); },
  setDockHidden(next) { dockHidden = next; render(); },
  setMotion(next) { animate = next; render(); },
  setModal(next) { modal = next; render(); },
  interrupt() {},
  unmount() { root.render(null); },
};
document.addEventListener('dragstart', event => {
  if (!event.dataTransfer) return;
  const types = [...event.dataTransfer.types];
  window.compareDragTest.transfer = {
    types, values:Object.fromEntries(types.map(type => [type,event.dataTransfer.getData(type)])),
  };
});
function Inspector() {
  const tray = useCompareTray();
  const runtime = useMotionRuntime();
  window.compareDragTest.items = () => tray.items.map(item => item.id);
  window.compareDragTest.status = () => tray.status;
  window.compareDragTest.interrupt = reason => runtime.cancel(reason);
  return null;
}
function Source() {
  const sourceRef = useRef(null);
  const binding = useCompareDragSource({record,sourceRef});
  return h('article',{id:'source',ref:sourceRef,...binding.surfaceProps},
    h('a',{id:'source-title',href:'#native-title',...binding.titleProps,onClick(event) {
      if (event.defaultPrevented || binding.consumeClick(event)) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault(); window.compareDragTest.opens += 1;
    }},record.title),
    h('svg',{id:'source-art',width:100,height:48,'aria-hidden':true},
      h('rect',{width:96,height:44,fill:'currentColor'})),
    h('p',{id:'selectable'},'Ordinary selectable game facts stay copyable.'),
    h('div',{id:'source-controls'},
      h(ComparePinButton,{record}),
      h(CompareDragHandle,{record,compact:true}),
      h('button',{id:'nested',type:'button',onClick(){window.compareDragTest.nested += 1;}},'Independent action'),
      h('input',{id:'rating','aria-label':'Your fixture rating',type:'number',defaultValue:'7'}),
      h('textarea',{id:'note','aria-label':'Your fixture note',defaultValue:'Keep this private draft'}),
      h('details',null,h('summary',null,'Actions and source'),h('a',{id:'external',href:'#source-credit'},'Source credit')),
    ),
  );
}
function WrapperSource() {
  return h(CompareDragSource,{record,children:binding => h('div',{
    id:'wrapper-source',className:'existing-inner-row',ref:binding.sourceRef,...binding.surfaceProps,
  },h('button',{id:'wrapper-title',type:'button',...binding.titleProps,onClick(event){
    if (!event.defaultPrevented && !binding.consumeClick(event)) window.compareDragTest.opens += 1;
  }},'Wrapped title'))});
}
function render() {
  const ticket = generation;
  const currentScope = scope;
  root.render(h(StrictMode,null,h(MotionProvider,{
    policy:{animate,reducedMotion:!animate,hidden:false,coarsePointer:matchMedia('(pointer:coarse)').matches,constrained:false},
    boundary:{scopeKey:scope,generation,blocked:!enabled},
    location:{viewKey:'fixture',requestedDetailKey:null,displayedDetailKey:null,navigationGeneration:generation,overlayKey:null},
  },h(CompareTrayProvider,{
    scope,
    interaction:{enabled,captureCurrent:()=>({isCurrent:()=>generation === ticket && scope === currentScope && enabled})},
  },h(Inspector),
  sourceVisible && h(Source),
  h(WrapperSource),
  h(CompareTray,{hidden:dockHidden,animate,onCompare() {}}),
  h(Dialog,{open:modal,titleId:'fixture-modal-title',motion:false,onClose(){modal = false;render();}},
    h('h2',{id:'fixture-modal-title','data-autofocus':true,tabIndex:-1},'Blocking fixture')),
  h('nav',{className:'mobile-nav','aria-label':'Fixture navigation'},h('button',{type:'button'},'Browse')),
  ))));
}
render();
</script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let browserServer: BrowserServer | undefined;
let context: BrowserContext;
let page: Page;
let origin: string;
let errors: string[];
let externalRequests: string[];
let resourceReceipt: { origin: string; runnerPid: number; chromePid: number | undefined; browserVersion: string; startedAt: string; closedAt: string | null } | undefined;
const receiptPath = process.env.PLAY100_COMPARE_FIXTURE_RECEIPT;

beforeAll(async () => {
  const port = Number(process.env.PLAY100_COMPARE_FIXTURE_PORT ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('The Compare fixture port is invalid.');
  server = await createServer({
    configFile: false, root: process.cwd(), cacheDir: 'node_modules/.vite-compare-tests',
    logLevel: 'error', appType: 'custom',
    plugins: [
      react(),
      {
        name: 'compare-source-fixture',
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url?.split('?')[0] !== '/__compare-source-test') return next();
            void vite.transformIndexHtml('/__compare-source-test', fixture).then(html => {
              response.setHeader('Content-Type', 'text/html');
              response.end(html);
            }, next);
          });
        },
      },
    ],
    server: { host: '127.0.0.1', port, strictPort: true, watch: null },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Compare fixture did not bind an owned local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browserServer = await chromium.launchServer({ channel: 'chrome', headless: true });
  browser = await chromium.connect(browserServer.wsEndpoint());
  console.info(`Compare fixture ${origin}; runner PID ${process.pid}; Chrome PID ${browserServer.process().pid}; Chrome ${browser.version()}`);
  resourceReceipt = { origin, runnerPid: process.pid, chromePid: browserServer.process().pid, browserVersion: browser.version(), startedAt: new Date().toISOString(), closedAt: null };
  if (receiptPath) await writeFile(receiptPath, JSON.stringify(resourceReceipt, null, 2));
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await browserServer?.close();
  await server?.close();
  if (receiptPath && resourceReceipt) await writeFile(receiptPath, JSON.stringify({ ...resourceReceipt, closedAt: new Date().toISOString() }, null, 2));
});

async function openFixture(touch = false, width = 1280) {
  if (!browser) throw new Error('The Compare test browser is unavailable.');
  context = await browser.newContext({
    viewport: { width, height: touch ? 851 : 960 }, hasTouch: touch, isMobile: touch,
    reducedMotion: 'reduce',
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  context.on('request', request => {
    if (!request.url().startsWith(`${origin}/`) && !request.url().startsWith('data:')) externalRequests.push(request.url());
  });
  await page.goto(`${origin}/__compare-source-test`);
  await browserExpect(page.locator('#source-title')).toBeVisible();
  await browserExpect(page.locator('.compare-drag-handle')).toBeEnabled();
}

beforeEach(async () => {
  errors = [];
  externalRequests = [];
  await openFixture();
});

afterEach(async () => {
  await context?.close();
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

async function nativeStart(selector = '#source-title') {
  const target = page.locator(selector);
  await target.scrollIntoViewIfNeeded();
  const rect = await target.boundingBox();
  if (!rect) throw new Error('The Compare source is not laid out.');
  const x = selector === '#source' ? rect.x + rect.width - 4 : rect.x + Math.min(24, rect.width / 2);
  const y = selector === '#source' ? rect.y + rect.height - 4 : rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 24, y + 16, { steps: 8 });
  await browserExpect(page.locator('.compare-tray-dock')).toContainText('Drop to pin');
}

async function nativeDrop() {
  const dock = await page.locator('.compare-tray-dock').boundingBox();
  if (!dock) throw new Error('The current Compare dock is missing.');
  await page.mouse.move(dock.x + dock.width / 2, dock.y + dock.height / 2, { steps: 12 });
  await page.mouse.up();
}

describe('Compare source browser contract', () => {
  it.each(['#source', '#source-art'])('accepts the real %s card/SVG source without a default DOM image or payload', async selector => {
    await nativeStart(selector);
    await nativeDrop();
    await browserExpect.poll(() => page.evaluate(() => window.compareDragTest.items())).toHaveLength(1);
    expect(await page.evaluate(() => window.compareDragTest.transfer?.types)).toEqual([COMPARE_DRAG_TYPE]);
    expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(0);
  });

  it('uses actual native title drag and only the opaque MIME, without opening or copying private UI', async () => {
    await nativeStart();
    const transfer = await page.evaluate(() => window.compareDragTest.transfer);
    expect(transfer?.types).toEqual([COMPARE_DRAG_TYPE]);
    expect(transfer?.values[COMPARE_DRAG_TYPE]).toMatch(/^[a-f0-9-]{36}$/i);
    await browserExpect(page.locator('.compare-drag-ghost')).toHaveCount(1);
    await browserExpect(page.locator('.compare-drag-ghost')).toHaveText('Pin to Compare');
    expect(await page.locator('.compare-drag-ghost input,.compare-drag-ghost textarea,.compare-drag-ghost img,[data-compare-token]').count()).toBe(0);
    await nativeDrop();
    await browserExpect.poll(() => page.evaluate(() => window.compareDragTest.items())).toEqual(['manual:drag-fixture']);
    expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(0);
    await browserExpect(page.locator('.compare-drag-ghost')).toHaveCount(0);
    await page.locator('#source-title').click();
    expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(1);
    await page.locator('#source-title').press('Enter');
    expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(2);
  });

  it('keeps native grip and zero-DOM wrapper title sources, with one slot for repeated pin', async () => {
    await nativeStart('.compare-drag-handle');
    await nativeDrop();
    await browserExpect.poll(() => page.evaluate(() => window.compareDragTest.items())).toHaveLength(1);
    await nativeStart('#wrapper-title');
    await nativeDrop();
    await browserExpect.poll(() => page.evaluate(() => window.compareDragTest.items())).toEqual(['manual:drag-fixture']);
    expect(await page.locator('#wrapper-source').evaluate(element => element.parentElement?.id)).toBe('mount');
    expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(0);
  });

  it('preserves ordinary title clicks, independent fields and selectable prose', async () => {
    await page.locator('#source-title').click();
    await page.locator('#nested').click();
    await page.locator('#rating').fill('8.5');
    await page.locator('#note').fill('Still my private draft');
    await page.locator('summary').click();
    await browserExpect(page.locator('#external')).toBeVisible();
    expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(1);
    expect(await page.evaluate(() => window.compareDragTest.nested)).toBe(1);
    expect(await page.evaluate(() => window.compareDragTest.items())).toEqual([]);
    const rect = await page.locator('#selectable').boundingBox();
    if (!rect) throw new Error('Selectable prose is missing.');
    await page.mouse.move(rect.x + 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + Math.min(180, rect.width - 2), rect.y + rect.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(await page.evaluate(() => document.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
    await browserExpect(page.locator('.compare-drag-ghost,.compare-tray-dock')).toHaveCount(0);
    await browserExpect(page.locator('#note')).toHaveValue('Still my private draft');
  });

  it('preserves a native modified link in a separate owned tab without arming Compare', async () => {
    const opened = context.waitForEvent('page');
    await page.locator('#source-title').click({ modifiers: ['Control'] });
    const other = await opened;
    try {
      await other.waitForLoadState('domcontentloaded');
      expect(other.url()).toContain('#native-title');
      expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(0);
      expect(await page.evaluate(() => window.compareDragTest.items())).toEqual([]);
      await browserExpect(page.locator('.compare-drag-ghost')).toHaveCount(0);
    } finally { await other.close(); }
  });

  it('cancels an old native token across account A to B to A and blocks readiness-gated starts', async () => {
    await page.evaluate(() => window.compareDragTest.setScope('account:demo-play100:alice'));
    await nativeStart();
    await page.evaluate(() => window.compareDragTest.setScope('account:demo-play100:bob'));
    await browserExpect(page.locator('.compare-drag-ghost,.compare-tray-dock')).toHaveCount(0);
    await page.evaluate(() => window.compareDragTest.setScope('account:demo-play100:alice'));
    await page.mouse.up();
    expect(await page.evaluate(() => window.compareDragTest.items())).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('play100:compare-tray:v1:account:demo-play100:alice'))).toBeNull();
    await page.evaluate(() => window.compareDragTest.setEnabled(false));
    await browserExpect(page.locator('.compare-drag-handle')).toBeDisabled();
    await page.evaluate(() => window.compareDragTest.setEnabled(true));
    await page.locator('.compare-drag-handle').click();
    await browserExpect.poll(() => page.evaluate(() => window.compareDragTest.items())).toHaveLength(1);
  });

  it('removes native feedback on hide, source removal, and unmount even with reduced optional motion', async () => {
    for (const action of ['hidden', 'source', 'unmount'] as const) {
      await page.reload();
      await browserExpect(page.locator('.compare-drag-handle')).toBeEnabled();
      await nativeStart();
      await page.evaluate(action => {
        if (action === 'hidden') window.compareDragTest.interrupt('hidden');
        else if (action === 'source') window.compareDragTest.setSource(false);
        else window.compareDragTest.unmount();
      }, action);
      await browserExpect(page.locator('.compare-drag-ghost')).toHaveCount(0);
      await page.mouse.up();
      expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('play100:compare-tray:')))).toEqual([]);
    }
  });

  it('cancels a native drag on a real modal and on an explicitly hidden dock', async () => {
    for (const modal of [true, false]) {
      await page.reload();
      await browserExpect(page.locator('.compare-drag-handle')).toBeEnabled();
      await nativeStart();
      await page.evaluate(modal => {
        if (modal) window.compareDragTest.setModal(true);
        else window.compareDragTest.setDockHidden(true);
      }, modal);
      await browserExpect(page.locator('.compare-drag-ghost')).toHaveCount(0);
      await page.mouse.up();
      expect(await page.evaluate(() => window.compareDragTest.items())).toEqual([]);
      if (modal) await browserExpect(page.getByRole('dialog', { name: 'Blocking fixture' })).toBeVisible();
    }
  });

  it('keeps a coarse tap and pre-hold vertical pan native, including the 320px grip target', async () => {
    await context.close();
    await openFixture(true, 320);
    await page.locator('#source-title').tap();
    expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(1);
    const grip = await page.locator('.compare-drag-handle').boundingBox();
    if (!grip) throw new Error('The visible coarse Compare grip is missing.');
    expect(grip.width).toBeGreaterThanOrEqual(44);
    expect(grip.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const title = await page.locator('#source-title').boundingBox();
    if (!title) throw new Error('The pan source title is missing.');
    const x = title.x + 30, y = title.y + title.height / 2;
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 5; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.max(8, y - step * 20) }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await browserExpect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
      await browserExpect(page.locator('.compare-drag-ghost,.compare-tray-dock')).toHaveCount(0);
      expect(await page.evaluate(() => window.compareDragTest.items())).toEqual([]);
    } finally { await cdp.detach(); }
  });

  it.each([393, 320])('supports the narrow touch grip and a still-held Escape cancellation at %ipx', async width => {
    await context.close();
    await openFixture(true, width);
    const grip = await page.locator('.compare-drag-handle').boundingBox();
    if (!grip) throw new Error('The touch grip is missing.');
    const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(310);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 3, y: y + 3 }] });
      await browserExpect(page.locator('.compare-drag-ghost')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await browserExpect(page.locator('.compare-drag-ghost')).toHaveCount(0);
      await page.waitForTimeout(400);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.compareDragTest.items())).toEqual([]);
      await page.locator('.compare-drag-handle').tap();
      await browserExpect.poll(() => page.evaluate(() => window.compareDragTest.items())).toHaveLength(1);
    } finally { await cdp.detach(); }
  });

  it('performs the bounded broad-touch hold experiment with real touch input and the same token drop', async () => {
    await context.close();
    await openFixture(true, 393);
    const source = await page.locator('#source-title').boundingBox();
    if (!source) throw new Error('The touch title is missing.');
    const x = source.x + 30, y = source.y + source.height / 2;
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(310);
      // Cross the UA's touchmove delivery threshold after the hold, not its pre-hold slop.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 24, y: y + 24 }] });
      await browserExpect(page.locator('.compare-drag-ghost')).toHaveCount(1);
      await browserExpect(page.locator('.compare-drag-ghost')).toHaveText('Pin to Compare');
      const dock = await page.locator('.compare-tray-dock').boundingBox();
      if (!dock) throw new Error('The touch drop target is missing.');
      const endX = dock.x + dock.width / 2, endY = dock.y + dock.height / 2;
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (endX - x) * step / 8, y: y + (endY - y) * step / 8 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await browserExpect.poll(() => page.evaluate(() => window.compareDragTest.items())).toEqual(['manual:drag-fixture']);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.compareDragTest.status())).toContain('pinned for comparison. 1 of six games.');
      expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(0);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await browserExpect(page.locator('.compare-drag-ghost')).toHaveCount(0);
      await page.locator('#source-title').tap();
      expect(await page.evaluate(() => window.compareDragTest.opens)).toBe(1);
    } finally { await cdp.detach(); }
  }, 20_000);
});

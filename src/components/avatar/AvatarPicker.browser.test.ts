import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../../lib/test-server-ports';
import { generateAvatarDataUri } from '../../lib/avatar';
import type { AvatarDescriptor } from '../../lib/avatar';

interface SaveCall {
  identityKey: string;
  descriptor: AvatarDescriptor;
}

declare global {
  interface Window {
    avatarTest: {
      calls: SaveCall[];
      cancelCalls: number;
      props(next: { value?: AvatarDescriptor; identityKey?: string }): void;
      mode(value: 'success' | 'failure' | 'throw' | 'deferred'): void;
      resolve(index: number): void;
      reject(index: number): void;
      unmount(): void;
      mount(): void;
    };
  }
}

// Served in memory by the test-only Vite instance; no fixture or route enters the app.
const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Avatar component tests</title><link rel="icon" href="/favicon.svg">
<style>main{width:min(520px,calc(100% - 70px));margin:24px auto}h1{font-size:18px;margin-bottom:24px}</style>
</head><body><main><h1>Isolated avatar component fixture</h1><div id="mount"></div></main>
<script type="module">
import { createElement as h, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AvatarPicker } from '/src/components/avatar/AvatarPicker.tsx';
import '/src/styles.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
let value = { version: 1, seed: '00000000000000000000000000000000', palette: 'lime' };
let identityKey = 'fixture-a';
let mode = 'success';
const pending = [];
const root = createRoot(document.getElementById('mount'));
function render() {
  const identity = identityKey;
  root.render(h(StrictMode, null, h(AvatarPicker, {
    value, identityKey, titleId: 'fixture-title',
    onCancel() { window.avatarTest.cancelCalls += 1; },
    onSave(next) {
      window.avatarTest.calls.push({ identityKey: identity, descriptor: structuredClone(next) });
      if (mode === 'throw') throw new Error('Synthetic synchronous failure.');
      if (mode === 'failure') return Promise.reject(new Error('Synthetic save failure.'));
      if (mode === 'deferred') return new Promise((resolve, reject) => pending.push({ resolve, reject }));
      return Promise.resolve();
    }
  })));
}
window.avatarTest = {
  calls: [], cancelCalls: 0,
  props(next) { value = next.value ?? value; identityKey = next.identityKey ?? identityKey; render(); },
  mode(next) { mode = next; },
  resolve(index) { pending[index].resolve(); },
  reject(index) { pending[index].reject(new Error('Synthetic old-identity failure.')); },
  unmount() { root.render(null); },
  mount() { render(); }
};
render();
</script></body></html>`;

const first: AvatarDescriptor = { version: 1, seed: '0'.repeat(32), palette: 'lime' };
const second: AvatarDescriptor = { version: 1, seed: 'b'.repeat(32), palette: 'sky' };
let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let context: BrowserContext;
let page: Page;
let origin: string;
let errors: string[];
let externalRequests: string[];

beforeAll(async () => {
  server = (await createFetchSafeViteServer(() => createServer({
    configFile: false,
    root: process.cwd(),
    cacheDir: 'node_modules/.vite-avatar-tests',
    logLevel: 'error',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', '@dicebear/core'] },
    plugins: [
      react(),
      {
        name: 'avatar-component-test-fixture',
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url !== '/__avatar-test') return next();
            void vite.transformIndexHtml('/__avatar-test', fixture).then((html) => {
              response.setHeader('Content-Type', 'text/html');
              response.end(html);
            }, next);
          });
        },
      },
    ],
    server: { host: '127.0.0.1', port: 0, strictPort: true, watch: null },
  }))).server;
  expect(server.config.optimizeDeps.noDiscovery).toBe(true);
  expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-avatar-tests$/);
  expect(server.config.server.watch).toBeNull();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Avatar test server did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

beforeEach(async () => {
  if (!browser) throw new Error('Avatar test browser is unavailable.');
  errors = [];
  externalRequests = [];
  context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  context.on('request', (request) => {
    if (!request.url().startsWith(`${origin}/`) && !request.url().startsWith('data:')) externalRequests.push(request.url());
  });
  await page.goto(`${origin}/__avatar-test`);
  await page.getByRole('heading', { name: 'Pick your avatar.' }).waitFor();
});

afterEach(async () => {
  await context?.close();
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

function faces() {
  return page.getByRole('radiogroup', { name: 'Choose a face' }).getByRole('radio');
}

async function selectedImage() {
  return page.locator('.avatar-picker__candidate.is-selected img').getAttribute('src');
}

async function calls() {
  return page.evaluate(() => window.avatarTest.calls);
}

describe('AvatarPicker in a real browser', () => {
  it('mounts six local previews without saving, focusing a control or opening another dialog', async () => {
    await browserExpect(faces()).toHaveCount(6);
    await browserExpect(faces().first()).toBeChecked();
    expect(await selectedImage()).toBe(generateAvatarDataUri(first));
    expect(await calls()).toEqual([]);
    expect(await page.locator('dialog').count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
    expect(await page.locator('.avatar-picker img').evaluateAll((images) => images.every((image) =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 &&
      image.src.startsWith('data:image/svg+xml;') && image.width > 0 && image.height > 0,
    ))).toBe(true);
  });

  it('supports native arrow selection with visible focus, without changing persisted input', async () => {
    await faces().first().focus();
    await page.keyboard.press('ArrowRight');
    await browserExpect(faces().nth(1)).toBeChecked();
    const outline = await page.locator('.avatar-picker__candidate').nth(1).evaluate((element) => getComputedStyle(element).outlineWidth);
    expect(outline).toBe('3px');
    await page.getByRole('radio', { name: 'Moss', exact: true }).check();
    await page.keyboard.press('ArrowRight');
    await browserExpect(page.getByRole('radio', { name: 'Clay', exact: true })).toBeChecked();
    expect(await calls()).toEqual([]);
  });

  it('keeps palette changes and Shuffle local, and Cancel never calls Save', async () => {
    await faces().nth(2).check();
    await page.getByRole('radio', { name: 'Lilac', exact: true }).check();
    const oldSeeds = await faces().evaluateAll((inputs) => inputs.map((input) => input.getAttribute('value')));
    await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
    await browserExpect(faces()).toHaveCount(6);
    await browserExpect(faces().first()).toBeChecked();
    await browserExpect(page.getByRole('radio', { name: 'Lilac', exact: true })).toBeChecked();
    expect(await faces().evaluateAll((inputs) => inputs.map((input) => input.getAttribute('value')))).not.toEqual(oldSeeds);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await calls()).toEqual([]);
    expect(await page.evaluate(() => window.avatarTest.cancelCalls)).toBe(1);
  });

  it('does not clobber the draft or regenerate candidates on ordinary external value changes', async () => {
    await faces().nth(3).check();
    await page.getByRole('radio', { name: 'Clay', exact: true }).check();
    const image = await selectedImage();
    const seeds = await faces().evaluateAll((inputs) => inputs.map((input) => input.getAttribute('value')));
    await page.evaluate((value) => window.avatarTest.props({ value }), second);
    expect(await selectedImage()).toBe(image);
    expect(await faces().evaluateAll((inputs) => inputs.map((input) => input.getAttribute('value')))).toEqual(seeds);
    await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
    await browserExpect(page.getByRole('status')).toHaveText('Avatar saved.');
    const saved = await calls();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.descriptor.palette).toBe('clay');
    expect(saved[0]?.descriptor.seed).toBe(seeds[3]);
  });

  it('saves a snapshot exactly once, disables pending controls and does not call Cancel on success', async () => {
    await faces().nth(4).check();
    await page.getByRole('radio', { name: 'Moss', exact: true }).check();
    const image = await selectedImage();
    await page.evaluate(() => window.avatarTest.mode('deferred'));
    await page.getByRole('button', { name: 'Save avatar', exact: true }).evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error('Expected the Save button');
      button.click();
      button.click();
    });
    await browserExpect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    expect(await calls()).toHaveLength(1);
    expect(await page.locator('.avatar-picker input, .avatar-picker button').evaluateAll((controls) =>
      controls.every((control) => control.matches(':disabled')),
    )).toBe(true);
    await page.evaluate(() => window.avatarTest.resolve(0));
    await browserExpect(page.getByRole('status')).toHaveText('Avatar saved.');
    await browserExpect(page.getByRole('button', { name: 'Save avatar', exact: true })).toBeDisabled();
    expect(await selectedImage()).toBe(image);
    expect(await page.evaluate(() => window.avatarTest.cancelCalls)).toBe(0);
  });

  it.each(['failure', 'throw'] as const)('shows %s inline, preserves the draft and permits an explicit retry', async (mode) => {
    await faces().nth(5).check();
    await page.getByRole('radio', { name: 'Clay', exact: true }).check();
    const image = await selectedImage();
    await page.evaluate((mode) => window.avatarTest.mode(mode), mode);
    await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
    await browserExpect(page.getByRole('alert')).toContainText('Could not save avatar.');
    await browserExpect(page.getByRole('alert')).toContainText('Your choice is still here.');
    expect(await selectedImage()).toBe(image);
    await browserExpect(faces().nth(5)).toBeChecked();
    await page.evaluate(() => window.avatarTest.mode('success'));
    await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
    await browserExpect(page.getByRole('status')).toHaveText('Avatar saved.');
    const saved = await calls();
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(saved[1]);
    await browserExpect(page.getByRole('alert')).toHaveCount(0);
  });

  it('discards an unsaved old identity draft instead of passing it to the new callback', async () => {
    await faces().nth(2).check();
    await page.getByRole('radio', { name: 'Lilac', exact: true }).check();
    await page.evaluate((value) => window.avatarTest.props({ identityKey: 'fixture-b', value }), second);
    await browserExpect(faces().first()).toHaveValue(second.seed);
    expect(await selectedImage()).toBe(generateAvatarDataUri(second));
    await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
    await browserExpect(page.getByRole('status')).toHaveText('Avatar saved.');
    expect(await calls()).toEqual([{ identityKey: 'fixture-b', descriptor: second }]);
  });

  it.each(['resolve', 'reject'] as const)('ignores a late %s from the old identity while the new identity is saving', async (settle) => {
    await page.evaluate(() => window.avatarTest.mode('deferred'));
    await faces().nth(1).check();
    await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
    await page.evaluate((value) => window.avatarTest.props({ identityKey: 'fixture-b', value }), second);
    await browserExpect(faces().first()).toHaveValue(second.seed);
    await browserExpect(page.getByRole('button', { name: 'Save avatar', exact: true })).toBeEnabled();
    expect(await selectedImage()).toBe(generateAvatarDataUri(second));
    await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
    await page.evaluate((settle) => window.avatarTest[settle](0), settle);
    await browserExpect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    await browserExpect(page.getByRole('alert')).toHaveCount(0);
    await page.evaluate(() => window.avatarTest.resolve(1));
    await browserExpect(page.getByRole('status')).toHaveText('Avatar saved.');
    const saved = await calls();
    expect(saved).toHaveLength(2);
    expect(saved[0]?.identityKey).toBe('fixture-a');
    expect(saved[1]).toEqual({ identityKey: 'fixture-b', descriptor: second });
    expect(await page.evaluate(() => window.avatarTest.cancelCalls)).toBe(0);
  });

  it('ignores late rejection after unmount and does not poison a reopened picker', async () => {
    await page.evaluate(() => window.avatarTest.mode('deferred'));
    await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
    await page.evaluate(() => window.avatarTest.unmount());
    await browserExpect(page.locator('.avatar-picker')).toHaveCount(0);
    await page.evaluate(() => { window.avatarTest.reject(0); window.avatarTest.mount(); });
    await browserExpect(faces().first()).toHaveValue(first.seed);
    await browserExpect(page.getByRole('alert')).toHaveCount(0);
    await browserExpect(page.getByRole('button', { name: 'Save avatar', exact: true })).toBeEnabled();
    expect(await calls()).toHaveLength(1);
  });

  it('retains the current choices and reports a failed Shuffle instead of inventing seeds', async () => {
    await faces().nth(2).check();
    const image = await selectedImage();
    await page.evaluate(() => {
      Object.defineProperty(crypto, 'getRandomValues', { value: () => { throw new Error('Synthetic crypto failure.'); } });
    });
    await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
    await browserExpect(page.getByRole('alert')).toContainText('Your choice is unchanged.');
    expect(await selectedImage()).toBe(image);
    await browserExpect(faces()).toHaveCount(6);
    expect(await calls()).toEqual([]);
  });

  it('keeps an initial generation failure visible across local edits instead of hiding missing choices', async () => {
    await page.addInitScript(() => {
      Object.defineProperty(crypto, 'getRandomValues', { value: () => { throw new Error('Synthetic crypto failure.'); } });
    });
    await page.reload();
    await browserExpect(faces()).toHaveCount(1);
    await browserExpect(page.getByRole('alert')).toContainText('Your current avatar is still available.');
    await page.getByRole('radio', { name: 'Sky', exact: true }).check();
    await browserExpect(page.getByRole('alert')).toContainText('Could not generate new faces.');
    await page.getByRole('button', { name: 'Save avatar', exact: true }).click();
    await browserExpect(page.getByRole('status')).toHaveText('Avatar saved.');
    await browserExpect(page.getByRole('alert')).toContainText('Could not generate new faces.');
    expect(await calls()).toEqual([{ identityKey: 'fixture-a', descriptor: { ...first, palette: 'sky' } }]);
  });

  it.each([320, 393, 1280])('keeps a 3x2 grid, usable targets and no overflow at %ipx', async (width) => {
    await page.setViewportSize({ width, height: 851 });
    const layout = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('.avatar-picker__candidate')].map((item) => item.getBoundingClientRect().toJSON());
      const targets = [...document.querySelectorAll('.avatar-picker input, .avatar-picker button')].map((item) => item.getBoundingClientRect());
      return {
        columns: new Set(candidates.map((rect) => rect.x)).size,
        rows: new Set(candidates.map((rect) => rect.y)).size,
        targets: targets.every((rect) => rect.width >= 44 && rect.height >= 48),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(layout).toEqual({ columns: 3, rows: 2, targets: true, overflow: false });
  });

  it('respects reduced motion and passes focused accessibility checks', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('.avatar-picker__candidate').first().evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
    const report = await new AxeBuilder({ page }).include('.avatar-picker').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(report.violations.map(({ id, description }) => ({ id, description }))).toEqual([]);
  });
});

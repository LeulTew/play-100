import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';

interface RadioFrame {
  checked: string | undefined;
  selected: string | undefined;
  focused: string | undefined;
  disabled: boolean;
}

declare global {
  interface Window {
    settingsRadioFixture: {
      calls: string[];
      frames: RadioFrame[];
      finish(result: boolean | 'reject'): void;
      externalBusy(value: boolean): void;
    };
  }
}

const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Settings radio fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module">
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsDialog } from '/src/components/SettingsDialog.tsx';
import { emptyPersonalLibrary } from '/src/lib/personal-library.ts';
import '/src/styles.css';
import '/src/personal.css';
let finish, setExternalBusy;
const calls = [], frames = [];
function App() {
  const [motion, setMotion] = useState('auto');
  const [busy, setBusy] = useState(false);
  setExternalBusy = setBusy;
  return h(SettingsDialog, {
    motion, busy, reducedMotion: false, constrained: false, saved: 0, completed: 0,
    warning: null, state: { ...emptyPersonalLibrary(), motion }, persistent: true,
    status: 'Existing Settings status.',
    onMotion(value) {
      calls.push(value);
      setBusy(true);
      return new Promise((resolve, reject) => {
        finish = result => {
          if (result === true) setMotion(value);
          setBusy(false);
          if (result === 'reject') reject(new Error('Synthetic motion-save rejection'));
          else resolve(result);
        };
      });
    },
    onReset: async () => true, onRestore: async () => true, onAbout() {}, onClose() {},
  });
}
document.addEventListener('change', event => {
  if (!(event.target instanceof HTMLInputElement) || event.target.name !== 'visual-experience') return;
  frames.length = 0;
  const sample = () => {
    frames.push({
      checked: document.querySelector('input[name="visual-experience"]:checked')?.value,
      selected: document.querySelector('.motion-option.selected input')?.value,
      focused: document.activeElement instanceof HTMLInputElement ? document.activeElement.value : undefined,
      disabled: Boolean(document.querySelector('input[name="visual-experience"]:disabled')),
    });
    if (frames.length < 2) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
window.settingsRadioFixture = {
  calls, frames, finish: result => finish(result), externalBusy: value => setExternalBusy(value),
};
createRoot(document.getElementById('mount')).render(h(App));
</script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = await createServer({
    configFile: false, root: process.cwd(), cacheDir: 'node_modules/.vite-settings-radio-tests',
    logLevel: 'error', appType: 'custom',
    plugins: [react(), {
      name: 'settings-radio-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== '/__settings-radio') return next();
          void vite.transformIndexHtml('/__settings-radio', fixture).then(html => {
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          }, next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0, watch: null },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Settings fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

afterAll(async () => { await browser?.close(); await server?.close(); });

const radio = (page: Page, value: string) => page.locator(`input[name="visual-experience"][value="${value}"]`);

for (const mobile of [false, true]) {
  describe(mobile ? 'mobile Settings motion radios' : 'desktop Settings motion radios', () => {
    async function withPage(work: (page: Page) => Promise<void>) {
      if (!browser) throw new Error('Settings fixture browser unavailable.');
      const context = await browser.newContext({
        viewport: { width: mobile ? 393 : 1440, height: 900 }, isMobile: mobile, hasTouch: mobile,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', route => new URL(route.request().url()).origin === origin
        ? route.continue() : route.abort('blockedbyclient'));
      try {
        await page.goto(`${origin}/__settings-radio`);
        await browserExpect(page.locator('#settings-title')).toBeFocused();
        await work(page);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    }

    it('keeps the clicked value and selected class for both pending frames without disabling its focus', async () => {
      await withPage(async page => {
        await radio(page, 'lite').click();
        await browserExpect.poll(() => page.evaluate(() => window.settingsRadioFixture.frames.length)).toBe(2);
        expect(await page.evaluate(() => window.settingsRadioFixture.frames)).toEqual([
          { checked: 'lite', selected: 'lite', focused: 'lite', disabled: false },
          { checked: 'lite', selected: 'lite', focused: 'lite', disabled: false },
        ]);
        await browserExpect(radio(page, 'lite')).toHaveAttribute('aria-disabled', 'true');
        // Bypass Playwright's aria-disabled actionability check to exercise the handler guard.
        await radio(page, 'full').click({ force: true });
        await browserExpect(radio(page, 'lite')).toBeChecked();
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['lite']);
        await page.evaluate(() => window.settingsRadioFixture.finish(true));
        await browserExpect(radio(page, 'lite')).toBeChecked();
        await browserExpect(radio(page, 'lite')).not.toHaveAttribute('aria-disabled', 'true');
      });
    });

    it.each([['ArrowDown', 'full'], ['ArrowUp', 'lite']] as const)(
      '%s keeps the newly selected %s radio focused throughout its save',
      async (key, selected) => {
        await withPage(async page => {
          await radio(page, 'auto').focus();
          await page.keyboard.press(key);
          await browserExpect.poll(() => page.evaluate(() => window.settingsRadioFixture.frames.length)).toBe(2);
          expect(await page.evaluate(() => window.settingsRadioFixture.frames)).toEqual([
            { checked: selected, selected, focused: selected, disabled: false },
            { checked: selected, selected, focused: selected, disabled: false },
          ]);
          await browserExpect(radio(page, selected)).toBeFocused();
          await page.evaluate(() => window.settingsRadioFixture.finish(true));
          await browserExpect(radio(page, selected)).not.toHaveAttribute('aria-disabled', 'true');
          await browserExpect(radio(page, selected)).toBeFocused();
          await browserExpect(radio(page, selected)).toBeChecked();
        });
      },
    );

    it.each([false, 'reject'] as const)('reverts and announces failed save %s in the existing status region, then retries', async result => {
      await withPage(async page => {
        await radio(page, 'lite').click();
        await browserExpect(radio(page, 'lite')).toBeChecked();
        await page.evaluate(value => window.settingsRadioFixture.finish(value), result);
        await browserExpect(radio(page, 'auto')).toBeChecked();
        await browserExpect(page.locator('.motion-option.selected input')).toHaveValue('auto');
        await browserExpect(radio(page, 'lite')).toBeFocused();
        const status = page.locator('.settings-dialog .dialog-inner > [role="status"]');
        await browserExpect(status).toHaveCount(1);
        await browserExpect(status).toContainText('Existing Settings status.');
        await browserExpect(status).toContainText('Your visual experience could not be saved.');
        await radio(page, 'lite').click();
        await browserExpect(status).not.toContainText('Your visual experience could not be saved.');
        await page.evaluate(() => window.settingsRadioFixture.finish(true));
        await browserExpect(radio(page, 'lite')).not.toHaveAttribute('aria-disabled', 'true');
        await browserExpect(radio(page, 'lite')).toBeChecked();
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['lite', 'lite']);
      });
    });

    it('still disables the group for unrelated library work', async () => {
      await withPage(async page => {
        await page.evaluate(() => window.settingsRadioFixture.externalBusy(true));
        for (const value of ['auto', 'full', 'lite']) await browserExpect(radio(page, value)).toBeDisabled();
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual([]);
        await page.evaluate(() => window.settingsRadioFixture.externalBusy(false));
        await browserExpect(radio(page, 'auto')).toBeEnabled();
      });
    });
  });
}

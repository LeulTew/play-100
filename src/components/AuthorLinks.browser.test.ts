import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import sharp from 'sharp';

const origin = 'http://127.0.0.1:4450';
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Author links fixture</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.svg">
</head><body><main id="root"></main><script type="module" src="/src/components/AuthorLinks.browser-fixture.tsx"></script></body></html>`;
let server: ViteDevServer;
let browser: Browser;

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    appType: 'custom',
    logLevel: 'error',
    cacheDir: 'node_modules/.vite-author-links',
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
    plugins: [
      react(),
      {
        name: 'author-links-fixture',
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url !== '/__author-links') return next();
            void vite.transformIndexHtml('/__author-links', html).then((content) => {
              response.setHeader('Content-Type', 'text/html');
              response.end(content);
            }, next);
          });
        },
      },
    ],
    server: { host: '127.0.0.1', port: 4450, strictPort: true, watch: null },
  });
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

describe('author contact icon targets', () => {
  it.each([false, true])(
    'renders four real monochrome sprite icons offline with 44px keyboard targets (touch=%s)',
    async (touch) => {
      const context = await browser.newContext({
        viewport: { width: touch ? 393 : 1280, height: 851 },
        isMobile: touch,
        hasTouch: touch,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(`${origin}/__author-links`);
        const links = page.locator('.author-links a');
        await browserExpect(links).toHaveCount(4);
        await browserExpect
          .poll(() =>
            page
              .locator('.author-links use')
              .evaluateAll((nodes) =>
                nodes.every((node) => node instanceof SVGGraphicsElement && node.getBBox().width > 10),
              ),
          )
          .toBe(true);
        await context.setOffline(true);
        await page.keyboard.press('Tab');
        for (let index = 0; index < 4; index++) {
          const link = links.nth(index);
          await browserExpect(link).toBeFocused();
          const box = await link.boundingBox();
          expect(box?.width).toBe(44);
          expect(box?.height).toBe(44);
          await browserExpect(link).toHaveCSS('outline-style', 'solid');
          await browserExpect(link).toHaveCSS('outline-width', '3px');
          const image = await sharp(await link.locator('svg').screenshot())
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          let ink = 0;
          for (let offset = 0; offset < image.data.length; offset += image.info.channels)
            if (image.data[offset]! < 100 && image.data[offset + 1]! < 100 && image.data[offset + 2]! < 100) ink++;
          expect(ink).toBeGreaterThan(20);
          await page.keyboard.press('Tab');
        }
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    },
  );
});

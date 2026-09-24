import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import type { HtmlTagDescriptor } from 'vite';
import react from '@vitejs/plugin-react';
import catalogHandler from './api/catalog.ts';
import catalogDetailHandler from './api/catalog-detail.ts';
import { play100Pwa } from './scripts/pwa-build.ts';
import { publicMetadataHtml } from './scripts/public-metadata.ts';
import { firstPaintShell, firstPaintVariant } from './scripts/first-paint/plugin.ts';
import author from './author.json' with { type: 'json' };
import deployment from './vercel.json' with { type: 'json' };
import { appCheckCspProblems, readAppCheckConfiguration } from './src/lib/app-check-config.ts';
import { readFirebaseConfiguration } from './src/lib/online-config.ts';

const publicUrl = process.env.VITE_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
const siteOrigin = publicUrl ? new URL(publicUrl).origin : undefined;
if (siteOrigin && !siteOrigin.startsWith('https://')) {
  throw new Error('The public website origin must use HTTPS.');
}

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const online = readFirebaseConfiguration(environment);
  if (mode !== 'cloud-test' && (online.error || (environment.VITE_FIREBASE_REQUIRED === 'true' && !online.config))) {
    throw new Error(online.error ?? 'This release requires a complete public Firebase configuration. Build stopped before publication.');
  }
  const appCheck = readAppCheckConfiguration(environment);
  if (appCheck.error) throw new Error(appCheck.error);
  if (appCheck.config) {
    const policy = deployment.headers.find(rule => rule.source === '/((?!__/auth/).*)')?.headers
      .find(header => header.key === 'Content-Security-Policy')?.value ?? '';
    const problems = appCheckCspProblems(policy);
    if (problems.length) throw new Error(`App Check is enabled but vercel.json CSP is not ready: ${problems.join(' ')}`);
  }
  return {
  define: {
    'import.meta.env.VITE_APP_CHECK_ENABLED': JSON.stringify(appCheck.config ? 'true' : 'false'),
  },
  plugins: [
    react(),
    play100Pwa(),
    {
      name: 'play100-local-catalog',
      configureServer(server) {
        server.middlewares.use('/api/catalog-detail', (request, response) => { void catalogDetailHandler(request, response); });
        server.middlewares.use('/api/catalog', (request, response) => { void catalogHandler(request, response); });
      },
      configurePreviewServer(server) {
        server.middlewares.use('/api/catalog-detail', (request, response) => { void catalogDetailHandler(request, response); });
        server.middlewares.use('/api/catalog', (request, response) => { void catalogHandler(request, response); });
      },
    },
    {
      name: 'play100-public-metadata',
      transformIndexHtml(html, context) {
        const fonts = Object.values(context.bundle ?? {}).filter((asset) =>
          asset.type === 'asset' && /barlow-condensed-latin-800-normal.*\.woff2$/.test(asset.fileName),
        );
        const tags: HtmlTagDescriptor[] = [
          { tag: 'meta', attrs: { name: 'author', content: author.fullName } },
          ...fonts.map((asset) => ({
            tag: 'link', attrs: { rel: 'preload', href: `/${asset.fileName}`, as: 'font', type: 'font/woff2', crossorigin: 'anonymous' },
          })),
          { tag: 'link', attrs: { rel: 'preload', href: '/data/collection.json', as: 'fetch', type: 'application/json', crossorigin: 'anonymous' } },
        ];
        return {
          html: publicMetadataHtml(html, siteOrigin),
          tags,
        };
      },
    },
    // The header React's first commit renders, or no shell when that commit shows the online
    // configuration banner (cloud-test builds only; other modes throw above).
    firstPaintShell({ variant: firstPaintVariant(mode, environment.VITE_USE_FIREBASE_EMULATORS, online) }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 650,
    assetsInlineLimit: 0,
  },
  test: {
    // Browser files each drive their own Chromium and Vite server.
    // Run them one at a time after the parallel unit files.
    // Their budgets mirror Vitest's browser mode.
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'src/**/*.browser.test.ts'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          fileParallelism: false,
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
  };
});

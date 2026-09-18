import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import type { HtmlTagDescriptor } from 'vite';
import react from '@vitejs/plugin-react';
import catalogHandler from './api/catalog.ts';
import author from './author.json' with { type: 'json' };
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
  return {
  plugins: [
    react(),
    {
      name: 'play100-local-catalog',
      configureServer(server) {
        server.middlewares.use('/api/catalog', (request, response) => { void catalogHandler(request, response); });
      },
      configurePreviewServer(server) {
        server.middlewares.use('/api/catalog', (request, response) => { void catalogHandler(request, response); });
      },
    },
    {
      name: 'play100-public-metadata',
      transformIndexHtml(html, context) {
        const fonts = Object.values(context.bundle ?? {}).filter((asset) =>
          asset.type === 'asset' && /(?:hanken-grotesk-latin-wght-normal|barlow-condensed-latin-(?:700|800)-normal).*\.woff2$/.test(asset.fileName),
        );
        const tags: HtmlTagDescriptor[] = [
          { tag: 'meta', attrs: { name: 'author', content: author.fullName } },
          ...fonts.map((asset) => ({
            tag: 'link', attrs: { rel: 'preload', href: `/${asset.fileName}`, as: 'font', type: 'font/woff2', crossorigin: 'anonymous' },
          })),
          { tag: 'link', attrs: { rel: 'preload', href: '/data/collection.json', as: 'fetch', type: 'application/json', crossorigin: 'anonymous' } },
        ];
        if (siteOrigin) tags.push(
          { tag: 'link', attrs: { rel: 'canonical', href: `${siteOrigin}/` } },
          { tag: 'meta', attrs: { property: 'og:url', content: `${siteOrigin}/` } },
          { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
          { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
          { tag: 'meta', attrs: { property: 'og:image:alt', content: 'Play 100. Good games. Great escapes. One hundred games worth making time for.' } },
        );
        return {
          html: siteOrigin ? html.replace('content="/social-card.png"', `content="${siteOrigin}/social-card.png"`) : html,
          tags,
        };
      },
    },
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 650,
    assetsInlineLimit: 0,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
  };
});

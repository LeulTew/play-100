import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { Manifest } from 'vite';
import { pwaBuildVersion, pwaCorePaths, pwaDocumentPolicy, PWA_ROOTS } from './pwa-build';
import { PWA_ICONS, renderPwaIcons } from './pwa-icons';

function manifest(): Manifest {
  const output: Manifest = {
    'index.html': {
      file: 'assets/index-12345678.js', isEntry: true, imports: ['_shared'],
      css: ['assets/index-12345678.css'],
      assets: ['assets/brand-12345678.woff2', 'assets/brand-12345678.woff'],
      dynamicImports: ['src/cloud/OnlineController.tsx', 'src/components/scene/CollectionScene.tsx'],
    },
    _shared: { file: 'assets/shared-12345678.js' },
    'src/cloud/OnlineController.tsx': { file: 'assets/OnlineController-12345678.js' },
    'src/components/scene/CollectionScene.tsx': { file: 'assets/CollectionScene-12345678.js' },
  };
  for (const [index, root] of PWA_ROOTS.slice(1).entries()) {
    output[root] = { file: `assets/route${index}-12345678.js`, imports: ['index.html', '_shared'] };
  }
  return output;
}

describe('generated public PWA build closure', () => {
  it('uses explicit route roots/static imports, never a recursive dynamic or public-folder glob', () => {
    const files = pwaCorePaths(manifest());
    expect(files).toContain('/assets/shared-12345678.js');
    expect(files).toContain('/assets/route0-12345678.js');
    expect(PWA_ROOTS).toContain('src/pwa/apply-update.ts');
    expect(files).toContain('/assets/route3-12345678.js');
    expect(PWA_ROOTS).toContain('src/components/DataUseContent.tsx');
    expect(files).toContain('/assets/route4-12345678.js');
    expect(files).toContain('/assets/brand-12345678.woff2');
    expect(files).toContain('/data/collection.json');
    expect(files).toContain('/data/discovery/catalog.v1.json');
    expect(files).toContain('/pwa/fallback.css');
    expect(files.some(file => /OnlineController|CollectionScene|\.woff$|\.mp4$|\.xlsx$/.test(file))).toBe(false);
    expect(new Set(files).size).toBe(files.length);
  });

  it('keeps the standalone stylesheet in the core but outside the active app document', async () => {
    const files = pwaCorePaths(manifest());
    expect(files.filter(file => file === '/pwa/fallback.css')).toHaveLength(1);
    const html = await readFile(path.join(process.cwd(), 'index.html'), 'utf8');
    const noscript = /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/i.exec(html)?.[1];
    expect(noscript).toContain('href="/pwa/fallback.css"');
    expect(html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ''))
      .not.toContain('href="/pwa/fallback.css"');
    const offline = await readFile(path.join(process.cwd(), 'public', 'pwa', 'offline.html'), 'utf8');
    expect(offline).toContain('href="/pwa/fallback.css"');
  });

  it('embeds only main security headers, not the auth template, cookie or private headers', () => {
    const policy = pwaDocumentPolicy({ headers: [
      { source: '/__/auth/:path*', headers: [{ key: 'Content-Security-Policy', value: "script-src 'nonce-template'" }] },
      { source: '/((?!__/auth/).*)', headers: [
        { key: 'Content-Security-Policy', value: "default-src 'self'; style-src 'self' 'unsafe-inline'" },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Set-Cookie', value: 'fixture=not-embedded' },
        { key: 'X-Private-Fixture', value: 'not-embedded' },
      ] },
    ] });
    expect(policy.headers).toEqual([
      { name: 'content-security-policy', value: "default-src 'self'; style-src 'self' 'unsafe-inline'" },
      { name: 'cross-origin-opener-policy', value: 'same-origin' },
    ]);
    expect(policy.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(policy)).not.toContain('not-embedded');
    expect(JSON.stringify(policy)).not.toContain('nonce-template');
    expect(() => pwaDocumentPolicy({ headers: [] })).toThrow(/exactly one main/);
  });

  it('changes the worker version for header-only deployments and reproduces it on policy rollback', () => {
    const config = (value: string) => ({ headers: [{ source: '/((?!__/auth/).*)', headers: [
      { key: 'Content-Security-Policy', value },
    ] }] });
    const original = pwaDocumentPolicy(config("default-src 'self'; style-src 'self' 'unsafe-inline'"));
    const tightened = pwaDocumentPolicy(config("default-src 'self'; style-src 'self'"));
    const restored = pwaDocumentPolicy(config("default-src 'self'; style-src 'self' 'unsafe-inline'"));
    expect(original.sha256).not.toBe(tightened.sha256);
    expect(pwaBuildVersion([], [], 'same worker and asset bytes', original))
      .not.toBe(pwaBuildVersion([], [], 'same worker and asset bytes', tightened));
    expect(pwaBuildVersion([], [], 'same worker and asset bytes', original))
      .toBe(pwaBuildVersion([], [], 'same worker and asset bytes', restored));
  });

  it('fails a missing offline route or unexpected cloud import instead of shipping partial success', () => {
    const missing = manifest();
    delete missing[PWA_ROOTS[1]];
    expect(() => pwaCorePaths(missing)).toThrow(/missing/);
    const changed = manifest();
    changed['index.html']!.imports = ['src/cloud/OnlineController.tsx'];
    expect(() => pwaCorePaths(changed)).toThrow(/online\/3D/);
    const injected = manifest();
    injected._shared = { file: '../api/catalog' };
    expect(() => pwaCorePaths(injected)).toThrow(/unapproved/);
  });

  it('includes the lazy data-use body and its static closure, failing if either is missing', () => {
    const entries = manifest();
    const body = 'src/components/DataUseContent.tsx';
    entries[body] = {
      file: 'assets/DataUseContent-12345678.js',
      imports: ['_disclosure'],
      css: ['assets/disclosure-12345678.css'],
    };
    entries._disclosure = { file: 'assets/disclosure-12345678.js' };
    expect(pwaCorePaths(entries)).toEqual(expect.arrayContaining([
      '/assets/DataUseContent-12345678.js', '/assets/disclosure-12345678.js', '/assets/disclosure-12345678.css',
    ]));
    delete entries._disclosure;
    expect(() => pwaCorePaths(entries)).toThrow(/missing required Vite entry _disclosure/);
    delete entries[body];
    expect(() => pwaCorePaths(entries)).toThrow(/missing required Vite entry src\/components\/DataUseContent/);
  });

  it.each([
    'src/lib/discovery-catalog.ts', 'src/lib/google-intent.ts',
    'src/lib/comparison-game-filter.ts', 'src/lib/friend-comparison-intent.ts',
  ])('keeps the previously eager %s tools in the explicit offline closure', root => {
    expect(PWA_ROOTS).toContain(root);
    const entries = manifest();
    const entry = entries[root];
    if (!entry) throw new Error(`Missing fixture root ${root}`);
    expect(pwaCorePaths(entries)).toContain(`/${entry.file}`);
    delete entries[root];
    expect(() => pwaCorePaths(entries)).toThrow('missing required Vite entry');
  });

  it('declares stable root installation identity and distinct any/maskable sizes', async () => {
    const data = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'manifest.webmanifest'), 'utf8'));
    expect(data).toMatchObject({
      id: '/', scope: '/', start_url: '/', display: 'standalone',
      theme_color: '#f3f3e9', background_color: '#f3f3e9', name: 'Play 100',
    });
    expect(data.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', purpose: 'any', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'any', type: 'image/png' }),
      expect.objectContaining({ sizes: '192x192', purpose: 'maskable', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'maskable', type: 'image/png' }),
    ]));
    expect(data.start_url).not.toContain('?');
  });

  it('decodes exact icon sizes and keeps the existing ink logo inside the maskable safe circle', async () => {
    const icons = await renderPwaIcons(process.cwd());
    expect(icons).toHaveLength(PWA_ICONS.length);
    for (const icon of icons) {
      const { data, info } = await sharp(icon.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([icon.size, icon.size, 4]);
      let ink = 0;
      let transparentPixels = 0;
      let furthestInk = 0;
      for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * 4;
        if (data[offset + 3] !== 255) transparentPixels += 1;
        if ((data[offset] ?? 255) < 100 && (data[offset + 1] ?? 255) < 100) {
          ink += 1;
          furthestInk = Math.max(furthestInk, Math.hypot(x + .5 - icon.size / 2, y + .5 - icon.size / 2));
        }
      }
      expect(ink).toBeGreaterThan(100);
      expect(transparentPixels).toBe(0);
      if (icon.maskable) expect(furthestInk).toBeLessThanOrEqual(icon.size * .4);
    }
  });
});

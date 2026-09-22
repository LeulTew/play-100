import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { Manifest } from 'vite';
import { pwaCorePaths, PWA_ROOTS } from './pwa-build';
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
    expect(files).toContain('/assets/brand-12345678.woff2');
    expect(files).toContain('/data/collection.json');
    expect(files).toContain('/data/discovery/catalog.v1.json');
    expect(files.some(file => /OnlineController|CollectionScene|\.woff$|\.mp4$|\.xlsx$/.test(file))).toBe(false);
    expect(new Set(files).size).toBe(files.length);
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

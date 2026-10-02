import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Manifest } from 'vite';
import { manifestEntry, PRELOADED_TOOL_CHUNKS, preloadedToolChunkName } from './preloaded-tool-chunks.ts';
import { PWA_ROOTS } from './pwa-build.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

describe('preloaded tool chunks', () => {
  it('names modules that exist and that the offline core precaches, each in its own chunk', () => {
    for (const file of Object.keys(PRELOADED_TOOL_CHUNKS)) {
      expect(existsSync(path.join(root, file)), file).toBe(true);
      expect(PWA_ROOTS).toContain(file);
    }
    const names = Object.values(PRELOADED_TOOL_CHUNKS);
    expect(new Set(names).size).toBe(names.length);
  });

  it('places only the listed modules, matched by their whole path with either separator', () => {
    expect(preloadedToolChunkName(`${root}src/lib/google-intent.ts`)).toBe('google-intent');
    expect(preloadedToolChunkName('C:\\repo\\src\\lib\\comparison-game-filter.ts')).toBe('comparison-game-filter');
    expect(preloadedToolChunkName('/repo/src/lib/friend-comparison-intent.ts')).toBe('friend-comparison-intent');
    expect(preloadedToolChunkName('/repo/src/lib/google-intent-key.ts')).toBeNull();
    expect(preloadedToolChunkName('/repo/src/lib/my-google-intent.ts')).toBeNull();
    expect(preloadedToolChunkName('/repo/src/lib/url.ts')).toBeNull();
  });

  it('resolves a root by its own key, then by its group chunk, and fails on an ambiguous group', () => {
    const own: Manifest = { 'src/lib/google-intent.ts': { file: 'assets/google-intent-12345678.js' } };
    expect(manifestEntry(own, 'src/lib/google-intent.ts')?.key).toBe('src/lib/google-intent.ts');
    const grouped: Manifest = {
      'src/lib/url.ts': { file: 'assets/url-12345678.js', src: 'src/lib/url.ts', name: 'google-intent' },
      '_google-intent-AbCd_123.js': { file: 'assets/google-intent-AbCd_123.js' },
      '_google-intent-key-12345678.js': { file: 'assets/google-intent-key-12345678.js' },
    };
    expect(manifestEntry(grouped, 'src/lib/google-intent.ts')?.key).toBe('_google-intent-AbCd_123.js');
    expect(manifestEntry(grouped, 'src/lib/comparison-game-filter.ts')).toBeUndefined();
    expect(manifestEntry(grouped, 'src/lib/discovery-catalog.ts')).toBeUndefined();
    grouped['_google-intent-Zz99Yy88.js'] = { file: 'assets/x-1.js', name: 'google-intent' };
    expect(() => manifestEntry(grouped, 'src/lib/google-intent.ts')).toThrow(
      'More than one Vite chunk is named google-intent.',
    );
  });
});

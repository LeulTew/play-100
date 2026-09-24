import { readFileSync } from 'node:fs';
import { sourceTokens } from '../../scripts/source-contract';
import { describe, expect, it } from 'vitest';
import { isPublicPwaFile } from '../pwa/worker';

describe('external static fallback styling', () => {
  it('keeps noscript and offline styling available without inline declarations', () => {
    for (const file of ['index.html', 'public/pwa/offline.html']) {
      const html = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
      expect(html).not.toMatch(/\sstyle\s*=/i);
      expect(html).toContain('/pwa/fallback.css');
    }
    expect(readFileSync(new URL('../../public/pwa/offline.html', import.meta.url), 'utf8')).not.toMatch(/<style\b/i);
    expect(isPublicPwaFile('/pwa/fallback.css')).toBe(true);
    expect(sourceTokens(readFileSync(new URL('../../scripts/pwa-build.ts', import.meta.url), 'utf8')))
      .toContain(sourceTokens("'/pwa/fallback.css'"));
  });
});

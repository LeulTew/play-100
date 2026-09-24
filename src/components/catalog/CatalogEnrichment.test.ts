import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { enrichmentFixture } from '../../lib/discovery-test-fixtures';
import type { ExternalCatalogArtwork as Artwork } from '../../lib/catalog-enrichment';
import { CatalogEnrichment, ExternalCatalogArtworkCredit } from './CatalogEnrichment';

const lookup = { online: true, scopeKey: 'guest', onEnableOnline: vi.fn() };
const state = () => ({
  key: 'public',
  status: 'ready' as const,
  data: enrichmentFixture(),
  cached: false,
  error: null,
  connected: true,
  retry: vi.fn(),
});

describe('separate public review provenance', () => {
  it('is absent without the explicit public lookup gate', () => {
    expect(renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment: state() }))).toBe('');
  });
  it('shows issuer, literal scale, platform, method and old score/reference dates separately', () => {
    const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment: state(), lookup }));
    for (const text of [
      '83/100',
      'Example publication',
      'PC',
      'Critic average',
      'via Wikidata',
      '2024-04-20',
      '2024-04-21',
      '2026-09-22',
    ])
      expect(html).toContain(text);
    expect(html).toContain('https://www.wikidata.org/wiki/Q15408545#P444');
    expect(html).toContain('https://example.com/reviews/game');
    expect(html).not.toContain('Your rating / 10');
    expect(html).not.toContain('type="number"');
  });
  it('offers an explicit online enable action and keeps cached dates visible', () => {
    const html = renderToStaticMarkup(
      createElement(CatalogEnrichment, {
        enrichment: { ...state(), cached: true, status: 'disabled' },
        lookup: { ...lookup, online: false },
      }),
    );
    expect(html).toContain('Online lookup is off.');
    expect(html).toContain('Enable online details');
    expect(html).toContain('Cached public details');
    expect(lookup.onEnableOnline).not.toHaveBeenCalled();
  });
  it('surfaces partial source failures outside the disclosure without deleting successful ratings', () => {
    const enrichment = state();
    enrichment.data.sources[1] = {
      source: 'steam',
      status: 'error',
      code: 'timeout',
      retryAfter: 0,
      message: 'Steam took too long.',
    };
    const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
    expect(html).toContain('83/100');
    expect(html).toContain('role="alert">Steam: Steam took too long.');
    expect(html).toContain('Retry public details');
  });
  it('retains licensed image attribution, original link and transformation/retrieval details', () => {
    const artwork: Artwork = {
      kind: 'commons-raster',
      src: 'data:image/webp;base64,UklGRg==',
      width: 1,
      height: 1,
      alt: 'Test art',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.png',
      originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Example.png',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      credit: 'Original artist; resized and converted to WebP; trademark caveat.',
      retrievedAt: '2026-09-22T12:00:00.000Z',
    };
    const html = renderToStaticMarkup(createElement(ExternalCatalogArtworkCredit, { artwork }));
    for (const text of [artwork.credit, artwork.sourceUrl, artwork.originalUrl, artwork.licenseUrl, '2026-09-22'])
      expect(html).toContain(text);
    expect(html).not.toContain('<img');
  });
});

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
    const details = html.match(/<details class="catalog-review-details">([\s\S]*?)<\/details>/)?.[1];
    expect(details).toBeDefined();
    expect(details).toContain('<summary>Source details for Example publication</summary>');
    for (const text of ['PC', 'Critic average', '32 source reviews/ratings', '2024-04-20', '2024-04-21', '2026-09-22'])
      expect(details).toContain(text);
    expect(details).toContain('https://www.wikidata.org/wiki/Q15408545#P444');
    expect(details).toContain('https://example.com/reviews/game');
    const compact = html.slice(html.indexOf('<li>'), html.indexOf('<details class="catalog-review-details">'));
    for (const text of ['83/100', 'Example publication', 'PC', 'via Wikidata']) expect(compact).toContain(text);
    expect(compact).not.toContain('Critic average');
    expect(compact).not.toContain('2024-04-20');
    expect(html).not.toContain('open=""');
    expect(html).not.toContain('Your rating / 10');
    expect(html).not.toContain('type="number"');
  });
  it('keeps exact missing metadata inside the source disclosure instead of repeating it in the compact row', () => {
    const enrichment = state();
    enrichment.data.ratings = enrichment.data.ratings.map((rating) => ({
      ...rating,
      platforms: [],
      method: null,
      count: null,
      asOf: null,
      referenceDate: null,
      referenceUrl: null,
    }));
    const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
    const details = html.match(/<details class="catalog-review-details">([\s\S]*?)<\/details>/)?.[1];
    expect(details).toBeDefined();
    for (const text of [
      'Platform not specified',
      'Review method not specified',
      'Review count not supplied',
      'Score date not supplied',
    ])
      expect(details).toContain(text);
    expect(details).toMatch(/datetime="2026-09-22T12:00:00\.000Z"/i);
    const compact = html.slice(html.indexOf('<li>'), html.indexOf('<details class="catalog-review-details">'));
    expect(compact).not.toMatch(/not specified|not supplied/);
    expect(compact).toContain('83/100');
    expect(html).not.toContain('Cited source');
  });
  it('keeps user recommendations visibly distinct from reported review scores', () => {
    const enrichment = state();
    enrichment.data.ratings.push({
      id: 'steam:fixture-summary',
      source: 'steam',
      kind: 'user-recommendations',
      publisher: 'Steam users',
      publisherId: null,
      score: { text: '91%', value: 91, scale: 100, unit: 'percent' },
      platforms: [],
      method: 'Steam purchases, all languages, off-topic activity excluded',
      count: 1000,
      asOf: null,
      referenceDate: null,
      retrievedAt: enrichment.data.fetchedAt,
      sourceUrl: 'https://store.steampowered.com/app/123/#app_reviews_hash',
      referenceUrl: null,
    });
    const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html.match(/<details class="catalog-review-details">/g)).toHaveLength(2);
    expect(html).toContain('<strong>83/100</strong>');
    expect(html).toContain('<strong>91%</strong>');
    expect(html).toContain('<p>User recommendations · Steam</p>');
    expect(html).toContain('Reported review score · via Wikidata · PC');
    expect(html).toContain('Source details for Steam users');
    expect(html).toContain('View Steam reviews');
    expect(html).toContain('No scores are averaged together.');
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
  it('reports a complete empty lookup without implying that missing scores are zero', () => {
    const enrichment = state();
    enrichment.data.ratings = [];
    const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
    expect(html).toContain(
      'No supported external ratings are available for this exact game. Missing scores are not zero.',
    );
    expect(html).not.toContain('check every rating source');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('Retry public details');
  });
  it.each(['wikidata', 'steam'] as const)(
    'describes an empty lookup with a failed %s rating source as incomplete',
    (source) => {
      const enrichment = state();
      enrichment.data.ratings = [];
      const message = 'The public source is temporarily busy or rejected the request. Please try again later.';
      enrichment.data.sources[source === 'wikidata' ? 0 : 1] = {
        source,
        status: 'error',
        code: 'unavailable',
        retryAfter: 0,
        message,
      };
      const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
      expect(html).toContain('We couldn&#x27;t check every rating source. Retry to check for scores.');
      expect(html).toContain('Missing scores are not zero.');
      expect(html).not.toContain('No supported external ratings are available');
      expect(html).toContain(`role="alert">${source === 'wikidata' ? 'Review source' : 'Steam'}: ${message}</p>`);
      expect(html).toContain('Retry public details');
    },
  );
  it('does not describe successful empty rating coverage as incomplete for a Commons-only failure', () => {
    const enrichment = state();
    enrichment.data.ratings = [];
    enrichment.data.sources[2] = {
      source: 'commons',
      status: 'error',
      code: 'timeout',
      retryAfter: 0,
      message: 'Artwork took too long to load.',
    };
    const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
    expect(html).toContain(
      'No supported external ratings are available for this exact game. Missing scores are not zero.',
    );
    expect(html).not.toContain('check every rating source');
    expect(html).toContain('role="alert">Artwork: Artwork took too long to load.</p>');
    expect(html).toContain('Retry public details');
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
    expect(html).not.toContain('No supported external ratings are available');
    expect(html).not.toContain('check every rating source');
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

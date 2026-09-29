import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { artworkFixture, enrichmentFixture } from '../../lib/discovery-test-fixtures';
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

describe('display-only external score precision', () => {
  it.each([
    ['4.44728422164917/5', '≈4.45/5'],
    ['86/100', '86/100'],
    ['4.8/5', '4.8/5'],
    ['4.45/5', '4.45/5'],
    ['8.94728422164917/10', '≈8.95/10'],
    ['4.44728422164917 / 5.00', '≈4.45 / 5.00'],
    ['98.123456789%', '98.123456789%'],
    ['Recommended', 'Recommended'],
    ['Four out of five stars', 'Four out of five stars'],
    ['4.450000/5', '4.45/5'],
    ['4.000000/5', '4/5'],
    ['4.999999/5', '≈5/5'],
    ['1.005/5', '≈1.01/5'],
    ['0.004/5', '≈0/5'],
    ['4.447/0', '4.447/0'],
    ['6.447/5', '6.447/5'],
    ['4.447/unknown', '4.447/unknown'],
  ])('displays %s as %s without changing its scale or unrelated text', (original, expected) => {
    const enrichment = state();
    enrichment.data.ratings[0]!.score.text = original;
    const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
    expect(html).toContain(`<strong>${expected}</strong>`);
  });

  it('keeps the exact source value in its disclosure and never mutates source data', () => {
    const enrichment = state();
    const score = '4.44728422164917/5';
    enrichment.data.ratings[0] = {
      ...enrichment.data.ratings[0]!,
      publisher: 'Google Play',
      score: { text: score, value: 4.44728422164917, scale: 5, unit: 'points' },
    };
    const before = JSON.stringify(enrichment.data);
    const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
    const compact = html.slice(html.indexOf('<li>'), html.indexOf('<details class="catalog-review-details">'));
    expect(compact).toContain('<strong>≈4.45/5</strong>');
    expect(compact).toContain('<h4>Google Play</h4>');
    expect(compact).toContain('Reported review score · via Wikidata · PC');
    expect(compact).not.toContain(score);
    const details = html.match(/<details class="catalog-review-details">([\s\S]*?)<\/details>/)?.[1];
    expect(details).toContain(`<p>Original score: ${score}</p>`);
    expect(details).toContain(enrichment.data.ratings[0]!.sourceUrl);
    expect(JSON.stringify(enrichment.data)).toBe(before);
    expect(html).not.toContain('Your rating / 10');
  });
});

describe('separate public review provenance', () => {
  it.each([
    { status: 'error', connected: true, blocked: false },
    { status: 'loading', connected: true, blocked: true },
    { status: 'offline', connected: false, blocked: true },
  ] as const)(
    'guards the public retry without disabling its native focus in $status',
    ({ status, connected, blocked }) => {
      const enrichment = { ...state(), status, connected, error: 'A source could not be reached.' };
      const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
      const retry = html.match(/<button\b[^>]*>Retry public details<\/button>/)?.[0];
      expect(retry).toBeDefined();
      expect(retry?.includes('aria-disabled="true"')).toBe(blocked);
      expect(retry).toContain(`aria-busy="${status === 'loading'}"`);
      expect(retry).not.toContain(' disabled=');
      expect(html).toContain('id="catalog-enrichment-title" tabindex="-1"');
      expect(enrichment.retry).not.toHaveBeenCalled();
    },
  );

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
      platforms: ['Steam'],
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
  it.each([
    {
      source: 'steam',
      kind: 'user-recommendations',
      platforms: ['Steam', 'PC', 'PC', 'Steam Deck'],
      expected: 'User recommendations · Steam · PC / Steam Deck',
    },
    {
      source: 'wikidata',
      kind: 'review-score',
      platforms: ['Wikidata', 'PC', 'pc', 'PlayStation 5'],
      expected: 'Reported review score · via Wikidata · PC / PlayStation 5',
    },
    {
      source: 'wikidata',
      kind: 'review-score',
      platforms: ['PC', 'PlayStation 5'],
      expected: 'Reported review score · via Wikidata · PC / PlayStation 5',
    },
  ] as const)('deduplicates only compact $source context: $platforms', ({ source, kind, platforms, expected }) => {
    const enrichment = state();
    const original = enrichment.data.ratings[0]!;
    enrichment.data.ratings = [
      {
        ...original,
        source,
        kind,
        publisher: source === 'steam' ? 'Steam' : original.publisher,
        platforms: [...platforms],
        score: source === 'steam' ? { text: '88.1%', value: 88.1, scale: 100, unit: 'percent' } : original.score,
        sourceUrl: source === 'steam' ? 'https://store.steampowered.com/app/123/#app_reviews_hash' : original.sourceUrl,
      },
    ];
    const before = JSON.stringify(enrichment.data);
    const html = renderToStaticMarkup(createElement(CatalogEnrichment, { enrichment, lookup }));
    const compact = html.slice(html.indexOf('<li>'), html.indexOf('<details class="catalog-review-details">'));
    expect(compact).toContain(`<p>${expected}</p>`);
    expect(compact).toContain(`<strong>${enrichment.data.ratings[0]!.score.text}</strong>`);
    expect(compact).toContain(`<h4>${enrichment.data.ratings[0]!.publisher}</h4>`);
    expect(compact).not.toContain(original.method);
    const details = html.match(/<details class="catalog-review-details">([\s\S]*?)<\/details>/)?.[1];
    expect(details).toContain(platforms.join(' / '));
    expect(details).toContain(original.method);
    expect(details).toContain(enrichment.data.ratings[0]!.sourceUrl);
    expect(JSON.stringify(enrichment.data)).toBe(before);
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

  it('requires HTTPS for live artwork credit links without dropping any supplied attribution', () => {
    const credit =
      'Nintendo (http://evil.example/login) | Resized and converted to WebP; original license retained. | ' +
      'Trademark rights are not granted by the copyright license.';
    const artwork: Artwork = { ...artworkFixture, kind: 'commons-raster', credit };
    const html = renderToStaticMarkup(createElement(ExternalCatalogArtworkCredit, { artwork }));
    expect(html).not.toContain('href="http://evil.example/login"');
    expect(html).toContain(credit);
    expect(html).toContain('Nintendo (http://evil.example/login)');
    expect(html).toContain(`href="${artwork.sourceUrl}"`);
    expect(html).toContain(`href="${artwork.licenseUrl}"`);
    expect(html).toContain(artwork.license);
    expect(html).toContain('Full supplied credit');
  });
});

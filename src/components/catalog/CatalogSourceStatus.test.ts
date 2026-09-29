import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CatalogSourceStatus } from './CatalogSourceStatus';
import { emptySources } from '../../lib/catalog-search-session';
import { discoveryFixture } from '../../lib/discovery-test-fixtures';

describe('new online matches status', () => {
  it.each([
    [0, 'No new online matches'],
    [1, '1 new online match'],
    [2, '2 new online matches'],
  ] as const)('reports %i new visible matches, not the provider raw total', (count, label) => {
    const sources = emptySources().map((source) => ({
      ...source,
      status: 'ready' as const,
      total: 5,
      records: Array.from({ length: 5 }, () => discoveryFixture.record),
    }));
    const html = renderToStaticMarkup(
      createElement(CatalogSourceStatus, {
        sources,
        newMatches: { wikidata: count, freetogame: 0 },
        onRetry: vi.fn(),
        onMore: vi.fn(),
      }),
    );
    expect(html).toContain(label);
    expect(html).not.toContain('loaded online');
  });
  it('preserves provider failure and loading messages instead of claiming no matches', () => {
    const sources = emptySources().map((source) => ({
      ...source,
      status: source.source === 'wikidata' ? ('loading' as const) : ('error' as const),
      failure: 'timeout' as const,
    }));
    const html = renderToStaticMarkup(
      createElement(CatalogSourceStatus, {
        sources,
        newMatches: { wikidata: 0, freetogame: 0 },
        onRetry: vi.fn(),
        onMore: vi.fn(),
      }),
    );
    expect(html).toContain('Loading');
    expect(html).toContain('Timed out');
    expect(html).not.toContain('No new online matches');
  });
});

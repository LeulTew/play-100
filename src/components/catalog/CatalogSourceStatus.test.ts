import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CatalogRetry, CatalogSourceStatus } from './CatalogSourceStatus';
import { emptySources } from '../../lib/catalog-search-session';
import { discoveryFixture } from '../../lib/discovery-test-fixtures';

describe('new online matches status', () => {
  it.each([
    { busy: false, disabled: false },
    { busy: true, disabled: false },
    { busy: false, disabled: true },
  ])('keeps the retry natively focusable for $busy/$disabled', ({ busy, disabled }) => {
    const onRetry = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CatalogRetry, {
        needed: true,
        busy,
        disabled,
        label: 'Retry Wikidata',
        onRetry,
        returnFocus: { current: null },
      }),
    );
    expect(html).toContain('>Retry Wikidata</button>');
    expect(html).toContain(`aria-busy="${busy}"`);
    expect(html.includes('aria-disabled="true"')).toBe(busy || disabled);
    expect(html).not.toContain(' disabled=');
    expect(onRetry).not.toHaveBeenCalled();
  });

  it.each([false, true])('does not add Retry for a fresh successful or loading request (loading=%s)', (busy) => {
    expect(
      renderToStaticMarkup(
        createElement(CatalogRetry, {
          needed: false,
          busy,
          label: 'Retry Wikidata',
          onRetry: vi.fn(),
          returnFocus: { current: null },
        }),
      ),
    ).toBe('');
  });

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
    expect(html).toContain('role="status" tabindex="-1"');
    expect(html).toContain('Retry FreeToGame');
    expect(html).not.toContain('Retry Wikidata');
  });
});

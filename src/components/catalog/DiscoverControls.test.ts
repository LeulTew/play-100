import { readFileSync } from 'node:fs';
import { Children, createElement, isValidElement } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { emptySources } from '../../lib/catalog-search-session';
import { defaultDiscoveryFilters } from '../../lib/discovery-search';
import { discoveryFixture } from '../../lib/discovery-test-fixtures';
import { CatalogSourceStatus } from './CatalogSourceStatus';
import { DiscoverFilters, DiscoverSources } from './DiscoverControls';

const filterProps = (): ComponentProps<typeof DiscoverFilters> => ({
  filters: defaultDiscoveryFilters,
  filterId: 'catalog-filter',
  editingRef: { current: false },
  showCollection: false,
  progressView: 'all',
  items: [discoveryFixture],
  change: vi.fn(),
});

const sourceProps = (): ComponentProps<typeof DiscoverSources> => ({
  filters: defaultDiscoveryFilters,
  progressView: 'all',
  remote: { sources: emptySources(), records: [], loading: false, retry: vi.fn(), more: vi.fn() },
  remoteEnabled: false,
  newMatches: { wikidata: 0, freetogame: 0 },
  change: vi.fn(),
});

describe('Discover control composition', () => {
  it.each(['DiscoverPage', 'DiscoverControls'])('keeps %s within 450 nonblank lines', (name) => {
    const source = readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8');
    expect(source.split(/\r?\n/).filter((line) => line.trim()).length).toBeLessThanOrEqual(450);
  });

  it('retains the native search and filter disclosure without adding a layout wrapper', () => {
    const props = filterProps();
    const html = renderToStaticMarkup(createElement(DiscoverFilters, props));
    expect(html).toMatch(/^<form class="discovery-search">/);
    expect(html).toContain('<label for="catalog-search">Find a game</label>');
    expect(html).toContain('id="catalog-search" type="search" maxLength="80"');
    expect(html).toContain('placeholder="Search games, studios or aliases…"');
    expect(html).toContain('class="browse-filters discovery-filters"');
    expect(html).toContain('aria-label="Filters, None active"');
    expect(html).toContain('id="catalog-filter-genre-family" aria-describedby="discovery-genre-help"');
    expect(html).toContain('<label for="catalog-filter-year">Year</label>');
    expect(html).toContain('<label for="catalog-filter-source">Source</label>');
    expect(html).toContain('Include The 100');
    expect(html).not.toContain('aria-label="Clear search"');
    expect(html).not.toContain('>Clear filters</button>');
    expect(props.change).not.toHaveBeenCalled();
  });

  it('preserves selected source labels missing from the available catalog options', () => {
    const props = filterProps();
    props.filters = {
      ...props.filters,
      q: 'legacy game',
      genreFamily: 'role-playing',
      genre: 'Old source label',
      year: '1995',
      source: 'wikidata',
    };
    props.progressView = 'completed';
    props.showCollection = true;
    const html = renderToStaticMarkup(createElement(DiscoverFilters, props));
    expect(html).toContain('aria-label="Filters, 5 active"');
    expect(html).toContain('<option selected="">Old source label</option>');
    expect(html).toContain('<option selected="">1995</option>');
    expect(html).toContain('class="discovery-help" open=""');
    expect(html).toContain('aria-label="Clear search"');
    expect(html).toContain('>Clear filters</button>');
    expect(html).toContain('Including original entries from The 100 once, alongside other games.');
    expect(props.change).not.toHaveBeenCalled();
  });

  it.each([
    { source: 'collection', progress: 'all', catalogs: 'on', message: 'Showing entries from The 100.' },
    {
      source: 'all',
      progress: 'completed',
      catalogs: 'on',
      message: 'Online lookup is paused for this progress view.',
    },
    { source: 'all', progress: 'all', catalogs: 'off', message: 'Online lookup is off.' },
  ] as const)(
    'preserves the $source/$progress/$catalogs source boundary',
    ({ source, progress, catalogs, message }) => {
      const props = sourceProps();
      props.filters = { ...props.filters, source, catalogs };
      props.progressView = progress;
      const html = renderToStaticMarkup(createElement(DiscoverSources, props));
      expect(html).toMatch(/^<div class="discovery-online">/);
      expect(html).toContain(message);
      expect(html).toContain('aria-label="Public catalog sources"');
      expect(html).toContain('Only public search terms and exact public game IDs');
      expect(html).toContain('not your saved progress, ratings or notes.');
      expect(props.change).not.toHaveBeenCalled();
    },
  );

  it('keeps remote pagination behind the same guarded change callback and focus request', () => {
    const props = sourceProps();
    const tree = DiscoverSources(props);
    const status = Children.toArray((tree.props as { children?: ReactNode }).children).find(
      (node) => isValidElement(node) && node.type === CatalogSourceStatus,
    );
    if (!isValidElement<ComponentProps<typeof CatalogSourceStatus>>(status))
      throw new Error('Missing provider-status controls.');
    expect(status.props.sources).toBe(props.remote.sources);
    expect(status.props.onRetry).toBe(props.remote.retry);
    expect(status.props.newMatches).toBe(props.newMatches);
    status.props.onMore('wikidata', 5);
    status.props.onPrevious?.('freetogame', 20);
    expect(props.change).toHaveBeenNthCalledWith(1, { source: 'wikidata', offset: 5, online: 'on' }, 'push', true);
    expect(props.change).toHaveBeenNthCalledWith(2, { source: 'freetogame', offset: 20, online: 'on' }, 'push', true);
  });
});

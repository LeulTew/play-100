import { createElement } from 'react';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { collectionFilms, filmDuration } from '../lib/films';
import { ExtendedFallback, FilmsFallback } from './CollectionExtrasFallback';
import { discoveryFixture } from '../lib/discovery-test-fixtures';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { emptySources } from '../lib/catalog-search-session';

it('reserves the exact film listing text and frames without loading movies or artwork', () => {
  const onWatch = vi.fn();
  const html = renderToStaticMarkup(createElement(FilmsFallback, { onWatch }));
  expect(html).not.toContain('id="collection-films"');
  expect(html).not.toContain('id="collection-films-title"');
  expect(html).toContain('<ul class="films-list">');
  for (const film of collectionFilms) {
    expect(html).toContain(`data-film-id="${film.id}"`);
    expect(html).toContain(film.title.replaceAll('&', '&amp;'));
    expect(html).toContain(film.description);
    expect(html).toContain(`${filmDuration(film.durationSeconds)} · Watch film`);
  }
  expect(html.match(/class="film-poster"/g)).toHaveLength(2);
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<video');
  expect(onWatch).not.toHaveBeenCalled();
});

it.each([
  [true, false, true],
  [false, false, false],
  [true, true, false],
] as const)('exposes operable Search online for eligible=%s, remote=%s', (eligible, remoteEnabled, shown) => {
  const onSearchIntent = vi.fn();
  const props: ComponentProps<typeof ExtendedFallback> = {
    records: [discoveryFixture.record],
    online: {
      sources: emptySources(),
      records: [],
      localRecords: [],
      loading: false,
      retry: vi.fn(),
      more: vi.fn(),
      eligible,
      artwork: new Map(),
      seedError: null,
      seedRetry: vi.fn(),
      searchOnline: vi.fn(),
      remoteEnabled,
    },
    state: emptyPersonalLibrary(),
    queryKey: 'query',
    busy: false,
    selecting: false,
    selected: new Set(),
    onSelect: vi.fn(),
    onAction: vi.fn(async () => true),
    onSearchIntent,
  };
  const html = renderToStaticMarkup(createElement(ExtendedFallback, props));
  expect(html).toContain(`data-unranked-id="${discoveryFixture.record.id}"`);
  expect(html.includes('data-extended-search')).toBe(shown);
  if (shown) {
    const button = html.match(/<button\b[^>]*data-extended-search[^>]*>[\s\S]*?<\/button>/)?.[0];
    expect(button).toContain('Search online');
    expect(button).not.toContain('disabled');
    expect(html.indexOf(button!)).toBeGreaterThan(html.indexOf('</ul>'));
  }
  expect(onSearchIntent).not.toHaveBeenCalled();
});

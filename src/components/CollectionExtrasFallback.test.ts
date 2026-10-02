import { createElement } from 'react';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { collectionFilms, filmDuration } from '../lib/films';
import { ExtendedFallback, FilmsFallback, TableFallback } from './CollectionExtrasFallback';
import RatingsTable from './RatingsTable';
import { defaultFilters } from '../lib/url';
import { discoveryFixture } from '../lib/discovery-test-fixtures';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { emptySources } from '../lib/catalog-search-session';
import ExtendedResults from './catalog/ExtendedResults';
import { DeferredCollection } from './DeferredCollection';

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
  ['now', 'true'],
  // Without IntersectionObserver, as here, a nearby section cannot wait to be near and asks at once.
  ['near', 'true'],
  // A constrained device's films wait for use, observer or not: a scroll past them asks for nothing (CollectionPage).
  ['use', 'false'],
] as const)('asks for the films module %s: first busy %s', (load, busy) => {
  const html = renderToStaticMarkup(
    createElement(DeferredCollection, { load, input: { kind: 'films', props: { postersReady: true } } }),
  );
  expect(html).toContain(`aria-busy="${busy}"`);
  expect(html).toContain('<ul class="films-list">');
});

it('keeps one identical visible rating note before and after the table loads', () => {
  const props: ComponentProps<typeof RatingsTable> = {
    games: [],
    filters: defaultFilters,
    progress: {},
    selecting: false,
    selected: new Set(),
    busy: false,
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onToggle: vi.fn(),
    onSort: vi.fn(),
  };
  const notes = [TableFallback, RatingsTable].map((component) => {
    const html = renderToStaticMarkup(createElement(component, props));
    expect(html.match(/class="ratings-explainer"/g)).toHaveLength(1);
    expect(html).not.toContain('class="table-footnote"');
    const note = /class="ratings-explainer"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
    expect(note).toContain('rank-based workbook ratings are separate from critic scores.');
    expect(note).toContain('Critic averages include both Metacritic columns.');
    expect(note).toContain('My games → Ranking');
    return note.replace(/<[^>]+>/g, '');
  });
  expect(notes[0]).toBe(notes[1]);
});

it.each([
  ['', false, '1 saved game'],
  ['?q=fixture', false, '1 match'],
  ['?q=fixture', true, '1 match so far'],
] as const)('keeps the additional-game count truthful through deferred loading for %s', (queryKey, loading, count) => {
  const props: ComponentProps<typeof ExtendedResults> = {
    records: [discoveryFixture.record],
    online: {
      sources: emptySources(),
      records: [],
      localRecords: [],
      loading,
      retry: vi.fn(),
      more: vi.fn(),
      eligible: Boolean(queryKey),
      artwork: new Map(),
      seedError: null,
      seedRetry: vi.fn(),
      searchOnline: vi.fn(),
      remoteEnabled: false,
    },
    state: emptyPersonalLibrary(),
    queryKey,
    busy: false,
    selecting: false,
    selected: new Set(),
    onSelect: vi.fn(),
    onAction: vi.fn(async () => true),
  };
  for (const element of [
    createElement(DeferredCollection, { input: { kind: 'extended', props } }),
    createElement(ExtendedResults, props),
  ]) {
    const html = renderToStaticMarkup(element);
    expect(html).toContain(`>Beyond The 100</h2><span>${count}</span>`);
  }
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

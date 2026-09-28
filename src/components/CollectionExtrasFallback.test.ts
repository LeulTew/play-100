import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { collectionFilms, filmDuration } from '../lib/films';
import { FilmsFallback } from './CollectionExtrasFallback';

it('reserves the exact film listing text and frames without loading movies or artwork', () => {
  const onWatch = vi.fn();
  const html = renderToStaticMarkup(createElement(FilmsFallback, { onWatch }));
  expect(html).toContain('id="collection-films"');
  expect(html).toContain('id="collection-films-title"');
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

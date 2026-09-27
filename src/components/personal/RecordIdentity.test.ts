import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { artworkFixture } from '../../lib/discovery-test-fixtures';
import type { LibraryRecord } from '../../lib/personal-types';
import { RecordIdentity } from './RecordIdentity';

const record: LibraryRecord = {
  id: 'wikidata:Q161234',
  source: 'wikidata',
  sourceId: 'Q161234',
  sourceUrl: 'https://www.wikidata.org/wiki/Q161234',
  title: 'Saved provider title',
  year: 2000,
  studio: null,
  genre: null,
  collectionRank: null,
};

describe('personal record artwork', () => {
  it('renders approved local artwork with its complete existing credit disclosure', () => {
    const html = renderToStaticMarkup(createElement(RecordIdentity, { record, artwork: artworkFixture, onOpen() {} }));
    expect(html).toContain(`src="${artworkFixture.src}"`);
    expect(html).toContain(`width="${artworkFixture.width}" height="${artworkFixture.height}"`);
    expect(html).toContain('class="game-artwork record-thumb" aria-hidden="true"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('aria-label="Artwork credits for Saved provider title"');
    expect(html).toContain(artworkFixture.credit);
    expect(html).toContain(`href="${artworkFixture.sourceUrl}"`);
    expect(html).toContain(`href="${artworkFixture.licenseUrl}"`);
    expect(html).not.toContain('game-artwork-fallback');
    expect(record).not.toHaveProperty('artwork');
  });

  it('keeps authored covers separate even if provider artwork is supplied', () => {
    const html = renderToStaticMarkup(
      createElement(RecordIdentity, {
        record: {
          ...record,
          id: 'authored-game',
          source: 'collection',
          sourceId: 'authored-game',
          sourceUrl: null,
          collectionRank: 1,
        },
        artwork: artworkFixture,
        onOpen() {},
      }),
    );
    expect(html).toContain('src="/covers/authored-game.webp"');
    expect(html).not.toContain(artworkFixture.src);
    expect(html).not.toContain('game-artwork-disclosure');
  });

  it('uses the stack placeholder without inventing credits when no artwork is known', () => {
    const html = renderToStaticMarkup(createElement(RecordIdentity, { record, onOpen() {} }));
    expect(html).toContain('game-artwork-fallback');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('game-artwork-disclosure');
  });

  it('does not render an arbitrary remote URL as artwork', () => {
    const html = renderToStaticMarkup(
      createElement(RecordIdentity, {
        record,
        artwork: { ...artworkFixture, src: 'https://example.invalid/cover.webp' },
        onOpen() {},
      }),
    );
    expect(html).toContain('game-artwork-fallback');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('https://example.invalid/cover.webp');
  });
});

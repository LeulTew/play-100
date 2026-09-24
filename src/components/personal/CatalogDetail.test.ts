import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryRecord } from '../../lib/personal-types';
import { artworkFixture, discoveryFixture } from '../../lib/discovery-test-fixtures';
import CatalogDetail from './CatalogDetail';
import type { CatalogDetailProps } from './CatalogDetail';

function renderDetail(overrides: Partial<CatalogDetailProps> = {}) {
  const props: CatalogDetailProps = {
    record: discoveryFixture.record, saved: false, progress: undefined,
    rankingPosition: null, rating: null, busy: false,
    onClose: vi.fn(), onAction: vi.fn().mockResolvedValue(true), onRankings: vi.fn(),
    ...overrides,
  };
  return { html: renderToStaticMarkup(createElement(CatalogDetail, props)), props };
}

describe('catalog detail artwork continuity surface', () => {
  it.each([false, true])('keeps the detail queue name stable with pressed=%s', selected => {
    const { html } = renderDetail({ progress: { later: selected, completed: selected, played: selected } });
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const button = buttons.find(value => value.endsWith('</svg>Play later</button>'));
    expect(button).toContain(`aria-pressed="${selected}"`);
    expect(button).toContain(`fill="${selected ? 'currentColor' : 'none'}"`);
    expect(html).not.toContain('Saved for later');
  });

  it.each([false, true])('keeps the detail completion name stable with a non-color cue for pressed=%s', completed => {
    const { html } = renderDetail({ progress: { later: false, completed, played: completed } });
    const button = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(value => value.endsWith('</svg>Completed</button>'));
    expect(button).toContain(`aria-pressed="${completed}"`);
    expect(button).toContain(`<path d="${completed ? 'm5 12 4 4L19 6' : 'M12 4v16M4 12h16'}">`);
    expect(button).toContain(`class="button ${completed ? 'button-lime' : 'button-outline'}"`);
    expect(html).not.toContain('Mark completed');
  });

  it('uses the supplied local artwork with intrinsic dimensions in the existing centered dialog', () => {
    const { html, props } = renderDetail({ artwork: artworkFixture });
    expect(html).toContain('class="dialog info-dialog catalog-detail-dialog"');
    expect(html).toContain('class="catalog-detail-sleeve"');
    expect(html).toContain(`src="${artworkFixture.src}"`);
    expect(html).toContain('width="320" height="180"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).not.toContain('class="catalog-art"');
    expect(html).not.toContain('game-dialog');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onAction).not.toHaveBeenCalled();
    expect(props.onRankings).not.toHaveBeenCalled();
  });

  it('retains the full source, conversion and license credit in a labelled native disclosure', () => {
    const artwork = {
      ...artworkFixture,
      credit: 'Original artist; resized and converted to WebP. Logos remain trademarks of their owners.',
    };
    const { html } = renderDetail({ artwork });
    expect(html).toContain('<details class="game-artwork-disclosure">');
    expect(html).toContain(`aria-label="Artwork credits for ${discoveryFixture.record.title}"`);
    expect(html).toContain(artwork.credit);
    expect(html).toContain(`href="${artwork.sourceUrl}" target="_blank" rel="noreferrer"`);
    expect(html).toContain(`href="${artwork.licenseUrl}" target="_blank" rel="noreferrer"`);
    expect(html).toContain(artwork.license);
    expect(html).not.toContain('open=""');
    expect(html).toContain(`href="${discoveryFixture.record.sourceUrl}"`);
  });

  it.each([undefined, null])('keeps the no-art preview useful without fetching or inventing art (%s)', (artwork) => {
    const { html } = renderDetail({ artwork });
    expect(html).toContain('catalog-detail-artwork-empty');
    expect(html).toContain('Artwork unavailable');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('game-artwork-disclosure');
    expect(html).toContain('Play later');
    expect(html).toContain('Completed');
    expect(html).toContain(`Your rating / 10 for ${discoveryFixture.record.title}`);
    expect(html).toContain('Rating adds this game to Ranking in My games. It does not mark it played or change a fixed position.');
    expect(html).toContain('Preview only.');
    expect(html).toContain('Add to My games from Discover');
    expect(html).toContain('The 100 stays unchanged.');
  });

  it('does not infer artwork or replace an independent manual opinion from a matching title', () => {
    const record: LibraryRecord = {
      ...discoveryFixture.record, id: 'manual:separate-copy', source: 'manual',
      sourceId: 'separate-copy', sourceUrl: null,
    };
    const original = { ...record };
    const { html, props } = renderDetail({ record, saved: true, rating: 3.2, rankingPosition: 2 });
    expect(html).not.toContain('<img');
    expect(html).toContain('Artwork unavailable');
    expect(html).toContain('value="3.2"');
    expect(html).toContain('Your rank: #2');
    expect(html).toContain('Saved in My games.');
    expect(html).toContain('The 100 stays unchanged.');
    expect(record).toEqual(original);
    expect(props.record).toBe(record);
    expect(props.onAction).not.toHaveBeenCalled();
  });

  it('does not turn a still-loading collection record into an enlarged workbook thumbnail', () => {
    const record: LibraryRecord = {
      ...discoveryFixture.record, id: 'red-dead-redemption-2', source: 'collection',
      sourceId: 'red-dead-redemption-2', sourceUrl: null, collectionRank: 1,
    };
    const { html } = renderDetail({ record });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('/covers/');
    expect(html).toContain('Artwork unavailable');
  });

  it('retains the shared artwork safety and escaped-credit behavior in this consumer', () => {
    const { html } = renderDetail({
      artwork: {
        ...artworkFixture, src: 'https://example.com/unlicensed-cover.webp',
        credit: '<script>not markup</script>', sourceUrl: 'javascript:alert(1)',
        licenseUrl: 'http://example.com/license',
      },
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('class="game-artwork-fallback"');
    expect(html).toContain('&lt;script&gt;not markup&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="http://example.com/license"');
  });
});

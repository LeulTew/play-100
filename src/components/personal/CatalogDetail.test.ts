import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryRecord } from '../../lib/personal-types';
import { artworkFixture, discoveryFixture } from '../../lib/discovery-test-fixtures';
import CatalogDetail from './CatalogDetail';
import type { CatalogDetailProps } from './CatalogDetail';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState) };
});

afterEach(() => {
  vi.mocked(useState).mockReset();
});

function renderDetail(overrides: Partial<CatalogDetailProps> = {}) {
  const props: CatalogDetailProps = {
    record: discoveryFixture.record,
    saved: false,
    progress: undefined,
    rankingPosition: null,
    rating: null,
    busy: false,
    onClose: vi.fn(),
    onAction: vi.fn().mockResolvedValue(true),
    onRankings: vi.fn(),
    ...overrides,
  };
  return { html: renderToStaticMarkup(createElement(CatalogDetail, props)), props };
}

describe('catalog detail artwork continuity surface', () => {
  it('names its short source summary as the description instead of the dialog body', () => {
    const { html } = renderDetail();
    expect(html).toContain('aria-describedby="catalog-game-description"');
    const summary = html.match(/<p id="catalog-game-description" class="dialog-lead">([^<]+)<\/p>/)?.[1];
    expect(summary).toBeDefined();
    expect(summary!.length).toBeLessThan(100);
    expect(summary).not.toMatch(/rating|Preview only|progress/);
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('offers the metadata-only library action with saved=%s and busy=%s', (saved, busy) => {
    const { html, props } = renderDetail({ saved, busy });
    const label = `${saved ? 'In My games' : 'Add to My games'}: ${discoveryFixture.record.title}`;
    const button = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find((value) => value.includes(label));
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled=""');
    expect(button?.includes('aria-disabled="true"')).toBe(saved || busy);
    expect(html).toContain(
      saved
        ? 'Saved in My games.'
        : 'Preview only. Add to My games to keep this game without changing your progress, Play later or ranking.',
    );
    expect(props.onAction).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps mutation buttons natively focusable while busy=%s', (busy) => {
    const { html } = renderDetail({ busy });
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    for (const label of ['Play later', 'Completed', 'Add to my ranking']) {
      const button = buttons.find((value) => value.includes(`>${label}</button>`));
      expect(button).toBeDefined();
      expect(button).not.toContain('disabled=""');
      expect(button?.includes('aria-disabled="true"')).toBe(busy);
    }
  });

  it('keeps the saved-ranking shortcut available to its existing pending-editor guard', () => {
    const { html } = renderDetail({ busy: true, rankingPosition: 1 });
    const button = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find((value) => value.includes('Your rank: #1'));
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled=');
  });

  it.each([
    ['pending', 'status', 'Saving changes…'],
    ['saved', 'status', `${discoveryFixture.record.title} added to My games.`],
    ['failed', 'alert', 'Device storage is full.'],
  ] as const)('announces its own %s mutation inside the dialog', (result, role, text) => {
    vi.mocked(useState).mockReturnValueOnce([result, vi.fn()]);
    const { html } = renderDetail({
      feedback: `${discoveryFixture.record.title} added to My games.`,
      error: result === 'failed' ? 'Device storage is full.' : '',
      publicLookup: { online: false, scopeKey: 'guest:0:0', onEnableOnline: vi.fn() },
    });
    expect(html).toContain(`role="${role}">${text}</p>`);
    expect(html).toContain('Enable online details');
    expect(html.indexOf('Enable online details')).toBeLessThan(html.indexOf(`role="${role}">${text}</p>`));
    if (result === 'failed') expect(html).not.toContain('class="detail-share-notice"');
  });

  it('does not replay a previous detail result before this dialog has changed anything', () => {
    const { html } = renderDetail({ feedback: 'An earlier save completed.', error: 'An earlier error.' });
    expect(html).not.toContain('An earlier save completed.');
    expect(html).not.toContain('An earlier error.');
  });

  it('has an actionable fallback when a rejected callback supplies no library diagnostic', () => {
    vi.mocked(useState).mockReturnValueOnce(['failed', vi.fn()]);
    const { html } = renderDetail();
    expect(html).toContain('role="alert">This change could not be saved. Your library is unchanged. Try again.</p>');
  });

  it.each([false, true])('keeps the detail queue name stable with pressed=%s', (selected) => {
    const { html } = renderDetail({ progress: { later: selected, completed: selected, played: selected } });
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const button = buttons.find((value) => value.endsWith('</svg>Play later</button>'));
    expect(button).toContain(`aria-pressed="${selected}"`);
    expect(button).toContain(`fill="${selected ? 'currentColor' : 'none'}"`);
    expect(html).not.toContain('Saved for later');
  });

  it.each([false, true])('keeps the detail completion name stable with a non-color cue for pressed=%s', (completed) => {
    const { html } = renderDetail({ progress: { later: false, completed, played: completed } });
    const button = html
      .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
      ?.find((value) => value.endsWith('</svg>Completed</button>'));
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

  it.each([
    [480, 210, 360],
    [320, 180, 320],
    [240, 360, 240],
  ])('bounds the detail sleeve for %ix%i art at %ipx', (width, height, size) => {
    const { html } = renderDetail({ artwork: { ...artworkFixture, width, height } });
    expect(html).toContain(`style="width:${size}px;aspect-ratio:${width} / ${height}"`);
    expect(html).toContain(`width="${width}" height="${height}"`);
  });

  it('keeps the bounded default frame for tiny originals without changing their intrinsic image dimensions', () => {
    const { html } = renderDetail({ artwork: { ...artworkFixture, width: 64, height: 32 } });
    expect(html).toContain('<div class="catalog-detail-sleeve">');
    expect(html).toContain('width="64" height="32"');
  });

  it('keeps raw provider classifications in a native disclosure below the concise genre', () => {
    const genre = 'role-playing video game / turn-based Japanese role-playing game / time travel video game';
    const { html, props } = renderDetail({ record: { ...discoveryFixture.record, genre } });
    expect(html).toContain('<dt>Genre</dt><dd>Role-playing</dd>');
    expect(html).toContain('<details class="catalog-enrichment-sources catalog-source-classification">');
    expect(html).toContain('<summary>Source classification</summary>');
    expect(html).toContain(`<p class="catalog-enrichment-note">${genre}</p>`);
    expect(html).not.toContain('open=""');
    expect(props.record.genre).toBe(genre);
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
    expect(html).toContain(`href="${artwork.sourceUrl}" target="_blank" rel="noopener noreferrer"`);
    expect(html).toContain(`href="${artwork.licenseUrl}" target="_blank" rel="noopener noreferrer"`);
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
    expect(html).toContain('Your rating ranks this game; it doesn&#x27;t mark it played.');
    expect(html).toContain('Preview only.');
    expect(html).toContain('Add to My games to keep this game without changing your progress, Play later or ranking.');
    expect(html).not.toContain('Add to My games from Discover');
    expect(html).toContain('The 100 stays unchanged.');
  });

  it('does not infer artwork or replace an independent manual opinion from a matching title', () => {
    const record: LibraryRecord = {
      ...discoveryFixture.record,
      id: 'manual:separate-copy',
      source: 'manual',
      sourceId: 'separate-copy',
      sourceUrl: null,
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
      ...discoveryFixture.record,
      id: 'red-dead-redemption-2',
      source: 'collection',
      sourceId: 'red-dead-redemption-2',
      sourceUrl: null,
      collectionRank: 1,
    };
    const { html } = renderDetail({ record });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('/covers/');
    expect(html).toContain('Artwork unavailable');
    expect(html).not.toContain(`Add to My games: ${record.title}`);
  });

  it('retains the shared artwork safety and escaped-credit behavior in this consumer', () => {
    const { html } = renderDetail({
      artwork: {
        ...artworkFixture,
        src: 'https://example.com/unlicensed-cover.webp',
        credit: '<script>not markup</script>',
        sourceUrl: 'javascript:alert(1)',
        licenseUrl: 'ftp://example.com/license',
      },
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('class="game-artwork-fallback"');
    expect(html).toContain('&lt;script&gt;not markup&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="ftp://example.com/license"');
  });
});

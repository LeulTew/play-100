import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultFilters } from '../lib/url';
import { BrowseFilters } from './BrowseFilters';
import { CollectionControls } from './CollectionControls';
import { parseCollection } from '../lib/collection';
import { readFileSync } from 'node:fs';
import { discoveryFixture } from '../lib/discovery-test-fixtures';

describe('collection result scope and accessible names', () => {
  it('keeps curated genres separate without changing saved additions exact filter values', () => {
    const game = parseCollection(
      JSON.parse(readFileSync(new URL('../../data/collection.json', import.meta.url), 'utf8')),
    ).games[0]!;
    const rawGenre = 'action-adventure game';
    const html = renderToStaticMarkup(
      createElement(CollectionControls, {
        games: [game],
        extraRecords: [
          { ...discoveryFixture.record, genre: rawGenre },
          { ...discoveryFixture.record, genre: rawGenre },
          { ...discoveryFixture.record, genre: game.genre },
          { ...discoveryFixture.record, genre: null },
        ],
        filters: { ...defaultFilters, genre: rawGenre },
        count: 1,
        addedCount: 1,
        unrankedCount: 1,
        onlineScope: true,
        searching: false,
        savedCount: 1,
        completedCount: 0,
        onChange: vi.fn(),
        onShare: vi.fn(),
      }),
    );
    const select = html.match(/<select\b[^>]*id="genre-filter"[\s\S]*?<\/select>/)?.[0];
    expect(select).toContain(`<option>${game.genre}</option>`);
    expect(select).toContain(`<optgroup label="Saved additions"><option selected="">${rawGenre}</option></optgroup>`);
    expect(select?.match(new RegExp(rawGenre, 'g'))).toHaveLength(1);
    expect(select).not.toContain('(not loaded)');
  });

  it.each([false, true])(
    'names the current selection-mode action without a competing pressed state (selecting=%s)',
    (selecting) => {
      const html = renderToStaticMarkup(
        createElement(CollectionControls, {
          games: [],
          extraRecords: [],
          filters: defaultFilters,
          count: 0,
          addedCount: 0,
          unrankedCount: 0,
          onlineScope: true,
          searching: false,
          savedCount: 0,
          completedCount: 0,
          onChange: vi.fn(),
          onShare: vi.fn(),
          selecting,
          onSelectMode: vi.fn(),
        }),
      );
      const button = html
        .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
        ?.find((value) =>
          value.endsWith(`</svg>${selecting ? 'Exit selection mode' : 'Select multiple games'}</button>`),
        );
      expect(button).toBeDefined();
      expect(button).not.toContain('aria-pressed');
      expect(html).toContain('Core 50 · #1–50');
      expect(html).toContain('Essential 50 · #51–100');
    },
  );

  it.each([
    [100, 0],
    [1, 4],
    [0, 4],
    [0, 0],
    [100, 400],
  ])('separates %i original matches from %i beyond matches', (originals, beyond) => {
    const html = renderToStaticMarkup(
      createElement(CollectionControls, {
        games: [],
        extraRecords: [],
        filters: { ...defaultFilters, q: 'fixture' },
        count: originals + beyond,
        addedCount: beyond,
        unrankedCount: beyond,
        onlineScope: true,
        searching: false,
        savedCount: 0,
        completedCount: 0,
        onChange: vi.fn(),
        onShare: vi.fn(),
      }),
    );
    expect(html).toContain(`<strong>${originals}</strong> in The 100`);
    if (beyond) expect(html).toContain(` · ${beyond} beyond The 100`);
    expect(html).not.toContain('games found');
    expect(html).toContain('aria-label="The collection, 100"');
    // G7-UX COPY-001: the count reads as a phrase, not a token attached to the title.
    expect(html).toContain('>The collection <span><span class="title-separator">·</span> 100 games</span></h2>');
    expect(html).toContain(`aria-label="All games, ${beyond}"`);
    expect(html).toContain('aria-label="Play later, 0"');
    expect(html).toContain('aria-label="Completed, 0"');
    // Label in Name: visible label and count are separate words that appear inside each name.
    expect(html).toContain(`>All games <span>${beyond}</span></button>`);
    expect(html).toContain('>Play later <span>0</span></button>');
    expect(html).toContain('>Completed <span>0</span></button>');
  });

  it.each([
    ['Filters', 'Filters'],
    ['Filters & sort', 'Filters &amp; sort'],
    ['Filters & sort & search', 'Filters &amp; sort &amp; search'],
  ])('names %s with its active count, containing the visible words in order', (label, escapedLabel) => {
    for (const [activeCount, status] of [
      [0, 'None active'],
      [3, '3 active'],
    ] as const) {
      const html = renderToStaticMarkup(createElement(BrowseFilters, { label, activeCount, children: 'Controls' }));
      // Label in Name (WCAG 2.5.3): the visible label, a real space, then the status, all inside the name.
      expect(html).toContain(
        `<summary aria-label="${escapedLabel}, ${status}">${escapedLabel} <span>${status}</span></summary>`,
      );
      expect(html).not.toContain('aria-describedby');
    }
  });
});

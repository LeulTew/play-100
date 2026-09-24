import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultFilters } from '../lib/url';
import { BrowseFilters } from './BrowseFilters';
import { CollectionControls } from './CollectionControls';

describe('collection result scope and accessible names', () => {
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

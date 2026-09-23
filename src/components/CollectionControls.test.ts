import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultFilters } from '../lib/url';
import { BrowseFilters } from './BrowseFilters';
import { CollectionControls } from './CollectionControls';

describe('collection result scope and accessible names', () => {
  it.each([[100, 0], [1, 4], [0, 4], [0, 0], [100, 400]])(
    'separates %i original matches from %i beyond matches', (originals, beyond) => {
      const html = renderToStaticMarkup(createElement(CollectionControls, {
        games: [], extraRecords: [], filters: { ...defaultFilters, q: 'fixture' },
        count: originals + beyond, addedCount: beyond, unrankedCount: beyond,
        onlineScope: true, searching: false, savedCount: 0, completedCount: 0,
        onChange: vi.fn(), onShare: vi.fn(),
      }));
      expect(html).toContain(`<strong>${originals}</strong> in The 100`);
      if (beyond) expect(html).toContain(` · ${beyond} beyond The 100`);
      expect(html).not.toContain('games found');
      expect(html).toContain('aria-label="The collection, 100"');
      expect(html).toContain(`aria-label="All games, ${beyond}"`);
      expect(html).toContain('aria-label="Play later, 0"');
      expect(html).toContain('aria-label="Completed, 0"');
    },
  );

  it.each(['Filters', 'Filters & sort'])('keeps %s and its active count separate in the accessible name', label => {
    const html = renderToStaticMarkup(createElement(BrowseFilters, { label, activeCount: 0, children: 'Controls' }));
    expect(html).toContain(`aria-label="${label.replace('&', '&amp;')}"`);
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(descriptionId).toBeDefined();
    expect(html).toContain(`<span id="${descriptionId}">None active</span>`);
  });
});

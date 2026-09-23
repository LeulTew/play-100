import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { discoveryFixture } from '../lib/discovery-test-fixtures';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { defaultFilters } from '../lib/url';
import { author } from '../lib/author';
import { criticColumns } from '../lib/collection';
import { emptySources } from '../lib/catalog-search-session';
import { CatalogSourceStatus } from './catalog/CatalogSourceStatus';
import { DiscoveryCard } from './catalog/DiscoveryCard';
import { SavedCatalogCopies } from './catalog/SavedCatalogCopies';
import RatingsTable from './RatingsTable';

describe('composite control accessible names', () => {
  it.each([false, true])('names discovery Pin as an add-only action (pinned=%s)', pinned => {
    const record = discoveryFixture.record;
    const html = renderToStaticMarkup(h(DiscoveryCard, {
      record, state: emptyPersonalLibrary(), busy: false, pinned, onPin: vi.fn(), onAction: vi.fn(async () => true),
    }));
    const pin = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(button => button.includes(`aria-label="${pinned ? 'Pinned' : 'Pin'} for comparison: ${record.title}"`));
    expect(pin).toBeDefined();
    expect(pin).toContain(`</svg>${pinned ? 'Pinned' : 'Pin'}</button>`);
    expect(pin).not.toContain('aria-pressed');
    expect(pin?.includes('disabled=""')).toBe(pinned);
    expect(pin).toContain(`fill="${pinned ? 'currentColor' : 'none'}"`);
  });

  it('distinguishes provider disclosures in the same status group without changing their visible labels', () => {
    const html = renderToStaticMarkup(h(CatalogSourceStatus, {
      sources: emptySources().map(source => ({ ...source, status: 'ready' as const, notices: ['Provider-specific coverage.'] })),
      onRetry: vi.fn(), onMore: vi.fn(),
    }));
    expect(html).toContain('aria-label="Source details for Wikidata">Source details</summary>');
    expect(html).toContain('aria-label="Source details for FreeToGame">Source details</summary>');
  });

  it('retains the visible disclosure wording exactly before its game context', () => {
    const html = renderToStaticMarkup(h(DiscoveryCard, {
      record: discoveryFixture.record, state: emptyPersonalLibrary(), busy: false,
      onAction: vi.fn(async () => true),
    }));
    expect(html).toContain(`aria-label="Actions &amp; source for ${discoveryFixture.record.title}"`);
    expect(html).toContain('>Actions &amp; source</summary>');
  });

  it.each([false, true])('starts saved-copy names with the visible action, including its source when shown (multiple=%s)', multiple => {
    const record = discoveryFixture.record;
    const copies = multiple ? [record, { ...record, id: 'manual:copy', source: 'manual' as const, sourceId: 'copy' }] : [record];
    const html = renderToStaticMarkup(h(SavedCatalogCopies, { canonicalId: 'canonical', copies, onOpen: vi.fn() }));
    expect(html).toContain(`aria-label="Open saved copy (Wikidata) of ${record.title}"`);
    expect(html).toContain(multiple ? '>Open saved copy (Wikidata)</button>' : '>Open saved copy</button>');
    if (multiple) expect(html).toContain(`aria-label="Open saved copy (Added by you) of ${record.title}"`);
  });

  it('separates sortable score names from their visible scales without repeating them as descriptions', () => {
    const html = renderToStaticMarkup(h(RatingsTable, {
      games: [], filters: defaultFilters, progress: {}, selecting: false,
      selected: new Set<string>(), busy: false, onSelect: vi.fn(), onOpen: vi.fn(), onToggle: vi.fn(), onSort: vi.fn(),
    }));
    expect(html).toContain(`aria-label="${author.shortName}&#x27;s rating / 10 · original"`);
    expect(html).toContain('aria-label="Average / 100"');
    for (const { label, scale } of criticColumns) expect(html).toContain(`aria-label="${label} / ${scale}"`);
  });
});

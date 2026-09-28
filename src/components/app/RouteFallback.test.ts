import { readFileSync } from 'node:fs';
import { sourceTokens } from '../../../scripts/source-contract';
import * as ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RouteFallback } from './RouteFallback';

describe('destination loading anatomy', () => {
  it.each([
    ['collection', 'The 100'],
    ['games', 'My games'],
    ['library', 'My games'],
    ['rankings', 'My games'],
    ['discover', 'Discover'],
    ['account', 'Account'],
    ['publish', 'Publish ranking'],
    ['community', 'Community'],
    ['profile', 'Public ranking'],
    ['creator', 'Creator desk'],
    ['friends', 'Friends'],
    ['friend', 'Player'],
    ['invite', 'Invitation'],
    ['compare', 'Compare rankings'],
    ['friend-sharing', 'Friends sharing'],
    ['friend-shelf', 'Shared games'],
  ] as const)('names %s without inventing loaded contents', (route, title) => {
    const html = renderToStaticMarkup(createElement(RouteFallback, { route, kind: 'public-page' }));
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).toContain(`Loading ${title}…`);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-hidden="true" inert=""');
    expect(html).not.toMatch(/my-games-workspace|library-results-boundary|id="(my-games-title|discover-title)"/);
    expect(html).not.toMatch(/<(button|input|form|img)\b/);
    expect(html).not.toContain('0 games');
  });

  it('keeps sign-in as a static native form skeleton even when opened from Discover', () => {
    const onClose = vi.fn();
    const getReturnFocus = vi.fn(() => null);
    const html = renderToStaticMarkup(
      createElement(RouteFallback, { route: 'discover', kind: 'account-sheet', onClose, getReturnFocus }),
    );
    expect(html).toContain('aria-labelledby="loading-account-title"');
    expect(html).toContain('data-motion-owned="true"');
    expect(html).toContain('data-autofocus="true" tabindex="-1">Sign in</h2>');
    expect(html.match(/class="search-field section-help"/g)).toHaveLength(3);
    expect(html).toContain('role="status">Loading sign-in…</p>');
    expect(html).not.toContain('discovery-cards-grid');
    expect(html).not.toMatch(/<(input|form)\b/);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(getReturnFocus).not.toHaveBeenCalled();
  });

  it('does not pull lazy route code, effects or decorative animations into the fallback', () => {
    const source = readFileSync(new URL('./RouteFallback.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('./route-fallback.css', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(lazy|fetch|useEffect|useState|setTimeout)\s*\(|\bimport\s*\(/);
    expect(source).not.toMatch(/from\s+['"][^'"]*(cloud\/|personal\/|catalog\/)/);
    expect(css).not.toMatch(/@import|@keyframes|\banimation\s*:|\btransition\s*:|gradient\s*\(/);
  });

  it('reuses only placeholder rules that the existing public entry already loads eagerly', () => {
    const host = readFileSync(new URL('./RouteHost.tsx', import.meta.url), 'utf8');
    const collection = readFileSync(new URL('../CollectionPage.tsx', import.meta.url), 'utf8');
    const controls = readFileSync(new URL('../CollectionControls.tsx', import.meta.url), 'utf8');
    const filters = readFileSync(new URL('../BrowseFilters.tsx', import.meta.url), 'utf8');
    const extended = readFileSync(new URL('../catalog/ExtendedResults.tsx', import.meta.url), 'utf8');
    const card = readFileSync(new URL('../catalog/DiscoveryCard.tsx', import.meta.url), 'utf8');
    expect(sourceTokens(host, ts.ScriptKind.TSX)).toContain(
      sourceTokens("import CollectionPage from '../CollectionPage'"),
    );
    expect(sourceTokens(collection, ts.ScriptKind.TSX)).toContain(sourceTokens("import './catalog/discover.css'"));
    expect(sourceTokens(extended, ts.ScriptKind.TSX)).toContain(
      sourceTokens("import { DiscoveryCard } from './DiscoveryCard'"),
    );
    expect(sourceTokens(card, ts.ScriptKind.TSX)).toContain(sourceTokens("import './discover.css'"));
    // The filter placeholders' rules (browse-filters.css) load with The 100's own filters.
    expect(sourceTokens(collection, ts.ScriptKind.TSX)).toContain(
      sourceTokens("import { CollectionControls } from './CollectionControls'"),
    );
    expect(sourceTokens(controls, ts.ScriptKind.TSX)).toContain(
      sourceTokens("import { BrowseFilters } from './BrowseFilters'"),
    );
    expect(sourceTokens(filters, ts.ScriptKind.TSX)).toContain(sourceTokens("import './browse-filters.css'"));
  });

  it("reserves Discover's and My games' settled controls as inert placeholders above their results", () => {
    const discover = renderToStaticMarkup(createElement(RouteFallback, { route: 'discover', kind: 'public-page' }));
    expect(discover).toContain('class="app-page route-fallback discovery-page" aria-busy="true"');
    // The search, then the status on the search note's line, then the filters and results heading, then the cards.
    const order = [
      '<div class="discovery-search" aria-hidden="true" inert=""><label>\u00a0</label><div class="search-field"></div></div>',
      '<p class="section-help" role="status">Loading Discover…</p>',
      '<div aria-hidden="true" inert=""><div class="browse-filters discovery-filters"><div class="browse-filters-content">',
      '<div class="discovery-results-heading">',
      '<div class="route-skeleton discovery-skeleton discovery-cards-grid" aria-hidden="true" inert="">',
    ].map((part) => discover.indexOf(part));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(discover.match(/class="filter-select progress-filter"/g)).toHaveLength(4);
    expect(discover.match(/class="discovery-card-skeleton"/g)).toHaveLength(10);
    for (const route of ['games', 'library', 'rankings'] as const) {
      const games = renderToStaticMarkup(createElement(RouteFallback, { route, kind: 'public-page' }));
      expect(games).toContain('class="app-page route-fallback" aria-busy="true"');
      expect(games).toContain(
        '<div aria-hidden="true" inert=""><div class="route-fallback-tabs"><div class="filter-select progress-filter"><label>\u00a0</label><span class="button button-outline"></span></div></div><div class="search-field route-fallback-tools"></div></div><p class="section-help route-fallback-results" role="status">Loading My games…</p>',
      );
    }
    for (const route of ['collection', 'account', 'friends'] as const) {
      const other = renderToStaticMarkup(createElement(RouteFallback, { route, kind: 'public-page' }));
      expect(other).not.toMatch(/discovery-page|discovery-search|browse-filters|route-fallback-(tabs|tools|results)/);
    }
  });
});

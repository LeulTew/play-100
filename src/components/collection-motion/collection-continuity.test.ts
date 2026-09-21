import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCollection } from '../../lib/collection';
import { createSearch, defaultFilters } from '../../lib/url';
import type { Game } from '../../lib/types';
import { GameCard } from '../GameCard';
import { GameDetail } from '../GameDetail';
import RatingsTable from '../RatingsTable';
import coverMetadata from '../../generated/cover-metadata.json';
import * as compareSource from '../compare-tray/useCompareDragSource';
import type { LibraryRecord } from '../../lib/personal-types';

const raw: unknown = JSON.parse(readFileSync(new URL('../../../data/collection.json', import.meta.url), 'utf8'));
const games = parseCollection(raw).games;
const dimensions: Record<string, { width: number; height: number }> = coverMetadata;

afterEach(() => vi.restoreAllMocks());

function gameAt(rank: number): Game {
  const game = games[rank - 1];
  if (!game) throw new Error(`Missing collection fixture ${rank}`);
  return game;
}

describe('collection continuity preserves the public presentation', () => {
  it.each(['grid', 'list'] as const)('keeps the %s card a real link with native artwork and separate controls', (view) => {
    const game = gameAt(2);
    const filters = { ...defaultFilters, view, q: 'mass effect' };
    const onOpen = vi.fn();
    const html = renderToStaticMarkup(h(GameCard, {
      game, filters, state: undefined, onOpen, onSave: vi.fn(), onPlayed: vi.fn(),
      onCompleted: vi.fn(), selecting: true, selected: true, onSelect: vi.fn(),
      compareActions: h('button', { type: 'button' }, 'Pin for comparison'),
    }));
    expect(html).toContain(`href="/${createSearch(filters, game.slug).replaceAll('&', '&amp;')}"`);
    expect(html).toContain(`data-game="${game.slug}"`);
    expect(html).toContain('9.9696969696969688');
    expect(html).toContain(`width="${dimensions[game.slug]?.width}" height="${dimensions[game.slug]?.height}"`);
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).toContain(`aria-label="Select ${game.title}"`);
    expect(html).toContain('Pin for comparison');
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<(?:button|input)\b/);
    expect(html).not.toMatch(/<article\b[^>]*(?:tabindex|role)=/);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps raw author ratings, critic scores and the personal editor independent', () => {
    const game = gameAt(2);
    const onRate = vi.fn(async () => true);
    const html = renderToStaticMarkup(h(GameDetail, {
      game, state: undefined, previous: gameAt(1), next: gameAt(3),
      onClose: vi.fn(), onOpen: vi.fn(), onToggle: vi.fn(), onShare: vi.fn(),
      shareFeedback: '', personalRating: 4.25, onRate,
    }));
    expect(html).toContain('data-motion-owned');
    expect(html).toContain('9.9696969696969688');
    expect(html).toContain("Leul&#x27;s original rating");
    expect(html).toContain('Workbook snapshot. Not live or independently verified.');
    expect(html).toContain(`aria-label="Your rating for ${game.title}"`);
    expect(html).toContain('value="4.25"');
    expect(html.match(/<input\b/g)).toHaveLength(1);
    expect(html.match(/id="game-title"/g)).toHaveLength(1);
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).toContain(`width="${dimensions[game.slug]?.width}" height="${dimensions[game.slug]?.height}"`);
    expect(onRate).not.toHaveBeenCalled();
  });

  it('retains source caveats instead of changing facts to improve a transition', () => {
    const game = games.find(item => item.slug === 'hitman-world-of-assassination');
    if (!game) throw new Error('Missing Hitman source-caveat fixture');
    const html = renderToStaticMarkup(h(GameDetail, {
      game, state: undefined, previous: undefined, next: undefined,
      onClose: vi.fn(), onOpen: vi.fn(), onToggle: vi.fn(), onShare: vi.fn(),
      shareFeedback: '', personalRating: null, onRate: vi.fn(async () => true),
    }));
    expect(html).toContain('HITMAN III-branded artwork');
    expect(html).toContain('lists 2016');
    expect(html).toContain('We preserve all three rather than infer a release or edition.');
  });

  it('passes an owned provider action record to the card adapter without changing public identity or using storage busy as a gate', () => {
    const game = gameAt(1);
    const owned: LibraryRecord = {
      id: 'wikidata:Q20612424', source: 'wikidata', sourceId: 'Q20612424',
      title: game.title, collectionRank: null, year: game.year, genre: game.genre,
      studio: game.studio, sourceUrl: 'https://www.wikidata.org/wiki/Q20612424',
    };
    const binding = vi.spyOn(compareSource, 'useCompareDragSource');
    const html = renderToStaticMarkup(h(GameCard, {
      game, filters: defaultFilters, state: undefined, busy: true, compareRecord: owned,
      onOpen: vi.fn(), onSave: vi.fn(), onPlayed: vi.fn(), onCompleted: vi.fn(),
    }));
    expect(binding).toHaveBeenCalledExactlyOnceWith({ record: owned, sourceRef: { current: null } });
    expect(html).toContain(`data-game="${game.slug}"`);
    expect(html).toContain(`game=${game.slug}`);
    expect(html).not.toContain('data-game="wikidata:');
  });

  it('keeps table titles native, original ranks intact and controls outside the title link', () => {
    const filters = { ...defaultFilters, view: 'table' as const };
    const html = renderToStaticMarkup(h(RatingsTable, {
      games: [gameAt(2), gameAt(1)], filters, progress: {}, selecting: true,
      selected: new Set([gameAt(2).slug]), busy: false, onSelect: vi.fn(),
      onOpen: vi.fn(), onToggle: vi.fn(), onSort: vi.fn(),
    }));
    expect(html.indexOf('data-game="mass-effect-2"')).toBeLessThan(html.indexOf('data-game="red-dead-redemption-2"'));
    expect(html).toContain('<td class="table-rank">02</td>');
    expect(html).toContain('<td class="table-rank">01</td>');
    expect(html).toContain('9.9696969696969688');
    expect(html).toContain('href="/?view=table&amp;game=mass-effect-2"');
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<(?:button|input)\b/);
    expect(html).not.toContain('game-cover');
    expect(html).not.toMatch(/<tr\b[^>]*(?:tabindex|draggable)=/);
  });

  it('binds only a table title to the exact supplied action record', () => {
    const game = gameAt(1);
    const owned: LibraryRecord = {
      id: 'wikidata:Q20612424', source: 'wikidata', sourceId: 'Q20612424',
      title: game.title, collectionRank: null, year: game.year, genre: game.genre,
      studio: game.studio, sourceUrl: 'https://www.wikidata.org/wiki/Q20612424',
    };
    const binding = vi.spyOn(compareSource, 'useCompareDragSource');
    const resolve = vi.fn(() => owned);
    renderToStaticMarkup(h(RatingsTable, {
      games: [game], filters: { ...defaultFilters, view: 'table' }, progress: {},
      selecting: false, selected: new Set<string>(), busy: true, onSelect: vi.fn(),
      onOpen: vi.fn(), onToggle: vi.fn(), onSort: vi.fn(), getCompareRecord: resolve,
    }));
    expect(resolve).toHaveBeenCalledExactlyOnceWith(game);
    expect(binding).toHaveBeenCalledExactlyOnceWith({ record: owned, sourceRef: { current: null } });
  });
});

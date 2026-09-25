import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCollection } from '../../lib/collection';
import { createSearch, defaultFilters } from '../../lib/url';
import type { Game } from '../../lib/types';
import { GameCard } from '../GameCard';
import { GameDetail } from '../GameDetail';
import { AboutDialog } from '../AboutDialog';
import RatingsTable from '../RatingsTable';
import coverMetadata from '../../generated/cover-metadata.json';
import * as compareSource from '../compare-tray/useCompareDragSource';
import { CompareTrayContext } from '../compare-tray/compare-tray-context';
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
  it.each([false, true])('keeps card, table and detail queue names stable with pressed=%s', (selected) => {
    const game = gameAt(2);
    const state = { played: selected, completed: selected, later: selected };
    const card = renderToStaticMarkup(
      h(GameCard, {
        game,
        filters: defaultFilters,
        state,
        onOpen: vi.fn(),
        onSave: vi.fn(),
        onPlayed: vi.fn(),
        onCompleted: vi.fn(),
      }),
    );
    const table = renderToStaticMarkup(
      h(RatingsTable, {
        games: [game],
        filters: defaultFilters,
        progress: { [game.slug]: state },
        selecting: false,
        selected: new Set<string>(),
        busy: false,
        onSelect: vi.fn(),
        onOpen: vi.fn(),
        onToggle: vi.fn(),
        onSort: vi.fn(),
      }),
    );
    for (const html of [card, table]) {
      expect(html).toContain(`aria-pressed="${selected}" aria-label="Play later: ${game.title}"`);
      const queue = html
        .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
        ?.find((button) => button.includes(`aria-label="Play later: ${game.title}"`));
      expect(queue).toContain('title="Play later"');
      expect(queue).toContain(`fill="${selected ? 'currentColor' : 'none'}"`);
    }
    const detail = renderToStaticMarkup(
      h(GameDetail, {
        game,
        state,
        previous: undefined,
        next: undefined,
        onClose: vi.fn(),
        onOpen: vi.fn(),
        onToggle: vi.fn(),
        onShare: vi.fn(),
        shareFeedback: '',
        personalRating: null,
        onRate: vi.fn(async () => true),
      }),
    );
    const buttons = detail.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const button = buttons.find((value) => value.trimEnd().endsWith('</svg>Play later</button>'));
    expect(button).toContain(`aria-pressed="${selected}"`);
    expect(button).toContain(`fill="${selected ? 'currentColor' : 'none'}"`);
  });

  it.each([false, true])('keeps the detail completion name stable with a non-color cue for pressed=%s', (completed) => {
    const detail = renderToStaticMarkup(
      h(GameDetail, {
        game: gameAt(2),
        state: { played: completed, completed, later: false },
        previous: undefined,
        next: undefined,
        onClose: vi.fn(),
        onOpen: vi.fn(),
        onToggle: vi.fn(),
        onShare: vi.fn(),
        shareFeedback: '',
        personalRating: null,
        onRate: vi.fn(async () => true),
      }),
    );
    const button = detail
      .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
      ?.find((value) => value.trimEnd().endsWith('</svg>Completed</button>'));
    expect(button).toContain(`aria-pressed="${completed}"`);
    expect(button).toContain(`<path d="${completed ? 'm5 12 4 4L19 6' : 'M12 4v16M4 12h16'}">`);
    expect(button).toContain(`class="button ${completed ? 'button-lime' : 'button-outline'}"`);
  });

  it.each(['grid', 'list'] as const)(
    'keeps the %s card a real link with native artwork and separate controls',
    (view) => {
      const game = gameAt(2);
      const filters = { ...defaultFilters, view, q: 'mass effect' };
      const onOpen = vi.fn();
      const html = renderToStaticMarkup(
        h(GameCard, {
          game,
          filters,
          state: undefined,
          onOpen,
          onSave: vi.fn(),
          onPlayed: vi.fn(),
          onCompleted: vi.fn(),
          selecting: true,
          selected: true,
          onSelect: vi.fn(),
          compareActions: h('button', { type: 'button' }, 'Pin for comparison'),
        }),
      );
      expect(html).toContain(`href="/${createSearch(filters, game.slug).replaceAll('&', '&amp;')}"`);
      expect(html).toContain(`data-game="${game.slug}"`);
      expect(html).toContain('9.9696969696969688');
      expect(html).toContain(`width="${dimensions[game.slug]?.width}" height="${dimensions[game.slug]?.height}"`);
      expect(html.match(/<img\b/g)).toHaveLength(1);
      expect(html).toContain(`aria-label="Select ${game.title}"`);
      expect(html).toContain('Pin for comparison');
      expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<(?:button|input)\b/);
      expect(html).toMatch(/^<li\b/);
      expect(html).not.toMatch(/<li\b[^>]*(?:tabindex=|role=)/);
      expect(html).not.toMatch(/<article\b[^>]*role=/);
      expect(onOpen).not.toHaveBeenCalled();
    },
  );

  it('keeps raw author ratings, critic scores and the personal editor independent', () => {
    const game = gameAt(2);
    const onRate = vi.fn(async () => true);
    const html = renderToStaticMarkup(
      h(GameDetail, {
        game,
        state: undefined,
        previous: gameAt(1),
        next: gameAt(3),
        onClose: vi.fn(),
        onOpen: vi.fn(),
        onToggle: vi.fn(),
        onShare: vi.fn(),
        shareFeedback: '',
        personalRating: 4.25,
        onRate,
      }),
    );
    expect(html).toContain('data-motion-owned');
    expect(html).toContain('9.9696969696969688');
    expect(html).toContain('Leul&#x27;s original rating');
    expect(html).toContain('Original workbook score, based on the game&#x27;s rank.');
    expect(html).not.toContain('Workbook rank-based rating.');
    expect(html).toContain('Workbook snapshot. Not live or independently verified.');
    expect(html).toContain(
      'Rating adds this game to Ranking in My games. It does not mark it played or change a fixed position.',
    );
    expect(html).toContain(`aria-label="Your rating / 10 for ${game.title}"`);
    expect(html).toContain('value="4.25"');
    expect(html.match(/<input\b/g)).toHaveLength(1);
    expect(html.match(/id="game-title"/g)).toHaveLength(1);
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).toContain(`width="${dimensions[game.slug]?.width}" height="${dimensions[game.slug]?.height}"`);
    expect(onRate).not.toHaveBeenCalled();
  });

  it('explains source ratings plainly without changing their precision or personal boundary', () => {
    const html = renderToStaticMarkup(h(AboutDialog, { onClose: vi.fn() }));
    expect(html).toContain('original workbook scores, based on each game&#x27;s rank');
    expect(html).toContain('including rounded or text-based results, rather than recalculating them');
    expect(html).toContain('never prefilled');
    expect(html).toContain('headed “my rating(based on rank)”.');
    expect(html).toContain('“Hitman: World of Assassination” title');
    expect(html).toContain('main tab “AAA Top 50”');
  });

  it('distinguishes optional catalog lookups from licensed detail artwork and source ratings', () => {
    const html = renderToStaticMarkup(h(AboutDialog, { onClose: vi.fn() }));
    expect(html).toContain('Discover includes a bundled catalog and optional online metadata lookup');
    expect(html).toContain('Online catalog search sends your query');
    expect(html).toContain('It does not send your private library, notes or rankings.');
    expect(html).toContain(
      'Opening an eligible Discover game can also load separately labelled public ratings and licensed artwork while online lookup is on.',
    );
    expect(html).toContain('Credits stay attached; entries from The 100 keep their original artwork and scores.');
    expect(html).toContain('These lookups do not copy descriptions, prices or review text.');
    expect(html).toContain('unavailable sources show an error rather than an empty success');
    expect(html).not.toContain('not external cover artwork');
  });

  it('retains source caveats instead of changing facts to improve a transition', () => {
    const game = games.find((item) => item.slug === 'hitman-world-of-assassination');
    if (!game) throw new Error('Missing Hitman source-caveat fixture');
    const html = renderToStaticMarkup(
      h(GameDetail, {
        game,
        state: undefined,
        previous: undefined,
        next: undefined,
        onClose: vi.fn(),
        onOpen: vi.fn(),
        onToggle: vi.fn(),
        onShare: vi.fn(),
        shareFeedback: '',
        personalRating: null,
        onRate: vi.fn(async () => true),
      }),
    );
    expect(html).toContain('HITMAN III-branded artwork');
    expect(html).toContain('lists 2016');
    expect(html).toContain('the workbook calls this “Hitman: World of Assassination”,');
    expect(html).toContain('The source column was headed “my rating(based on rank)”;');
    expect(html).toContain('We preserve all three rather than infer a release or edition.');
  });

  it.each([1, 2, 100])('puts the complete original rationale before bookkeeping for rank %i', (rank) => {
    const game = gameAt(rank);
    const html = renderToStaticMarkup(
      h(GameDetail, {
        game,
        state: undefined,
        previous: undefined,
        next: undefined,
        onClose: vi.fn(),
        onOpen: vi.fn(),
        onToggle: vi.fn(),
        onShare: vi.fn(),
        shareFeedback: '',
        personalRating: null,
        onRate: vi.fn(async () => true),
        savedCopies: h('p', null, 'Existing saved copies'),
      }),
    );
    const rationale = renderToStaticMarkup(h('p', { className: 'rationale' }, game.rationale));
    expect(html).toContain(rationale);
    expect(html.match(/Why it made the list/g)).toHaveLength(1);
    expect(html.indexOf(rationale)).toBeLessThan(html.indexOf('Existing saved copies'));
    expect(html.indexOf(rationale)).toBeLessThan(html.indexOf('Play later'));
    expect(html.indexOf(rationale)).toBeLessThan(html.indexOf('Your rating / 10 for'));
    if (game.sourceNote) {
      const note = renderToStaticMarkup(
        h('p', null, h('strong', null, 'From the source workbook'), h('br'), game.sourceNote),
      );
      expect(html).toContain(note);
      expect(html.indexOf(note)).toBeLessThan(html.indexOf('Existing saved copies'));
    }
  });

  it('passes an owned provider action record to the card adapter without changing public identity or using storage busy as a gate', () => {
    const game = gameAt(1);
    const owned: LibraryRecord = {
      id: 'wikidata:Q20612424',
      source: 'wikidata',
      sourceId: 'Q20612424',
      title: game.title,
      collectionRank: null,
      year: game.year,
      genre: game.genre,
      studio: game.studio,
      sourceUrl: 'https://www.wikidata.org/wiki/Q20612424',
    };
    const binding = vi.spyOn(compareSource, 'useCompareDragSource');
    const html = renderToStaticMarkup(
      h(GameCard, {
        game,
        filters: defaultFilters,
        state: undefined,
        busy: true,
        compareRecord: owned,
        onOpen: vi.fn(),
        onSave: vi.fn(),
        onPlayed: vi.fn(),
        onCompleted: vi.fn(),
      }),
    );
    expect(binding).toHaveBeenCalledExactlyOnceWith({ record: owned, sourceRef: { current: null } });
    expect(html).toContain(`data-game="${game.slug}"`);
    expect(html).toContain(`game=${game.slug}`);
    expect(html).not.toContain('data-game="wikidata:');
  });

  it('keeps table titles native, original ranks intact and controls outside the title link', () => {
    const filters = { ...defaultFilters, view: 'table' as const };
    const html = renderToStaticMarkup(
      h(RatingsTable, {
        games: [gameAt(2), gameAt(1)],
        filters,
        progress: {},
        selecting: true,
        selected: new Set([gameAt(2).slug]),
        busy: false,
        onSelect: vi.fn(),
        onOpen: vi.fn(),
        onToggle: vi.fn(),
        onSort: vi.fn(),
      }),
    );
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
      id: 'wikidata:Q20612424',
      source: 'wikidata',
      sourceId: 'Q20612424',
      title: game.title,
      collectionRank: null,
      year: game.year,
      genre: game.genre,
      studio: game.studio,
      sourceUrl: 'https://www.wikidata.org/wiki/Q20612424',
    };
    const binding = vi.spyOn(compareSource, 'useCompareDragSource');
    const resolve = vi.fn(() => owned);
    const tray = {
      currentScope: 'guest',
      items: [],
      persistent: true,
      warning: null,
      error: null,
      status: '',
      dragging: false,
      pin: vi.fn(() => true),
      unpin: vi.fn(() => true),
      clear: vi.fn(() => true),
      dismissError: vi.fn(),
    };
    const html = renderToStaticMarkup(
      h(
        CompareTrayContext.Provider,
        { value: tray },
        h(RatingsTable, {
          games: [game],
          filters: { ...defaultFilters, view: 'table' },
          progress: {},
          selecting: false,
          selected: new Set<string>(),
          busy: true,
          onSelect: vi.fn(),
          onOpen: vi.fn(),
          onToggle: vi.fn(),
          onSort: vi.fn(),
          getCompareRecord: resolve,
        }),
      ),
    );
    expect(html).toContain(`aria-label="Pin for comparison: ${game.title}"`);
    expect(tray.pin).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledExactlyOnceWith(game);
    expect(binding).toHaveBeenCalledExactlyOnceWith({ record: owned, sourceRef: { current: null } });
  });
});

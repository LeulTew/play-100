import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { emptyPersonalLibrary } from '../../lib/personal-library';
import type { PersonalLibraryState, LibraryRecord } from '../../lib/personal-types';
import type { Filters } from '../../lib/types';
import MyGamesPage from '../personal/MyGamesPage';
import LibraryPage from '../personal/LibraryPage';
import RankingsPage from '../personal/RankingsPage';
import { GameArtwork } from '../games/GameArtwork';
import { CompareTray } from './CompareTray';
import { ComparePinButton } from './ComparePinButton';
import { CompareDragHandle } from './CompareDragHandle';
import { CompareDragSource } from './CompareDragSource';
import { CompareTrayContext } from './compare-tray-context';
import { MotionPolicyContext, staticMotionPolicy } from '../../motion/context';

const alpha: LibraryRecord = {
  id: 'alpha',
  source: 'collection',
  sourceId: 'alpha',
  title: 'Alpha game',
  year: 2020,
  collectionRank: 1,
  sourceUrl: null,
  studio: null,
  genre: null,
};
const beta: LibraryRecord = { ...alpha, id: 'beta', sourceId: 'beta', title: 'Beta game', collectionRank: 2 };
const state: PersonalLibraryState = {
  ...emptyPersonalLibrary(),
  records: { alpha, beta },
  progress: {
    alpha: { played: true, completed: true, later: true },
    beta: { played: false, completed: false, later: true },
  },
  queueOrder: ['beta', 'alpha'],
  ranking: [{ id: 'alpha', note: 'A private note', score: 7, manualPosition: 1 }],
};
const filters: Filters = {
  q: '',
  genre: 'all',
  year: 'all',
  tier: 'all',
  list: 'all',
  sort: 'rank',
  view: 'grid',
  direction: 'auto',
  catalogs: 'on',
};
const props = {
  state,
  filters,
  busy: false,
  animate: false,
  onFilters: vi.fn(),
  onAction: vi.fn(async () => true),
  onPresentationChange: vi.fn(async (commit: () => void) => {
    commit();
    return true;
  }),
  onOpen: vi.fn(),
  onDiscover: vi.fn(),
  onBrowse: vi.fn(),
  availableRecords: [alpha, beta],
  persistent: true,
};

describe('workspace embedding contract', () => {
  it.each([false, true])('keeps editor Pin names stable with pressed=%s', (selected) => {
    const pinProps = { onPin: vi.fn(), onUnpin: vi.fn(), pinnedIds: new Set(selected ? ['alpha'] : []) };
    const library = renderToStaticMarkup(h(LibraryPage, { ...props, ...pinProps }));
    const ranking = renderToStaticMarkup(h(RankingsPage, { ...props, ...pinProps }));
    for (const html of [library, ranking]) {
      expect(html).toContain(`aria-pressed="${selected}" aria-label="Pin for comparison: Alpha game"`);
      const pin = html
        .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
        ?.find((button) => button.includes('aria-label="Pin for comparison: Alpha game"'));
      expect(pin).toContain(`fill="${selected ? 'currentColor' : 'none'}"`);
    }
    expect(library).toContain('title="Pin for comparison"');
    expect(ranking).toContain('</svg>Pin for comparison</button>');
  });

  it.each([false, true])('uses add-only editor Pin names when no unpin action is supplied (pinned=%s)', (pinned) => {
    const pinProps = { onPin: vi.fn(), pinnedIds: new Set(pinned ? ['alpha'] : []) };
    for (const html of [
      renderToStaticMarkup(h(LibraryPage, { ...props, ...pinProps })),
      renderToStaticMarkup(h(RankingsPage, { ...props, ...pinProps })),
    ]) {
      const pin = html
        .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
        ?.find((button) => button.includes(`aria-label="${pinned ? 'Pinned' : 'Pin'} for comparison: Alpha game"`));
      expect(pin).toBeDefined();
      expect(pin).not.toContain('aria-pressed');
      expect(pin?.includes('disabled=""')).toBe(pinned);
      expect(pin).toContain(`fill="${pinned ? 'currentColor' : 'none'}"`);
    }
  });

  it.each([false, true])('keeps the editor queue name stable with pressed=%s', (selected) => {
    const libraryState = {
      ...state,
      progress: { ...state.progress, alpha: { played: false, completed: false, later: selected } },
    };
    const library = renderToStaticMarkup(h(LibraryPage, { ...props, state: libraryState }));
    const queue = library
      .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
      ?.find((button) => button.includes('aria-label="Play later: Alpha game"'));
    expect(queue).toContain(`aria-pressed="${selected}"`);
    expect(queue).toContain('title="Play later"');
    expect(queue).toContain(`fill="${selected ? 'currentColor' : 'none'}"`);
  });

  it.each([0, 1, 25, 26, 500])(
    'keeps Library counts and bounded rows with %i records, without unnecessary page controls',
    (total) => {
      const records = Array.from({ length: total }, (_, index) => ({
        ...alpha,
        id: `game-${index}`,
        sourceId: `game-${index}`,
        title: `Game ${index}`,
      }));
      const html = renderToStaticMarkup(
        h(LibraryPage, {
          ...props,
          embedded: true,
          workspaceView: 'library',
          state: {
            ...emptyPersonalLibrary(),
            records: Object.fromEntries(records.map((record) => [record.id, record])),
          },
        }),
      );
      expect(html).toContain(`Showing ${total ? 1 : 0}–${Math.min(total, 25)} of ${total} matching games`);
      expect(html).toContain('Your library results</h3>');
      expect(html).toContain('role="status" aria-atomic="true"');
      expect(html.match(/class="personal-row personal-row-static"/g) ?? []).toHaveLength(Math.min(total, 25));
      expect(html.includes('aria-label="Library pages"')).toBe(total > 25);
      expect(html.includes('Search your library')).toBe(total > 0);
      expect(html.includes('Select games')).toBe(total > 0);
      expect(html).toContain('Add a game manually');
      if (total === 0) {
        expect(html).toContain('No games yet');
        expect(html).toContain('Choose from the 100');
        expect(html).toContain('Discover more games');
      }
    },
  );

  it('retains filters, search and recovery for an empty filtered view', () => {
    const html = renderToStaticMarkup(
      h(LibraryPage, {
        ...props,
        progressFilter: 'not-played',
        state: {
          ...emptyPersonalLibrary(),
          records: { alpha },
          progress: { alpha: { played: true, completed: false, later: false } },
        },
      }),
    );
    expect(html).toContain('No matches');
    expect(html).toContain('Search your library');
    expect(html).toContain('Clear search and progress filter');
    expect(html).toContain('Your saved games are unchanged.');
    expect(html).not.toContain('aria-label="Library pages"');
  });

  it('retains standalone Library and Ranking headings and their existing controls', () => {
    const library = renderToStaticMarkup(h(LibraryPage, props));
    expect(library).toContain('>My library</h1>');
    expect(library).toContain('Personal library views');
    expect(library).toContain('role="group" aria-label="Personal library views"');
    for (const name of ['Play later, 2', 'Completed, 1', 'All my games, 2']) {
      expect(library).toContain(`aria-label="${name}"`);
      // Label in Name: the visible label and count are separate words inside the name.
      const [label, count] = name.split(', ');
      expect(library).toContain(`>${label} <span>${count}</span></button>`);
    }
    expect(library).toContain('aria-label="Remove Alpha game from my library"');
    expect(library).not.toContain('title="Remove from my library"');
    expect(library).toContain('Add a game manually');
    const ranking = renderToStaticMarkup(h(RankingsPage, props));
    expect(ranking).toContain('>My rankings</h1>');
    expect(ranking).toContain('Fixed at #1');
    expect(ranking).toContain('A private note');
    expect(ranking).toContain('Remove Alpha game from my ranking');
  });
  it('maps a queue view to existing order and disables reordering only for a filtered queue', () => {
    const queue = renderToStaticMarkup(h(LibraryPage, { ...props, embedded: true, workspaceView: 'queue' }));
    expect(queue.indexOf('Beta game')).toBeLessThan(queue.indexOf('Alpha game'));
    expect(queue).toContain('Drag Beta game to reorder your queue');
    expect(queue).toContain('Search your queue');
    expect(queue).toContain('placeholder="Find a game in your queue…"');
    expect(queue).not.toContain('Search your library');
    const completed = renderToStaticMarkup(
      h(LibraryPage, { ...props, embedded: true, workspaceView: 'queue', completedOnly: true }),
    );
    expect(completed).not.toContain('Beta game');
    expect(completed).toContain('Alpha game');
    expect(completed).toContain('Clear search, progress filters and selection to reorder.');
    expect(completed).toContain('disabled=""');
  });
  it('keeps the Library tree present and mounts only the active clean Ranking pane without nested page headings', () => {
    for (const view of ['library', 'queue', 'ranking'] as const) {
      const html = renderToStaticMarkup(h(MyGamesPage, { ...props, scope: 'guest', view, onViewChange: vi.fn() }));
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain('>My games</h1>');
      expect(html).toContain('aria-label="My games views"');
      for (const name of ['Library, 2', 'Queue, 2', 'Ranking, 1']) {
        const [label, count] = name.split(', ');
        expect(html).toContain(`aria-label="${name}"`);
        // Label in Name: the visible label and count stay word-separated so they read inside the name.
        expect(html).toContain(`>${label} <span>${count}</span>`);
      }
      expect(html).toContain('class="filter-select progress-filter"');
      expect(html).toContain('Played (not completed)');
      // Clean inactive Ranking panes have no rows, editors or search subscriptions.
      expect(html.includes('A private note')).toBe(view === 'ranking');
      expect(html.includes('id="ranking-search"')).toBe(view === 'ranking');
      expect(html).toContain('Add a game manually');
      expect(html.match(/<div hidden=""/g)).toHaveLength(1);
      if (view !== 'ranking') expect(html).toContain('<div hidden=""></div>');
      expect(html).not.toContain('Personal library views');
    }
  });
  it.each([120, 2000])('bounds %i ranked games to 25 mounted rows with global page positions', (total) => {
    const records = Array.from({ length: total }, (_, index) => ({
      ...alpha,
      id: `manual:ranking-${index}`,
      source: 'manual' as const,
      sourceId: `ranking-${index}`,
      collectionRank: null,
      title: `Synthetic ranking ${index}`,
    }));
    const html = renderToStaticMarkup(
      h(RankingsPage, {
        ...props,
        viewState: { searchInput: '', query: '', offset: 25 },
        state: {
          ...emptyPersonalLibrary(),
          records: Object.fromEntries(records.map((record) => [record.id, record])),
          ranking: records.map((record, index) => ({
            id: record.id,
            score: 7,
            note: '',
            manualPosition: index + 1,
          })),
        },
      }),
    );
    expect(html.match(/class="ranking-row-content"/g)).toHaveLength(25);
    expect(html).toContain('aria-posinset="26"');
    expect(html).toContain(`aria-setsize="${total}"`);
    expect(html).toContain(`26–50 of ${total} ranked games`);
    expect(html).toContain('Move Synthetic ranking 25 up in ranking');
  });
  it('embeds metadata-only pins without enabling any personal action', () => {
    const onAction = vi.fn(async () => true);
    const html = renderToStaticMarkup(
      h(MyGamesPage, {
        ...props,
        onAction,
        scope: 'guest',
        view: 'library',
        onViewChange: vi.fn(),
        onPin: vi.fn(),
        onUnpin: vi.fn(),
        pinnedIds: new Set(['alpha']),
      }),
    );
    expect(html).toContain('aria-pressed="true" aria-label="Pin for comparison: Alpha game"');
    expect(html).toContain('aria-pressed="false" aria-label="Pin for comparison: Beta game"');
    expect(onAction).not.toHaveBeenCalled();
  });
  it('mounts one optional drag slot per record beside Pin in each mounted editor, never inside a button', () => {
    const renderDragHandle = vi.fn((record: LibraryRecord) =>
      h('button', { type: 'button', 'data-compare-drag': record.id }, 'Drag to tray'),
    );
    const html = renderToStaticMarkup(
      h(MyGamesPage, {
        ...props,
        scope: 'guest',
        view: 'queue',
        onViewChange: vi.fn(),
        onPin: vi.fn(),
        renderDragHandle,
      }),
    );
    // An unvisited Ranking pane renders no rows, so the queue view mounts only its own slots.
    expect(html.match(/data-compare-drag="/g)).toHaveLength(2);
    expect(renderDragHandle.mock.calls.map(([record]) => record.id)).toEqual(['beta', 'alpha']);
    expect(html).toContain('Drag Beta game to reorder your queue');
    expect(html).not.toContain('reorder your ranking');
    const ranking = renderToStaticMarkup(
      h(MyGamesPage, {
        ...props,
        scope: 'guest',
        view: 'ranking',
        onViewChange: vi.fn(),
        onPin: vi.fn(),
        renderDragHandle,
      }),
    );
    expect(ranking.match(/data-compare-drag="/g)).toHaveLength(3);
    // Library rows (hidden, in Library order) plus the now-visited Ranking row.
    expect(
      renderDragHandle.mock.calls
        .slice(2)
        .map(([record]) => record.id)
        .sort(),
    ).toEqual(['alpha', 'alpha', 'beta']);
    expect(ranking).toContain('Drag Alpha game to reorder your ranking');
    expect(ranking).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
    expect(html).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
    const legacy = renderToStaticMarkup(h(LibraryPage, props));
    expect(legacy).not.toContain('data-compare-drag');
  });
});

describe('tray and image rendering contract', () => {
  const value = {
    currentScope: 'guest',
    items: [alpha],
    persistent: true,
    warning: null,
    error: null,
    status: '',
    dragging: false,
    pin: vi.fn(() => true),
    unpin: vi.fn(() => true),
    clear: vi.fn(() => true),
    dismissError: vi.fn(),
    beginDrag: vi.fn(() => null),
    cancelDrag: vi.fn(),
    dropGame: vi.fn(() => true),
  };
  it.each([false, true])('keeps full and compact pin names stable with pressed=%s', (pinned) => {
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(
        h(
          CompareTrayContext.Provider,
          { value: { ...value, items: pinned ? [alpha] : [] } },
          h(ComparePinButton, { record: alpha, compact }),
        ),
      );
      expect(html).toContain(`aria-pressed="${pinned}" aria-label="Pin for comparison: Alpha game"`);
      if (compact) expect(html).toContain('title="Pin for comparison"');
      else expect(html).not.toContain('title=');
      expect(html).toContain(`fill="${pinned ? 'currentColor' : 'none'}"`);
      if (!compact) expect(html).toContain('</svg>Pin for comparison</button>');
    }
  });

  it.each([undefined, 'collection', 'games', 'discover'] as const)(
    'limits contextual compaction to a supplied non-collection page (%s)',
    (page) => {
      const html = renderToStaticMarkup(
        h(CompareTrayContext.Provider, { value }, h(CompareTray, { page, onCompare: vi.fn() })),
      );
      expect(html).toContain(`data-compact="${page !== undefined && page !== 'collection'}"`);
      expect(html).toContain('Compare tray');
    },
  );
  it('exposes button and keyboard-native pin controls, a dock and an explicitly named chooser', () => {
    const html = renderToStaticMarkup(
      h(
        CompareTrayContext.Provider,
        { value },
        h(ComparePinButton, { record: alpha }),
        h(CompareTray, { onCompare: vi.fn() }),
      ),
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="true" aria-label="Pin for comparison: Alpha game"');
    expect(html).toContain('compare-tray-reserve');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('Choose friends');
    expect(html).toContain('>Compare rankings <span class="compare-tray-action-context">with friends</span>');
    expect(html).toContain('aria-label="Compare rankings with friends"');
    expect(html).toContain('Pinning does not save, rate or share a game.');
  });
  it('does not show an empty persistent dock or a dock behind another active dialog', () => {
    for (const hidden of [true, false]) {
      const html = renderToStaticMarkup(
        h(
          CompareTrayContext.Provider,
          { value: { ...value, items: hidden ? [alpha] : [] } },
          h(CompareTray, { hidden, onCompare: vi.fn() }),
        ),
      );
      expect(html).not.toContain('<aside');
      expect(html).not.toContain('compare-tray-reserve');
    }
  });
  it('uses one inline table surface without the fixed-dock end reserve', () => {
    const html = renderToStaticMarkup(
      h(
        CompareTrayContext.Provider,
        { value },
        h(CompareTray, { page: 'collection', layout: 'inline', onCompare: vi.fn() }),
      ),
    );
    expect(html.match(/<aside\b/g)).toHaveLength(1);
    expect(html).toContain('data-layout="inline"');
    expect(html).not.toContain('compare-tray-reserve');
    expect(html).toContain('Compare rankings');
    expect(html).toContain('aria-haspopup="dialog"');
  });
  it('offers an optional semantic handle and a drop target even before the first pin', () => {
    const html = renderToStaticMarkup(
      h(
        CompareTrayContext.Provider,
        { value: { ...value, items: [], dragging: true } },
        h(CompareDragHandle, { record: alpha }),
        h(CompareTray, { onCompare: vi.fn() }),
      ),
    );
    expect(html).toContain('aria-label="Drag to tray: Alpha game, or click to pin for comparison"');
    expect(html).not.toContain('title="Drag with a mouse, or click to pin"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('data-dragging="true"');
    expect(html).toContain('data-has-content="false"');
    expect(html).not.toContain('compare-tray-reserve');
    expect(html).toContain('Drop to pin for comparison');
    expect(html).toContain('data-compare-drag-grip=""');
  });
  it('removes the duplicate coarse Compare handle from layout, focus and the accessibility tree', () => {
    const html = renderToStaticMarkup(
      h(
        CompareTrayContext.Provider,
        { value },
        h(
          MotionPolicyContext.Provider,
          { value: { ...staticMotionPolicy, coarsePointer: true } },
          h(CompareDragHandle, { record: alpha }),
        ),
      ),
    );
    expect(html).toContain('aria-label="Pin to tray: Alpha game"');
    expect(html).toContain('>Pin to tray');
    expect(html).not.toContain('Drag to tray');
    expect(html).not.toContain('drag with a mouse');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
  });
  it('keeps the compact grip pointer-only on every pointer type', () => {
    for (const coarsePointer of [false, true]) {
      const html = renderToStaticMarkup(
        h(
          CompareTrayContext.Provider,
          { value },
          h(
            MotionPolicyContext.Provider,
            { value: { ...staticMotionPolicy, coarsePointer } },
            h(CompareDragHandle, { record: alpha, compact: true }),
          ),
        ),
      );
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('tabindex="-1"');
      expect(html).toContain('title="Drag to tray"');
      expect(html).not.toContain('aria-label=');
      expect(html).not.toContain('or drag with a mouse');
      expect(html).not.toContain('to the Compare tray');
    }
  });
  it.each([true, false])('includes the visible tray label in the opener name (persistent=%s)', (persistent) => {
    const html = renderToStaticMarkup(
      h(CompareTrayContext.Provider, { value: { ...value, persistent } }, h(CompareTray, { onCompare: vi.fn() })),
    );
    expect(html).toContain(`aria-label="Open ${persistent ? 'Compare tray' : 'Temporary tray'}, 1 game"`);
    // Label in Name (WCAG 2.5.3): visible label, a real space, then the count, in the same order as the name.
    expect(html).toContain(
      `<span><span>${persistent ? 'Compare tray' : 'Temporary tray'}</span> <strong>1 game</strong></span>`,
    );
  });
  it('retains the compact collection state for real pins and storage messages while dragging', () => {
    for (const content of [
      { items: [alpha], warning: null, error: null },
      { items: [], warning: 'Pins stay in this tab only.', error: null },
      { items: [], warning: null, error: 'The pinned game is invalid.' },
    ]) {
      for (const dragging of [false, true]) {
        const html = renderToStaticMarkup(
          h(
            CompareTrayContext.Provider,
            { value: { ...value, ...content, dragging } },
            h(CompareTray, { onCompare: vi.fn() }),
          ),
        );
        expect(html).toContain('data-has-content="true"');
        expect(html).toContain(`data-dragging="${dragging}"`);
        // An icon-only status mark is a named image, not a label on a generic span.
        if (content.warning)
          expect(html).toContain(
            'class="compare-tray-storage-mark" role="img" aria-label="Tray storage needs attention" title="Open the tray to review its storage warning"',
          );
        else expect(html).not.toContain('compare-tray-storage-mark');
      }
    }
  });
  it('keeps a source inert without a source provider and adds no wrapper DOM', () => {
    const html = renderToStaticMarkup(
      h(CompareDragSource, {
        record: alpha,
        children: (binding) =>
          h(
            'div',
            { ...binding.surfaceProps, ref: binding.sourceRef, className: 'existing-row' },
            h('button', { type: 'button', ...binding.titleProps }, alpha.title),
          ),
      }),
    );
    expect(html).toBe('<div class="existing-row"><button type="button">Alpha game</button></div>');
  });
  it('loads only local artwork and exposes fixed dimensions and lazy loading', () => {
    const artwork = {
      src: `/images/discovery/${'a'.repeat(64)}.webp`,
      width: 120,
      height: 80,
      alt: '',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.webp',
      credit: 'Example creator',
      license: 'CC BY',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    };
    const html = renderToStaticMarkup(h(GameArtwork, { record: alpha, artwork }));
    expect(html).toContain(artwork.src);
    expect(html).toContain('width="120" height="80"');
    expect(html).toContain('loading="lazy"');
    const fallback = renderToStaticMarkup(
      h(GameArtwork, {
        record: { ...beta, source: 'manual' },
        artwork: { ...artwork, src: 'https://untrusted.example/image.webp' },
      }),
    );
    expect(fallback).not.toContain('<img');
    expect(fallback).toContain('No artwork available');
  });
});

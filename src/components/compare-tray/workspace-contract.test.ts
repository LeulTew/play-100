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
import { CompareTrayContext } from './compare-tray-context';

const alpha: LibraryRecord = { id: 'alpha', source: 'collection', sourceId: 'alpha', title: 'Alpha game', year: 2020, collectionRank: 1, sourceUrl: null, studio: null, genre: null };
const beta: LibraryRecord = { ...alpha, id: 'beta', sourceId: 'beta', title: 'Beta game', collectionRank: 2 };
const state: PersonalLibraryState = {
  ...emptyPersonalLibrary(),
  records: { alpha, beta },
  progress: { alpha: { played: true, completed: true, later: true }, beta: { played: false, completed: false, later: true } },
  queueOrder: ['beta', 'alpha'],
  ranking: [{ id: 'alpha', note: 'A private note', score: 7, manualPosition: 1 }],
};
const filters: Filters = { q: '', genre: 'all', year: 'all', tier: 'all', list: 'all', sort: 'rank', view: 'grid', direction: 'auto', catalogs: 'on' };
const props = {
  state, filters, busy: false, animate: false, onFilters: vi.fn(), onAction: vi.fn(async () => true),
  onOpen: vi.fn(), onDiscover: vi.fn(), onBrowse: vi.fn(), availableRecords: [alpha, beta], persistent: true,
};

describe('workspace embedding contract', () => {
  it('retains standalone Library and Ranking headings and their existing controls', () => {
    const library = renderToStaticMarkup(h(LibraryPage, props));
    expect(library).toContain('>My library</h1>');
    expect(library).toContain('Personal library views');
    expect(library).toContain('Remove Alpha game from my library');
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
    const completed = renderToStaticMarkup(h(LibraryPage, { ...props, embedded: true, workspaceView: 'queue', completedOnly: true }));
    expect(completed).not.toContain('Beta game');
    expect(completed).toContain('Alpha game');
    expect(completed).toContain('Clear search, progress filters and selection to reorder.');
    expect(completed).toContain('disabled=""');
  });
  it('keeps both editor trees present but hides the inactive one without nested page headings', () => {
    for (const view of ['library', 'queue', 'ranking'] as const) {
      const html = renderToStaticMarkup(h(MyGamesPage, { ...props, scope: 'guest', view, onViewChange: vi.fn() }));
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain('>My games</h1>');
      expect(html).toContain('aria-label="My games views"');
      expect(html).toContain('class="filter-select progress-filter"');
      expect(html).toContain('Played (not completed)');
      expect(html).toContain('A private note');
      expect(html).toContain('Add a game manually');
      expect(html.match(/<div hidden=""/g)).toHaveLength(1);
      expect(html).not.toContain('Personal library views');
    }
  });
  it('embeds metadata-only pins without enabling any personal action', () => {
    const onAction = vi.fn(async () => true);
    const html = renderToStaticMarkup(h(MyGamesPage, { ...props, onAction, scope: 'guest', view: 'library', onViewChange: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), pinnedIds: new Set(['alpha']) }));
    expect(html).toContain('Unpin Alpha game from comparison');
    expect(html).toContain('Pin Beta game for comparison');
    expect(onAction).not.toHaveBeenCalled();
  });
  it('mounts one optional drag slot per record beside Pin in both editors, never inside a button', () => {
    const renderDragHandle = vi.fn((record: LibraryRecord) => h('button', { type: 'button', 'data-compare-drag': record.id }, 'Drag to tray'));
    const html = renderToStaticMarkup(h(MyGamesPage, { ...props, scope: 'guest', view: 'queue', onViewChange: vi.fn(), onPin: vi.fn(), renderDragHandle }));
    expect(html.match(/data-compare-drag="/g)).toHaveLength(3);
    expect(renderDragHandle.mock.calls.map(([record]) => record.id)).toEqual(['beta', 'alpha', 'alpha']);
    expect(html).toContain('Drag Beta game to reorder your queue');
    expect(html).toContain('Drag Alpha game to reorder your ranking');
    expect(html).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
    const legacy = renderToStaticMarkup(h(LibraryPage, props));
    expect(legacy).not.toContain('data-compare-drag');
  });
});

describe('tray and image rendering contract', () => {
  const value = { currentScope: 'guest', items: [alpha], persistent: true, warning: null, error: null, status: '', dragging: false, pin: vi.fn(() => true), unpin: vi.fn(() => true), clear: vi.fn(() => true), beginDrag: vi.fn(() => null), cancelDrag: vi.fn(), dropGame: vi.fn(() => true) };
  it('exposes button and keyboard-native pin controls, a dock and an explicitly named chooser', () => {
    const html = renderToStaticMarkup(h(CompareTrayContext.Provider, { value }, h(ComparePinButton, { record: alpha }), h(CompareTray, { onCompare: vi.fn() })));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Unpin Alpha game from comparison');
    expect(html).toContain('compare-tray-reserve');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('Choose friends');
    expect(html).toContain('Pinning does not save, rate or share a game.');
  });
  it('does not show an empty persistent dock or a dock behind another active dialog', () => {
    for (const hidden of [true, false]) {
      const html = renderToStaticMarkup(h(CompareTrayContext.Provider, { value: { ...value, items: hidden ? [alpha] : [] } }, h(CompareTray, { hidden, onCompare: vi.fn() })));
      expect(html).not.toContain('<aside');
      expect(html).not.toContain('compare-tray-reserve');
    }
  });
  it('offers an optional semantic handle and a drop target even before the first pin', () => {
    const html = renderToStaticMarkup(h(CompareTrayContext.Provider, { value: { ...value, items: [], dragging: true } }, h(CompareDragHandle, { record: alpha }), h(CompareTray, { onCompare: vi.fn() })));
    expect(html).toContain('Pin Alpha game for comparison, or drag to the tray');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('data-dragging="true"');
    expect(html).toContain('Drop to pin for comparison');
  });
  it('loads only local artwork and exposes fixed dimensions and lazy loading', () => {
    const artwork = { src: `/images/discovery/${'a'.repeat(64)}.webp`, width: 120, height: 80, alt: '', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.webp', credit: 'Example creator', license: 'CC BY', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' };
    const html = renderToStaticMarkup(h(GameArtwork, { record: alpha, artwork }));
    expect(html).toContain(artwork.src);
    expect(html).toContain('width="120" height="80"');
    expect(html).toContain('loading="lazy"');
    const fallback = renderToStaticMarkup(h(GameArtwork, { record: { ...beta, source: 'manual' }, artwork: { ...artwork, src: 'https://untrusted.example/image.webp' } }));
    expect(fallback).not.toContain('<img');
    expect(fallback).toContain('No artwork available');
  });
});

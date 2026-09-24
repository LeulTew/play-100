import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { FriendShelfCards, FriendShelfEditor } from '../cloud/FriendShelf';
import { emptyPersonalLibrary } from './personal-library';
import type { FriendShelfEntry, FriendShelfConfig } from './friend-shelf-types';

const entry: FriendShelfEntry = {
  id: 'manual:saved',
  title: 'Added <game>',
  year: 2020,
  source: 'manual',
  sourceId: 'saved',
  sourceUrl: null,
};
const config: FriendShelfConfig = {
  format: 1,
  enabled: true,
  deleted: false,
  consentSyncEpoch: 1,
  selectedIds: [entry.id],
  epoch: 2,
  revision: 2,
  updatedAt: 1000,
};
const avatar = { version: 1 as const, seed: 'b'.repeat(32), palette: 'moss' as const };
it('renders metadata-only unranked game cards, with Save/Pin but no invented scores or positions', () => {
  const html = renderToStaticMarkup(
    createElement(FriendShelfCards, { entries: [entry], status: 'ready', onSave: vi.fn(), onPin: vi.fn() }),
  );
  expect(html).toContain('Added &lt;game&gt;');
  expect(html).toContain('2020');
  expect(html).toContain('Manual addition');
  expect(html).toContain('>Save<');
  expect(html).toContain('>Pin<');
  expect(html).not.toMatch(/Unrated|score|position|<ol|<img/);
});
it('does not render stale entries while access is loading or denied', () => {
  for (const status of ['loading', 'unavailable'] as const) {
    const html = renderToStaticMarkup(
      createElement(FriendShelfCards, { entries: [entry], status, onSave: vi.fn(), onPin: vi.fn() }),
    );
    expect(html).not.toContain('Added &lt;game&gt;');
    expect(html).not.toContain('>Save<');
  }
});
it('keeps initial selection off, bounds rendered choices and does not mutate during render', () => {
  const state = emptyPersonalLibrary();
  for (let i = 0; i < 205; i += 1)
    state.records[`manual:g${i}`] = {
      ...entry,
      id: `manual:g${i}`,
      sourceId: `g${i}`,
      studio: null,
      genre: null,
      collectionRank: null,
    };
  const onPrepare = vi.fn();
  const onSave = vi.fn();
  const onStop = vi.fn();
  const html = renderToStaticMarkup(
    createElement(FriendShelfEditor, {
      state,
      games: [],
      config: null,
      identity: { displayName: 'Chosen name', avatar },
      connected: true,
      status: 'off',
      error: '',
      onPrepare,
      onSave,
      onStop,
      onRetry: vi.fn(),
    }),
  );
  expect(html.match(/type="checkbox"/g)).toHaveLength(50);
  expect(html).not.toMatch(/checked=""/);
  expect(html).toContain('0 / 200 selected');
  expect(html).toContain('Preview shared games');
  expect(html).not.toContain('Share these games');
  expect(onPrepare).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  expect(onStop).not.toHaveBeenCalled();
});
it('leaves Stop sharing available when private saving is paused, without offering a new selection', () => {
  const html = renderToStaticMarkup(
    createElement(FriendShelfEditor, {
      state: emptyPersonalLibrary(),
      games: [],
      config,
      identity: { displayName: 'Chosen name', avatar },
      connected: false,
      status: 'paused',
      error: '',
      onPrepare: vi.fn(),
      onSave: vi.fn(),
      onStop: vi.fn(),
      onRetry: vi.fn(),
    }),
  );
  expect(html).toContain('Stop sharing');
  expect(html).not.toContain('Preview shared games');
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryRecord } from '../../lib/personal-types';
import { emptyPersonalLibrary } from '../../lib/personal-library';
import { RemoveGamesDialog } from './RemoveGamesDialog';

const records: LibraryRecord[] = ['alpha', 'beta'].map((sourceId) => ({
  id: `manual:${sourceId}`,
  source: 'manual',
  sourceId,
  title: `Synthetic ${sourceId}`,
  year: null,
  studio: null,
  genre: null,
  collectionRank: null,
  sourceUrl: null,
}));

function render(selected: LibraryRecord[], remaining = selected, ranked = remaining) {
  return renderToStaticMarkup(
    createElement(RemoveGamesDialog, {
      records: selected,
      state: {
        ...emptyPersonalLibrary(),
        records: Object.fromEntries(remaining.map((record) => [record.id, record])),
        ranking: ranked.map((record) => ({ id: record.id, score: null, note: '', manualPosition: null })),
      },
      busy: false,
      onClose: vi.fn(),
      onRemove: vi.fn(async () => true),
    }),
  );
}

describe('private library removal copy', () => {
  it('uses singular consequences and cancellation for one remaining game', () => {
    const html = render(records.slice(0, 1));
    expect(html).toContain('Remove this game?</h2>');
    expect(html).toContain(
      'its saved entry, Play later position, Played and Completed marks, personal rating and note',
    );
    expect(html).toContain('Keep game</button>');
    expect(html).not.toContain('Keep games');
    expect(html).toContain('Remove 1 game</button>');
    expect(html).toContain('This cannot be undone.');
    expect(html).toContain('choose Keep game and export a backup from Settings first.');
    expect(html).toContain('This also removes 1 game from your ranking. Games below move up.');
  });

  it('preserves plural consequences and cancellation for multiple games', () => {
    const html = render(records);
    expect(html).toContain('Remove 2 games?</h2>');
    expect(html).toContain(
      'their saved entries, Play later positions, Played and Completed marks, personal ratings and notes',
    );
    expect(html).toContain('Keep games</button>');
    expect(html).toContain('Remove 2 games</button>');
    expect(html).toContain('choose Keep games and export a backup from Settings first.');
    expect(html).toContain('This also removes 2 games from your ranking. Games below move up.');
  });

  it('uses the remaining count when another client removed one selected game', () => {
    const html = render(records, records.slice(0, 1));
    expect(html).toContain('Remove this game?</h2>');
    expect(html).toContain('its saved entry');
    expect(html).toContain('Keep game</button>');
    expect(html).not.toContain('Synthetic beta');
    expect(html).toContain('This also removes 1 game from your ranking.');
  });

  it('counts only selected games that are ranked, not the whole library or selection', () => {
    const html = render(records, records, records.slice(0, 1));
    expect(html).toContain('Remove 2 games?</h2>');
    expect(html).toContain('This also removes 1 game from your ranking. Games below move up.');
  });

  it('does not claim a ranking change for an unranked selection', () => {
    const html = render(records.slice(0, 1), records, records.slice(1));
    expect(html).not.toContain('from your ranking');
    expect(html).not.toContain('Games below move up');
  });

  it('preserves the already-removed state without a destructive action', () => {
    const html = render(records, []);
    expect(html).toContain('Already removed.</h2>');
    expect(html).toContain('These games are no longer in your private library. No other games will be removed.');
    expect(html).toContain('Close</button>');
    expect(html).not.toContain('Keep game');
    expect(html).not.toContain('button-danger');
    expect(html).not.toContain('This cannot be undone.');
    expect(html).not.toContain('from your ranking');
  });
});

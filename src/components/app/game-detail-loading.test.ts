import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { parseCollection } from '../../lib/collection';
import { loadCatalogDetail, peekCatalogDetail } from '../../lib/catalog-detail-preload';
import { emptyPersonalLibrary } from '../../lib/personal-library';
import { defaultFilters } from '../../lib/url';
import { DialogHost } from './DialogHost';
import type { DialogHostProps } from './DialogHost';

const { games } = parseCollection(
  JSON.parse(readFileSync(new URL('../../../data/collection.json', import.meta.url), 'utf8')),
);
const game = games[0]!;

function host(): DialogHostProps {
  return {
    page: 'collection',
    scope: 'guest',
    game: {
      key: `guest:${game.slug}`,
      props: {
        game,
        state: undefined,
        onClose: vi.fn(),
        onOpen: vi.fn(),
        onToggle: vi.fn(),
        onShare: vi.fn(),
        shareFeedback: '',
        personalRating: null,
        onRate: vi.fn(async () => true),
      },
      navigation: {
        scoped: false,
        filters: defaultFilters,
        games,
        state: emptyPersonalLibrary(),
        ownership: new Map(),
      },
    },
    catalog: null,
    loadingGame: false,
    canonicalError: null,
    missingGame: false,
    onCloseGame: vi.fn(),
    menu: null,
    about: null,
    settings: null,
    manualShare: null,
  };
}

// The 100's game detail ships in the catalog detail's chunk, not the eager bundle (DialogHost.tsx).
describe('a game detail outside the eager bundle', () => {
  it('waits for its module, then renders in its first commit once the module has loaded', async () => {
    expect(peekCatalogDetail()).toBeNull();
    expect(renderToStaticMarkup(createElement(DialogHost, host()))).not.toContain(game.title);
    await loadCatalogDetail();
    expect(renderToStaticMarkup(createElement(DialogHost, host()))).toContain(game.title);
  });
});

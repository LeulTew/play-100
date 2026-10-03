import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { discoveryFixture } from '../lib/discovery-test-fixtures';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { LibraryStateKnownContext, pressedState } from '../lib/library-state';
import { parseCollection } from '../lib/collection';
import { defaultFilters } from '../lib/url';
import { GameCard } from './GameCard';
import { GameDetail } from './GameDetail';
import { CompletedToggle } from './CompletedToggle';
import { PlayedToggle } from './PlayedToggle';
import { DiscoveryCard } from './catalog/DiscoveryCard';

const raw: unknown = JSON.parse(readFileSync(new URL('../../data/collection.json', import.meta.url), 'utf8'));
const game = parseCollection(raw).games[1];
if (!game) throw new Error('Missing collection fixture');
const stored = { played: true, completed: true, later: true };

function render(known: boolean, node: ReactNode) {
  return renderToStaticMarkup(h(LibraryStateKnownContext, { value: known }, node));
}

function controls(html: string, pattern: RegExp) {
  const found = html.match(/<(?:button|input)\b[^>]*>/g)?.filter((tag) => pattern.test(tag)) ?? [];
  if (found.length === 0) throw new Error(`No control matches ${String(pattern)}`);
  return found;
}

function control(html: string, pattern: RegExp) {
  const [found] = controls(html, pattern);
  if (!found || controls(html, pattern).length > 1) throw new Error(`Expected one control for ${String(pattern)}`);
  return found;
}

const surfaces: [string, () => ReactNode, RegExp[]][] = [
  [
    'game card',
    () =>
      h(GameCard, {
        game,
        filters: defaultFilters,
        state: stored,
        busy: true,
        onOpen: vi.fn(),
        onSave: vi.fn(),
        onPlayed: vi.fn(),
        onCompleted: vi.fn(),
      }),
    [/aria-label="Play later: /, /aria-label="Completed: /],
  ],
  [
    'game detail',
    () =>
      h(GameDetail, {
        game,
        state: stored,
        busy: true,
        previous: undefined,
        next: undefined,
        position: { current: 1, total: 1 },
        onClose: vi.fn(),
        onOpen: vi.fn(),
        onToggle: vi.fn(),
        onShare: vi.fn(),
        shareFeedback: '',
        personalRating: null,
        onRate: vi.fn(async () => true),
      }),
    [/class="button button-lime"/],
  ],
  [
    'discovery card',
    () =>
      h(DiscoveryCard, {
        record: discoveryFixture.record,
        state: {
          ...emptyPersonalLibrary(),
          progress: { [discoveryFixture.record.id]: stored },
        },
        busy: true,
        pinned: false,
        onPin: vi.fn(),
        onAction: vi.fn(async () => true),
      }),
    [/aria-label="Play later: /, /aria-label="Completed: /],
  ],
];

describe('library toggles while the stored state is unknown (A11Y-009)', () => {
  it('maps the state to the APG toggle attributes', () => {
    expect(pressedState(true, true)).toEqual({ 'aria-pressed': true });
    expect(pressedState(true, false)).toEqual({ 'aria-pressed': false });
    expect(pressedState(false, true)).toEqual({ 'aria-busy': true });
    expect(pressedState(false, false)).toEqual({ 'aria-busy': true });
  });

  it.each(surfaces)('%s claims no pressed state while loading, then the stored one', (_, surface, patterns) => {
    const loading = render(false, surface());
    const loaded = render(true, surface());
    for (const pattern of patterns) {
      const before = controls(loading, pattern);
      const after = controls(loaded, pattern);
      expect(before).toHaveLength(after.length);
      for (const tag of before) {
        expect(tag).not.toContain('aria-pressed');
        expect(tag).toContain('aria-busy="true"');
        expect(tag).toContain('aria-disabled="true"');
      }
      for (const tag of after) {
        expect(tag).toContain('aria-pressed="true"');
        expect(tag).not.toContain('aria-busy');
      }
    }
  });

  it('marks the Completed and Played controls busy instead of not pressed or unchecked', () => {
    const toggles = (known: boolean) =>
      render(
        known,
        h('div', null, [
          h(CompletedToggle, { key: 'c', title: 'Game', completed: true, busy: true, onChange: vi.fn() }),
          h(PlayedToggle, { key: 'p', id: 'game', title: 'Game', played: true, busy: true, onChange: vi.fn() }),
        ]),
      );
    const loading = toggles(false);
    expect(control(loading, /Completed: Game/)).not.toContain('aria-pressed');
    expect(control(loading, /Completed: Game/)).toContain('aria-busy="true"');
    expect(control(loading, /Played: Game/)).toContain('aria-busy="true"');
    const loaded = toggles(true);
    expect(control(loaded, /Completed: Game/)).toContain('aria-pressed="true"');
    expect(control(loaded, /Played: Game/)).not.toContain('aria-busy');
    expect(control(loaded, /Played: Game/)).toContain('checked=""');
  });

  it('routes every library Play later and Completed toggle through the shared state', () => {
    for (const file of [
      './GameCard.tsx',
      './GameDetail.tsx',
      './CompletedToggle.tsx',
      './catalog/DiscoveryCard.tsx',
      './personal/CatalogDetail.tsx',
      './personal/LibraryRecordRow.tsx',
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/aria-pressed=\{/);
    }
  });
});

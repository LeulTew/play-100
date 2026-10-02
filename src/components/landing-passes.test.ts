import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { parseCollection } from '../lib/collection';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { defaultFilters } from '../lib/url';
import CollectionPage from './CollectionPage';
import { FIRST_PASS_CARDS, firstPassSettled, rendersAtOnce, scheduleSecondPass } from './landing-passes';

const data = parseCollection(JSON.parse(readFileSync(new URL('../../data/collection.json', import.meta.url), 'utf8')));

/** The landing's first commit, as a static render shows it: no effect, so no second pass, has run. */
function firstCommit(constrained: boolean, failed = false) {
  return renderToStaticMarkup(
    createElement(CollectionPage, {
      collection: failed
        ? { status: 'error', data: null, error: 'The collection request failed (503).', retry: vi.fn() }
        : { status: 'ready', data, error: null, retry: vi.fn() },
      state: emptyPersonalLibrary(),
      filters: defaultFilters,
      busy: false,
      motion: 'lite',
      motionPending: false,
      animate: false,
      reducedMotion: false,
      coarsePointer: false,
      constrained,
      onFilters: vi.fn(),
      onAction: vi.fn(async () => true),
      onOpen: vi.fn(),
      onPreview: vi.fn(),
      onShare: vi.fn(),
      onFullLibrary: vi.fn(),
      notify: vi.fn(),
    }),
  );
}

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;
const cards = /<li[^>]* class="game-card[ "]/g;
const reserves = /<li class="game-card-reserve" aria-hidden="true"><\/li>/g;

describe('landing passes', () => {
  it('renders a constrained device’s landing in two passes, except for a traversal or a link to the films', () => {
    expect(rendersAtOnce({ constrained: false, navigation: 'app', filmsLinked: false })).toBe(true);
    expect(rendersAtOnce({ constrained: true, navigation: 'load', filmsLinked: false })).toBe(false);
    expect(rendersAtOnce({ constrained: true, navigation: 'app', filmsLinked: false })).toBe(false);
    // The browser restores a back or forward visit's scroll position into the cards, so they must all be there.
    expect(rendersAtOnce({ constrained: true, navigation: 'traverse', filmsLinked: false })).toBe(true);
    expect(rendersAtOnce({ constrained: true, navigation: 'load', filmsLinked: true })).toBe(true);
  });

  it('first renders the first cards and holds every other card’s place and the showcase’s', () => {
    const html = firstCommit(true);
    expect(count(html, cards)).toBe(FIRST_PASS_CARDS);
    expect(count(html, reserves)).toBe(24 - FIRST_PASS_CARDS);
    // Each reserve keeps its card's key and place: the second pass only replaces reserves.
    expect(html.indexOf('game-card-reserve')).toBeGreaterThan(html.lastIndexOf('data-game='));
    expect(html).toContain('<div class="first-paint-reserve" aria-hidden="true"></div>');
    expect(html).not.toContain('workbook-section');
    // The count and the next page are the whole view's, as before.
    expect(html).toContain('Show 24 more');
  });

  it('renders every card and the showcase at once on a capable device', () => {
    const html = firstCommit(false);
    expect(count(html, cards)).toBe(24);
    expect(count(html, reserves)).toBe(0);
    expect(html).toContain('workbook-section');
    expect(html).not.toContain('first-paint-reserve');
  });

  it('schedules the second pass after the next paint and can cancel it', () => {
    let scheduled: (() => void) | undefined;
    const cancel = vi.fn();
    const schedule = vi.fn((run: () => void) => {
      scheduled = run;
      return cancel;
    });
    const run = vi.fn();
    expect(scheduleSecondPass(run, schedule)).toBe(cancel);
    expect(run).not.toHaveBeenCalled();
    scheduled?.();
    expect(run).toHaveBeenCalledOnce();
  });

  // A failed load's first pass is its notice. The showcase, with the workbook downloads, must still follow it, not stay
  // a screen-high reserve.
  it('starts the second pass once the cards or a failed load’s notice have rendered', () => {
    expect(firstPassSettled('loading')).toBe(false);
    expect(firstPassSettled('ready')).toBe(true);
    expect(firstPassSettled('error')).toBe(true);
    const html = firstCommit(true, true);
    expect(html).toContain('The collection couldn&#x27;t load.');
    expect(html).toContain('<div class="first-paint-reserve" aria-hidden="true"></div>');
    expect(firstCommit(false, true)).toContain('workbook-section');
  });
});

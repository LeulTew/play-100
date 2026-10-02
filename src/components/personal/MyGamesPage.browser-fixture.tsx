import { createElement as h, Profiler, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../../lib/browser-fixture';
import type { LibraryRecord, PersonalLibraryState } from '../../lib/personal-types';
import type { Filters } from '../../lib/types';
import type { MyGamesView } from './MyGamesPage';
import MyGamesPage from './MyGamesPage.tsx';
import { registerPendingEditor } from '../../hooks/useExitSave.ts';
import { applyPersonalAction, emptyPersonalLibrary } from '../../lib/personal-library.ts';
import { hasUnsubmittedPwaForm } from '../../lib/pwa-update-guard.ts';
import '../../styles.css';
import '../../shared-ui.css';
const params = new URLSearchParams(location.search);
const record = (id: string, title: string, collectionRank: number): LibraryRecord => ({
  id,
  source: 'collection',
  sourceId: id,
  title,
  year: 2020,
  collectionRank,
  sourceUrl: null,
  studio: null,
  genre: null,
});
const alpha = record('alpha', params.has('short-title') ? 'Halo 3' : 'Alpha game', 1);
const beta = record('beta', 'Beta game', 2);
// ?records=N adds N games added by the user; their titles sort after the two collection games.
const added = Object.fromEntries(
  Array.from({ length: Number(params.get('records') ?? 0) }, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    return [
      'manual:' + number,
      {
        id: 'manual:' + number,
        source: 'manual',
        sourceId: number,
        title: 'Game ' + number,
        year: 2020,
        collectionRank: null,
        sourceUrl: null,
        studio: null,
        genre: null,
      } satisfies LibraryRecord,
    ];
  }),
);
const initial: PersonalLibraryState = {
  ...emptyPersonalLibrary(),
  records: { alpha, beta, ...added },
  ranking: [
    { id: 'alpha', note: 'Saved note', score: 7, manualPosition: null },
    { id: 'beta', note: '', score: 5, manualPosition: null },
  ],
};
if (params.has('moves')) {
  const ids = Object.keys(initial.records);
  initial.queueOrder = params.has('queue-count') ? ids.slice(0, Number(params.get('queue-count'))) : ids;
  initial.progress = Object.fromEntries(
    ids.map((id) => [id, { later: initial.queueOrder.includes(id), played: false, completed: false }]),
  );
  initial.ranking = ids.map((id) => ({ id, note: '', score: null, manualPosition: null }));
}
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
const exits: string[] = [],
  saves: string[] = [];
let accept = false;
class MoveControl {
  held = false;
  count = 0;
  pending: ((saved: boolean) => void) | null = null;
  request(): Promise<boolean> {
    this.count += 1;
    return this.held
      ? new Promise((resolve) => {
          this.pending = resolve;
        })
      : Promise.resolve(true);
  }
  hold() {
    this.held = true;
  }
  finish(saved: boolean) {
    if (!this.pending) throw new Error('There is no held move.');
    const resolve = this.pending;
    this.pending = null;
    resolve(saved);
  }
}
const moves = new MoveControl();
const queueRemovals = new MoveControl();
// ?probe counts render commits and records every layout-reading call between arm() and the frame after the next click.
type PagingTurn = Awaited<ReturnType<Window['myGamesPaging']['settled']>>;
const probe: { armed: boolean; commits: number; reads: PagingTurn['reads']; done: Promise<PagingTurn> | null } = {
  armed: false,
  commits: 0,
  reads: [],
  done: null,
};
const firstRow = () =>
  document.querySelector('ul[aria-label="Your games"] > .personal-row-static')?.getAttribute('data-record-id') ?? null;
if (params.has('probe')) {
  // DOM writes since the last read: delivered records are counted too, since delivery empties takeRecords().
  let written = 0;
  const writes = new MutationObserver((records) => {
    written += records.length;
  });
  writes.observe(fixtureElement('mount'), { subtree: true, childList: true, attributes: true, characterData: true });
  const pending = () => {
    const count = written + writes.takeRecords().length;
    written = 0;
    return count;
  };
  const note = (api: string, target: unknown) => {
    if (probe.armed)
      probe.reads.push({
        api,
        target: target instanceof Element ? (target.textContent ?? '').trim().slice(0, 40) : null,
        dirty: pending() > 0,
        row: firstRow(),
      });
  };
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (...args) {
    note('focus', this);
    return focus.apply(this, args);
  };
  const scrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) {
    note('scrollIntoView', this);
    return scrollIntoView.apply(this, args);
  };
  const getBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (...args) {
    note('getBoundingClientRect', this);
    return getBoundingClientRect.apply(this, args);
  };
  const getClientRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = function (...args) {
    note('getClientRects', this);
    return getClientRects.apply(this, args);
  };
  const computedStyle = window.getComputedStyle;
  window.getComputedStyle = function (...args) {
    note('getComputedStyle', args[0]);
    return computedStyle.apply(this, args);
  };
  window.myGamesPaging = {
    arm() {
      pending();
      Object.assign(probe, { armed: true, commits: 0, reads: [] });
      // The frame after the click runs once its task, React's commit and the effects it flushes are done.
      probe.done = new Promise((resolve) =>
        document.addEventListener(
          'click',
          () =>
            requestAnimationFrame(() => {
              probe.armed = false;
              resolve({
                commits: probe.commits,
                reads: probe.reads,
                mutationsAfterReads: pending(),
                row: firstRow(),
                focused: document.activeElement?.textContent?.trim() ?? null,
              });
            }),
          { capture: true, once: true },
        ),
      );
    },
    settled: () => {
      if (!probe.done) throw new Error('The paging fixture must be armed before awaiting a turn.');
      return probe.done;
    },
  };
}
export function App() {
  const [state, setState] = useState(initial);
  const [view, setView] = useState<MyGamesView>(() => {
    const requested = params.get('view') ?? 'ranking';
    if (requested !== 'library' && requested !== 'queue' && requested !== 'ranking')
      throw new Error('Invalid fixture view.');
    return requested;
  });
  const page = h(MyGamesPage, {
    scope: 'guest',
    view,
    onViewChange: setView,
    state,
    filters,
    busy: false,
    animate: false,
    persistent: true,
    availableRecords: [alpha, beta],
    onOpen() {},
    onFilters: () => exits.push('filters'),
    onDiscover: () => exits.push('discover'),
    onBrowse: () => exits.push('browse'),
    onPublish: () => exits.push('publish'),
    async onAction(action) {
      if (action.type === 'set-progress' && action.key === 'later' && !action.value) {
        const saved = await queueRemovals.request();
        if (saved) setState((prior) => applyPersonalAction(prior, action));
        return saved;
      }
      if (action.type === 'move-item') {
        const saved = await moves.request();
        if (saved) setState((prior) => applyPersonalAction(prior, action));
        return saved;
      }
      if (action.type !== 'edit-ranking') return true;
      saves.push(JSON.stringify({ id: action.id, note: action.note, score: action.score }));
      if (!accept) return false;
      setState((prior) => ({
        ...prior,
        ranking: prior.ranking.map((entry) =>
          entry.id !== action.id
            ? entry
            : {
                ...entry,
                ...(action.note !== undefined ? { note: action.note } : {}),
                ...(action.score !== undefined ? { score: action.score } : {}),
              },
        ),
      }));
      return true;
    },
  });
  return params.has('probe') ? (
    <Profiler
      id="my-games"
      onRender={() => {
        if (probe.armed) probe.commits += 1;
      }}
    >
      {page}
    </Profiler>
  ) : (
    page
  );
}
// A held editor: pending until released, and its save settles only when finished.
let heldPending = false;
let finishHeld: (saved: boolean) => void = () => {};
window.myGamesFixture = {
  exits,
  saves,
  holdMoves() {
    moves.hold();
  },
  finishMove(saved) {
    moves.finish(saved);
  },
  moveCount: () => moves.count,
  holdQueueRemovals: () => queueRemovals.hold(),
  finishQueueRemoval: (saved) => queueRemovals.finish(saved),
  queueRemovalCount: () => queueRemovals.count,
  accept: (value) => {
    accept = value;
  },
  hasUnsubmittedForm: () => hasUnsubmittedPwaForm(),
  holdEditor() {
    heldPending = true;
    registerPendingEditor({
      pending: () => heldPending,
      flush: () =>
        new Promise((resolve) => {
          finishHeld = resolve;
        }),
    });
  },
  releaseEditor() {
    heldPending = false;
  },
  finishEditor(saved) {
    finishHeld(saved);
  },
};
createRoot(fixtureElement('mount')).render(h(App));

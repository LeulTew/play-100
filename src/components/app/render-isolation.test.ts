import { createElement, useState } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { advanceGeneration, useCommittedGeneration } from '../../hooks/useCommittedGeneration';
import type { HeldGeneration } from '../../hooks/useCommittedGeneration';
import { useAppCapabilities } from '../../hooks/useAppCapabilities';
import { sameFields, useEquivalentValue } from '../../hooks/useEquivalentValue';
import { useStableHandlers } from '../../hooks/useLatest';
import { createNoticeStore } from '../../lib/notice-store';
import CollectionPage from '../CollectionPage';
import { GameCard } from '../GameCard';
import { RouteHost } from './RouteHost';

const MEMO = Symbol.for('react.memo');
const kind = (component: unknown) => (component as { $$typeof?: symbol }).$$typeof;

/**
 * Renders `render` for each pass: a state update during render makes React render the component again at once and
 * discard the earlier pass, as a concurrent render that never commits would be.
 */
function passes<T>(count: number, render: (pass: number) => T): T[] {
  const seen: T[] = [];
  function Probe(): ReactElement | null {
    const [pass, setPass] = useState(0);
    seen.push(render(pass));
    if (pass < count - 1) setPass(pass + 1);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return seen;
}

describe('App render isolation (PERF-03)', () => {
  it('memoises the route, the collection page and its cards', () => {
    expect(kind(RouteHost)).toBe(MEMO);
    expect(kind(CollectionPage)).toBe(MEMO);
    expect(kind(GameCard)).toBe(MEMO);
  });

  it('keeps each command identity across renders and never runs an uncommitted handler', () => {
    const calls: number[] = [];
    const commands = passes(3, (pass) => useStableHandlers({ open: () => calls.push(pass) }));
    expect(new Set(commands).size).toBe(1);
    expect(new Set(commands.map((command) => command.open)).size).toBe(1);
    commands[2]?.open();
    // No pass committed, so the command still runs the first render's handler.
    expect(calls).toEqual([0]);
  });

  it('holds one identity for equivalent values', () => {
    const same = (held: { id: number }, next: { id: number }) => held.id === next.id;
    const held = passes(3, (pass) => useEquivalentValue({ id: pass < 2 ? 1 : 2 }, same));
    expect(held[0]).toBe(held[1]);
    expect(held[2]).toEqual({ id: 2 });
    expect(held[2]).not.toBe(held[1]);
  });

  it('holds one guest library for a spread of the same parts', () => {
    const perform = () => true;
    const snapshot = { status: 'ready', error: null };
    const libraries = passes(3, (pass) => useEquivalentValue({ ...snapshot, busy: pass === 2, perform }, sameFields));
    expect(libraries[0]).toBe(libraries[1]);
    expect(libraries[2]?.busy).toBe(true);
    expect(sameFields({ a: 1 }, { a: 1, b: 2 } as { a: number })).toBe(false);
  });

  it('holds one motion policy while the capabilities it reads are unchanged', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('document', { hidden: false, documentElement: { dataset: {} } });
    vi.stubGlobal('navigator', {});
    try {
      const policies = passes(3, () => useAppCapabilities('guest', 'ready', 'auto').capabilities);
      expect(new Set(policies).size).toBe(1);
      expect(policies[0]).toEqual({
        reducedMotion: false,
        coarsePointer: false,
        hidden: false,
        constrained: false,
        animate: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('counts generations from the values a render saw, not from how often it rendered', () => {
    const first: HeldGeneration<readonly [string, boolean]> = { values: ['guest', false], generation: 0 };
    expect(advanceGeneration(first, ['guest', false])).toBe(first);
    expect(advanceGeneration(first, ['guest', true])).toEqual({
      values: ['guest', true],
      generation: 1,
    });
    expect(passes(3, () => useCommittedGeneration(['guest']))).toEqual([0, 0, 0]);
    expect(passes(3, (pass) => useCommittedGeneration([pass < 2 ? 'guest' : 'account']))).toEqual([0, 0, 1, 1]);
  });

  it('notifies only the notice subscribers, so a notice renders nothing else', () => {
    const notices = createNoticeStore(100);
    const toast = vi.fn();
    const stop = notices.subscribe(toast);
    notices.notify('Saved.');
    expect(toast).toHaveBeenCalledTimes(1);
    stop();
    notices.clear();
    expect(toast).toHaveBeenCalledTimes(1);
    notices.dispose();
  });
});

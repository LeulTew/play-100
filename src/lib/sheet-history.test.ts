import { afterEach, describe, expect, it, vi } from 'vitest';
import { installSheetHistory } from './sheet-history';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function fixture() {
  const location = new URL('https://play100.test/my-games?catalogs=off');
  const entries: { state: unknown; href: string }[] = [{ state: { unrelated: 'kept' }, href: location.href }];
  let index = 0;
  const queued: number[] = [];
  const history = {
    get state(): unknown {
      return entries[index]!.state;
    },
    pushState: vi.fn((state: unknown, _title: string, url?: string | URL | null) => {
      entries.splice(index + 1);
      entries.push({ state, href: url ? new URL(url, location.href).href : location.href });
      index++;
      location.href = entries[index]!.href;
    }),
    replaceState: vi.fn((state: unknown, _title: string, url?: string | URL | null) => {
      entries[index] = { state, href: url ? new URL(url, location.href).href : location.href };
      location.href = entries[index]!.href;
    }),
    go: vi.fn((delta?: number) => {
      if (delta) queued.push(delta);
    }),
  };
  const host = Object.assign(new EventTarget(), { history, location });
  const listening = vi.spyOn(host, 'addEventListener');
  let live = false;
  const close = vi.fn(() => {
    live = false;
  });
  const dismissal = { current: () => live, close };
  cleanups.push(installSheetHistory(host, () => (live ? dismissal : null)));
  const listener = listening.mock.calls.find(([type]) => type === 'popstate')?.[1];
  if (typeof listener !== 'function') throw new Error('The history guard must subscribe to native traversal.');
  const events: { href: string; stopped: boolean }[] = [];
  const settle = (trusted = true) => {
    const delta = queued.shift();
    if (delta === undefined) throw new Error('A native traversal must be queued.');
    index += delta;
    if (!entries[index]) throw new Error('The traversal left the known document history.');
    location.href = entries[index]!.href;
    const stopImmediatePropagation = vi.fn();
    listener({ isTrusted: trusted, stopImmediatePropagation } as Event);
    events.push({ href: location.href, stopped: stopImmediatePropagation.mock.calls.length > 0 });
  };
  return {
    history,
    location,
    entries,
    events,
    settle,
    close,
    open: () => {
      live = true;
    },
    retire: () => {
      live = false;
    },
  };
}

describe('sheet history ownership', () => {
  it('restores Back before closing and leaves no entry between the current and previous pages', () => {
    const f = fixture();
    f.history.pushState({ filter: 'all' }, '', '/discover?catalogs=off');
    const current = f.location.href;
    expect(f.entries).toHaveLength(2);
    f.open();
    f.history.go(-1);
    f.settle();
    expect(f.close).not.toHaveBeenCalled();
    expect(f.events.at(-1)?.stopped).toBe(true);
    expect(f.history.go).toHaveBeenLastCalledWith(1);
    f.settle();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.location.href).toBe(current);
    expect(f.entries).toHaveLength(2);
    expect(f.history.state).toMatchObject({ filter: 'all' });
    f.history.go(-1);
    f.settle();
    expect(f.location.pathname).toBe('/my-games');
    expect(f.events.at(-1)?.stopped).toBe(false);
    expect(f.history.state).toMatchObject({ unrelated: 'kept' });
    f.history.go(1);
    f.settle();
    expect(f.location.href).toBe(current);
    expect(f.events.at(-1)?.stopped).toBe(false);
  });

  it('dismisses on Forward without consuming that page entry, including a multi-entry traversal', () => {
    const f = fixture();
    f.history.pushState(null, '', '/discover');
    f.history.pushState(null, '', '/community');
    f.history.go(-2);
    f.settle();
    f.open();
    f.history.go(2);
    f.settle();
    expect(f.history.go).toHaveBeenLastCalledWith(-2);
    f.settle();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.location.pathname).toBe('/my-games');
    expect(f.entries).toHaveLength(3);
    f.history.go(1);
    f.settle();
    expect(f.location.pathname).toBe('/discover');
  });

  it('keeps replacement URL/state and ignores synthetic application popstate events', () => {
    const f = fixture();
    f.history.pushState({ draft: 'local' }, '', '/discover');
    f.history.replaceState({ draft: 'local', filter: 'rpg' }, '', '/discover?q=rpg');
    f.open();
    f.history.go(-1);
    f.settle(false);
    expect(f.close).not.toHaveBeenCalled();
    expect(f.events.at(-1)?.stopped).toBe(false);
    expect(f.entries).toHaveLength(2);
    expect(f.entries[1]!.state).toMatchObject({ draft: 'local', filter: 'rpg' });
  });

  it('does not close a replaced or already dismissed sheet when the restore arrives', () => {
    const f = fixture();
    f.history.pushState(null, '', '/discover');
    f.open();
    f.history.go(-1);
    f.settle();
    f.retire();
    f.settle();
    expect(f.location.pathname).toBe('/discover');
    expect(f.close).not.toHaveBeenCalled();
  });

  it('lets a route-backed detail use its real entry rather than compensating it', () => {
    const f = fixture();
    f.history.pushState({ play100Dialog: true }, '', '/my-games?game=fixture');
    f.history.go(-1);
    f.settle();
    expect(f.location.search).toBe('?catalogs=off');
    expect(f.events.at(-1)?.stopped).toBe(false);
    expect(f.close).not.toHaveBeenCalled();
  });
});

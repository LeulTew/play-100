import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FriendsView } from '../lib/friend-manager';
import type { FriendBlock, FriendCursor, FriendInvitation } from '../lib/friend-types';
import type { FriendStore } from './friend-store';
import { useAuxiliaryPages } from './friends-page-data';

type Effect = () => void | (() => void);
const harness = vi.hoisted(() => ({
  cursor: 0,
  rendering: false,
  rerender: false,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[] | undefined; cleanup: (() => void) | void }>(),
  layout: [] as Array<() => void>,
  pending: [] as Array<() => void>,
}));
// Run the real hook in React's order without a browser or Firebase: a render runs again while it updates its own
// state, and a commit runs the layout effects before the passive ones. A render that never commits runs no effects.
vi.mock('react', () => {
  const same = (a: readonly unknown[], b: readonly unknown[]) =>
    a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = <T>(create: () => T, dependencies: readonly unknown[]): T => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as { value: T; dependencies: readonly unknown[] } | undefined;
    if (previous && same(previous.dependencies, dependencies)) return previous.value;
    const value = create();
    harness.slots[index] = { value, dependencies };
    return value;
  };
  const effect = (queue: 'layout' | 'pending') => (run: Effect, dependencies?: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (!previous?.dependencies || !dependencies || !same(previous.dependencies, dependencies))
      harness[queue].push(() => {
        previous?.cleanup?.();
        harness.effects.set(index, { dependencies, cleanup: run() });
      });
  };
  return {
    useMemo: memo,
    useCallback: <T>(callback: T, dependencies: readonly unknown[]) => memo(() => callback, dependencies),
    useRef: <T>(initial: T) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: initial };
      return harness.slots[index] as { current: T };
    },
    useState: <T>(initial: T | (() => T)) => {
      const index = harness.cursor++;
      if (!(index in harness.slots))
        harness.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [
        harness.slots[index] as T,
        (next: T | ((previous: T) => T)) => {
          const value = typeof next === 'function' ? (next as (previous: T) => T)(harness.slots[index] as T) : next;
          if (Object.is(value, harness.slots[index])) return;
          harness.slots[index] = value;
          if (harness.rendering) harness.rerender = true;
        },
      ];
    },
    useEffect: effect('pending'),
    useLayoutEffect: effect('layout'),
    useSyncExternalStore: vi.fn(),
  };
});
vi.mock('./firebase-client', () => ({ cloudAuth: { currentUser: { uid: 'owner' } } }));

const store = { listInvites: vi.fn(), listBlocks: vi.fn() };
const auxVersionRef = { current: 0 };
const current = () => true;
const setRefreshRequired = vi.fn();
const setError = vi.fn();
const cursor = (name: string) => ({ id: name }) as unknown as FriendCursor;
const invite = (token: string) => ({ token }) as FriendInvitation;
const block = (uid: string): FriendBlock => ({ uid, createdAt: 1 });
function page<T>(items: T[], next?: FriendCursor) {
  return { items, cursor: next };
}
function deferred<T>() {
  const result = {} as { promise: Promise<T>; resolve: (value: T) => void };
  result.promise = new Promise<T>((resolve) => {
    result.resolve = resolve;
  });
  return result;
}
function AuxiliaryProbe({ view }: { view: FriendsView }) {
  const relationView = view === 'friends' || view === 'incoming' || view === 'sent';
  return useAuxiliaryPages(
    store as unknown as FriendStore,
    'owner',
    { view, name: '', order: 'recent' },
    relationView,
    current,
    auxVersionRef,
    setRefreshRequired,
    setError,
  );
}
/** Renders until the hook stops updating its own state, as React does before it commits. */
function render(view: FriendsView) {
  for (let pass = 0; pass < 5; pass += 1) {
    harness.cursor = 0;
    harness.layout = [];
    harness.pending = [];
    harness.rerender = false;
    harness.rendering = true;
    const result = AuxiliaryProbe({ view });
    harness.rendering = false;
    if (!harness.rerender) return result;
  }
  throw new Error('The hook kept updating its state while it rendered.');
}
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Commits the last render, then lets the reads its effects start settle. */
async function commit() {
  for (const run of harness.layout.splice(0)) run();
  for (const run of harness.pending.splice(0)) run();
  await settle();
}
const tokens = (items: FriendInvitation[]) => items.map((item) => item.token);
/** Opens Invite links, then loads its second page as "Load more" does, and returns the committed render. */
async function twoInvitePages() {
  store.listInvites.mockResolvedValueOnce(page([invite('a')], cursor('1'))).mockResolvedValueOnce(page([invite('b')]));
  render('invites');
  await commit();
  const first = render('invites');
  await commit();
  expect(await first.loadAux(true)).toBe(true);
  const result = render('invites');
  await commit();
  expect(result.aux).toMatchObject({ view: 'invites', pages: 2, cursor: undefined, ready: true, loading: false });
  expect(tokens(result.aux.invites)).toEqual(['a', 'b']);
  return result;
}
beforeEach(() => {
  harness.cursor = 0;
  harness.rendering = false;
  harness.rerender = false;
  harness.slots = [];
  harness.effects.clear();
  harness.layout = [];
  harness.pending = [];
  auxVersionRef.current = 0;
  store.listInvites.mockReset();
  store.listBlocks.mockReset();
  setRefreshRequired.mockReset();
  setError.mockReset();
});
afterEach(() => {
  for (const effect of harness.effects.values()) effect.cleanup?.();
});
it('opens Invite links already loading in its first frame, then shows the page it read', async () => {
  store.listInvites.mockResolvedValueOnce(page([invite('a')]));
  expect(render('invites').aux).toMatchObject({ view: 'invites', loading: true, ready: false, invites: [] });
  await commit();
  const loaded = render('invites');
  expect(store.listInvites).toHaveBeenCalledExactlyOnceWith('owner', undefined);
  expect(loaded.aux).toMatchObject({ view: 'invites', pages: 1, ready: true, loading: false, error: null });
  expect(tokens(loaded.aux.invites)).toEqual(['a']);
  expect(setRefreshRequired).toHaveBeenCalledExactlyOnceWith(false);
  expect(setError).toHaveBeenCalledExactlyOnceWith('');
});
it('reads nothing in a relation view, and reloads as many pages as Invite links held when it opens again', async () => {
  await twoInvitePages();
  store.listInvites.mockClear();
  render('friends');
  await commit();
  expect(store.listInvites).not.toHaveBeenCalled();
  expect(store.listBlocks).not.toHaveBeenCalled();
  store.listInvites
    .mockResolvedValueOnce(page([invite('a')], cursor('1')))
    .mockResolvedValueOnce(page([invite('c')], cursor('2')));
  expect(render('invites').aux).toMatchObject({ view: 'invites', loading: true, ready: false, invites: [], pages: 0 });
  await commit();
  expect(store.listInvites.mock.calls).toEqual([
    ['owner', undefined],
    ['owner', cursor('1')],
  ]);
  const reloaded = render('invites');
  expect(reloaded.aux).toMatchObject({ pages: 2, ready: true, loading: false });
  expect(reloaded.aux.cursor).toEqual(cursor('2'));
  expect(tokens(reloaded.aux.invites)).toEqual(['a', 'c']);
});
it('opens Blocked afresh with one page after Invite links held two', async () => {
  await twoInvitePages();
  store.listBlocks.mockResolvedValueOnce(page([block('x')], cursor('b1')));
  expect(render('blocked').aux).toMatchObject({ view: 'blocked', loading: true, blocks: [], pages: 0 });
  await commit();
  expect(store.listBlocks).toHaveBeenCalledExactlyOnceWith('owner', undefined);
  expect(render('blocked').aux).toMatchObject({ view: 'blocked', blocks: [block('x')], pages: 1, ready: true });
});
it('keeps the open list while loadAux() reloads the pages it holds', async () => {
  const opened = await twoInvitePages();
  store.listInvites.mockClear();
  store.listInvites.mockResolvedValueOnce(page([invite('a')], cursor('1'))).mockResolvedValueOnce(page([invite('d')]));
  const reload = opened.loadAux();
  const reloading = render('invites');
  expect(reloading.aux).toMatchObject({ loading: true, pages: 2 });
  expect(tokens(reloading.aux.invites)).toEqual(['a', 'b']);
  expect(await reload).toBe(true);
  expect(store.listInvites).toHaveBeenCalledTimes(2);
  expect(tokens(render('invites').aux.invites)).toEqual(['a', 'd']);
});
it('drops a read of Invite links that Blocked replaced', async () => {
  const late = deferred<{ items: FriendInvitation[]; cursor: FriendCursor | undefined }>();
  store.listInvites.mockReturnValueOnce(late.promise);
  store.listBlocks.mockResolvedValueOnce(page([block('x')]));
  render('invites');
  await commit();
  render('blocked');
  await commit();
  late.resolve(page([invite('late')]));
  await settle();
  const result = render('blocked');
  expect(result.aux).toMatchObject({ view: 'blocked', invites: [], blocks: [block('x')], pages: 1, ready: true });
  expect(setRefreshRequired).toHaveBeenCalledOnce();
});
it('shows a failed read, and loadAux() retries it with one page', async () => {
  const failure = new Error('offline');
  store.listInvites.mockRejectedValueOnce(failure).mockResolvedValueOnce(page([invite('a')]));
  render('invites');
  await commit();
  const failed = render('invites');
  await commit();
  expect(failed.aux).toMatchObject({ view: 'invites', loading: false, ready: false, error: failure });
  expect(setError).not.toHaveBeenCalled();
  const retry = failed.loadAux();
  expect(render('invites').aux).toMatchObject({ loading: true, error: null });
  expect(await retry).toBe(true);
  expect(store.listInvites).toHaveBeenLastCalledWith('owner', undefined);
  expect(render('invites').aux).toMatchObject({ pages: 1, ready: true, loading: false, error: null });
});

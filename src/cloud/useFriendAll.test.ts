import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScopedLibrary } from '../lib/cloud-types';
import { accountScope } from '../lib/cloud-types';
import type { FriendAllPolicy } from '../lib/friend-all';
import type { FriendSettings } from '../lib/friend-types';
import { emptyPersonalLibrary } from '../lib/personal-library';
import type { Game } from '../lib/types';
import type { FriendAllControls } from './friend-all-store';
import { friendAllChoice, stableFriendAllPolicy, useFriendAll } from './useFriendAll';

type Effect = () => void | (() => void);
type Snapshot = { metadata: { fromCache: boolean; hasPendingWrites: boolean } };
const harness = vi.hoisted(() => ({
  cursor: 0,
  rendering: false,
  rerender: false,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup: (() => void) | void }>(),
  layout: [] as Array<() => void>,
  pending: [] as Array<() => void>,
  listeners: new Set<(value: Snapshot) => void>(),
  queues: [] as Array<{ dispose: () => void }>,
  controls: vi.fn(),
  progress: vi.fn(),
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
  const effect = (queue: 'layout' | 'pending') => (run: Effect, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (!previous || !same(previous.dependencies, dependencies))
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
  };
});
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: (_database: unknown, ...path: string[]) => path.join('/'),
  onSnapshot: (_reference: unknown, _options: unknown, next: (value: Snapshot) => void) => {
    harness.listeners.add(next);
    return () => harness.listeners.delete(next);
  },
}));
vi.mock('./firebase-client', () => ({
  cloudAuth: { currentUser: { uid: 'owner' } },
  cloudDb: { app: { options: { projectId: 'demo-play100' } } },
}));
vi.mock('./friend-all-store', () => ({
  FriendAllCommittedError: class extends Error {},
  FriendAllStore: class {
    readonly controls = harness.controls;
    readonly setPolicy = vi.fn();
    readonly publish = vi.fn();
    readonly progress = harness.progress;
  },
}));
vi.mock('../lib/sync-retry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/sync-retry')>()),
  SyncWorkQueue: class {
    readonly nextAttemptAt = null;
    readonly request = vi.fn();
    readonly setAvailable = vi.fn();
    readonly wake = vi.fn();
    readonly succeeded = vi.fn();
    readonly failed = vi.fn();
    readonly dispose = vi.fn();
    constructor() {
      harness.queues.push(this);
    }
  },
}));
vi.mock('../lib/friend-all-work', () => ({ readFriendAllCooldown: vi.fn(), saveFriendAllCooldown: vi.fn() }));
vi.mock('../lib/scoped-library', () => ({ loadScopedLibrary: vi.fn() }));
vi.mock('../hooks/useExitSave', () => ({ usePendingEdits: () => false, hasPendingEdits: () => false }));

const scope = accountScope('owner', 'demo-play100');
const games: Game[] = [];
function library(saving = true): ScopedLibrary {
  return {
    version: 1,
    scope,
    state: emptyPersonalLibrary(),
    profile: null,
    recovery: null,
    sync: {
      enabled: saving,
      epoch: 3,
      baseRemoteRevision: 7,
      remoteGeneration: null,
      dirty: false,
      dataRevision: 0,
      displayName: '',
      lastSyncedAt: null,
    },
  };
}
const ready = library();
function settings(): FriendSettings {
  return { format: 1, enabled: true, deleted: false, selectedIds: [], epoch: 2, revision: 5, updatedAt: 1 };
}
function policy(revision: number): FriendAllPolicy {
  return {
    format: 2,
    uid: 'owner',
    enabled: true,
    deleted: false,
    origin: 'explicit',
    epoch: 4,
    revision,
    syncEpoch: 3,
    ranking: { epoch: 2, revision: 5 },
    shelf: { epoch: 2, revision: 5 },
    updatedAt: 1,
  };
}
function sharingControls(revision: number): FriendAllControls {
  return { policy: policy(revision), ranking: settings(), shelf: { ...settings(), consentSyncEpoch: 3 } };
}
function deferred<T>() {
  const result = {} as { promise: Promise<T>; resolve: (value: T) => void };
  result.promise = new Promise<T>((resolve) => {
    result.resolve = resolve;
  });
  return result;
}
function FriendAllProbe({ verified, snapshot }: { verified: boolean; snapshot: ScopedLibrary | null }) {
  return useFriendAll('owner', scope, snapshot, verified, games, 1);
}
/** Renders until the hook stops updating its own state, as React does before it commits. */
function render(verified = true, snapshot: ScopedLibrary | null = ready) {
  for (let pass = 0; pass < 5; pass += 1) {
    harness.cursor = 0;
    harness.layout = [];
    harness.pending = [];
    harness.rerender = false;
    harness.rendering = true;
    const result = FriendAllProbe({ verified, snapshot });
    harness.rendering = false;
    if (!harness.rerender) return result;
  }
  throw new Error('The hook kept updating its state while it rendered.');
}
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Commits the last render, then lets the work its effects start settle. */
async function commit() {
  for (const run of harness.layout.splice(0)) run();
  for (const run of harness.pending.splice(0)) run();
  await settle();
}
/** A server change to the controls, which starts one coalesced read. */
async function serverChange() {
  for (const listener of harness.listeners) listener({ metadata: { fromCache: false, hasPendingWrites: false } });
  await settle();
}
/** Mounts, reads the controls at revision 1, and returns the committed render that shares everything. */
async function mounted() {
  render();
  await commit();
  const result = render();
  await commit();
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
  harness.listeners.clear();
  harness.queues = [];
  vi.clearAllMocks();
  harness.controls.mockReset().mockImplementation(async () => sharingControls(1));
  harness.progress.mockReset().mockResolvedValue(null);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  vi.unstubAllGlobals();
});
it('holds a policy only while its account and revision match', () => {
  const held = policy(1);
  const reread = policy(1);
  const revised = policy(2);
  const another = { ...reread, uid: 'another-owner' };
  expect(stableFriendAllPolicy(held, reread)).toBe(held);
  expect(stableFriendAllPolicy(held, revised)).toBe(revised);
  expect(stableFriendAllPolicy(held, another)).toBe(another);
  expect(stableFriendAllPolicy(null, reread)).toBe(reread);
  expect(stableFriendAllPolicy(held, null)).toBeNull();
});
it('judges controls by the verification and library snapshot it is given', () => {
  expect(friendAllChoice('owner', scope, true, ready, sharingControls(1))).toEqual({ kind: 'all', canEnable: false });
  expect(friendAllChoice('owner', scope, false, ready, sharingControls(1))).toEqual({
    kind: 'paused',
    reason: 'verification',
    canEnable: false,
  });
  expect(friendAllChoice('owner', scope, true, null, sharingControls(1))).toEqual({
    kind: 'paused',
    reason: 'account',
    canEnable: false,
  });
});
it('keeps one policy across re-reads of the same revision, so publication is not restarted', async () => {
  const first = await mounted();
  expect(first.eligibility).toEqual({ kind: 'all', canEnable: false });
  expect(first.policy).toEqual(policy(1));
  expect(harness.queues).toHaveLength(1);
  await serverChange();
  const reread = render();
  await commit();
  expect(harness.controls).toHaveBeenCalledTimes(2);
  expect(reread.policy).toBe(first.policy);
  expect(harness.queues).toHaveLength(1);
  harness.controls.mockImplementation(async () => sharingControls(2));
  await serverChange();
  const revised = render();
  await commit();
  expect(revised.policy).toEqual(policy(2));
  expect(harness.queues).toHaveLength(2);
  expect(harness.queues[0]?.dispose).toHaveBeenCalledOnce();
});
it("judges each render's eligibility by that render's own verification and saving", async () => {
  await mounted();
  expect(render(false).eligibility).toEqual({ kind: 'paused', reason: 'verification', canEnable: false });
  expect(render(false).status).toBe('paused');
  expect(render(true, library(false)).eligibility).toEqual({ kind: 'paused', reason: 'saving', canEnable: false });
  expect(render().eligibility).toEqual({ kind: 'all', canEnable: false });
});
it('drops a read that settles after a committed render lost verification', async () => {
  const first = await mounted();
  const read = deferred<FriendAllControls>();
  harness.controls.mockReturnValueOnce(read.promise);
  const refreshing = first.refresh();
  render(false);
  await commit();
  read.resolve(sharingControls(2));
  await refreshing;
  expect(render().policy).toBe(first.policy);
});
it('still accepts that read after a render React discarded, which never changed the inputs', async () => {
  const first = await mounted();
  const read = deferred<FriendAllControls>();
  harness.controls.mockReturnValueOnce(read.promise);
  const refreshing = first.refresh();
  // Rendered, but never committed: its inputs never reach the work that is still running.
  render(false);
  read.resolve(sharingControls(2));
  await refreshing;
  expect(render().policy).toEqual(policy(2));
});

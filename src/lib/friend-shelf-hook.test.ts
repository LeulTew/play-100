import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScopedLibrary } from './cloud-types';
import { accountScope } from './cloud-types';
import { emptyPersonalLibrary } from './personal-library';
import { useFriendShelf } from '../cloud/useFriendShelf';

type Effect = () => void | (() => void);
const harness = vi.hoisted(() => {
  const app = { options: { projectId: 'demo-play100' } };
  return {
    cursor: 0,
    slots: [] as unknown[],
    effects: new Map<number, { dependencies: readonly unknown[]; cleanup: (() => void) | void }>(),
    pending: [] as Array<() => void>,
    app,
    config: vi.fn().mockResolvedValue(null),
    watchConfig: vi.fn(() => vi.fn()),
  };
});
// Run the real hook's dependency-driven effects without starting a browser or Firebase.
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
          harness.slots[index] =
            typeof next === 'function' ? (next as (previous: T) => T)(harness.slots[index] as T) : next;
        },
      ];
    },
    useEffect: (effect: Effect, dependencies: readonly unknown[]) => {
      const index = harness.cursor++;
      const previous = harness.effects.get(index);
      if (!previous || !same(previous.dependencies, dependencies))
        harness.pending.push(() => {
          previous?.cleanup?.();
          harness.effects.set(index, { dependencies, cleanup: effect() });
        });
    },
  };
});
vi.mock('../cloud/firebase-client', () => ({
  cloudAuth: { app: harness.app, currentUser: { uid: 'owner' } },
  cloudDb: { app: harness.app },
}));
vi.mock('../cloud/friend-shelf-store', () => ({
  FriendShelfStore: class {
    config = harness.config;
    watchConfig = harness.watchConfig;
  },
}));
vi.mock('../hooks/useExitSave', () => ({ usePendingEdits: () => false, hasPendingEdits: () => false }));
vi.mock('./scoped-library', () => ({ loadScopedLibrary: vi.fn() }));
const scope = accountScope('owner', 'demo-play100');
const journal = { update: vi.fn().mockResolvedValue(undefined), pending: vi.fn().mockResolvedValue(new Set()) };
beforeEach(() => {
  harness.cursor = 0;
  harness.slots = [];
  harness.effects.clear();
  harness.pending = [];
  vi.clearAllMocks();
  harness.config.mockReset().mockResolvedValue(null);
  harness.watchConfig.mockReset().mockImplementation(() => vi.fn());
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  vi.unstubAllGlobals();
});
function snapshot(): ScopedLibrary {
  return {
    version: 1,
    scope,
    state: emptyPersonalLibrary(),
    profile: null,
    recovery: null,
    sync: {
      enabled: false,
      epoch: 0,
      baseRemoteRevision: 0,
      remoteGeneration: null,
      dirty: false,
      dataRevision: 0,
      displayName: '',
      lastSyncedAt: null,
    },
  };
}
function HookProbe(value: ScopedLibrary | null, visibleTools: boolean) {
  return useFriendShelf('owner', scope, value, true, [], visibleTools, 1, journal);
}
async function render(value: ScopedLibrary | null, visibleTools = false) {
  harness.cursor = 0;
  const result = HookProbe(value, visibleTools);
  for (const run of harness.pending.splice(0)) run();
  await Promise.resolve();
  await Promise.resolve();
  return result;
}
it('starts its initial read when a delayed account cache becomes ready, without rebinding on each library edit', async () => {
  await render(null);
  expect(harness.config).not.toHaveBeenCalled();
  expect(harness.watchConfig).not.toHaveBeenCalled();
  const ready = snapshot();
  await render(ready);
  expect(harness.config).toHaveBeenCalledExactlyOnceWith('owner');
  await render({ ...ready, state: { ...ready.state, revision: 1 } });
  expect(harness.config).toHaveBeenCalledOnce();
});
it('waits for the matching account cache before attaching visible tools, then attaches exactly once', async () => {
  await render({ ...snapshot(), scope: accountScope('another-owner', 'demo-play100') }, true);
  expect(harness.watchConfig).not.toHaveBeenCalled();
  await render(snapshot(), true);
  expect(harness.watchConfig).toHaveBeenCalledOnce();
  await render({ ...snapshot(), state: { ...emptyPersonalLibrary(), revision: 1 } }, true);
  expect(harness.watchConfig).toHaveBeenCalledOnce();
});
it('does not label pending or failed initial consent as off, and reports confirmed absence separately', async () => {
  let reject!: (cause: Error) => void;
  harness.config.mockReturnValueOnce(
    new Promise((_resolve, no) => {
      reject = no;
    }),
  );
  const ready = snapshot();
  expect((await render(ready)).status).toBe('checking');
  reject(new Error('Synthetic initial consent lookup failed'));
  await Promise.resolve();
  await Promise.resolve();
  expect((await render(ready)).status).toBe('error');
  expect((await render(ready)).ready).toBe(false);
});
it('reports off only after the initial read confirms absent configuration', async () => {
  const ready = snapshot();
  expect((await render(ready)).status).toBe('checking');
  const confirmed = await render(ready);
  expect(confirmed.ready).toBe(true);
  expect(confirmed.status).toBe('off');
});

import type { EffectCallback, SetStateAction } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibrary } from './useLibrary';
import {
  commitPersonalAction,
  loadPersonalLibrary,
  resetPersonalLibrary,
  restorePersonalLibrary,
} from '../lib/personal-db';
import { applyPersonalAction, emptyPersonalLibrary } from '../lib/personal-library';
import { discoveryFixture } from '../lib/discovery-test-fixtures';
import { temporaryLibraryWarning } from '../lib/storage-notices';
import type { PersonalLibraryLoad } from '../lib/personal-types';
import { retryAccountOpening } from '../lib/storage-recovery-actions';
import type { OnlineBridge } from '../cloud/ui-types';

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  effects: [] as EffectCallback[],
}));

// The operations use the hook's synchronous current-snapshot ref. Capture state
// publications here; native focus and real React re-renders have browser coverage.
vi.mock('react', () => ({
  useRef: <T>(current: T) => ({ current }),
  useCallback: <T>(callback: T) => callback,
  useLayoutEffect: (effect: EffectCallback) => {
    effect();
  },
  useEffect: (effect: EffectCallback) => {
    hooks.effects.push(effect);
  },
  startTransition: (work: () => void) => work(),
  useState: <T>(initial: T | (() => T)) => {
    let value = typeof initial === 'function' ? (initial as () => T)() : initial;
    const index = hooks.values.push(value) - 1;
    return [
      value,
      (next: SetStateAction<T>) => {
        value = typeof next === 'function' ? (next as (previous: T) => T)(value) : next;
        hooks.values[index] = value;
      },
    ];
  },
}));
vi.mock('../lib/guest-library-startup', () => ({ takeGuestLibraryLoad: () => null }));
vi.mock('../lib/storage-recovery-preload', () => ({
  loadStorageRecovery: () => import('../lib/storage-recovery-actions'),
}));
vi.mock('../lib/personal-db', () => ({
  loadPersonalLibrary: vi.fn(),
  commitPersonalAction: vi.fn(),
  resetPersonalLibrary: vi.fn(),
  restorePersonalLibrary: vi.fn(),
  subscribePersonalLibrary: vi.fn(() => () => {}),
}));

const blocked = Object.assign(
  new Error(
    'Close other Play 100 tabs to finish updating this device library, then retry. Your saved data has not been changed.',
  ),
  { name: 'PersonalLibraryBlockedError' },
);
const saved = applyPersonalAction(emptyPersonalLibrary(), {
  type: 'rate-game',
  record: discoveryFixture.record,
  score: 8,
});
beforeEach(() => {
  hooks.values = [];
  hooks.effects = [];
  vi.resetAllMocks();
  vi.stubGlobal('localStorage', { getItem: () => null });
});
afterEach(() => vi.unstubAllGlobals());

function LibraryFixture() {
  return useLibrary([], false);
}

async function blockedLibrary() {
  vi.mocked(loadPersonalLibrary).mockRejectedValueOnce(blocked);
  const library = LibraryFixture();
  hooks.effects[0]!();
  await vi.waitFor(() => expect(hooks.values[0]).toMatchObject({ status: 'temporary', canRetry: true }));
  return library;
}

describe('deferred account opening', () => {
  const context = (): Parameters<typeof retryAccountOpening>[0] => ({
    currentOnline: { current: null },
    hintSequence: { current: 0 },
    alive: { current: true },
    setStage: vi.fn(),
    setChecking: vi.fn(),
    setRequested: vi.fn(),
    reportError: vi.fn(),
    resolveHint: vi.fn(async () => false),
  });

  it('coalesces repeated activation in the deferred module', async () => {
    const state = context();
    let resolve!: (value: boolean) => void;
    const open = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    const first = retryAccountOpening(state, open, null);
    expect(retryAccountOpening(state, open, null)).toBe(first);
    expect(open).toHaveBeenCalledOnce();
    resolve(true);
    expect(await first).toBe(true);
    expect(state.resolveHint).toHaveBeenCalledOnce();
    expect(state.setStage).toHaveBeenLastCalledWith('idle');
  });

  it('does not revive an account choice superseded during the device reopen', async () => {
    const state = context();
    let resolve!: (value: boolean) => void;
    const pending = retryAccountOpening(
      state,
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
      null,
    );
    state.hintSequence.current += 1;
    resolve(true);
    expect(await pending).toBe(false);
    expect(state.resolveHint).not.toHaveBeenCalled();
    expect(state.setRequested).not.toHaveBeenCalled();
  });

  const account = (uid = 'origin'): OnlineBridge => ({
    loading: false,
    identity: { uid, email: '', displayName: uid, verified: true, providers: [] },
    controller: {
      state: saved,
      status: 'temporary',
      warning: null,
      error: blocked.message,
      busy: false,
      perform: vi.fn(async () => true),
      restore: vi.fn(async () => true),
      reset: vi.fn(async () => true),
      retryOpen: vi.fn(async () => true),
    },
    scope: `account:demo-play100:${uid}`,
    enabled: false,
    status: 'error',
    label: uid,
    creator: false,
    headerIdentity: null,
  });

  it.each(['guest-to-account', 'account-switch', 'writer-generation'] as const)(
    'refuses an originating retry delivered after %s, before device or account reads',
    async (change) => {
      const state = context();
      const origin = change === 'guest-to-account' ? null : account();
      const replacement = account(change === 'account-switch' ? 'other' : 'origin');
      state.currentOnline.current = replacement;
      const open = vi.fn(async () => true);
      expect(await retryAccountOpening(state, open, origin)).toBe(false);
      expect(open).not.toHaveBeenCalled();
      expect(state.resolveHint).not.toHaveBeenCalled();
      expect(replacement.controller?.retryOpen).not.toHaveBeenCalled();
      expect(state.setStage).not.toHaveBeenCalled();
      expect(state.reportError).not.toHaveBeenCalled();
    },
  );

  it('never switches account writers if a new generation arrives during the device read', async () => {
    const state = context();
    const origin = account();
    const replacement = account();
    state.currentOnline.current = origin;
    let resolve!: (value: boolean) => void;
    const pending = retryAccountOpening(
      state,
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
      origin,
    );
    state.currentOnline.current = replacement;
    resolve(true);
    expect(await pending).toBe(false);
    expect(origin.controller?.retryOpen).not.toHaveBeenCalled();
    expect(replacement.controller?.retryOpen).not.toHaveBeenCalled();
    expect(state.resolveHint).not.toHaveBeenCalled();
  });

  it('keeps a blocked account-opening lifetime valid when its initial writer becomes ready', async () => {
    const state = context();
    const origin = account();
    if (!origin.controller) throw new Error('The account fixture needs a controller.');
    const controller = origin.controller;
    controller.retryOpen = vi.fn(async () => {
      state.currentOnline.current = {
        ...origin,
        controller: { ...controller, status: 'ready', error: null, perform: vi.fn(async () => true) },
      };
      return true;
    });
    state.currentOnline.current = origin;
    expect(
      await retryAccountOpening(
        state,
        vi.fn(async () => true),
        origin,
      ),
    ).toBe(true);
    expect(controller.retryOpen).toHaveBeenCalledOnce();
    expect(state.reportError).toHaveBeenCalledWith(null);
  });
});

describe('device library retry', () => {
  it('retains the warning on another block and publishes a fresh ready read without writing', async () => {
    const library = await blockedLibrary();
    vi.mocked(loadPersonalLibrary).mockRejectedValueOnce(blocked);
    expect(await library.retry()).toBe(false);
    expect(hooks.values[0]).toEqual({
      state: emptyPersonalLibrary(),
      status: 'temporary',
      canRetry: true,
      warning: temporaryLibraryWarning(blocked.message),
      error: temporaryLibraryWarning(blocked.message),
    });

    vi.mocked(loadPersonalLibrary).mockResolvedValueOnce({ state: saved, notice: null, migrated: false });
    expect(await library.retry()).toBe(true);
    expect(hooks.values[0]).toEqual({ state: saved, status: 'ready', warning: null, error: null, canRetry: false });
    expect(loadPersonalLibrary).toHaveBeenCalledTimes(3);
    expect(commitPersonalAction).not.toHaveBeenCalled();
    expect(resetPersonalLibrary).not.toHaveBeenCalled();
    expect(restorePersonalLibrary).not.toHaveBeenCalled();
  });

  it('coalesces repeated activation while reopening and keeps temporary status while pending', async () => {
    const library = await blockedLibrary();
    let complete!: (value: PersonalLibraryLoad) => void;
    vi.mocked(loadPersonalLibrary).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const first = library.retry();
    const second = library.retry();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(loadPersonalLibrary).toHaveBeenCalledTimes(2));
    expect(hooks.values[0]).toMatchObject({ status: 'temporary', canRetry: true });
    expect(hooks.values[1]).toBe(1);
    complete({ state: saved, notice: null, migrated: false });
    expect(await first).toBe(true);
    expect(hooks.values[1]).toBe(0);
  });

  it('refuses implicit discard, retains edits on a failed confirmed retry, and discards only on successful open', async () => {
    const library = await blockedLibrary();
    const action = { type: 'add-ranking' as const, records: [discoveryFixture.record] };
    const temporary = applyPersonalAction(emptyPersonalLibrary(), action);
    expect(await library.perform(action)).toBe(true);
    expect(await library.retry()).toBe(false);
    expect(hooks.values[0]).toMatchObject({
      state: temporary,
      discardRequired: true,
      error: expect.stringContaining('Export a backup'),
    });
    expect(loadPersonalLibrary).toHaveBeenCalledTimes(1);
    vi.mocked(loadPersonalLibrary).mockRejectedValueOnce(blocked);
    expect(await library.retry(temporary.revision)).toBe(false);
    expect(hooks.values[0]).toMatchObject({ state: temporary, status: 'temporary', discardRequired: true });
    vi.mocked(loadPersonalLibrary).mockResolvedValueOnce({ state: saved, notice: null, migrated: false });
    expect(await library.retry(temporary.revision)).toBe(true);
    expect(hooks.values[0]).toEqual({ state: saved, status: 'ready', warning: null, error: null, canRetry: false });
    expect(commitPersonalAction).not.toHaveBeenCalled();
    expect(resetPersonalLibrary).not.toHaveBeenCalled();
    expect(restorePersonalLibrary).not.toHaveBeenCalled();
  });

  it('rejects an outdated discard confirmation after another queued temporary edit', async () => {
    const library = await blockedLibrary();
    const action = { type: 'add-ranking' as const, records: [discoveryFixture.record] };
    const temporary = applyPersonalAction(emptyPersonalLibrary(), action);
    await library.perform(action);
    const newer = applyPersonalAction(temporary, action);
    const edit = library.perform(action);
    const retry = library.retry(temporary.revision);
    expect(await edit).toBe(true);
    expect(await retry).toBe(false);
    expect(hooks.values[0]).toMatchObject({ state: newer, status: 'temporary', discardRequired: true });
    expect(loadPersonalLibrary).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardedReload, isModuleLoadFailure, ModuleLoadFailure } from './chunk-recovery';
import type { PwaUpdateGuard } from '../pwa/types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture(online = true) {
  const replace = vi.fn();
  const fetch = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal('location', { href: 'https://play.test/games?game=one&catalogs=off#details', replace });
  vi.stubGlobal('navigator', { onLine: online });
  vi.stubGlobal('fetch', fetch);
  return { replace, fetch };
}

describe('explicit module recovery', () => {
  it('recognizes tagged React.lazy rethrows without guessing from message text', () => {
    const failure = new ModuleLoadFailure(new TypeError('arbitrary browser wording'));
    expect(isModuleLoadFailure(failure)).toBe(true);
    expect(isModuleLoadFailure(new Error('Failed to fetch dynamically imported module'))).toBe(false);
  });
  it('never probes or navigates while offline', async () => {
    const { replace, fetch } = fixture(false);
    expect(await guardedReload({ intent: 'settings' })).toBe('offline');
    expect(fetch).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
  it.each(['settings', 'credits'] as const)('restores %s only after a successful network HEAD', async (intent) => {
    const { replace, fetch } = fixture();
    expect(await guardedReload({ intent })).toBe('navigating');
    expect(fetch).toHaveBeenCalledWith('/', {
      method: 'HEAD',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    expect(replace).toHaveBeenCalledWith(`https://play.test/games?game=one&catalogs=off&info=${intent}#details`);
  });
  it.each(['network', 'status'] as const)('keeps the current app on %s failure', async (kind) => {
    const { replace, fetch } = fixture();
    if (kind === 'network') fetch.mockRejectedValueOnce(new Error('offline'));
    else fetch.mockResolvedValueOnce({ ok: false });
    expect(await guardedReload()).toBe(kind === 'status' ? 'unavailable' : 'offline');
    expect(replace).not.toHaveBeenCalled();
  });
  it('cancels a probe after unmount or navigation', async () => {
    const { replace } = fixture();
    expect(await guardedReload({ isCurrent: () => false })).toBe('cancelled');
    expect(replace).not.toHaveBeenCalled();
  });
  it('keeps a probe bounded to five seconds and does not reload after a timeout', async () => {
    const { replace, fetch } = fixture();
    const abort = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(abort.signal);
    fetch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          abort.signal.addEventListener('abort', () => reject(abort.signal.reason), { once: true });
        }),
    );
    const recovery = guardedReload();
    abort.abort(new DOMException('Timed out', 'TimeoutError'));
    expect(await recovery).toBe('offline');
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(replace).not.toHaveBeenCalled();
  });
  it('does not reload a different URL after an in-flight probe', async () => {
    const { replace, fetch } = fixture();
    fetch.mockImplementationOnce(async () => {
      location.href = 'https://play.test/discover';
      return { ok: true };
    });
    expect(await guardedReload()).toBe('cancelled');
    expect(replace).not.toHaveBeenCalled();
  });
  it('does not reload when the connection drops during the probe', async () => {
    const { replace, fetch } = fixture();
    fetch.mockImplementationOnce(async () => {
      vi.stubGlobal('navigator', { onLine: false });
      return { ok: true };
    });
    expect(await guardedReload()).toBe('offline');
    expect(replace).not.toHaveBeenCalled();
  });
  it('supports successful probes without AbortSignal.timeout and clears the fallback timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('AbortSignal', {});
    const { replace } = fixture();
    expect(await guardedReload()).toBe('navigating');
    expect(replace).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts a stalled fallback probe at five seconds and clears its timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('AbortSignal', {});
    const { fetch, replace } = fixture();
    fetch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          const options = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
          options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        }),
    );
    const result = guardedReload();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toBe('offline');
    expect(replace).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('awaits the shared edit flush before starting its connectivity probe', async () => {
    const { fetch, replace } = fixture();
    let finish!: (saved: boolean) => void;
    const guard: PwaUpdateGuard = {
      prepare: () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
      isCurrent: () => true,
      canReload: () => true,
    };
    const request = guardedReload({ guard });
    expect(fetch).not.toHaveBeenCalled();
    finish(true);
    expect(await request).toBe('navigating');
    expect(fetch).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledOnce();
  });

  it.each(['failed save', 'unsubmitted form', 'busy library'] as const)(
    'does not probe or navigate over %s',
    async (reason) => {
      const { fetch, replace } = fixture();
      const guard: PwaUpdateGuard = {
        prepare: async () => {
          if (reason === 'unsubmitted form') throw new Error('The form is not submitted.');
          return reason !== 'failed save';
        },
        isCurrent: () => true,
        canReload: () => reason !== 'busy library',
      };
      const request = guardedReload({ guard });
      if (reason === 'unsubmitted form') await expect(request).rejects.toThrow('The form is not submitted.');
      else expect(await request).toBe('blocked');
      expect(fetch).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it.each(['scope', 'input', 'write'] as const)('rechecks %s after HEAD', async (reason) => {
    const { fetch, replace } = fixture();
    let unchanged = true;
    const guard: PwaUpdateGuard = {
      prepare: async () => true,
      isCurrent: () => reason !== 'scope' || unchanged,
      canReload: () => unchanged,
    };
    fetch.mockImplementationOnce(async () => {
      unchanged = false;
      return { ok: true };
    });
    expect(await guardedReload({ guard })).toBe(reason === 'scope' ? 'cancelled' : 'blocked');
    expect(replace).not.toHaveBeenCalled();
  });
});

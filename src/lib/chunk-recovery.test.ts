import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardedReload, isModuleLoadFailure, ModuleLoadFailure } from './chunk-recovery';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
  it.each(['settings', 'credits'] as const)('restores %s only after a successful network HEAD', async intent => {
    const { replace, fetch } = fixture();
    expect(await guardedReload({ intent })).toBe('navigating');
    expect(fetch).toHaveBeenCalledWith('/', {
      method: 'HEAD', cache: 'no-store', signal: expect.any(AbortSignal),
    });
    expect(replace).toHaveBeenCalledWith(`https://play.test/games?game=one&catalogs=off&info=${intent}#details`);
  });
  it.each(['network', 'status'] as const)('keeps the current app on %s failure', async kind => {
    const { replace, fetch } = fixture();
    if (kind === 'network') fetch.mockRejectedValueOnce(new Error('offline'));
    else fetch.mockResolvedValueOnce({ ok: false });
    expect(await guardedReload()).toBe('offline');
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
    fetch.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      abort.signal.addEventListener('abort', () => reject(abort.signal.reason), { once: true });
    }));
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
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyPersonalLibrary } from './personal-library';
import { loadPersonalLibrary } from './personal-db';
import { startGuestLibraryLoad, takeGuestLibraryLoad } from './guest-library-startup';

vi.mock('./personal-db', () => ({ loadPersonalLibrary: vi.fn() }));
afterEach(async () => {
  await takeGuestLibraryLoad()?.promise.catch(() => {});
  vi.resetAllMocks();
});

describe('one-use guest bootstrap read', () => {
  it('does not start any read merely by importing the helper', () => {
    expect(loadPersonalLibrary).not.toHaveBeenCalled();
    expect(takeGuestLibraryLoad()).toBeNull();
  });

  it('starts immediately, shares one pending read and transfers the exact result once', async () => {
    const result = { state: emptyPersonalLibrary(), notice: null, migrated: false };
    vi.mocked(loadPersonalLibrary).mockResolvedValue(result);
    startGuestLibraryLoad();
    startGuestLibraryLoad();
    expect(loadPersonalLibrary).toHaveBeenCalledOnce();
    expect(loadPersonalLibrary).toHaveBeenCalledWith([]);
    const attempt = takeGuestLibraryLoad();
    if (!attempt) throw new Error('The startup attempt must be available.');
    expect(takeGuestLibraryLoad()).toBeNull();
    expect(await attempt.promise).toBe(result);
  });

  it('retains an early failure for the existing hook migration/recovery path', async () => {
    const error = new Error('Canonical records are needed for legacy migration.');
    vi.mocked(loadPersonalLibrary).mockRejectedValue(error);
    startGuestLibraryLoad();
    await Promise.resolve();
    const attempt = takeGuestLibraryLoad();
    if (!attempt) throw new Error('The failed attempt must still reach its consumer.');
    await expect(attempt.promise).rejects.toBe(error);
    expect(takeGuestLibraryLoad()).toBeNull();
  });
});

import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import {
  closePersonalLibrary,
  commitPersonalAction,
  loadPersonalLibrary,
  resetPersonalLibrary,
  restorePersonalLibrary,
} from './personal-db';
import { commitScopedAction, deleteScopedLibrary, loadScopedLibrary, restoreScopedLibrary } from './scoped-library';
import { emptyPersonalLibrary } from './personal-library';
import {
  clearMotionHint,
  effectiveMotionPreference,
  MOTION_HINT_KEY,
  motionHintKey,
  parseMotionHint,
  readMotionHint,
  rememberMotionHint,
} from './motion-hint';

let values: Map<string, string>;
let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
beforeEach(() => {
  closePersonalLibrary();
  values = new Map();
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', undefined);
});
afterEach(() => {
  closePersonalLibrary();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('optional scoped enum-only motion hints', () => {
  it.each(['auto', 'full', 'lite'] as const)('roundtrips exactly %s without JSON or personal data', (motion) => {
    rememberMotionHint('guest', motion);
    expect(values).toEqual(new Map([[`${MOTION_HINT_KEY}:guest`, motion]]));
    expect(readMotionHint('guest')).toBe(motion);
    expect(parseMotionHint(motion)).toBe(motion);
    const set = vi.spyOn(storage, 'setItem');
    rememberMotionHint('guest', motion);
    expect(set).not.toHaveBeenCalled();
  });

  it.each([null, undefined, '', 'FULL', ' lite ', '"auto"', '{}', 1, { motion: 'full' }])(
    'rejects malformed or absent hint %j',
    (value) => {
      expect(parseMotionHint(value)).toBeNull();
    },
  );

  it('does not infer an account, borrow another scope, or ignore the version', () => {
    const alice = accountScope('alice');
    rememberMotionHint(alice, 'full');
    values.set('play100.motion-hint.v0:guest', 'full');
    expect(readMotionHint('guest')).toBeNull();
    expect(readMotionHint(accountScope('bob'))).toBeNull();
    expect(readMotionHint(alice)).toBe('full');
    clearMotionHint(alice);
    expect(readMotionHint(alice)).toBeNull();
  });

  it('falls back on blocked reads and reports storage failure without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    expect(readMotionHint('guest')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('invalidates an old hint when a replacement cannot be written', () => {
    values.set(motionHintKey('guest'), 'full');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    rememberMotionHint('guest', 'lite');
    expect(values.has(motionHintKey('guest'))).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('reports blocked removal without changing authoritative save semantics', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    expect(() => clearMotionHint('guest')).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each(['auto', 'full', 'lite'] as const)(
    'uses hint only during loading and authority always wins for %s',
    (motion) => {
      expect(effectiveMotionPreference('loading', motion, null)).toBe('lite');
      expect(effectiveMotionPreference('loading', 'auto', motion)).toBe(motion);
      expect(effectiveMotionPreference('ready', motion, motion === 'lite' ? 'full' : 'lite')).toBe(motion);
      expect(effectiveMotionPreference('temporary', motion, motion === 'lite' ? 'full' : 'lite')).toBe(motion);
    },
  );

  it('writes guest default/load/save/restore/reset only after successful transactions', async () => {
    await loadPersonalLibrary([]);
    expect(readMotionHint('guest')).toBe('auto');
    await commitPersonalAction({ type: 'set-motion', motion: 'lite' });
    expect(readMotionHint('guest')).toBe('lite');
    rememberMotionHint('guest', 'full');
    await loadPersonalLibrary([]);
    expect(readMotionHint('guest')).toBe('lite');
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('Write failed');
    });
    await expect(commitPersonalAction({ type: 'set-motion', motion: 'full' })).rejects.toThrow();
    expect(readMotionHint('guest')).toBe('lite');
    put.mockRestore();
    await restorePersonalLibrary({ ...emptyPersonalLibrary(), motion: 'full' });
    expect(readMotionHint('guest')).toBe('full');
    await resetPersonalLibrary();
    expect(readMotionHint('guest')).toBe('auto');
  });

  it('preserves guest/account separation, new-scope inheritance and account deletion', async () => {
    const alice = accountScope('alice');
    const bob = accountScope('bob');
    await loadPersonalLibrary([]);
    await loadScopedLibrary(alice, 'lite');
    expect(readMotionHint(alice)).toBe('lite');
    await loadScopedLibrary(alice, 'full');
    expect(readMotionHint(alice)).toBe('lite');
    await loadScopedLibrary(bob, 'full');
    await commitScopedAction(alice, { type: 'set-motion', motion: 'auto' });
    expect(readMotionHint(alice)).toBe('auto');
    expect(readMotionHint(bob)).toBe('full');
    expect(readMotionHint('guest')).toBe('auto');
    await restoreScopedLibrary(alice, { ...emptyPersonalLibrary(), motion: 'lite' });
    expect(readMotionHint(alice)).toBe('lite');
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('Write failed');
    });
    await expect(commitScopedAction(alice, { type: 'set-motion', motion: 'full' })).rejects.toThrow();
    expect(readMotionHint(alice)).toBe('lite');
    put.mockRestore();
    await deleteScopedLibrary(alice);
    expect(readMotionHint(alice)).toBeNull();
    expect(readMotionHint(bob)).toBe('full');
  });

  it('does not turn an optional hint failure into failure of a durable library save', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    await loadPersonalLibrary([]);
    const saved = await commitPersonalAction({ type: 'set-motion', motion: 'lite' });
    expect(saved.motion).toBe('lite');
    expect((await loadPersonalLibrary([])).state.motion).toBe('lite');
    expect(readMotionHint('guest')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearComparisonView,
  comparisonScope,
  FRIEND_COMPARISON_KEY,
  initialComparison,
  parseComparisonView,
  readComparisonView,
  rememberComparisonView,
} from './friend-comparison-intent';

const scope = comparisonScope('demo-play100', 'owner');
function browser() {
  const storage = new Map<string, string>();
  const history = {
    state: {} as Record<string, unknown>,
    replaceState: vi.fn((value: Record<string, unknown>) => {
      history.state = value;
    }),
  };
  const sessionStorage = {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
  };
  vi.stubGlobal('history', history);
  vi.stubGlobal('sessionStorage', sessionStorage);
  vi.stubGlobal('location', { pathname: '/compare', href: 'https://play100.test/compare' });
  return { storage, history, sessionStorage };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('private account-bound comparison intent', () => {
  it('includes self with at most five distinct valid peers', () => {
    expect(initialComparison(scope, 'owner', ['peer']).selected).toEqual(['owner', 'peer']);
    expect(() =>
      initialComparison(
        scope,
        'owner',
        Array.from({ length: 6 }, (_, index) => `peer${index}`),
      ),
    ).toThrow();
    expect(() => initialComparison(scope, 'owner', ['owner'])).toThrow();
    expect(() => initialComparison(scope, 'owner', ['peer', 'peer'])).toThrow();
    expect(() => initialComparison(scope, 'owner', ['../../bad'])).toThrow();
  });
  it('rejects scope mismatches, malformed fields, excess participants and unsupported modes', () => {
    const valid = initialComparison(scope, 'owner', ['peer']);
    for (const extra of [
      { scope: 'demo-play100:other' },
      { extra: true },
      { query: 'x'.repeat(161) },
      { page: 0 },
      { page: 1.5 },
      { mode: 'mean' },
      { groupId: 'bad' },
      { selected: ['peer', 'peer'] },
      { selected: ['invalid uid'] },
    ]) {
      expect(parseComparisonView({ ...valid, ...extra }, scope)).toBeNull();
    }
  });
  it('retains selection and view through tab/history restoration without adding a public query', () => {
    const b = browser();
    const view = {
      ...initialComparison(scope, 'owner', ['peer']),
      query: 'Long game',
      mode: 'all-shared' as const,
      page: 2,
    };
    b.history.state = { play100Dialog: true };
    rememberComparisonView(view);
    expect(b.history.state).toEqual({ play100Dialog: true, play100Compare: view });
    expect(b.history.replaceState).toHaveBeenCalledWith(b.history.state, '', 'https://play100.test/compare');
    expect(readComparisonView(scope)).toEqual(view);
    b.history.state = {};
    expect(readComparisonView(scope)).toEqual(view);
    expect(readComparisonView('demo-play100:other')).toBeNull();
    clearComparisonView(scope);
    expect(b.storage.has(FRIEND_COMPARISON_KEY)).toBe(false);
  });
  it('keeps browser-history restoration available when tab storage is denied', () => {
    const b = browser();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    b.sessionStorage.setItem.mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    const view = initialComparison(scope, 'owner', ['peer']);
    rememberComparisonView(view);
    expect(readComparisonView(scope)).toEqual(view);
    expect(warn).toHaveBeenCalledOnce();
  });
  it('reports invalid own-tab data and never clears another account preference', () => {
    const b = browser();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    b.storage.set(FRIEND_COMPARISON_KEY, JSON.stringify({ scope, version: 2 }));
    expect(readComparisonView(scope)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    const other = initialComparison('demo-play100:other', 'other', ['peer']);
    b.storage.set(FRIEND_COMPARISON_KEY, JSON.stringify(other));
    clearComparisonView(scope);
    expect(b.storage.get(FRIEND_COMPARISON_KEY)).toBe(JSON.stringify(other));
  });
});

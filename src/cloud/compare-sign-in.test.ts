import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryRecord } from '../lib/personal-types';
import { compareTrayStorageKey, serializeCompareTray } from '../lib/compare-tray';
import {
  COMPARE_SIGN_IN_TTL_MS,
  deviceComparePins,
  forgetCompareSignIn,
  rememberCompareSignIn,
  takeCompareSignIn,
} from './compare-sign-in';

const record: LibraryRecord = {
  id: 'example-game',
  title: 'Example game',
  source: 'collection',
  sourceId: 'example-game',
  year: 2020,
  genre: null,
  studio: null,
  sourceUrl: null,
  collectionRank: 1,
};

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

let session: ReturnType<typeof storage>;
let local: ReturnType<typeof storage>;
beforeEach(() => {
  session = storage();
  local = storage();
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('localStorage', local);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Compare sign-in redirect purpose', () => {
  it('is taken once, by the first return, and only while fresh', () => {
    const start = Date.UTC(2030, 0, 1);
    expect(takeCompareSignIn(start)).toBe(false);
    rememberCompareSignIn(start);
    expect(takeCompareSignIn(start + COMPARE_SIGN_IN_TTL_MS - 1)).toBe(true);
    expect(takeCompareSignIn(start + COMPARE_SIGN_IN_TTL_MS - 1)).toBe(false);
    rememberCompareSignIn(start);
    expect(takeCompareSignIn(start + COMPARE_SIGN_IN_TTL_MS)).toBe(false);
    expect(session.values.size).toBe(0);
    // A clock that moved backwards does not keep an old purpose alive.
    rememberCompareSignIn(start);
    expect(takeCompareSignIn(start - 1)).toBe(false);
  });

  it('is removed by a redirect without that purpose and ignores malformed values', () => {
    rememberCompareSignIn();
    forgetCompareSignIn();
    expect(takeCompareSignIn()).toBe(false);
    for (const raw of ['', 'not json', 'null', '[]', '{"version":2,"createdAt":1}', '{"version":1}']) {
      session.values.set('play100.compare-sign-in.v1', raw);
      expect(takeCompareSignIn()).toBe(false);
      expect(session.values.size).toBe(0);
    }
  });

  it('treats blocked session storage as no purpose', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    expect(() => rememberCompareSignIn()).not.toThrow();
    expect(takeCompareSignIn()).toBe(false);
  });
});

describe("the device's Compare pins", () => {
  it('reads the guest tray and never an account tray', () => {
    const account = 'account:demo-play100:alice';
    expect(deviceComparePins()).toEqual([]);
    local.setItem(compareTrayStorageKey(account), serializeCompareTray(account, [record]));
    expect(deviceComparePins()).toEqual([]);
    local.setItem(compareTrayStorageKey('guest'), serializeCompareTray('guest', [record]));
    expect(deviceComparePins().map((pin) => pin.id)).toEqual([record.id]);
  });

  it('has none when the saved tray is unreadable', () => {
    local.setItem(compareTrayStorageKey('guest'), '{"version":1,"scope":"guest","items":[{}]}');
    expect(deviceComparePins()).toEqual([]);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    expect(deviceComparePins()).toEqual([]);
  });
});

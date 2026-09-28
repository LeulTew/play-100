import type { LibraryRecord } from '../lib/personal-types';
import { compareTrayStorageKey, parseCompareTray } from '../lib/compare-tray';

// A Google redirect started from the Compare tray's sign-in carries that purpose across the page load, so its return
// can continue to Compare. Only that redirect writes it, and the first return after it removes it, used or not.
const KEY = 'play100.compare-sign-in.v1';
export const COMPARE_SIGN_IN_TTL_MS = 15 * 60_000;

export function rememberCompareSignIn(now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ version: 1, createdAt: now }));
  } catch {
    // Without it the return opens Account, as any other sign-in does.
  }
}

export function forgetCompareSignIn(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was stored.
  }
}

/** Whether a fresh Compare sign-in redirect is pending in this tab; it is removed either way. */
export function takeCompareSignIn(now = Date.now()): boolean {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
  forgetCompareSignIn();
  if (raw === null) return false;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return false;
    const { version, createdAt } = value as { version?: unknown; createdAt?: unknown };
    return (
      version === 1 && typeof createdAt === 'number' && now >= createdAt && now - createdAt < COMPARE_SIGN_IN_TTL_MS
    );
  } catch {
    return false;
  }
}

/** The device's Compare tray pins, which a Compare sign-in continues with; none when the saved tray can't be read. */
export function deviceComparePins(): LibraryRecord[] {
  try {
    const raw = localStorage.getItem(compareTrayStorageKey('guest'));
    return raw === null ? [] : parseCompareTray(raw, 'guest');
  } catch {
    return [];
  }
}

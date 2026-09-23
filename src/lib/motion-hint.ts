import type { LibraryScope } from './cloud-types';
import type { MotionPreference } from './types';

export const MOTION_HINT_KEY = 'play100.motion-hint.v1';
export const motionHintKey = (scope: LibraryScope): string => `${MOTION_HINT_KEY}:${scope}`;

export function parseMotionHint(value: unknown): MotionPreference | null {
  return value === 'auto' || value === 'full' || value === 'lite' ? value : null;
}

export function readMotionHint(scope: LibraryScope): MotionPreference | null {
  try { return parseMotionHint(localStorage.getItem(motionHintKey(scope))); }
  catch {
    console.warn('The visual preference hint could not be read. Motion stays limited until the device library opens.');
    return null;
  }
}

export function clearMotionHint(scope: LibraryScope): void {
  try { localStorage.removeItem(motionHintKey(scope)); }
  catch { console.warn('The visual preference hint could not be removed. The saved library remains authoritative.'); }
}

export function rememberMotionHint(scope: LibraryScope, preference: MotionPreference): void {
  try {
    const key = motionHintKey(scope);
    if (localStorage.getItem(key) !== preference) localStorage.setItem(key, preference);
  } catch {
    console.warn('The visual preference hint could not be saved. The saved library remains authoritative.');
    clearMotionHint(scope);
  }
}

export function effectiveMotionPreference(
  status: 'loading' | 'ready' | 'temporary', authoritative: MotionPreference, hint: MotionPreference | null,
): MotionPreference {
  return status === 'loading' ? hint ?? 'lite' : authoritative;
}

import type { LibraryScope } from './cloud-types';
import type { MotionPreference } from './types';

export const MOTION_HINT_KEY = 'play100.motion-hint.v1';
export const motionHintKey = (scope: LibraryScope): string => `${MOTION_HINT_KEY}:${scope}`;

export function parseMotionHint(value: unknown): MotionPreference | null {
  return value === 'auto' || value === 'full' || value === 'lite' ? value : null;
}

export function readMotionHint(scope: LibraryScope): MotionPreference | null {
  try {
    return parseMotionHint(localStorage.getItem(motionHintKey(scope)));
  } catch {
    console.warn('The visual preference hint could not be read. Motion stays limited until the device library opens.');
    return null;
  }
}

let startupHint: { scope: LibraryScope; hint: MotionPreference | null } | null = null;

/**
 * Reads a scope's hint before its library load starts (src/main.tsx). The load rewrites the hint from the saved
 * library, perhaps before the first render reads it; the snapshot keeps that render on the hint from before the load,
 * the one the first-paint shell read (src/first-paint/boot.js) unless another tab has changed it since. A later call
 * replaces the snapshot.
 */
export function snapshotMotionHint(scope: LibraryScope): MotionPreference | null {
  startupHint = { scope, hint: readMotionHint(scope) };
  return startupHint.hint;
}

/**
 * The hint a render uses while its library opens (App.tsx): the startup snapshot of its scope, otherwise the stored
 * hint. The guest library opens once per page, so its snapshot is the hint for as long as any hint matters.
 */
export function startupMotionHint(scope: LibraryScope): MotionPreference | null {
  const snapshot = startupHint;
  return snapshot && snapshot.scope === scope ? snapshot.hint : readMotionHint(scope);
}

export function clearMotionHint(scope: LibraryScope): void {
  try {
    localStorage.removeItem(motionHintKey(scope));
  } catch {
    console.warn('The visual preference hint could not be removed. The saved library remains authoritative.');
  }
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
  status: 'loading' | 'ready' | 'temporary',
  authoritative: MotionPreference,
  hint: MotionPreference | null,
): MotionPreference {
  return status === 'loading' ? (hint ?? 'lite') : authoritative;
}

/**
 * Whether effectiveMotionPreference() returns its provisional 'lite': the library is still opening and no hint is
 * stored, so the visitor has chosen no visual preference that the app knows of yet.
 */
export function motionPreferencePending(
  status: 'loading' | 'ready' | 'temporary',
  hint: MotionPreference | null,
): boolean {
  return status === 'loading' && hint === null;
}

import type { PwaUpdateGuard } from '../pwa/types';

export type ChunkIntent = 'settings' | 'credits';

export class ModuleLoadFailure extends Error {
  constructor(cause: unknown) {
    super('An app module did not load.', { cause });
    this.name = 'ModuleLoadFailure';
  }
}

export function isModuleLoadFailure(error: unknown): error is ModuleLoadFailure {
  return error instanceof ModuleLoadFailure;
}

export const offlineRecoveryMessage = "You're offline. Reconnect, then try again.";
export const unavailableRecoveryMessage = "Play 100 didn't respond. Try again in a moment.";
export const unsavedRecoveryMessage =
  'Finish or correct unsaved work and wait for saving to finish before reloading. Nothing was reloaded.';

export async function guardedReload({
  intent,
  isCurrent = () => true,
  guard,
}: {
  intent?: ChunkIntent;
  isCurrent?: () => boolean;
  guard?: PwaUpdateGuard;
} = {}): Promise<'offline' | 'unavailable' | 'cancelled' | 'blocked' | 'navigating'> {
  const url = new URL(location.href);
  const original = url.href;
  if (!navigator.onLine) return 'offline';
  const current = () => isCurrent() && location.href === original && (!guard || guard.isCurrent());
  if (!current()) return 'cancelled';
  // PWA callers already prepare their guard; component recovery supplies it here.
  if (guard && (!(await guard.prepare()) || !guard.canReload())) return 'blocked';
  if (!current()) return 'cancelled';
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const abort = new AbortController();
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : abort.signal;
    if (signal === abort.signal) timeout = setTimeout(() => abort.abort(), 5000);
    const response = await fetch('/', { method: 'HEAD', cache: 'no-store', signal });
    if (!response.ok) return 'unavailable';
  } catch {
    return 'offline';
  } finally {
    clearTimeout(timeout);
  }
  if (!navigator.onLine) return 'offline';
  if (!current()) return 'cancelled';
  if (guard && !guard.canReload()) return 'blocked';
  if (intent) url.searchParams.set('info', intent);
  location.replace(url.href);
  return 'navigating';
}

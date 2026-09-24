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

export async function guardedReload({
  intent,
  isCurrent = () => true,
}: {
  intent?: ChunkIntent;
  isCurrent?: () => boolean;
} = {}): Promise<'offline' | 'unavailable' | 'cancelled' | 'navigating'> {
  const url = new URL(location.href);
  const original = url.href;
  if (!navigator.onLine) return 'offline';
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
  if (!isCurrent() || location.href !== original) return 'cancelled';
  if (intent) url.searchParams.set('info', intent);
  location.replace(url.href);
  return 'navigating';
}

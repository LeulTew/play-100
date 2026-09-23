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

export async function guardedReload({ intent, isCurrent = () => true }: {
  intent?: ChunkIntent;
  isCurrent?: () => boolean;
} = {}): Promise<'offline' | 'cancelled' | 'navigating'> {
  const url = new URL(location.href);
  const original = url.href;
  if (!navigator.onLine) return 'offline';
  try {
    const response = await fetch('/', { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return 'offline';
  } catch { return 'offline'; }
  if (!isCurrent() || location.href !== original) return 'cancelled';
  if (intent) url.searchParams.set('info', intent);
  location.replace(url.href);
  return 'navigating';
}

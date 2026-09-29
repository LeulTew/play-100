import type { ClientErrorArea } from './client-error-schema';

let pending: Promise<typeof import('./client-error-reporter') | null> | undefined;
let count = 0;

export function reportClientError(error: unknown, area: ClientErrorArea): void {
  if (!import.meta.env.PROD || typeof window === 'undefined' || count >= 20) return;
  count++;
  try {
    const name = error instanceof Error ? error.name : 'other';
    const errorClass = /^(Error|TypeError|RangeError|ReferenceError|SyntaxError|ModuleLoadFailure|AbortError)$/.test(
      name,
    )
      ? name
      : 'other';
    const pathname = location.pathname;
    pending ??= import('./client-error-reporter').catch(() => {
      console.warn('Anonymous client error reporting is unavailable.');
      return null;
    });
    void pending.then((module) => module?.reportClientErrorCount(errorClass, area, pathname));
  } catch {
    console.warn('Anonymous client error classification is unavailable.');
  }
}

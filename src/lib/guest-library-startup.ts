import { loadPersonalLibrary } from './personal-db';
import type { LibraryRecord, PersonalLibraryLoad } from './personal-types';

type StartupResult = { ok: true; value: PersonalLibraryLoad } | { ok: false; error: unknown };
let pending: { records: LibraryRecord[]; result: Promise<StartupResult> } | null = null;

export function startGuestLibraryLoad(): void {
  if (pending) return;
  const records: LibraryRecord[] = [];
  // Retain failures for the hook's normal migration/recovery path, without an
  // unhandled rejection if React has not mounted its consumer yet.
  const result = loadPersonalLibrary(records).then<StartupResult, StartupResult>(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
  pending = { records, result };
}

export function takeGuestLibraryLoad(): { records: LibraryRecord[]; promise: Promise<PersonalLibraryLoad> } | null {
  const attempt = pending;
  pending = null;
  return attempt
    ? {
        records: attempt.records,
        promise: attempt.result.then((result) => {
          if (!result.ok) throw result.error;
          return result.value;
        }),
      }
    : null;
}

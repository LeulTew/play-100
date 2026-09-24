import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import {
  commitPersonalAction, loadPersonalLibrary, resetPersonalLibrary,
  restorePersonalLibrary, subscribePersonalLibrary,
} from '../lib/personal-db';
import { applyPersonalAction, emptyPersonalLibrary, migrateLegacyLibrary } from '../lib/personal-library';
import { STORAGE_KEY } from '../lib/storage';
import { takeGuestLibraryLoad } from '../lib/guest-library-startup';
import { temporaryLibraryWarning } from '../lib/storage-notices';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../lib/personal-types';

interface Snapshot {
  state: PersonalLibraryState;
  status: 'loading' | 'ready' | 'temporary';
  warning: string | null;
  error: string | null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'The device library could not be saved.';
}

export function useLibrary(canonicalRecords: LibraryRecord[], canonicalLoading: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({ state: emptyPersonalLibrary(), status: 'loading', warning: null, error: null }));
  const [pending, setPending] = useState(0);
  const current = useRef(snapshot);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const records = useRef(canonicalRecords);
  const loadSequence = useRef(0);
  const temporaryEdits = useRef(false);
  const startupLoad = useRef<{ records: LibraryRecord[]; promise: ReturnType<typeof loadPersonalLibrary> } | null>(null);
  records.current = canonicalRecords;

  const publish = useCallback((next: Snapshot) => { current.current = next; setSnapshot(next); }, []);

  useEffect(() => {
    // Canonical records are needed for legacy migration, not for a loaded v3
    // snapshot. Cross-tab updates have their own queued refresh below.
    if (current.current.status === 'ready') return;
    if (current.current.status === 'temporary' && temporaryEdits.current) return;
    let canceled = false;
    const sequence = ++loadSequence.current;
    const attempt = startupLoad.current ?? takeGuestLibraryLoad() ?? { records: canonicalRecords, promise: loadPersonalLibrary(canonicalRecords) };
    startupLoad.current = attempt;
    // Metadata arriving during the read can reuse its validated v3 result.
    // A failed legacy migration retries with the now-available canonical records.
    void attempt.promise.catch((error: unknown) => {
      if (!canceled && sequence === loadSequence.current && attempt.records !== canonicalRecords && canonicalRecords.length > 0) return loadPersonalLibrary(canonicalRecords);
      throw error;
    }).then((result) => {
      if (canceled || sequence !== loadSequence.current) return;
      // Opening the library re-renders the whole app; as a transition React renders it in slices.
      // current.current is still updated at once, so writes queued meanwhile see the ready state.
      startTransition(() => publish({ state: result.state, status: 'ready', warning: result.notice, error: null }));
    }).catch((error: unknown) => {
      if (canceled || sequence !== loadSequence.current || canonicalLoading) return;
      let fallback = current.current.state;
      let detail = describeError(error);
      try {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) fallback = migrateLegacyLibrary(legacy, canonicalRecords);
      } catch (legacyError: unknown) {
        detail += ` ${describeError(legacyError)}`;
      }
      publish({
        state: fallback, status: 'temporary', error: null,
        warning: temporaryLibraryWarning(detail),
      });
    }).finally(() => {
      if (startupLoad.current === attempt) startupLoad.current = null;
    });
    return () => { canceled = true; };
  }, [canonicalRecords, canonicalLoading, publish]);

  useEffect(() => {
    let canceled = false;
    const refresh = () => {
      if (current.current.status !== 'ready') return;
      const sequence = ++loadSequence.current;
      void queue.current.then(() => loadPersonalLibrary(records.current)).then((result) => {
        if (!canceled && sequence === loadSequence.current) publish({ state: result.state, status: 'ready', warning: result.notice, error: null });
      }).catch((error: unknown) => {
        if (!canceled && sequence === loadSequence.current) publish({ ...current.current, error: `Another-tab refresh failed. Your current view is retained. ${describeError(error)}` });
      });
    };
    const visible = () => { if (!document.hidden) refresh(); };
    const unsubscribe = subscribePersonalLibrary(refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      canceled = true;
      unsubscribe();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [publish]);

  const enqueue = useCallback((operation: () => Promise<void>): Promise<boolean> => {
    setPending((count) => count + 1);
    ++loadSequence.current;
    const task = queue.current.then(async () => {
      try { await operation(); return true; }
      catch (error: unknown) { publish({ ...current.current, error: describeError(error) }); return false; }
      finally { setPending((count) => count - 1); }
    });
    queue.current = task;
    return task;
  }, [publish]);

  const perform = useCallback((action: PersonalAction) => enqueue(async () => {
    const previous = current.current;
    if (previous.status === 'loading') throw new Error('Your device library is still opening. Please try again in a moment.');
    const state = previous.status === 'temporary'
      ? applyPersonalAction(previous.state, action)
      : await commitPersonalAction(action);
    if (previous.status === 'temporary') temporaryEdits.current = true;
    publish({ ...previous, state, error: null });
  }), [enqueue, publish]);

  const restore = useCallback((state: PersonalLibraryState) => enqueue(async () => {
    const saved = await restorePersonalLibrary(state);
    temporaryEdits.current = false;
    publish({ state: saved, status: 'ready', warning: null, error: null });
  }), [enqueue, publish]);

  const reset = useCallback(() => enqueue(async () => {
    const result = await resetPersonalLibrary();
    temporaryEdits.current = false;
    publish({ state: result.state, status: 'ready', warning: result.notice, error: null });
  }), [enqueue, publish]);

  useEffect(() => {
    if (!pending) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [pending]);

  return { ...snapshot, busy: pending > 0 || snapshot.status === 'loading', perform, restore, reset };
}

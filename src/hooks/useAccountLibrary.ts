import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryScope, ScopedLibrary } from '../lib/cloud-types';
import type { LibraryController } from '../lib/library-controller';
import type { PersonalAction, PersonalLibraryState } from '../lib/personal-types';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { commitScopedAction, loadScopedLibrary, restoreScopedLibrary } from '../lib/scoped-library';
import { subscribePersonalLibrary } from '../lib/personal-db';
import type { MotionPreference } from '../lib/types';

export function useAccountLibrary(scope: LibraryScope | null, deviceMotion: MotionPreference, identityIsCurrent: () => boolean) {
  const [snapshot, setSnapshot] = useState<ScopedLibrary | null>(null);
  const [failure, setFailure] = useState<{ scope: LibraryScope; message: string } | null>(null);
  const [pending, setPending] = useState(0);
  const currentScope = useRef(scope);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  currentScope.current = scope;
  const refresh = useCallback(async () => {
    if (!scope) return;
    try {
      await queue.current;
      if (currentScope.current !== scope || !identityIsCurrent()) return;
      const value = await loadScopedLibrary(scope, deviceMotion);
      if (currentScope.current === scope) { setSnapshot(value); setFailure(null); }
    } catch (error) {
      if (currentScope.current === scope) setFailure({ scope, message: error instanceof Error ? error.message : 'Account device storage is unavailable.' });
    }
  }, [scope, deviceMotion, identityIsCurrent]);
  useEffect(() => {
    if (!scope) return;
    void refresh();
    const unsubscribe = subscribePersonalLibrary(() => { void refresh(); }, scope);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { unsubscribe(); window.removeEventListener('focus', focus); };
  }, [scope, refresh]);
  const enqueue = useCallback((operation: () => Promise<ScopedLibrary>): Promise<boolean> => {
    const target = scope;
    if (!target) return Promise.resolve(false);
    setPending((count) => count + 1);
    const task = queue.current.then(async () => {
      try {
        const next = await operation();
        if (currentScope.current === target) { setSnapshot(next); setFailure(null); }
        return true;
      } catch (error) {
        if (currentScope.current === target) setFailure({ scope: target, message: error instanceof Error ? error.message : 'Your account change could not be saved on this device.' });
        return false;
      } finally { setPending((count) => count - 1); }
    });
    queue.current = task;
    return task;
  }, [scope]);
  const perform = useCallback((action: PersonalAction) => scope
    ? enqueue(() => commitScopedAction(scope, action)) : Promise.resolve(false), [scope, enqueue]);
  const restore = useCallback((state: PersonalLibraryState) => scope
    ? enqueue(() => restoreScopedLibrary(scope, state)) : Promise.resolve(false), [scope, enqueue]);
  const reset = useCallback(() => restore(emptyPersonalLibrary()), [restore]);
  const current = snapshot?.scope === scope ? snapshot : null;
  const error = failure?.scope === scope ? failure.message : null;
  const controller = useMemo<LibraryController>(() => ({
    state: current?.state ?? emptyPersonalLibrary(), status: current ? 'ready' : error ? 'temporary' : 'loading',
    warning: null, error, busy: pending > 0 || (!current && !error), perform, restore, reset,
  }), [current, error, pending, perform, restore, reset]);
  useEffect(() => {
    if (!pending) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [pending]);
  return { snapshot: current, controller, error, refresh, waitForWrites: () => queue.current };
}

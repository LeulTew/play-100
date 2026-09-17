import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { compareTrayStorageKey, createCompareDragSession, createCompareTrayStore } from '../../lib/compare-tray';
import { CompareTrayContext } from './compare-tray-context';

export function CompareTrayProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const mounted = useRef(true);
  const currentLease = useRef<object | null>(null);
  const { store, drag, lease } = useMemo(() => {
    const lease = {};
    const isCurrent = () => mounted.current && currentLease.current === lease;
    const store = createCompareTrayStore(scope, () => window.localStorage, isCurrent);
    return { store, drag: createCompareDragSession(scope, store, isCurrent), lease };
  }, [scope]);
  currentLease.current = lease;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    store.reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key === compareTrayStorageKey(scope) || event.key === null) store.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      drag.cancelDrag();
    };
  }, [scope, store, drag]);
  const value = useMemo(() => ({
    ...snapshot, currentScope: scope, pin: store.pin, unpin: store.unpin, clear: store.clear,
    beginDrag: drag.beginDrag, cancelDrag: drag.cancelDrag, dropGame: drag.dropGame,
  }), [snapshot, scope, store, drag]);
  return <CompareTrayContext.Provider value={value}>{children}<span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{snapshot.status}</span></CompareTrayContext.Provider>;
}

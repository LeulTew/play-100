import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { compareTrayStorageKey, createCompareTrayStore } from '../../lib/compare-tray';
import { CompareTrayContext } from './compare-tray-context';

export function CompareTrayProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const currentScope = useRef(scope);
  currentScope.current = scope;
  return <ScopedCompareTrayProvider key={scope} scope={scope} isCurrent={() => currentScope.current === scope}>{children}</ScopedCompareTrayProvider>;
}

function ScopedCompareTrayProvider({ scope, isCurrent, children }: { scope: string; isCurrent: () => boolean; children: ReactNode }) {
  const mounted = useRef(true);
  const [store] = useState(() => createCompareTrayStore(scope, () => window.localStorage, () => mounted.current && isCurrent()));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    mounted.current = true;
    const onStorage = (event: StorageEvent) => {
      if (event.key === compareTrayStorageKey(scope) || event.key === null) store.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      mounted.current = false;
      window.removeEventListener('storage', onStorage);
    };
  }, [scope, store]);
  const value = useMemo(() => ({ ...snapshot, currentScope: scope, pin: store.pin, unpin: store.unpin, clear: store.clear }), [snapshot, scope, store]);
  return <CompareTrayContext.Provider value={value}>{children}<span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{snapshot.status}</span></CompareTrayContext.Provider>;
}

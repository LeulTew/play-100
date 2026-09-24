import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { compareTrayStorageKey, createCompareDragSession, createCompareTrayStore } from '../../lib/compare-tray';
import { useMotionRuntime } from '../../motion';
import type { CompareTrayProviderProps } from './compare-drag-types';
import { createCompareDragController } from './compare-drag-controller';
import { CompareDragSourceContext } from './compare-drag-source-context';
import { CompareTrayContext } from './compare-tray-context';

export function CompareTrayProvider({ scope, children, interaction }: CompareTrayProviderProps) {
  const runtime = useMotionRuntime();
  const input = useRef(interaction);
  input.current = interaction;
  const mounted = useRef(true);
  const currentLease = useRef<object | null>(null);
  const { store, controller, lease } = useMemo(() => {
    const lease = {};
    const isCurrent = () => mounted.current && currentLease.current === lease;
    const store = createCompareTrayStore(scope, () => window.localStorage, isCurrent);
    const drag = createCompareDragSession(scope, store, isCurrent);
    const controller = createCompareDragController({
      store,
      drag,
      runtime,
      isCurrent,
      interaction: () => input.current,
    });
    return { store, controller, lease };
  }, [scope, runtime]);
  currentLease.current = lease;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    controller.resume();
    store.reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key === compareTrayStorageKey(scope) || event.key === null) store.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      controller.dispose();
    };
  }, [scope, store, controller]);
  useEffect(() => {
    controller.refresh();
  }, [controller, interaction]);
  const value = useMemo(
    () => ({
      ...snapshot,
      currentScope: scope,
      pin: controller.pin,
      unpin: store.unpin,
      clear: controller.clear,
      dismissError: store.dismissError,
    }),
    [snapshot, scope, store, controller],
  );
  return (
    <CompareTrayContext.Provider value={value}>
      <CompareDragSourceContext.Provider value={controller}>{children}</CompareDragSourceContext.Provider>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {snapshot.status}
      </span>
    </CompareTrayContext.Provider>
  );
}

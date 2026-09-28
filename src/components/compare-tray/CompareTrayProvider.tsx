import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { compareTrayStorageKey } from '../../lib/compare-tray';
import { useMotionRuntime } from '../../motion';
import type { CompareTrayProviderProps } from './compare-drag-types';
import { createCompareTrayBinding } from './compare-tray-binding';
import { CompareDragSourceContext } from './compare-drag-source-context';
import { CompareTrayContext } from './compare-tray-context';

export function CompareTrayProvider({ scope, children, interaction }: CompareTrayProviderProps) {
  const runtime = useMotionRuntime();
  const binding = useMemo(() => createCompareTrayBinding(scope, runtime), [scope, runtime]);
  const { store, controller } = binding;
  useLayoutEffect(() => {
    binding.setInteraction(interaction);
  }, [binding, interaction]);
  useLayoutEffect(() => binding.activate(), [binding]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key === compareTrayStorageKey(scope) || event.key === null) store.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [scope, store]);
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

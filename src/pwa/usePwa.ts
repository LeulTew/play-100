import { useEffect, useState, useSyncExternalStore } from 'react';
import { createDeferredPwaController, initialDeferredPwaState } from './deferred-controller';

export function usePwa({ enabled, menuOpen = false }: { enabled: boolean; menuOpen?: boolean }) {
  const [controller] = useState(createDeferredPwaController);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => initialDeferredPwaState);
  useEffect(() => enabled ? controller.connect() : undefined, [controller, enabled]);
  useEffect(() => { if (enabled && menuOpen) controller.connectNow(); }, [controller, enabled, menuOpen]);
  const readiness: { controlsReady?: boolean } = { controlsReady: controller.isConnected() };
  return {
    ...state,
    ...readiness,
    install: controller.install,
    prepareOffline: controller.prepareOffline,
    checkForUpdate: controller.checkForUpdate,
    applyUpdate: controller.applyUpdate,
  };
}

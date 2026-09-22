import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPwaController, initialPwaState } from './client';

export function usePwa({ enabled }: { enabled: boolean }) {
  const [controller] = useState(createPwaController);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => initialPwaState);
  useEffect(() => enabled ? controller.connect() : undefined, [controller, enabled]);
  return {
    ...state,
    install: controller.install,
    prepareOffline: controller.prepareOffline,
    checkForUpdate: controller.checkForUpdate,
    applyUpdate: controller.applyUpdate,
  };
}

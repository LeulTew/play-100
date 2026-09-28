import { useCallback } from 'react';
import { createPwaUpdateGuard, useInputGeneration } from '../pwa/update-guard';
import type { AppPanel } from '../lib/secondary-dialogs';
import { captureView } from '../lib/view-guard';
import { useLatest } from './useLatest';

interface PwaGuardInput {
  captureFocusGuard: () => () => boolean;
  busy: boolean;
  panel: AppPanel;
}

/** The reload guard the app provides, and the guard an update from Settings applies under. */
export function usePwaGuards({ captureFocusGuard, busy, panel }: PwaGuardInput) {
  const updateState = useLatest({ busy, panel });
  const inputGeneration = useInputGeneration();
  const captureReloadGuard = useCallback(
    () =>
      createPwaUpdateGuard({ isCurrent: captureFocusGuard(), busy: () => updateState.current.busy, inputGeneration }),
    [captureFocusGuard, updateState, inputGeneration],
  );
  const captureSettingsUpdateGuard = useCallback(() => {
    const currentScopeAndNavigation = captureFocusGuard();
    const view = captureView();
    const isCurrent = () => currentScopeAndNavigation() && updateState.current.panel === 'settings' && view();
    return createPwaUpdateGuard({ isCurrent, busy: () => updateState.current.busy, inputGeneration });
  }, [captureFocusGuard, updateState, inputGeneration]);
  return { captureReloadGuard, captureSettingsUpdateGuard };
}

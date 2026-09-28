import { useEffect, useMemo } from 'react';
import { loadAppTools } from '../lib/app-tool-preload';
import { scheduleIdlePrefetch } from '../lib/idle-prefetch';
import { effectiveMotionPreference, motionPreferencePending, startupMotionHint } from '../lib/motion-hint';
import type { MotionPreference } from '../lib/types';
import type { LibraryScope } from '../lib/cloud-types';
import type { useLibrary } from './useLibrary';
import { useCapabilities } from './useCapabilities';

/** The motion preference App applies, the device's capabilities under it, and the idle tool prefetch they allow. */
export function useAppCapabilities(
  libraryScope: LibraryScope,
  libraryStatus: ReturnType<typeof useLibrary>['status'],
  savedMotion: MotionPreference,
) {
  // The guest hint from before the library load could rewrite it (main.tsx), so the first commit matches the shell.
  const motionHint = useMemo(() => startupMotionHint(libraryScope), [libraryScope]);
  const effectiveMotion = effectiveMotionPreference(libraryStatus, savedMotion, motionHint);
  const motionPending = motionPreferencePending(libraryStatus, motionHint);
  const capabilities = useCapabilities(effectiveMotion);
  useEffect(() => {
    if (!capabilities.animate || capabilities.constrained || capabilities.hidden) return;
    return scheduleIdlePrefetch(loadAppTools, 1200);
  }, [capabilities.animate, capabilities.constrained, capabilities.hidden]);
  return { effectiveMotion, motionPending, capabilities };
}

import { useEffect, useMemo } from 'react';
import { loadAppTools } from '../lib/app-tool-preload';
import { scheduleDiscoverPrefetch } from '../lib/discover-page-preload';
import { scheduleIdlePrefetch } from '../lib/idle-prefetch';
import { effectiveMotionPreference, motionPreferencePending, startupMotionHint } from '../lib/motion-hint';
import type { MotionPreference } from '../lib/types';
import type { LibraryScope } from '../lib/cloud-types';
import type { useLibrary } from './useLibrary';
import { useCapabilities } from './useCapabilities';

/** The motion preference App applies, the device's capabilities under it, and the idle prefetches they allow. */
export function useAppCapabilities(
  libraryScope: LibraryScope,
  libraryStatus: ReturnType<typeof useLibrary>['status'],
  savedMotion: MotionPreference,
) {
  // The guest hint from before the library load could rewrite it (main.tsx), so the first commit matches the shell.
  const motionHint = useMemo(() => startupMotionHint(libraryScope), [libraryScope]);
  const effectiveMotion = effectiveMotionPreference(libraryStatus, savedMotion, motionHint);
  const motionPending = motionPreferencePending(libraryStatus, motionHint);
  const { reducedMotion, coarsePointer, hidden, constrained, animate } = useCapabilities(effectiveMotion);
  // The motion policy context value: one object per change, so useMotionPolicy() consumers skip App's other renders.
  const capabilities = useMemo(
    () => ({ reducedMotion, coarsePointer, hidden, constrained, animate }),
    [reducedMotion, coarsePointer, hidden, constrained, animate],
  );
  useEffect(() => {
    if (!capabilities.animate || capabilities.constrained || capabilities.hidden) return;
    return scheduleIdlePrefetch(loadAppTools, 1200);
  }, [capabilities.animate, capabilities.constrained, capabilities.hidden]);
  // Discover's code and catalog load at idle on constrained devices too, unless the reader keeps the app light: Lite
  // or reduced motion here, Save-Data or 2G when the idle callback runs (scheduleDiscoverPrefetch).
  const lite = effectiveMotion === 'lite';
  useEffect(() => {
    if (lite || capabilities.reducedMotion || capabilities.hidden) return;
    return scheduleDiscoverPrefetch();
  }, [lite, capabilities.reducedMotion, capabilities.hidden]);
  return { effectiveMotion, motionPending, capabilities };
}

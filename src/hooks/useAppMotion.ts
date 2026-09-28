import { useMemo } from 'react';
import type { OnlineBridge } from '../cloud/ui-types';
import type { MotionBoundary, MotionLocation } from '../motion';
import type { useLibrary } from './useLibrary';
import { useCommittedGeneration } from './useCommittedGeneration';

interface AppMotionInput {
  libraryScope: string;
  online: OnlineBridge | null;
  onlineOpening: boolean;
  libraryStatus: ReturnType<typeof useLibrary>['status'];
  selectedSlug: string | null;
  displayedDetailKey: string | null;
  overlayKey: MotionLocation['overlayKey'];
}

/** The motion boundary (the account and library App shows) and the committed location motion observes. */
export function useAppMotion({
  libraryScope,
  online,
  onlineOpening,
  libraryStatus,
  selectedSlug,
  displayedDetailKey,
  overlayKey,
}: AppMotionInput) {
  const boundaryGeneration = useCommittedGeneration([
    libraryScope,
    online?.identity?.uid ?? null,
    online?.identity?.verified ?? false,
    online?.enabled ?? false,
    onlineOpening,
    libraryStatus,
    Boolean(online?.controller),
  ]);
  const boundaryBlocked = onlineOpening || libraryStatus === 'loading';
  const motionBoundary: MotionBoundary = useMemo(
    () => ({ scopeKey: libraryScope, generation: boundaryGeneration, blocked: boundaryBlocked }),
    [libraryScope, boundaryGeneration, boundaryBlocked],
  );
  const viewParams = new URLSearchParams(window.location.search);
  viewParams.delete('game');
  const viewQuery = viewParams.toString();
  // Motion observes the committed URL; native Back notifications can arrive later.
  const motionNavigation = useCommittedGeneration([`${window.location.pathname}${window.location.search}`]);
  const motionLocation: MotionLocation = {
    viewKey: `${window.location.pathname}${viewQuery ? `?${viewQuery}` : ''}`,
    requestedDetailKey: selectedSlug,
    displayedDetailKey,
    navigationGeneration: motionNavigation,
    overlayKey,
  };
  return { motionBoundary, motionLocation };
}

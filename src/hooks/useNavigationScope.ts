import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { LibraryScope } from '../lib/cloud-types';
import { createValueStore } from '../lib/value-store';
import { useCommittedGeneration } from './useCommittedGeneration';

export function captureScopeNavigation(
  scope: Readonly<{ current: number }>,
  navigation: Readonly<{ current: number }>,
): () => boolean {
  const startedScope = scope.current;
  const startedNavigation = navigation.current;
  return () => scope.current === startedScope && navigation.current === startedNavigation;
}

const createNavigationStore = () => createValueStore(0);

export function useNavigationScope(libraryScope: LibraryScope) {
  // The generation counts committed scope changes, so a render React discards invalidates no pending work.
  const scopeEpoch = useCommittedGeneration([libraryScope]);
  const activeScope = useRef(libraryScope);
  const scopeGeneration = useRef(scopeEpoch);
  // Insertion effects run before every layout effect of the commit, so every guard already sees the new scope.
  useInsertionEffect(() => {
    activeScope.current = libraryScope;
    scopeGeneration.current = scopeEpoch;
  }, [libraryScope, scopeEpoch]);
  // Each Back, Forward or app navigation advances the navigation generation as it happens.
  const [navigation] = useState(createNavigationStore);
  const navigationEpoch = useSyncExternalStore(navigation.subscribe, navigation.get, navigation.get);
  const navigationGeneration = useMemo(
    () => ({
      get current() {
        return navigation.get();
      },
    }),
    [navigation],
  );
  useEffect(() => {
    const changed = () => navigation.set(navigation.get() + 1);
    window.addEventListener('popstate', changed);
    window.addEventListener('play100:navigate', changed);
    return () => {
      window.removeEventListener('popstate', changed);
      window.removeEventListener('play100:navigate', changed);
    };
  }, [navigation]);
  const captureFocusGuard = useCallback(
    () => captureScopeNavigation(scopeGeneration, navigationGeneration),
    [navigationGeneration],
  );
  return { activeScope, scopeGeneration, scopeEpoch, navigationGeneration, navigationEpoch, captureFocusGuard };
}

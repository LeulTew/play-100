import { useCallback, useEffect, useInsertionEffect, useRef } from 'react';
import type { LibraryScope } from '../lib/cloud-types';

export function captureScopeNavigation(
  scope: Readonly<{ current: number }>,
  navigation: Readonly<{ current: number }>,
): () => boolean {
  const startedScope = scope.current;
  const startedNavigation = navigation.current;
  return () => scope.current === startedScope && navigation.current === startedNavigation;
}

export function useNavigationScope(libraryScope: LibraryScope) {
  const activeScope = useRef(libraryScope);
  const scopeGeneration = useRef(0);
  // The generation counts committed scope changes, so a render React discards invalidates no pending work.
  // Insertion effects run before every layout effect of the commit, so every guard already sees the new scope.
  useInsertionEffect(() => {
    if (activeScope.current === libraryScope) return;
    activeScope.current = libraryScope;
    scopeGeneration.current += 1;
  }, [libraryScope]);
  const navigationGeneration = useRef(0);
  useEffect(() => {
    const changed = () => {
      navigationGeneration.current += 1;
    };
    window.addEventListener('popstate', changed);
    window.addEventListener('play100:navigate', changed);
    return () => {
      window.removeEventListener('popstate', changed);
      window.removeEventListener('play100:navigate', changed);
    };
  }, []);
  const captureFocusGuard = useCallback(() => captureScopeNavigation(scopeGeneration, navigationGeneration), []);
  return { activeScope, scopeGeneration, navigationGeneration, captureFocusGuard };
}

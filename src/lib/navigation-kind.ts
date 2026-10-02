/** How the app reached the page it shows: the document's own load, a navigation the app made, or a history traversal. */
export type NavigationKind = 'load' | 'app' | 'traverse';

/**
 * Follows the navigations of `target`. The app announces its own as `play100:navigate` (useUrlState); the browser's
 * back and forward fire `popstate`. Listeners added when this module loads run before any component subscribes to the
 * same events, so a page that renders for a traversal already reads 'traverse'.
 */
export function trackNavigationKind(target: Pick<EventTarget, 'addEventListener'>): () => NavigationKind {
  let kind: NavigationKind = 'load';
  target.addEventListener('popstate', () => {
    kind = 'traverse';
  });
  target.addEventListener('play100:navigate', () => {
    kind = 'app';
  });
  return () => kind;
}

export const navigationKind: () => NavigationKind =
  typeof window === 'undefined' ? () => 'load' : trackNavigationKind(window);

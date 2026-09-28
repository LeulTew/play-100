import { useSyncExternalStore } from 'react';

// App's own history changes dispatch play100:navigate; Back, Forward and friend links fire popstate.
export function subscribeOnlineLocation(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  window.addEventListener('play100:navigate', listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('play100:navigate', listener);
  };
}
export function readOnlineLocation(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** The parts of a URL (path and query) the online pages are keyed by: its path, Compare group and friend. */
export function onlineLocation(url: string) {
  const queryAt = url.indexOf('?');
  const pathname = queryAt < 0 ? url : url.slice(0, queryAt);
  const search = queryAt < 0 ? '' : url.slice(queryAt);
  return { pathname, group: new URLSearchParams(search).get('group') ?? '', peer: pathname.split('/')[2] ?? '' };
}
export type OnlineLocation = ReturnType<typeof onlineLocation>;

/**
 * The URL the online pages are keyed by. It is read through a subscription to navigation, so a navigation renders the
 * controller again even when App does not, and no render reads `location` itself.
 */
export function useOnlineLocation() {
  return onlineLocation(useSyncExternalStore(subscribeOnlineLocation, readOnlineLocation, () => '/'));
}

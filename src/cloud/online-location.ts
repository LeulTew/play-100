import { useState, useSyncExternalStore } from 'react';

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

/**
 * Which opening of Compare is current, as the generation Compare is keyed on. A navigation that changes the group the
 * URL names (Back, Forward, a link or one of App's own) opens Compare afresh, in a new generation. Compare changes
 * ?group= in place (replaceState, which notifies no one) when the user picks, saves or clears a group, and reports that
 * group with keep(), so the next navigation compares with it instead. Both change the route at once, outside render:
 * no render, at any priority, can take the page's own change for a navigation and remount the page, losing its unsaved
 * name and selection.
 */
export class CompareRoute {
  // The group the URL named at the last navigation or keep(), or null until first read.
  private group: string | null = null;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  private follow = () => {
    const group = onlineLocation(readOnlineLocation()).group;
    if (this.group === null) this.group = group;
    else if (group !== this.group) {
      this.group = group;
      this.generation += 1;
      for (const listener of [...this.listeners]) listener();
    }
  };
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    // Each subscription listens for itself, so ending one leaves the others listening.
    const unsubscribe = subscribeOnlineLocation(() => this.follow());
    // A navigation between the render that read the route and this subscription.
    this.follow();
    return () => {
      this.listeners.delete(listener);
      unsubscribe();
    };
  };
  getSnapshot = (): number => {
    if (this.group === null) this.follow();
    return this.generation;
  };
  /** Records a group Compare put in the URL itself, which is not a navigation. */
  keep = (group: string): void => {
    this.group = group;
  };
}

/** This controller's Compare route: its current generation, and keep() for Compare's own ?group= changes. */
export function useCompareRoute() {
  const [route] = useState(() => new CompareRoute());
  const generation = useSyncExternalStore(route.subscribe, route.getSnapshot, () => 0);
  return { generation, keep: route.keep };
}

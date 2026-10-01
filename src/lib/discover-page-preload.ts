import { loadDiscoveryCatalog } from './discovery-loader';
import { scheduleIdlePrefetch } from './idle-prefetch';
import { createMemoizedModule } from './memoized-module';

/** Discover's page module, shared by its lazy route and its prefetch. */
export const discoverPageModule = createMemoizedModule(() => import('../components/catalog/DiscoverPage'));

/**
 * Loads Discover's page and catalog through the loads its route shares, so opening Discover joins them. Once the
 * route has started its own loads, which retry a failed catalog themselves, nothing is left to prefetch.
 */
function prefetchDiscover(): Promise<unknown> {
  if (discoverPageModule.started()) return Promise.resolve();
  return Promise.all([discoverPageModule.load(), loadDiscoveryCatalog(new AbortController().signal)]);
}

/**
 * Prefetches Discover once the page is idle. The route waits longest for its code and catalog, and a slow device
 * longest of all, so only Save-Data, 2G, reduced motion or being offline skips it (the navigation mode). A failed
 * page module offers the route's reload recovery, as after any background preload.
 */
export function scheduleDiscoverPrefetch(): () => void {
  return scheduleIdlePrefetch(prefetchDiscover, undefined, 'navigation');
}

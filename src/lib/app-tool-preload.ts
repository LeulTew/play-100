import type { AppPage } from './types';
import { isConstrainedDevice } from './device-capabilities';
import { loadCatalogDetail } from './catalog-detail-preload';
import { loadDiscoveryParser } from './discovery-parser-preload';

export const loadComparisonTools = () => Promise.all([
  import('./comparison-game-filter'), import('./friend-comparison-intent'),
]);
const loadGoogleIntent = () => import('./google-intent');

export const loadAppTools = () => Promise.all([
  loadCatalogDetail(), loadDiscoveryParser(), loadGoogleIntent(), loadComparisonTools(),
]);

export function prefetchAppTools(route: AppPage): void {
  if (document.hidden || isConstrainedDevice(navigator)) return;
  const load = route === 'collection' || route === 'discover' ? loadDiscoveryParser() :
    route === 'account' ? loadGoogleIntent() : loadComparisonTools();
  void load.catch(() => { console.warn('Background tool preloading failed. The requested action can retry its normal load.'); });
}

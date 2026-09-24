import type { AppPage } from './types';
import { isConstrainedDevice } from './device-capabilities';
import { loadCatalogDetail } from './catalog-detail-preload';
import { loadDiscoveryParser } from './discovery-parser-preload';
import { loadSecondaryDialogs } from './secondary-dialogs';
import { createRetryableModule } from './retryable-module';

const comparisonFilter = createRetryableModule(() => import('./comparison-game-filter'));
const comparisonIntent = createRetryableModule(() => import('./friend-comparison-intent'));
export const loadComparisonTools = () => Promise.all([comparisonFilter.load(), comparisonIntent.load()]);
const loadGoogleIntent = createRetryableModule(() => import('./google-intent')).load;

export const loadAppTools = () =>
  Promise.all([
    loadCatalogDetail(),
    loadDiscoveryParser(),
    loadGoogleIntent(),
    loadComparisonTools(),
    loadSecondaryDialogs(),
  ]);

export function prefetchAppTools(route: AppPage): void {
  if (document.hidden || isConstrainedDevice(navigator)) return;
  const load =
    route === 'collection' || route === 'discover'
      ? loadDiscoveryParser()
      : route === 'account'
        ? loadGoogleIntent()
        : loadComparisonTools();
  void load.catch(() => {
    console.warn('Background tool preloading failed. Explicit use will offer reload recovery.');
  });
}

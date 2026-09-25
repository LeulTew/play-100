import type { AppPage } from './types';
import { isConstrainedDevice } from './device-capabilities';
import { loadCatalogDetail } from './catalog-detail-preload';
import { loadDiscoveryParser } from './discovery-parser-preload';
import { createRetryableModule } from './retryable-module';

const comparisonFilter = createRetryableModule(() => import('./comparison-game-filter'));
const comparisonIntent = createRetryableModule(() => import('./friend-comparison-intent'));
export const loadComparisonTools = () => Promise.all([comparisonFilter.load(), comparisonIntent.load()]);
const loadGoogleIntent = createRetryableModule(() => import('./google-intent')).load;

/**
 * The idle warm-up of every page (App.tsx, on capable devices only): what a page opens without navigating, a catalog
 * game's details and the catalog parser search uses. Sign-in, friend comparison and the secondary dialogs have no use
 * before their own intent (the Account and Friends links, the Menu and the footer's buttons), which warms them, and the
 * online bridge imports sign-in and comparison statically (docs/architecture.md, "Optional prefetch").
 */
export const loadAppTools = () => Promise.all([loadCatalogDetail(), loadDiscoveryParser()]);

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

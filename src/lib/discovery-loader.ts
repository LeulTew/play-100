import { DISCOVERY_CATALOG_URL, DISCOVERY_LIMITS } from './discovery-catalog-shared';
import type { DiscoveryCatalog } from './discovery-catalog';
import { fetchCatalogJson } from './catalog-transport';
import { loadDiscoveryParser } from './discovery-parser-preload';

export function createDiscoveryLoader() {
  let cached: DiscoveryCatalog | null = null;
  return async (signal: AbortSignal): Promise<DiscoveryCatalog> => {
    signal.throwIfAborted();
    if (cached) return cached;
    const payload = await fetchCatalogJson(DISCOVERY_CATALOG_URL, signal, DISCOVERY_LIMITS.metadataBytes, 8000);
    signal.throwIfAborted();
    const { parseDiscoveryCatalog } = await loadDiscoveryParser();
    signal.throwIfAborted();
    const catalog = parseDiscoveryCatalog(payload);
    signal.throwIfAborted();
    cached = catalog;
    return catalog;
  };
}

export const loadDiscoveryCatalog = createDiscoveryLoader();

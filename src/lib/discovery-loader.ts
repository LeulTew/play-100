import { DISCOVERY_CATALOG_URL, DISCOVERY_LIMITS } from './discovery-catalog-shared';
import type { DiscoveryCatalog } from './discovery-catalog';
import { fetchCatalogJson } from './catalog-transport';
import { loadDiscoveryParser } from './discovery-parser-preload';
import { abortReason, throwIfAborted } from './abort';

export function createDiscoveryLoader() {
  let cached: DiscoveryCatalog | null = null;
  let pending: Promise<DiscoveryCatalog> | null = null;
  return async (signal: AbortSignal): Promise<DiscoveryCatalog> => {
    throwIfAborted(signal);
    if (cached) return cached;
    pending ??= (async () => {
      // Callers cancel their wait, not this shared, size-limited and timed transport.
      const payload = await fetchCatalogJson(
        DISCOVERY_CATALOG_URL,
        new AbortController().signal,
        DISCOVERY_LIMITS.metadataBytes,
        8000,
      );
      const { parseDiscoveryCatalog } = await loadDiscoveryParser();
      cached = parseDiscoveryCatalog(payload);
      return cached;
    })().finally(() => {
      pending = null;
    });
    let abort: () => void = () => undefined;
    const canceled = new Promise<never>((_, reject) => {
      abort = () => reject(abortReason(signal));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    try {
      const catalog = await Promise.race([pending, canceled]);
      throwIfAborted(signal);
      return catalog;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  };
}

export const loadDiscoveryCatalog = createDiscoveryLoader();

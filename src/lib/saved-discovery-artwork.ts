import { throwIfAborted } from './abort';
import { loadDiscoveryCatalog } from './discovery-loader';
import type { CatalogArtwork } from './discovery-catalog-shared';
import { EMPTY_DISCOVERY_ARTWORK, hasKnownDiscoveryArtwork } from './discovery-artwork-presence';

export async function loadSavedDiscoveryArtwork(
  ids: readonly string[],
  signal: AbortSignal,
): Promise<ReadonlyMap<string, CatalogArtwork>> {
  throwIfAborted(signal);
  if (!ids.some(hasKnownDiscoveryArtwork)) return EMPTY_DISCOVERY_ARTWORK;
  const { indexDiscoveryArtwork } = await import('./discovery-catalog');
  throwIfAborted(signal);
  const catalog = await loadDiscoveryCatalog(signal);
  throwIfAborted(signal);
  return indexDiscoveryArtwork(catalog);
}

import { useMemo } from 'react';
import type { LibraryRecord } from '../lib/personal-types';
import { indexDiscoveryArtwork } from '../lib/discovery-catalog-shared';
import { EMPTY_DISCOVERY_ARTWORK, hasKnownDiscoveryArtwork } from '../lib/discovery-artwork-presence';
import { useDiscoveryCatalog } from './useDiscoveryCatalog';

// Artwork for the catalog games My games lists. Only My games uses it, so it loads with that page.
export function useDiscoveryArtwork(records: readonly LibraryRecord[], active: boolean) {
  const { catalog } = useDiscoveryCatalog(
    active && records.some((record) => record.source !== 'collection' && hasKnownDiscoveryArtwork(record.id)),
  );
  return useMemo(() => (catalog ? indexDiscoveryArtwork(catalog) : EMPTY_DISCOVERY_ARTWORK), [catalog]);
}

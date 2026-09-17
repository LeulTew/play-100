import { useMemo, useState } from 'react';
import { useCatalogSearch } from './useCatalogSearch';
import { useDiscoveryCatalog } from './useDiscoveryCatalog';
import { defaultDiscoveryFilters, searchDiscoveryItems, shouldSearchOnline } from '../lib/discovery-search';
export type { SourceSearchState } from '../lib/catalog-search-session';

export function useExtendedSearch(query: string, enabled: boolean) {
  const term = query.trim();
  const eligible = enabled && term.length >= 2 && term.length <= 80;
  const seed = useDiscoveryCatalog(eligible);
  const [requested, setRequested] = useState('');
  const matches = useMemo(() => eligible && seed.catalog
    ? searchDiscoveryItems(seed.catalog.items, { ...defaultDiscoveryFilters, q: term }) : [], [eligible, seed.catalog, term]);
  const remoteEnabled = shouldSearchOnline(term, eligible, seed.status, matches.length, requested === term);
  const remote = useCatalogSearch(term, remoteEnabled);
  const records = [...new Map([...matches.map((item) => item.record), ...remote.records].map((record) => [record.id, record])).values()];
  const artwork = useMemo(() => new Map(seed.catalog?.items.map((item) => [item.record.id, item.artwork]) ?? []), [seed.catalog]);
  return {
    ...remote, records, eligible, artwork, seedError: seed.error, seedRetry: seed.retry,
    loading: eligible && (seed.status === 'loading' || seed.status === 'idle' || remote.loading),
    searchOnline: () => setRequested(term), remoteEnabled,
  };
}

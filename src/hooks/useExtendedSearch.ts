import { useMemo, useState } from 'react';
import { useCatalogSearch } from './useCatalogSearch';
import { useDiscoveryCatalog } from './useDiscoveryCatalog';
import { defaultDiscoveryFilters, searchDiscoveryItems, shouldSearchOnline } from '../lib/discovery-search';
import { catalogSearchItems, resolveCatalogRecords } from '../lib/catalog-identity';
import type { Game } from '../lib/types';
export type { SourceSearchState } from '../lib/catalog-search-session';

export function useExtendedSearch(query: string, enabled: boolean, games: readonly Game[]) {
  const term = query.trim();
  const eligible = enabled && term.length >= 2 && term.length <= 80;
  const localEligible = games.length > 0 && term.length >= 2 && term.length <= 80;
  const seed = useDiscoveryCatalog(localEligible);
  const [requested, setRequested] = useState('');
  const matches = useMemo(
    () =>
      localEligible
        ? searchDiscoveryItems(catalogSearchItems(games, seed.catalog?.items ?? []), {
            ...defaultDiscoveryFilters,
            q: term,
          })
        : [],
    [localEligible, games, seed.catalog, term],
  );
  const remoteEnabled = shouldSearchOnline(term, eligible, seed.status, matches.length, requested === term);
  const remote = useCatalogSearch(term, remoteEnabled);
  const records = useMemo(
    () =>
      resolveCatalogRecords(
        [...matches.filter((item) => eligible || item.game).map((item) => item.record), ...remote.records],
        games,
      ),
    [matches, eligible, remote.records, games],
  );
  const artwork = useMemo(
    () => new Map(seed.catalog?.items.map((item) => [item.record.id, item.artwork]) ?? []),
    [seed.catalog],
  );
  return {
    ...remote,
    records,
    eligible,
    artwork,
    seedError: seed.error,
    seedRetry: seed.retry,
    loading: eligible && (seed.status === 'loading' || seed.status === 'idle' || remote.loading),
    searchOnline: () => setRequested(term),
    remoteEnabled,
  };
}

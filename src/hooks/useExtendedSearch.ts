import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useCatalogSearch } from './useCatalogSearch';
import { useDiscoveryCatalog } from './useDiscoveryCatalog';
import { defaultDiscoveryFilters, searchDiscoveryItems, shouldSearchOnline } from '../lib/discovery-search';
import { catalogSearchItems, resolveCatalogRecords } from '../lib/catalog-identity';
import type { Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
export type { SourceSearchState } from '../lib/catalog-search-session';

export interface ExtendedSearchResults {
  query: string;
  records: readonly LibraryRecord[];
}

export const ExtendedSearchResultsContext = createContext<
  Dispatch<SetStateAction<ExtendedSearchResults | null>> | undefined
>(undefined);

export function useExtendedSearch(query: string, enabled: boolean, games: readonly Game[]) {
  const publish = useContext(ExtendedSearchResultsContext);
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
  useEffect(() => {
    const current = { query: term, records };
    publish?.(current);
    return () => publish?.((previous) => (previous === current ? null : previous));
  }, [publish, term, records]);
  const artwork = useMemo(
    () => new Map(seed.catalog?.items.map((item) => [item.record.id, item.artwork]) ?? []),
    [seed.catalog],
  );
  return {
    ...remote,
    records,
    localRecords: matches.map((item) => item.record),
    eligible,
    artwork,
    seedError: seed.error,
    seedRetry: seed.retry,
    loading: eligible && (seed.status === 'loading' || seed.status === 'idle' || remote.loading),
    searchOnline: () => setRequested(term),
    remoteEnabled,
  };
}

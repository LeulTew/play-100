import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useCatalogSearch } from './useCatalogSearch';
import { useDiscoveryCatalog } from './useDiscoveryCatalog';
import { defaultDiscoveryFilters, searchDiscoveryItems, shouldSearchOnline } from '../lib/discovery-search';
import { catalogSearchItems, resolveCatalogRecords } from '../lib/catalog-identity';
import type { Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import type { ValueStore } from '../lib/value-store';
export type { SourceSearchState } from '../lib/catalog-search-session';

export interface ExtendedSearchResults {
  query: string;
  records: readonly LibraryRecord[];
}

export const ExtendedSearchResultsContext = createContext<ValueStore<ExtendedSearchResults | null> | null>(null);

const noRecords: readonly LibraryRecord[] = [];
const emptySnapshot = () => noRecords;
const noSubscription = () => () => {};

export function useExtendedSearchResults(query: string, enabled: boolean): readonly LibraryRecord[] {
  const store = useContext(ExtendedSearchResultsContext);
  const term = query.trim();
  const snapshot = useCallback(() => {
    const current = store?.get();
    return current?.query === term ? current.records : noRecords;
  }, [store, term]);
  return useSyncExternalStore(
    enabled && store ? store.subscribe : noSubscription,
    enabled ? snapshot : emptySnapshot,
    emptySnapshot,
  );
}

export function useExtendedSearch(query: string, enabled: boolean, games: readonly Game[]) {
  const store = useContext(ExtendedSearchResultsContext);
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
    store?.set(current);
    return () => {
      if (store?.get() === current) store.set(null);
    };
  }, [store, term, records]);
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

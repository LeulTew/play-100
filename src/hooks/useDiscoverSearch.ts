import { useMemo } from 'react';
import type { DiscoveryFilters } from '../lib/discovery-search';
import { DISCOVERY_PAGE_SIZE, shouldSearchOnline } from '../lib/discovery-search';
import { useDiscoveryCatalog } from './useDiscoveryCatalog';
import { useCatalogSearch } from './useCatalogSearch';
import { matchesProgress } from '../lib/game-progress';
import type { PersonalLibraryState } from '../lib/personal-types';
import type { Game } from '../lib/types';
import { catalogOwnership, catalogPageRecords, catalogProgress, catalogSearchItems, collectionGameForId, resolveCatalogRecords } from '../lib/catalog-identity';
import { getLocalPage } from '../lib/local-pagination';
import { matchesDiscoveryGenre } from '../lib/discovery-genres';
import { discoveryScope } from '../lib/discovery-scope';

export function useDiscoverSearch(filters: DiscoveryFilters, games: readonly Game[], canonicalReady: boolean, state: PersonalLibraryState) {
  const seed = useDiscoveryCatalog(true);
  const { q, source, genre, year, genreFamily, include100 } = filters;
  const progressView = filters.progress ?? 'all';
  const ownership = useMemo(() => catalogOwnership(state.records), [state.records]);
  const progress = useMemo(() => catalogProgress(state, ownership), [state, ownership]);
  const items = useMemo(() => canonicalReady ? catalogSearchItems(games, seed.catalog?.items ?? []) : [], [canonicalReady, games, seed.catalog]);
  const scope = useMemo(() => discoveryScope(items, { q, source, genre, year, genreFamily, include100 }), [items, q, source, genre, year, genreFamily, include100]);
  const local = useMemo(() => scope.cards.filter(item => matchesProgress(progress[item.record.id], progressView)), [scope.cards, progress, progressView]);
  const remoteEnabled = shouldSearchOnline(filters.q, canonicalReady && source !== 'collection' && filters.catalogs === 'on' && progressView === 'all' &&
    (filters.online === 'on' || !scope.exactCollectionMatch), seed.status, local.length, filters.online === 'on');
  const remote = useCatalogSearch(filters.q, remoteEnabled, source === 'collection' ? 'all' : source, filters.online === 'on' ? filters.offset : 0);
  const resolvedRemote = (canonicalReady ? resolveCatalogRecords(remote.records, games) : []).filter((record) =>
    matchesProgress(progress[record.id], progressView) && matchesDiscoveryGenre(record.genre, genre, genreFamily) && (!filters.year || record.year === Number(filters.year)));
  const remoteRecords = scope.showCollection ? resolvedRemote : resolvedRemote.filter(record => !collectionGameForId(games, record.id));
  const collectionMatches = [...new Map([
    ...scope.collectionMatches.filter(item => matchesProgress(progress[item.record.id], progressView)).map(item => item.record),
    ...resolvedRemote.filter(record => collectionGameForId(games, record.id)),
  ].map(record => [record.id, record])).values()];
  const localReady = canonicalReady && (source === 'collection' || seed.status === 'ready' || seed.status === 'error');
  const localPage = getLocalPage(local.length, DISCOVERY_PAGE_SIZE, filters.offset);
  const localOffset = filters.online === 'on' ? 0 : localReady ? localPage.offset : filters.offset;
  const records = catalogPageRecords(local, remoteRecords, localOffset, DISCOVERY_PAGE_SIZE);
  const artwork = useMemo(() => new Map(seed.catalog?.items.map((item) => [item.record.id, item.artwork]) ?? []), [seed.catalog]);
  return {
    seed, local, records, artwork, remote, remoteEnabled, items, ownership, localReady, localPage,
    collectionMatches, showCollection: scope.showCollection,
  };
}

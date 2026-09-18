import { useMemo } from 'react';
import type { DiscoveryFilters } from '../lib/discovery-search';
import { DISCOVERY_PAGE_SIZE, searchDiscoveryItems, shouldSearchOnline } from '../lib/discovery-search';
import { useDiscoveryCatalog } from './useDiscoveryCatalog';
import { useCatalogSearch } from './useCatalogSearch';
import { matchesProgress } from '../lib/game-progress';
import type { PersonalProgress } from '../lib/personal-types';

export function useDiscoverSearch(filters: DiscoveryFilters, progress: Record<string, PersonalProgress>) {
  const seed = useDiscoveryCatalog(true);
  const { q, source, genre, year } = filters;
  const progressView = filters.progress ?? 'all';
  const local = useMemo(() => seed.catalog ? searchDiscoveryItems(seed.catalog.items, { q, source, genre, year }).filter(item => matchesProgress(progress[item.record.id], progressView)) : [],
    [seed.catalog, q, source, genre, year, progress, progressView]);
  const remoteEnabled = shouldSearchOnline(filters.q, filters.catalogs === 'on' && progressView === 'all', seed.status, local.length, filters.online === 'on');
  const remote = useCatalogSearch(filters.q, remoteEnabled, filters.source, filters.offset);
  const remoteRecords = remote.records.filter((record) =>
    matchesProgress(progress[record.id], progressView) && (!filters.genre || record.genre === filters.genre) && (!filters.year || record.year === Number(filters.year)));
  const localOffset = filters.online === 'on' ? 0 : filters.offset;
  const localPage = local.slice(localOffset, localOffset + DISCOVERY_PAGE_SIZE);
  const visibleLocalIds = new Set(localPage.map((item) => item.record.id));
  const records = [...localPage.map((item) => item.record), ...remoteRecords.filter((record) => !visibleLocalIds.has(record.id))];
  const artwork = useMemo(() => new Map(seed.catalog?.items.map((item) => [item.record.id, item.artwork]) ?? []), [seed.catalog]);
  return {
    seed, local, records, artwork, remote, remoteEnabled,
  };
}

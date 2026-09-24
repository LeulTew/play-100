import type { CatalogSearchItem } from './catalog-identity';
import { catalogRelevance } from './catalog-query';
import type { DiscoveryFilters } from './discovery-search';
import { searchDiscoveryItems } from './discovery-search';

export function discoveryScope<T extends CatalogSearchItem>(
  items: readonly T[],
  filters: Pick<DiscoveryFilters, 'q' | 'source' | 'genre' | 'genreFamily' | 'year' | 'include100'>,
) {
  const matches = searchDiscoveryItems(items, filters);
  const collectionMatches = matches.filter((item) => item.game);
  const showCollection = filters.include100 === 'on' || filters.source === 'collection';
  return {
    cards: showCollection ? matches : matches.filter((item) => !item.game),
    collectionMatches,
    showCollection,
    exactCollectionMatch: Boolean(
      filters.q.trim() &&
      collectionMatches.some((item) => {
        const relevance = catalogRelevance(item.record.title, item.aliases, filters.q);
        return relevance !== null && relevance <= 1;
      }),
    ),
  };
}

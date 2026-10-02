import { canonicalCatalogId } from './catalog-identity.js';
import type { CatalogSearchItem } from './catalog-identity.js';
import { normalizeCatalogQuery } from './catalog-query.js';
import type { CatalogSource } from './catalog-types.js';
import type { LibraryRecord } from './personal-types.js';

// Result matching for Discover and The 100's extended results. Both load lazily, unlike catalog-identity.ts.

export function newOnlineMatchCounts(
  sources: readonly { source: CatalogSource; records: readonly LibraryRecord[] }[],
  local: readonly LibraryRecord[],
  shown: readonly LibraryRecord[],
): Record<CatalogSource, number> {
  const seen = new Set(local.map((record) => canonicalCatalogId(record.id)));
  const visible = new Set(shown.map((record) => canonicalCatalogId(record.id)));
  const counts = { wikidata: 0, freetogame: 0 };
  for (const source of sources) {
    for (const record of source.records) {
      const id = canonicalCatalogId(record.id);
      if (!seen.has(id) && visible.has(id)) {
        counts[source.source]++;
        seen.add(id);
      }
    }
  }
  return counts;
}

export function collidingCatalogTitles(records: readonly LibraryRecord[]): ReadonlySet<string> {
  const titles = new Map<string, string[]>();
  for (const record of records) {
    const title = normalizeCatalogQuery(record.title);
    const ids = titles.get(title) ?? [];
    ids.push(record.id);
    titles.set(title, ids);
  }
  return new Set([...titles.values()].filter((ids) => new Set(ids).size > 1).flat());
}

export function catalogPageRecords(
  local: readonly CatalogSearchItem[],
  remote: readonly LibraryRecord[],
  offset: number,
  limit: number,
): LibraryRecord[] {
  const localIds = new Set(local.map((item) => item.record.id));
  return [
    ...local.slice(offset, offset + limit).map((item) => item.record),
    ...new Map(remote.filter((record) => !localIds.has(record.id)).map((record) => [record.id, record])).values(),
  ];
}

import type { Filters, Game } from './types';
import type { LibraryRecord, PersonalProgress } from './personal-types';
import { sortDirection } from './collection';
import { matchesCatalogQuery } from './catalog-query';
import { matchesProgressFilters } from './game-progress';

export function unrankedRecords(games: Game[], saved: Record<string, LibraryRecord>, online: LibraryRecord[]): LibraryRecord[] {
  const curated = new Set(games.map((game) => game.slug));
  return [...new Map([...online, ...Object.values(saved)].map((record) => [record.id, record])).values()]
    .filter((record) => !curated.has(record.id));
}

export function filterUnranked(records: LibraryRecord[], filters: Filters, progress: Record<string, PersonalProgress>, onlineMatches: ReadonlySet<string> = new Set()): LibraryRecord[] {
  if (filters.tier !== 'all') return [];
  const result = records.filter((record) => {
    if (filters.genre && record.genre !== filters.genre) return false;
    if (filters.year && record.year !== Number(filters.year)) return false;
    const state = progress[record.id];
    if (!matchesProgressFilters(state, filters)) return false;
    // Source searches can match an alias that is not included in the imported title.
    if (onlineMatches.has(record.id)) return true;
    return matchesCatalogQuery(`${record.title} ${record.studio ?? ''} ${record.genre ?? ''} ${record.year ?? ''}`, filters.q);
  });
  if (filters.sort === 'rank') return result;
  const direction = sortDirection(filters) === 'asc' ? 1 : -1;
  return result.sort((a, b) => {
    if (filters.sort === 'newest' || filters.sort === 'oldest') {
      if (a.year === null) return b.year === null ? a.title.localeCompare(b.title) : 1;
      if (b.year === null) return -1;
      return direction * (a.year - b.year) || a.title.localeCompare(b.title);
    }
    return (filters.sort === 'title' ? direction : 1) * a.title.localeCompare(b.title, 'en');
  });
}

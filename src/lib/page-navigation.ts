import type { AppPage, Filters } from './types';
import { createSearch, defaultFilters, PAGE_PATHS } from './url';
import { myGamesSearch } from './my-games-navigation';

export function pageDestination(page: AppPage, current: Pick<Filters, 'catalogs'>, patch: Partial<Filters> = {}) {
  const filters = { ...defaultFilters, catalogs: current.catalogs, ...patch };
  if (page === 'games' || page === 'library' || page === 'rankings') {
    const tab = page === 'rankings' ? 'ranking' : patch.list === 'later' ? 'queue' : 'library';
    return { path: PAGE_PATHS.games, search: myGamesSearch(filters, tab) };
  }
  return { path: PAGE_PATHS[page], search: createSearch(filters) };
}

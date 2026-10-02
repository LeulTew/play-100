import type { AppPage, Filters, SortOrder } from './types.js';
import { parseProgressFilter } from './game-progress.js';
import { appRoute } from './routes.js';
import { parseDiscoveryGenreFamily } from './discovery-genres.js';

// Error reports read the route list from here so it stays in this eager chunk rather than a chunk of its own.
export { APP_ROUTES, appRoute } from './routes.js';

export const SORT_ORDERS = [
  'rank',
  'title',
  'newest',
  'oldest',
  'score',
  'metacritic',
  'metacriticPc',
  'ign',
  'gamespot',
  'pcGamer',
  'rank-index',
  'author-rating',
] as const satisfies readonly SortOrder[];
export const PAGE_PATHS: Record<AppPage, string> = {
  collection: '/',
  games: '/my-games',
  library: '/my-library',
  rankings: '/my-rankings',
  discover: '/discover',
  account: '/account',
  publish: '/publish',
  community: '/community',
  profile: '/community',
  creator: '/creator',
  friends: '/friends',
  friend: '/friends',
  invite: '/invite',
  compare: '/compare',
  'friend-sharing': '/friends/sharing',
  'friend-shelf': '/friends/sharing/games',
};

export function pageFromPath(path: string): AppPage {
  const normalized = path.replace(/\/+$/, '') || '/';
  const route = appRoute(normalized);
  if (route?.page === 'friend' && !/^\/friends\/[A-Za-z0-9_-]{1,128}$/.test(normalized)) return 'collection';
  return route?.page ?? 'collection';
}

export const defaultFilters: Filters = {
  q: '',
  genre: '',
  genreFamily: '',
  year: '',
  tier: 'all',
  list: 'all',
  sort: 'rank',
  direction: 'auto',
  view: 'grid',
  catalogs: 'on',
  progress: 'all',
};

export function parseUrl(search: string): { filters: Filters; game: string | null } {
  const params = new URLSearchParams(search);
  const list = params.get('list');
  const sort = params.get('sort');
  const view = params.get('view');
  const tier = params.get('tier');
  const year = params.get('year') ?? '';
  const direction = params.get('direction');
  return {
    filters: {
      q: (params.get('q') ?? '').slice(0, 160),
      genre: (params.get('genre') ?? '').slice(0, 120),
      genreFamily: parseDiscoveryGenreFamily(params.get('genreFamily')),
      year: /^\d{4}$/.test(year) ? year : '',
      tier: tier === 'core' || tier === 'essential' ? tier : 'all',
      list: list === 'later' || list === 'completed' || list === 'unplayed' ? list : 'all',
      sort: SORT_ORDERS.find((option) => option === sort) ?? 'rank',
      direction: direction === 'asc' || direction === 'desc' ? direction : 'auto',
      view: view === 'list' || view === 'table' ? view : 'grid',
      catalogs: params.get('catalogs') === 'off' ? 'off' : 'on',
      progress: parseProgressFilter(params.get('progress')),
    },
    game: params.get('game'),
  };
}

export function createSearch(filters: Filters, game: string | null = null): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaultFilters) as (keyof Filters)[]) {
    const value = filters[key] ?? defaultFilters[key];
    if (value !== undefined && value !== defaultFilters[key]) params.set(key, value);
  }
  if (game) params.set('game', game);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function createShareLink(
  origin: string,
  filters: Filters,
  game: string | null,
): { url: string; privateFilter: boolean } {
  const publicSearch = createSearch({ ...filters, list: 'all', progress: 'all' }, game);
  return { url: `${origin}/${publicSearch}`, privateFilter: publicSearch !== createSearch(filters, game) };
}

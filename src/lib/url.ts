import type { AppPage, Filters, SortOrder } from './types';

export const SORT_ORDERS = ['rank', 'title', 'newest', 'oldest', 'score', 'metacritic', 'metacriticPc', 'ign', 'gamespot', 'pcGamer', 'rank-index', 'author-rating'] as const satisfies readonly SortOrder[];
export const PAGE_PATHS: Record<AppPage, string> = { collection: '/', library: '/my-library', rankings: '/my-rankings', discover: '/discover', account: '/account', publish: '/publish', community: '/community', profile: '/community', creator: '/creator', friends: '/friends', friend: '/friends', invite: '/invite', compare: '/compare', 'friend-sharing': '/friends/sharing' };

export function pageFromPath(path: string): AppPage {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/my-library') return 'library';
  if (normalized === '/my-rankings') return 'rankings';
  if (normalized === '/discover') return 'discover';
  if (normalized === '/account') return 'account';
  if (normalized === '/publish') return 'publish';
  if (normalized === '/community') return 'community';
  if (/^\/u\/[^/]+$/.test(normalized)) return 'profile';
  if (normalized === '/creator') return 'creator';
  if (normalized === '/friends') return 'friends';
  if (normalized === '/friends/sharing') return 'friend-sharing';
  if (/^\/friends\/[A-Za-z0-9_-]{1,128}$/.test(normalized)) return 'friend';
  if (normalized === '/invite') return 'invite';
  if (normalized === '/compare') return 'compare';
  return 'collection';
}

export const defaultFilters: Filters = {
  q: '', genre: '', year: '', tier: 'all', list: 'all', sort: 'rank', direction: 'auto', view: 'grid', catalogs: 'on',
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
      year: /^\d{4}$/.test(year) ? year : '',
      tier: tier === 'core' || tier === 'essential' ? tier : 'all',
      list: list === 'later' || list === 'completed' || list === 'unplayed' ? list : 'all',
      sort: SORT_ORDERS.find((option) => option === sort) ?? 'rank',
      direction: direction === 'asc' || direction === 'desc' ? direction : 'auto',
      view: view === 'list' || view === 'table' ? view : 'grid',
      catalogs: params.get('catalogs') === 'off' ? 'off' : 'on',
    },
    game: params.get('game'),
  };
}

export function createSearch(filters: Filters, game: string | null = null): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaultFilters) as (keyof Filters)[]) {
    if (filters[key] !== defaultFilters[key]) params.set(key, filters[key]);
  }
  if (game) params.set('game', game);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function createShareUrl(origin: string, filters: Filters, game: string | null): string {
  return `${origin}/${createSearch({ ...filters, list: 'all' }, game)}`;
}

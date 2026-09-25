import type { Filters } from './types';
import { createSearch } from './url';

export type MyGamesTab = 'library' | 'queue' | 'ranking';

export function myGamesTab(path: string, search: string): MyGamesTab {
  const normalized = path.replace(/\/+$/, '');
  if (normalized === '/my-rankings') return 'ranking';
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (normalized === '/my-games' && (tab === 'library' || tab === 'queue' || tab === 'ranking')) return tab;
  return params.get('list') === 'later' ? 'queue' : 'library';
}

export function parseLibraryPage(search: string): number {
  const value = new URLSearchParams(search).get('page') ?? '';
  return /^[1-9]\d{0,3}$/.test(value) ? Number(value) : 1;
}

export function libraryPageSearch(search: string, page: number): string {
  if (!Number.isInteger(page) || page < 1 || page > 9999) {
    throw new RangeError('A Library page must be a positive integer below 10000.');
  }
  const params = new URLSearchParams(search);
  if (page === 1) params.delete('page');
  else params.set('page', String(page));
  return params.size ? `?${params}` : '';
}

export function myGamesSearch(filters: Filters, tab: MyGamesTab, game: string | null = null, libraryPage = 1): string {
  const list = filters.list === 'later' ? 'all' : filters.list;
  const params = new URLSearchParams(createSearch({ ...filters, list }, game));
  if (tab !== 'library') params.set('tab', tab);
  return libraryPageSearch(params.size ? `?${params}` : '', tab === 'queue' ? 1 : libraryPage);
}

export function gameDetailSearch(search: string, game: string | null): string {
  const params = new URLSearchParams(search);
  if (game === null) params.delete('game');
  else params.set('game', game);
  return params.size ? `?${params}` : '';
}

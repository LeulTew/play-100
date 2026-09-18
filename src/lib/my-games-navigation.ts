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

export function myGamesSearch(filters: Filters, tab: MyGamesTab, game: string | null = null): string {
  const list = filters.list === 'later' ? 'all' : filters.list;
  const params = new URLSearchParams(createSearch({ ...filters, list }, game));
  if (tab !== 'library') params.set('tab', tab);
  return params.size ? `?${params}` : '';
}

export function gameDetailSearch(search: string, game: string | null): string {
  const params = new URLSearchParams(search);
  if (game === null) params.delete('game');
  else params.set('game', game);
  return params.size ? `?${params}` : '';
}

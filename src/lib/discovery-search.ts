import type { DiscoveryItem } from './discovery-catalog';
import type { CatalogSource } from './catalog-types';
import { catalogRelevance, matchesCatalogQuery } from './catalog-query';
import { parseProgressFilter } from './game-progress';
import type { ProgressFilter } from './game-progress';

export const DISCOVERY_PAGE_SIZE = 24;
export interface DiscoveryFilters {
  q: string;
  source: 'all' | CatalogSource;
  genre: string;
  year: string;
  offset: number;
  view: 'grid' | 'list';
  catalogs: 'on' | 'off';
  online: 'auto' | 'on';
  progress?: ProgressFilter;
}
export const defaultDiscoveryFilters: DiscoveryFilters = { q: '', source: 'all', genre: '', year: '', offset: 0, view: 'grid', catalogs: 'on', online: 'auto', progress: 'all' };

export function parseDiscoverySearch(search: string): DiscoveryFilters {
  const params = new URLSearchParams(search);
  const source = params.get('source');
  const offset = params.get('offset') ?? '0';
  const year = params.get('year') ?? '';
  return {
    q: [...(params.get('q') ?? '')].map((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character).join('').slice(0, 80),
    source: source === 'wikidata' || source === 'freetogame' ? source : 'all',
    genre: (params.get('genre') ?? '').slice(0, 200),
    year: /^(19|20)\d{2}$|^2100$/.test(year) ? year : '',
    offset: /^\d+$/.test(offset) && Number(offset) <= 10_000 ? Number(offset) : 0,
    view: params.get('view') === 'list' ? 'list' : 'grid',
    catalogs: params.get('catalogs') === 'off' ? 'off' : 'on',
    online: params.get('online') === 'on' ? 'on' : 'auto',
    progress: parseProgressFilter(params.get('progress')),
  };
}

export function createDiscoverySearch(filters: DiscoveryFilters): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaultDiscoveryFilters) as (keyof DiscoveryFilters)[]) {
    const value = filters[key] ?? defaultDiscoveryFilters[key];
    if (value !== undefined && value !== defaultDiscoveryFilters[key]) params.set(key, String(value));
  }
  return params.size ? `?${params}` : '';
}

export function shouldSearchOnline(query: string, allowed: boolean, seedStatus: 'idle' | 'loading' | 'ready' | 'error', localCount: number, explicit = false): boolean {
  return allowed && (explicit || seedStatus === 'error' || seedStatus === 'ready' && query.trim().length >= 2 && localCount < 6);
}

export function searchDiscoveryItems(items: readonly DiscoveryItem[], filters: Pick<DiscoveryFilters, 'q' | 'source' | 'genre' | 'year'>): DiscoveryItem[] {
  const found = items.flatMap((item) => {
    const { record } = item;
    if (filters.source !== 'all' && record.source !== filters.source ||
      filters.genre && record.genre !== filters.genre || filters.year && record.year !== Number(filters.year)) return [];
    const relevance = catalogRelevance(record.title, item.aliases, filters.q);
    if (relevance !== null) return [{ item, relevance }];
    return matchesCatalogQuery(`${record.title} ${record.studio ?? ''} ${record.genre ?? ''} ${record.year ?? ''}`, filters.q) ? [{ item, relevance: 4 }] : [];
  });
  return found.sort((a, b) => {
    if (filters.q.trim()) return a.relevance - b.relevance || a.item.record.title.localeCompare(b.item.record.title, 'en') || a.item.record.id.localeCompare(b.item.record.id);
    return Number(Boolean(b.item.artwork)) - Number(Boolean(a.item.artwork)) ||
      a.item.record.title.localeCompare(b.item.record.title, 'en') || a.item.record.id.localeCompare(b.item.record.id);
  }).map(({ item }) => item);
}

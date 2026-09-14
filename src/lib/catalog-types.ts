import type { LibraryRecord } from './personal-types';
import { emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';

export type CatalogSource = 'wikidata' | 'freetogame';

export interface CatalogPage {
  source: CatalogSource;
  query: string;
  items: LibraryRecord[];
  total: number;
  offset: number;
  nextOffset: number | null;
  notices: string[];
}

export function parseCatalogPage(value: unknown): CatalogPage {
  if (typeof value !== 'object' || value === null) throw new Error('The catalog returned an unreadable response.');
  const row = value as Record<string, unknown>;
  if (
    (row.source !== 'wikidata' && row.source !== 'freetogame') || typeof row.query !== 'string' ||
    !Array.isArray(row.items) || row.items.length > 20 || typeof row.total !== 'number' || !Number.isSafeInteger(row.total) || row.total < 0 ||
    typeof row.offset !== 'number' || !Number.isSafeInteger(row.offset) || row.offset < 0 ||
    (row.nextOffset !== null && (typeof row.nextOffset !== 'number' || !Number.isSafeInteger(row.nextOffset) || row.nextOffset <= row.offset)) ||
    !Array.isArray(row.notices) || !row.notices.every((notice): notice is string => typeof notice === 'string')
  ) throw new Error('The catalog returned invalid pagination or source information.');
  const recordMap: Record<string, unknown> = Object.create(null);
  for (const item of row.items) {
    if (typeof item !== 'object' || item === null || !('id' in item) || typeof item.id !== 'string' ||
      !('source' in item) || item.source !== row.source || Object.hasOwn(recordMap, item.id)) throw new Error('The catalog returned invalid or duplicate games.');
    recordMap[item.id] = item;
  }
  const parsed = parsePersonalLibrary({ ...emptyPersonalLibrary(), records: recordMap });
  return {
    source: row.source, query: row.query, items: Object.values(parsed.records), total: row.total,
    offset: row.offset, nextOffset: row.nextOffset, notices: row.notices,
  };
}

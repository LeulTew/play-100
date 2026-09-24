import { parseCatalogPage } from './catalog-types';
import type { CatalogPage, CatalogSource } from './catalog-types';
import { CatalogRequestError, fetchCatalogJson } from './catalog-transport';

export async function fetchCatalogPage(
  source: CatalogSource,
  query: string,
  offset: number,
  signal: AbortSignal,
): Promise<CatalogPage> {
  if (
    !['wikidata', 'freetogame'].includes(source) ||
    query.length > 80 ||
    [...query].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10_000
  ) {
    throw new CatalogRequestError('Use a search of up to 80 characters and a valid catalog page.', 'invalid');
  }
  const payload = await fetchCatalogJson(
    `/api/catalog?${new URLSearchParams({ source, q: query.trim(), offset: String(offset) })}`,
    signal,
    256 * 1024,
  );
  const page = parseCatalogPage(payload);
  if (page.source !== source || page.query !== query.trim() || page.offset !== offset)
    throw new Error('The catalog returned results for a different search or page. Please try again.');
  return page;
}

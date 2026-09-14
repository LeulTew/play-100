import { parseCatalogPage } from './catalog-types';
import type { CatalogPage, CatalogSource } from './catalog-types';

export async function fetchCatalogPage(source: CatalogSource, query: string, offset: number, signal: AbortSignal): Promise<CatalogPage> {
  const response = await fetch(`/api/catalog?${new URLSearchParams({ source, q: query.trim(), offset: String(offset) })}`, { signal });
  let payload: unknown;
  try { payload = await response.json(); }
  catch {
    if (signal.aborted) throw signal.reason;
    throw new Error('The catalog service returned an unreadable response. Please try again later.');
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error : 'The public catalog is temporarily unavailable.';
    throw new Error(message);
  }
  const page = parseCatalogPage(payload);
  if (page.source !== source || page.query !== query.trim() || page.offset !== offset) throw new Error('The catalog returned results for a different search or page. Please try again.');
  return page;
}

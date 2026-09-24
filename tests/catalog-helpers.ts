import type { Page, Route } from '@playwright/test';
import type { CatalogSource } from '../src/lib/catalog-types';
import type { LibraryRecord } from '../src/lib/personal-types';

export function catalogRecord(source: CatalogSource, sourceId: string, title: string): LibraryRecord {
  return {
    id: `${source}:${sourceId}`,
    title,
    source,
    sourceId,
    collectionRank: null,
    year: 2020,
    studio: 'Example studio',
    genre: 'Action RPG',
    sourceUrl:
      source === 'wikidata'
        ? `https://www.wikidata.org/wiki/${sourceId}`
        : `https://www.freetogame.com/open/${sourceId}`,
  };
}

export async function respondWithCatalog(route: Route, items: LibraryRecord[], nextOffset: number | null = null) {
  const url = new URL(route.request().url());
  const offset = Number(url.searchParams.get('offset') ?? 0);
  await route.fulfill({
    json: {
      source: url.searchParams.get('source'),
      query: url.searchParams.get('q') ?? '',
      offset,
      items,
      total: offset + items.length + (nextOffset === null ? 0 : 5),
      nextOffset,
      notices: [],
    },
  });
}

export async function emptyCatalogs(page: Page) {
  await page.route('**/api/catalog?**', (route) => respondWithCatalog(route, []));
}

import { canonicalCatalogId } from './catalog-identity';

export interface PublicCatalogIdentity {
  id: string;
  source: 'wikidata' | 'freetogame';
  sourceId: string;
}

export function enrichmentIdentity(id: string): PublicCatalogIdentity | null {
  if (canonicalCatalogId(id) !== id) return null;
  const match = /^(wikidata):(Q[1-9]\d{0,14})$|^(freetogame):([1-9]\d{0,14})$/.exec(id);
  if (!match) return null;
  return match[1] && match[2] ? { id, source: 'wikidata', sourceId: match[2] }
    : match[4] ? { id, source: 'freetogame', sourceId: match[4] } : null;
}

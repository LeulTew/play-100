import type { LibraryRecord } from './personal-types.js';

export const DISCOVERY_CATALOG_URL = '/data/discovery/catalog.v1.json';
export const DISCOVERY_LIMITS = {
  items: 1_000,
  aliases: 30,
  metadataBytes: 3 * 1024 * 1024,
  imageBytes: 80 * 1024,
  totalImageBytes: 35 * 1024 * 1024,
  imageEdge: 640,
} as const;

export interface CatalogArtwork {
  src: string;
  width: number;
  height: number;
  alt: string;
  sourceUrl: string;
  credit: string;
  license: string;
  licenseUrl: string;
  originalUrl: string;
  retrievedAt: string;
  sha256: string;
  bytes: number;
}

export interface DiscoveryItem {
  record: LibraryRecord;
  aliases: string[];
  artwork: CatalogArtwork | null;
  provenance: {
    retrievedAt: string;
    metadataLicense: 'CC0-1.0' | 'FreeToGame API terms';
    metadataLicenseUrl: string;
    artworkMissingReason: string | null;
  };
}

export interface DiscoveryCatalog {
  schemaVersion: 1;
  generatedAt: string;
  items: DiscoveryItem[];
}

export function indexDiscoveryArtwork(catalog: DiscoveryCatalog): ReadonlyMap<string, CatalogArtwork> {
  return new Map(catalog.items.flatMap(({ record, artwork }) => (artwork ? [[record.id, artwork] as const] : [])));
}

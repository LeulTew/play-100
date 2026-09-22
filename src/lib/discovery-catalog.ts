import type { LibraryRecord } from './personal-types';
import { emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import { hasAsciiControl } from './text-controls';

export const DISCOVERY_CATALOG_URL = '/data/discovery/catalog.v1.json';
export const DISCOVERY_LIMITS = {
  items: 1_000, aliases: 30, metadataBytes: 3 * 1024 * 1024,
  imageBytes: 80 * 1024, totalImageBytes: 35 * 1024 * 1024, imageEdge: 640,
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

function invalid(message: string): never {
  throw new Error(`Invalid discovery catalog: ${message}`);
}

function shape(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('expected an object.');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid('unsupported object type.');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || !fields.every((key) => Object.hasOwn(value, key))) {
    return invalid('missing or unknown fields.');
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !fields.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) {
      return invalid('expected enumerable data fields.');
    }
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || hasAsciiControl(value)) {
    return invalid(`expected nonempty text of at most ${limit} characters.`);
  }
  return value;
}

function integer(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) {
    return invalid(`expected an integer from 1 to ${max}.`);
  }
  return value;
}

function timestamp(value: unknown): string {
  const result = text(value, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) ||
    !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) {
    return invalid('expected an ISO UTC timestamp.');
  }
  return result;
}

function https(value: unknown, hosts: readonly string[]): string {
  const result = text(value, 2_000);
  let url: URL;
  try { url = new URL(result); } catch { return invalid('malformed URL.'); }
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password ||
    url.port || /[\s\\]/.test(result)) return invalid('unsafe URL.');
  return result;
}

const commonsHosts = ['commons.wikimedia.org'] as const;

export function parseCatalogArtwork(value: unknown): CatalogArtwork {
  const row = shape(value, [
    'src', 'width', 'height', 'alt', 'sourceUrl', 'credit', 'license', 'licenseUrl',
    'originalUrl', 'retrievedAt', 'sha256', 'bytes',
  ]);
  const sha256 = text(row.sha256, 64);
  const src = text(row.src, 160);
  if (!/^[a-f0-9]{64}$/.test(sha256) || src !== `/images/discovery/${sha256}.webp`) {
    return invalid('artwork must use its content-addressed local WebP path.');
  }
  const sourceUrl = https(row.sourceUrl, commonsHosts);
  if (!new URL(sourceUrl).pathname.startsWith('/wiki/File:')) return invalid('expected a Commons file page.');
  const originalUrl = https(row.originalUrl, ['upload.wikimedia.org']);
  if (!new URL(originalUrl).pathname.startsWith('/wikipedia/commons/')) return invalid('expected a Commons asset.');
  const license = text(row.license, 100);
  const licenseUrl = https(row.licenseUrl, ['creativecommons.org']);
  const licensePath = new URL(licenseUrl).pathname;
  const expectedLicense = /^\/licenses\/(by|by-sa)\/(2\.0|2\.5|3\.0|4\.0)\/$/.exec(licensePath);
  const matchesLicense = expectedLicense
    ? license === `CC ${expectedLicense[1]!.toUpperCase()} ${expectedLicense[2]}`
    : licensePath === '/publicdomain/zero/1.0/' ? license === 'CC0'
      : licensePath === '/publicdomain/mark/1.0/' && license === 'Public domain';
  if (!matchesLicense || new URL(licenseUrl).search || new URL(licenseUrl).hash) {
    return invalid('unsupported or mismatched image license.');
  }
  return {
    src, width: integer(row.width, DISCOVERY_LIMITS.imageEdge), height: integer(row.height, DISCOVERY_LIMITS.imageEdge),
    alt: text(row.alt, 300), sourceUrl, credit: text(row.credit, 2_000), license, licenseUrl,
    originalUrl, retrievedAt: timestamp(row.retrievedAt), sha256, bytes: integer(row.bytes, DISCOVERY_LIMITS.imageBytes),
  };
}

export function parseDiscoveryCatalog(value: unknown): DiscoveryCatalog {
  const root = shape(value, ['schemaVersion', 'generatedAt', 'items']);
  if (root.schemaVersion !== 1 || !Array.isArray(root.items) || !root.items.length ||
    root.items.length > DISCOVERY_LIMITS.items) return invalid('unsupported version or item count.');
  const generatedAt = timestamp(root.generatedAt);
  const records: Record<string, unknown> = Object.create(null);
  const pending = root.items.map((value: unknown) => {
    const row = shape(value, ['record', 'aliases', 'artwork', 'provenance']);
    const record = shape(row.record, ['id', 'title', 'year', 'studio', 'genre', 'source', 'sourceId', 'sourceUrl', 'collectionRank']);
    const sourceId = text(record.sourceId, 100);
    const id = text(record.id, 120);
    if ((record.source !== 'wikidata' && record.source !== 'freetogame') ||
      id !== `${record.source}:${sourceId}` || Object.hasOwn(records, id) ||
      !(record.source === 'wikidata' ? /^Q[1-9]\d{0,14}$/ : /^[1-9]\d{0,14}$/).test(sourceId)) {
      return invalid('unsupported, duplicate or mismatched record identity.');
    }
    const sourceUrl = https(record.sourceUrl, record.source === 'wikidata'
      ? ['www.wikidata.org'] : ['www.freetogame.com', 'freetogame.com']);
    if (record.source === 'wikidata' && sourceUrl !== `https://www.wikidata.org/wiki/${sourceId}`) {
      return invalid('Wikidata source URL does not match its ID.');
    }
    if (record.source === 'freetogame' && !/^\/[a-z0-9-]+$/.test(new URL(sourceUrl).pathname)) {
      return invalid('expected a FreeToGame profile URL.');
    }
    if (new URL(sourceUrl).search || new URL(sourceUrl).hash) return invalid('unexpected source URL parameters.');
    records[id] = record;
    if (!Array.isArray(row.aliases) || row.aliases.length > DISCOVERY_LIMITS.aliases) return invalid('too many aliases.');
    const aliases = row.aliases.map((alias: unknown) => text(alias, 200));
    if (new Set(aliases).size !== aliases.length) return invalid('duplicate aliases.');
    const provenance = shape(row.provenance, ['retrievedAt', 'metadataLicense', 'metadataLicenseUrl', 'artworkMissingReason']);
    const metadataLicense: DiscoveryItem['provenance']['metadataLicense'] =
      record.source === 'wikidata' ? 'CC0-1.0' : 'FreeToGame API terms';
    const metadataLicenseUrl = record.source === 'wikidata'
      ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://www.freetogame.com/api-doc';
    if (provenance.metadataLicense !== metadataLicense || provenance.metadataLicenseUrl !== metadataLicenseUrl) {
      return invalid('mismatched metadata license.');
    }
    const artwork = row.artwork === null ? null : parseCatalogArtwork(row.artwork);
    const artworkMissingReason = artwork === null ? text(provenance.artworkMissingReason, 300) : null;
    if (artwork && provenance.artworkMissingReason !== null) return invalid('artwork has a missing-art reason.');
    // The existing strict personal parser remains authoritative; no images enter LibraryRecord.
    return {
      recordId: id, aliases, artwork,
      provenance: { retrievedAt: timestamp(provenance.retrievedAt), metadataLicense, metadataLicenseUrl, artworkMissingReason },
    };
  });
  const parsed = parsePersonalLibrary({ ...emptyPersonalLibrary(), records }).records;
  const items: DiscoveryItem[] = pending.map(({ recordId, ...item }) => ({ ...item, record: parsed[recordId]! }));
  const assets = new Map<string, CatalogArtwork>();
  for (const { artwork, provenance } of items) {
    if (provenance.retrievedAt > generatedAt || (artwork && artwork.retrievedAt > generatedAt)) {
      return invalid('retrieval happened after generation.');
    }
    if (!artwork) continue;
    const prior = assets.get(artwork.src);
    if (prior && (prior.bytes !== artwork.bytes || prior.width !== artwork.width || prior.height !== artwork.height)) {
      return invalid('inconsistent shared asset dimensions or bytes.');
    }
    assets.set(artwork.src, artwork);
  }
  if ([...assets.values()].reduce((sum, asset) => sum + asset.bytes, 0) > DISCOVERY_LIMITS.totalImageBytes) {
    return invalid('local artwork exceeds 35 MiB.');
  }
  const result: DiscoveryCatalog = { schemaVersion: 1, generatedAt, items };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > DISCOVERY_LIMITS.metadataBytes) {
    return invalid('metadata exceeds 3 MiB.');
  }
  return result;
}

export function parseDiscoveryCatalogJson(json: string): DiscoveryCatalog {
  if (new TextEncoder().encode(json).byteLength > DISCOVERY_LIMITS.metadataBytes) {
    return invalid('metadata exceeds 3 MiB.');
  }
  return parseDiscoveryCatalog(JSON.parse(json));
}

export function indexDiscoveryArtwork(catalog: DiscoveryCatalog): ReadonlyMap<string, CatalogArtwork> {
  return new Map(catalog.items.flatMap(({ record, artwork }) => artwork ? [[record.id, artwork] as const] : []));
}

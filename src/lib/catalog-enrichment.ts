import { hasAsciiControl } from './text-controls.js';
import { enrichmentIdentity } from './catalog-enrichment-identity.js';
export { enrichmentIdentity } from './catalog-enrichment-identity.js';
export type { PublicCatalogIdentity } from './catalog-enrichment-identity.js';

export const ENRICHMENT_LIMITS = {
  responseBytes: 192 * 1024,
  ratings: 24,
  platforms: 8,
  cacheEntries: 24,
  cacheMs: 30 * 60_000,
  imageBytes: 80 * 1024,
  imageEdge: 480,
  creditLength: 2000,
} as const;

export interface ReportedScore {
  text: string;
  value: number;
  scale: number;
  unit: 'points' | 'percent';
}
export interface CatalogExternalRating {
  id: string;
  source: 'wikidata' | 'steam';
  kind: 'review-score' | 'user-recommendations';
  publisher: string;
  publisherId: string | null;
  score: ReportedScore;
  platforms: string[];
  method: string | null;
  count: number | null;
  asOf: string | null;
  referenceDate: string | null;
  retrievedAt: string;
  sourceUrl: string;
  referenceUrl: string | null;
}
export interface ExternalCatalogArtwork {
  kind: 'commons-raster';
  src: string;
  width: number;
  height: number;
  alt: string;
  sourceUrl: string;
  originalUrl: string;
  license: string;
  licenseUrl: string;
  credit: string;
  retrievedAt: string;
}
export type EnrichmentSource = 'wikidata' | 'steam' | 'commons' | 'freetogame';
export interface EnrichmentSourceState {
  source: EnrichmentSource;
  status: 'ready' | 'unavailable' | 'error';
  code: 'missing' | 'unsupported' | 'ambiguous' | 'rate-limited' | 'timeout' | 'invalid' | 'unavailable' | null;
  message: string;
  retryAfter: number;
}
export interface CatalogEnrichment {
  schemaVersion: 1;
  id: string;
  fetchedAt: string;
  ratings: CatalogExternalRating[];
  artwork: ExternalCatalogArtwork | null;
  sources: EnrichmentSourceState[];
}

export function parseReportedScore(text: string): ReportedScore | null {
  const match = /^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?)|(%))$/.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  const scale = match[3] ? 100 : Number(match[2]);
  if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0 || scale > 1000 || value < 0 || value > scale)
    return null;
  return { text, value, scale, unit: match[3] ? 'percent' : 'points' };
}

function invalid(): never {
  throw new Error('The public game details returned an invalid response. Please retry.');
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  )
    return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim() && value.length <= max && !hasAsciiControl(value)
    ? value
    : invalid();
}
function optionalText(value: unknown, max: number) {
  return value === null ? null : text(value, max);
}
function number(value: unknown, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : invalid();
}
function integer(value: unknown, min: number, max: number): number {
  return Number.isSafeInteger(value) ? number(value, min, max) : invalid();
}
function date(value: unknown): string {
  const result = text(value, 24);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString() !== result
  )
    return invalid();
  return result;
}
function day(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value, 10);
  if (!/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(result)) return invalid();
  const full = result.length === 4 ? `${result}-01-01` : result.length === 7 ? `${result}-01` : result;
  if (
    !Number.isFinite(Date.parse(`${full}T00:00:00Z`)) ||
    new Date(`${full}T00:00:00Z`).toISOString().slice(0, 10) !== full
  )
    return invalid();
  return result;
}
export function publicHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000 || hasAsciiControl(value) || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.includes('.') &&
      !url.hostname.endsWith('.local') &&
      !/^(?:localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)/.test(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function url(value: unknown): string {
  return publicHttpsUrl(value) ?? invalid();
}

function parseRating(value: unknown, expectedId: string): CatalogExternalRating {
  const row = object(value, [
    'id',
    'source',
    'kind',
    'publisher',
    'publisherId',
    'score',
    'platforms',
    'method',
    'count',
    'asOf',
    'referenceDate',
    'retrievedAt',
    'sourceUrl',
    'referenceUrl',
  ]);
  if (row.source !== 'wikidata' && row.source !== 'steam') return invalid();
  if (row.kind !== 'review-score' && row.kind !== 'user-recommendations') return invalid();
  if (row.kind !== (row.source === 'steam' ? 'user-recommendations' : 'review-score')) return invalid();
  const raw = object(row.score, ['text', 'value', 'scale', 'unit']);
  const score = parseReportedScore(text(raw.text, 80));
  if (!score || score.value !== raw.value || score.scale !== raw.scale || score.unit !== raw.unit) return invalid();
  if (!Array.isArray(row.platforms) || row.platforms.length > ENRICHMENT_LIMITS.platforms) return invalid();
  const sourceUrl = url(row.sourceUrl);
  if (
    row.source === 'wikidata'
      ? sourceUrl !== `https://www.wikidata.org/wiki/${expectedId.slice('wikidata:'.length)}#P444`
      : !/^https:\/\/store\.steampowered\.com\/app\/[1-9]\d*\/#app_reviews_hash$/.test(sourceUrl)
  )
    return invalid();
  if (!expectedId.startsWith('wikidata:')) return invalid();
  const publisherId = optionalText(row.publisherId, 20);
  if (publisherId && !/^Q[1-9]\d{0,14}$/.test(publisherId)) return invalid();
  return {
    id: text(row.id, 140),
    source: row.source,
    kind: row.kind,
    publisher: text(row.publisher, 200),
    publisherId,
    score,
    platforms: row.platforms.map((value) => text(value, 200)),
    method: optionalText(row.method, 240),
    count: row.count === null ? null : integer(row.count, 0, 1_000_000_000),
    asOf: day(row.asOf),
    referenceDate: day(row.referenceDate),
    retrievedAt: date(row.retrievedAt),
    sourceUrl,
    referenceUrl: row.referenceUrl === null ? null : url(row.referenceUrl),
  };
}

export function parseExternalCatalogArtwork(value: unknown): ExternalCatalogArtwork | null {
  if (value === null) return null;
  const row = object(value, [
    'kind',
    'src',
    'width',
    'height',
    'alt',
    'sourceUrl',
    'originalUrl',
    'license',
    'licenseUrl',
    'credit',
    'retrievedAt',
  ]);
  if (row.kind !== 'commons-raster') return invalid();
  const src = text(row.src, Math.ceil(ENRICHMENT_LIMITS.imageBytes / 3) * 4 + 32);
  if (!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) return invalid();
  const encoded = src.slice('data:image/webp;base64,'.length);
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  if (encoded.length % 4 !== 0 || (encoded.length / 4) * 3 - padding > ENRICHMENT_LIMITS.imageBytes) return invalid();
  const sourceUrl = url(row.sourceUrl);
  const originalUrl = url(row.originalUrl);
  const licenseUrl = url(row.licenseUrl);
  const license = text(row.license, 100);
  const cc = /^CC (BY|BY-SA) (2\.0|2\.5|3\.0|4\.0)$/.exec(license);
  const expected = cc
    ? `https://creativecommons.org/licenses/${cc[1]!.toLowerCase()}/${cc[2]}/`
    : license === 'CC0'
      ? 'https://creativecommons.org/publicdomain/zero/1.0/'
      : license === 'Public domain'
        ? 'https://creativecommons.org/publicdomain/mark/1.0/'
        : null;
  if (
    new URL(sourceUrl).origin !== 'https://commons.wikimedia.org' ||
    !new URL(sourceUrl).pathname.startsWith('/wiki/File:') ||
    new URL(originalUrl).origin !== 'https://upload.wikimedia.org' ||
    !new URL(originalUrl).pathname.startsWith('/wikipedia/commons/') ||
    !expected ||
    expected !== licenseUrl
  )
    return invalid();
  return {
    kind: 'commons-raster',
    src,
    width: integer(row.width, 1, ENRICHMENT_LIMITS.imageEdge),
    height: integer(row.height, 1, ENRICHMENT_LIMITS.imageEdge),
    alt: text(row.alt, 300),
    sourceUrl,
    originalUrl,
    license,
    licenseUrl,
    credit: text(row.credit, ENRICHMENT_LIMITS.creditLength),
    retrievedAt: date(row.retrievedAt),
  };
}

export function parseCatalogEnrichment(value: unknown, expectedId: string): CatalogEnrichment {
  const row = object(value, ['schemaVersion', 'id', 'fetchedAt', 'ratings', 'artwork', 'sources']);
  if (
    row.schemaVersion !== 1 ||
    row.id !== expectedId ||
    !enrichmentIdentity(expectedId) ||
    !Array.isArray(row.ratings) ||
    row.ratings.length > ENRICHMENT_LIMITS.ratings ||
    !Array.isArray(row.sources) ||
    !row.sources.length ||
    row.sources.length > 4
  )
    return invalid();
  const ratings = row.ratings.map((value) => parseRating(value, expectedId));
  if (new Set(ratings.map((rating) => rating.id)).size !== ratings.length) return invalid();
  const sources: EnrichmentSourceState[] = row.sources.map((value) => {
    const source = object(value, ['source', 'status', 'code', 'message', 'retryAfter']);
    if (
      source.source !== 'wikidata' &&
      source.source !== 'steam' &&
      source.source !== 'commons' &&
      source.source !== 'freetogame'
    )
      return invalid();
    if (source.status !== 'ready' && source.status !== 'unavailable' && source.status !== 'error') return invalid();
    if (
      source.code !== null &&
      source.code !== 'missing' &&
      source.code !== 'unsupported' &&
      source.code !== 'ambiguous' &&
      source.code !== 'rate-limited' &&
      source.code !== 'timeout' &&
      source.code !== 'invalid' &&
      source.code !== 'unavailable'
    )
      return invalid();
    if ((source.status === 'ready') !== (source.code === null)) return invalid();
    return {
      source: source.source,
      status: source.status,
      code: source.code,
      message: text(source.message, 500),
      retryAfter: integer(source.retryAfter, 0, 300),
    };
  });
  if (new Set(sources.map((source) => source.source)).size !== sources.length) return invalid();
  return {
    schemaVersion: 1,
    id: expectedId,
    fetchedAt: date(row.fetchedAt),
    ratings,
    artwork: parseExternalCatalogArtwork(row.artwork),
    sources,
  };
}

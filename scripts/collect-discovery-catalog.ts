import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  DISCOVERY_LIMITS, parseDiscoveryCatalog, parseDiscoveryCatalogJson,
  type CatalogArtwork, type DiscoveryCatalog, type DiscoveryItem,
} from '../src/lib/discovery-catalog.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USER_AGENT = 'Play100Discovery/1.0 (https://github.com/LeulTew/play-100; explicit public catalog snapshot)';
const WIKI = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const FTG = 'https://www.freetogame.com/api/games';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const FTG_TERMS = 'https://www.freetogame.com/api-doc';
const FTG_ART_REASON = 'FreeToGame API metadata is permitted; thumbnail display/copy rights are not explicit. Image excluded.';
const MAX_RESPONSE = 8 * 1024 * 1024;
const MAX_DOWNLOAD = 6 * 1024 * 1024;
const MAX_REQUESTS = 700;
const MAX_TRANSFER = 250 * 1024 * 1024;
const WIKI_SEARCH_COUNT = 350;
const MAX_ART_FILES = 240;

// These are lookup inputs, not invented records. Every result must independently assert P31=Q7889.
export const FEATURED_WIKI_TITLES = [
  'Kingdom Come: Deliverance', 'Kingdom Come: Deliverance II', 'Elden Ring', "Baldur's Gate 3",
  'The Witcher 3: Wild Hunt', 'Cyberpunk 2077', 'Red Dead Redemption 2', 'Grand Theft Auto V',
  'The Elder Scrolls V: Skyrim', 'Fallout 4', 'Fallout: New Vegas', 'Starfield (video game)',
  'The Legend of Zelda: Breath of the Wild', 'The Legend of Zelda: Tears of the Kingdom',
  'Super Mario Odyssey', 'Super Mario Galaxy', 'Super Mario World', 'Super Mario 64',
  'The Last of Us', 'The Last of Us Part II', 'God of War (2018 video game)', 'God of War Ragnarök',
  'Horizon Zero Dawn', 'Horizon Forbidden West', 'Ghost of Tsushima', 'Death Stranding',
  'Bloodborne', 'Dark Souls', 'Dark Souls III', 'Sekiro: Shadows Die Twice', "Demon's Souls",
  'Resident Evil 4 (2023 video game)', 'Resident Evil Village', 'Silent Hill 2',
  'Final Fantasy VII', 'Final Fantasy VII Remake', 'Final Fantasy XVI', 'Final Fantasy XV',
  'Persona 5', 'Persona 4', 'Monster Hunter: World', 'Monster Hunter Wilds',
  'Metal Gear Solid V: The Phantom Pain', 'Metal Gear Solid 3: Snake Eater',
  'Mass Effect 2', 'Mass Effect 3', 'Dragon Age: Inquisition', 'Dragon Age: Origins',
  'Half-Life', 'Half-Life 2', 'Portal (video game)', 'Portal 2', 'BioShock', 'BioShock Infinite',
  'Doom (2016 video game)', 'Doom Eternal', 'Wolfenstein: The New Order',
  'Halo: Combat Evolved', 'Halo 3', 'Halo Infinite', 'Gears of War',
  "Assassin's Creed II", "Assassin's Creed IV: Black Flag", "Assassin's Creed Odyssey",
  'Far Cry 3', 'Far Cry 5', 'Watch Dogs 2', 'Tom Clancy\'s Rainbow Six Siege',
  'Uncharted 4: A Thief\'s End', 'Marvel\'s Spider-Man', 'Marvel\'s Spider-Man 2',
  'Batman: Arkham City', 'Batman: Arkham Knight', 'Control (video game)', 'Alan Wake 2',
  'Tomb Raider (2013 video game)', 'Rise of the Tomb Raider', 'Hitman: World of Assassination',
  'Forza Horizon 5', 'Gran Turismo 7', 'Microsoft Flight Simulator (2020 video game)',
  'Civilization VI', 'Age of Empires II', 'Age of Empires IV', 'StarCraft II: Wings of Liberty',
  'Warcraft III: Reign of Chaos', 'Diablo II', 'Diablo IV', 'World of Warcraft',
  'Minecraft', 'Terraria', 'Stardew Valley', 'Hades (video game)', 'Hollow Knight',
  'Celeste (video game)', 'Undertale', 'Disco Elysium', 'Outer Wilds',
  'It Takes Two (video game)', 'Baldur\'s Gate II: Shadows of Amn', 'Divinity: Original Sin II',
  'Cities: Skylines', 'The Sims 4', 'Crusader Kings III', 'Total War: Warhammer III',
  'NieR: Automata', 'Yakuza 0', 'Like a Dragon: Infinite Wealth', 'Metaphor: ReFantazio',
  'Clair Obscur: Expedition 33', 'Black Myth: Wukong', 'Astro Bot', 'Balatro (video game)',
  'Satisfactory', 'Factorio', 'RimWorld', 'Subnautica', 'No Man\'s Sky', 'Valheim',
];

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}
function requiredObject(value: unknown, label: string): JsonObject {
  const result = object(value);
  if (!result) throw new Error(`Invalid ${label}: expected an object.`);
  return result;
}
function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function requiredText(value: unknown, label: string, max = 200): string {
  const result = string(value);
  if (!result || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) throw new Error(`Invalid ${label}.`);
  return result;
}
function optionalText(value: unknown): string | null {
  return value === undefined || value === null || value === '' ? null : requiredText(value, 'source metadata');
}
export function checksum(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function apiUrl(base: string, parameters: Record<string, string>): string {
  const url = new URL(base);
  url.search = new URLSearchParams({ format: 'json', maxlag: '5', ...parameters }).toString();
  return url.href;
}

export function validateFetchUrl(value: string, image: boolean): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || /[\s\\]/.test(value)) {
    throw new Error('Unsafe upstream URL.');
  }
  const allowed = image
    ? ['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname) &&
      url.pathname.startsWith('/wikipedia/commons/') && /\.(png|jpe?g|webp)$/i.test(url.pathname)
    : (url.origin === 'https://www.freetogame.com' && url.pathname === '/api/games' && !url.search) ||
      (['https://www.wikidata.org', 'https://commons.wikimedia.org'].includes(url.origin) && url.pathname === '/w/api.php' &&
        ['query', 'wbgetentities'].includes(url.searchParams.get('action') ?? ''));
  if (!allowed || /%(?:2f|5c|00)/i.test(url.pathname)) throw new Error(`Upstream endpoint not allowlisted: ${url.origin}${url.pathname}`);
  return url;
}

export class UpstreamError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class BoundedClient {
  requests = 0;
  transferredBytes = 0;
  private nextRequest = 0;
  private busy = false;
  constructor(
    readonly signal: AbortSignal,
    private readonly fetcher: typeof fetch = fetch,
    private readonly pause: (ms: number, signal: AbortSignal) => Promise<void> = sleep,
    private readonly clock: () => number = Date.now,
  ) {}

  async bytes(value: string, image = false): Promise<Buffer> {
    const url = validateFetchUrl(value, image);
    // Serial requests are intentional: <=1 concurrent, <=2 starts/second globally.
    if (this.busy) throw new Error('Collector requests must remain serial.');
    this.busy = true;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        this.signal.throwIfAborted();
        await this.pause(Math.max(0, this.nextRequest - this.clock()), this.signal);
        if (++this.requests > MAX_REQUESTS) throw new Error(`Request budget exceeded (${MAX_REQUESTS}); last good snapshot preserved.`);
        this.nextRequest = this.clock() + 550;
        const signal = AbortSignal.any([this.signal, AbortSignal.timeout(30_000)]);
        const response = await this.fetcher(url, {
          redirect: 'error', signal, headers: { 'User-Agent': USER_AGENT, Accept: image ? 'image/png,image/jpeg,image/webp' : 'application/json' },
        });
        if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
          await response.body?.cancel();
          const retry = response.headers.get('retry-after');
          const delay = retry
            ? /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - this.clock()
            : 2000 * 2 ** attempt;
          if (!Number.isFinite(delay) || delay > 60_000) throw new UpstreamError('Provider requests a longer wait. Rerun later; snapshot unchanged.', response.status);
          await this.pause(Math.max(2000 * 2 ** attempt, delay), this.signal);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new UpstreamError(`Provider HTTP ${response.status}: ${url.origin}${url.pathname}`, response.status);
        }
        const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        if (!(image ? ['image/png', 'image/jpeg', 'image/webp'].includes(contentType ?? '') : contentType === 'application/json')) {
          await response.body?.cancel();
          throw new Error(`Unexpected content type ${contentType}; refusing HTML or non-raster content.`);
        }
        const limit = image ? MAX_DOWNLOAD : MAX_RESPONSE;
        if (Number(response.headers.get('content-length')) > limit || !response.body) {
          await response.body?.cancel();
          throw new Error('Upstream response is empty or exceeds the byte budget.');
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            this.transferredBytes += part.value.byteLength;
            if (size > limit || this.transferredBytes > MAX_TRANSFER) {
              await reader.cancel();
              throw new Error('Upstream byte budget exceeded; last good snapshot preserved.');
            }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
        return Buffer.concat(chunks);
      }
      throw new Error('Provider retry budget exhausted.');
    } finally { this.busy = false; }
  }

  async json(url: string): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result: unknown = JSON.parse((await this.bytes(url)).toString('utf8'));
      const error = object(object(result)?.error);
      if (error?.code === 'maxlag' && attempt < 2) {
        await this.pause(5000 * 2 ** attempt, this.signal);
        continue;
      }
      if (error) throw new Error(`Provider API error: ${string(error.code) ?? 'unknown'}. Rerun later; snapshot unchanged.`);
      return result;
    }
    throw new Error('Provider API retry budget exhausted.');
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function claims(entity: JsonObject, property: string): unknown[] {
  const values = object(entity.claims)?.[property];
  if (!Array.isArray(values)) return [];
  return values.filter((value) => object(value)?.rank !== 'deprecated').flatMap((value) => {
    const snak = object(object(value)?.mainsnak);
    return snak?.snaktype === 'value' ? [object(snak.datavalue)?.value] : [];
  });
}
function related(entity: JsonObject, property: string): string[] {
  return claims(entity, property).flatMap((value) => {
    const id = string(object(value)?.id);
    return id && /^Q[1-9]\d*$/.test(id) ? [id] : [];
  });
}
function label(entity: unknown): string | null {
  const labels = object(object(entity)?.labels);
  return string(object(labels?.en)?.value) ?? string(object(labels?.mul)?.value);
}
function sourceYear(entity: JsonObject): number | null {
  const entries = object(entity.claims)?.P577;
  if (!Array.isArray(entries)) return null;
  const valid = entries.filter((entry) => object(entry)?.rank !== 'deprecated');
  const preferred = valid.filter((entry) => object(entry)?.rank === 'preferred');
  const years = (preferred.length ? preferred : valid).flatMap((entry) => {
    const snak = object(object(entry)?.mainsnak);
    const value = object(object(snak?.datavalue)?.value);
    const time = string(value?.time);
    const year = Number(/^\+(\d{4})-/.exec(time ?? '')?.[1]);
    return Number(value?.precision) >= 9 && Number.isInteger(year) && year >= 1900 && year <= 2100 ? [year] : [];
  });
  return years.length && new Set(years).size === 1 ? years[0]! : null;
}
function metadataProvenance(source: 'wikidata' | 'freetogame', retrievedAt: string, reason: string): DiscoveryItem['provenance'] {
  return {
    retrievedAt, metadataLicense: source === 'wikidata' ? 'CC0-1.0' : 'FreeToGame API terms',
    metadataLicenseUrl: source === 'wikidata' ? CC0 : FTG_TERMS, artworkMissingReason: reason,
  };
}

export function parseFreeToGame(payload: unknown, retrievedAt: string): DiscoveryItem[] {
  if (!Array.isArray(payload) || !payload.length || payload.length > 1000) throw new Error('Invalid FreeToGame catalog size.');
  const ids = new Set<string>();
  return payload.map((value) => {
    const row = requiredObject(value, 'FreeToGame record');
    if (!Number.isSafeInteger(row.id) || Number(row.id) < 1) throw new Error('Invalid FreeToGame ID.');
    const sourceId = String(row.id);
    if (ids.has(sourceId)) throw new Error(`Duplicate FreeToGame ID ${sourceId}.`);
    ids.add(sourceId);
    const release = string(row.release_date);
    const year = Number(/^(\d{4})-\d{2}-\d{2}$/.exec(release ?? '')?.[1]);
    return {
      record: {
        id: `freetogame:${sourceId}`, source: 'freetogame', sourceId,
        sourceUrl: requiredText(row.freetogame_profile_url, 'FreeToGame profile URL', 2000),
        title: requiredText(row.title, 'FreeToGame title'), year: year >= 1900 && year <= 2100 ? year : null,
        studio: optionalText(row.developer), genre: optionalText(row.genre), collectionRank: null,
      },
      aliases: [], artwork: null, provenance: metadataProvenance('freetogame', retrievedAt, FTG_ART_REASON),
    };
  });
}

export function parseWikiEntity(entity: JsonObject, names: JsonObject, retrievedAt: string): DiscoveryItem | null {
  const id = string(entity.id);
  const title = label(entity);
  if (!id || !/^Q[1-9]\d*$/.test(id) || !title || !related(entity, 'P31').includes('Q7889')) return null;
  const named = (property: string): string | null => {
    const values = [...new Set(related(entity, property).flatMap((id) => label(names[id]) ?? []))];
    const result = values.join(' / ');
    return result && result.length <= 200 ? result : null;
  };
  const aliases = object(entity.aliases);
  const allAliases = ['en', 'mul'].flatMap((language) => {
    const entries = aliases?.[language];
    return Array.isArray(entries) ? entries.flatMap((entry) => {
      const alias = string(object(entry)?.value);
      return alias && alias.length <= 200 && !/[\u0000-\u001f\u007f]/.test(alias) ? [alias] : [];
    }) : [];
  });
  return {
    record: {
      id: `wikidata:${id}`, title: requiredText(title, 'Wikidata title'), year: sourceYear(entity),
      studio: named('P178'), genre: named('P136'), source: 'wikidata', sourceId: id,
      sourceUrl: `https://www.wikidata.org/wiki/${id}`, collectionRank: null,
    },
    aliases: [...new Set(allAliases)].filter((alias) => alias !== title).sort().slice(0, DISCOVERY_LIMITS.aliases),
    artwork: null, provenance: metadataProvenance('wikidata', retrievedAt, 'No reusable Commons image or logo is referenced by the source.'),
  };
}

function plainCredit(value: string): string {
  return value.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, title: string) => {
    const link = href.startsWith('//') ? `https:${href}` : href.startsWith('/') ? `https://commons.wikimedia.org${href}` : href;
    return `${title} (${link})`;
  }).replace(/<[^>]*>/g, ' ').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
    const point = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
    return point >= 32 && point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, name: string) =>
    ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[name]!)
    .replace(/\s+/g, ' ').trim();
}

export interface CommonsPermission {
  sourceUrl: string;
  originalUrl: string;
  downloadUrl: string;
  credit: string;
  license: string;
  licenseUrl: string;
  sourceWidth: number;
  sourceHeight: number;
}
export function commonsPermission(info: JsonObject): CommonsPermission | string {
  const metadata = object(info.extmetadata);
  const field = (name: string) => string(object(metadata?.[name])?.value);
  const license = field('LicenseShortName');
  const artist = field('Artist');
  if (!license || !artist) return 'Commons file lacks a clear license or creator attribution.';
  const restrictions = field('Restrictions');
  if (restrictions && restrictions !== 'trademarked') return `Commons additional restrictions need manual review: ${restrictions}`.slice(0, 300);
  const cc = /^CC (BY|BY-SA) (2\.0|2\.5|3\.0|4\.0)$/.exec(license);
  const expected = cc ? `https://creativecommons.org/licenses/${cc[1]!.toLowerCase()}/${cc[2]}/`
    : license === 'CC0' ? CC0
      : license === 'Public domain' && field('Copyrighted') === 'False' ? 'https://creativecommons.org/publicdomain/mark/1.0/' : null;
  if (!expected) return `Commons license is outside the collector allowlist: ${license}`.slice(0, 300);
  const supplied = field('LicenseUrl')?.replace(/^http:/, 'https:');
  if (license !== 'Public domain' && supplied?.replace(/\/$/, '') !== expected.replace(/\/$/, '')) {
    return 'Commons license URL is missing or does not match the declared license.';
  }
  const credit = [artist, field('Credit'), field('Attribution')].filter((part): part is string => !!part).map(plainCredit);
  credit.push('Resized and converted to WebP; original license retained.');
  if (restrictions === 'trademarked') credit.push('Trademark rights are not granted by the copyright license.');
  const combined = [...new Set(credit)].join(' | ');
  if (combined.length > 2000) return 'Commons attribution is too long to preserve completely in the bounded catalog.';
  const sourceUrl = string(info.descriptionurl);
  const originalUrl = string(info.url);
  const downloadUrl = string(info.thumburl) ?? originalUrl;
  if (!sourceUrl || !originalUrl || !downloadUrl || !Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height)) {
    return 'Commons file lacks a usable raster thumbnail or intrinsic dimensions.';
  }
  try {
    validateFetchUrl(downloadUrl, true);
    const source = new URL(sourceUrl);
    const original = new URL(originalUrl);
    if (source.origin !== 'https://commons.wikimedia.org' || !source.pathname.startsWith('/wiki/File:') ||
      original.origin !== 'https://upload.wikimedia.org' || !original.pathname.startsWith('/wikipedia/commons/')) {
      return 'Commons supplied a non-allowlisted provenance URL.';
    }
  } catch { return 'Commons has no supported, allowlisted raster derivative.'; }
  if (Number(info.width) < 1 || Number(info.height) < 1) return 'Commons source dimensions are invalid.';
  return {
    sourceUrl, originalUrl, downloadUrl, credit: combined, license, licenseUrl: expected,
    sourceWidth: Number(info.width), sourceHeight: Number(info.height),
  };
}

export async function makeArtwork(
  input: Buffer, permission: CommonsPermission, title: string, retrievedAt: string,
): Promise<{ artwork: CatalogArtwork; bytes: Buffer }> {
  const metadata = await sharp(input, { limitInputPixels: 25_000_000, failOn: 'warning' }).metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || !metadata.width || !metadata.height ||
    (metadata.pages ?? 1) !== 1) throw new Error('Asset did not decode as a single supported raster image.');
  const edge = Math.min(480, Math.max(permission.sourceWidth, permission.sourceHeight));
  const bytes = await sharp(input, { limitInputPixels: 25_000_000, failOn: 'warning' })
    .rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 76, effort: 5 }).toBuffer();
  const result = await sharp(bytes).metadata();
  if (!result.width || !result.height || bytes.length > DISCOVERY_LIMITS.imageBytes) {
    throw new Error(`Artwork for ${title} exceeds 80 KiB or lacks dimensions. Adjust encoding deliberately and rerun.`);
  }
  const sha256 = checksum(bytes);
  return {
    bytes,
    artwork: {
      src: `/images/discovery/${sha256}.webp`, width: result.width, height: result.height,
      alt: `${title} - source image`, sourceUrl: permission.sourceUrl, originalUrl: permission.originalUrl,
      credit: permission.credit, license: permission.license, licenseUrl: permission.licenseUrl,
      retrievedAt, sha256, bytes: bytes.length,
    },
  };
}

async function entities(client: BoundedClient, parameters: Record<string, string>): Promise<JsonObject> {
  const response = requiredObject(await client.json(apiUrl(WIKI, { action: 'wbgetentities', ...parameters })), 'Wikidata response');
  return requiredObject(response.entities, 'Wikidata entities');
}

export async function collect(client: BoundedClient): Promise<{ catalog: DiscoveryCatalog; assets: Map<string, Buffer>; report: JsonObject }> {
  const freeRetrievedAt = new Date().toISOString();
  const free = parseFreeToGame(await client.json(FTG), freeRetrievedAt);
  console.log(`FreeToGame: ${free.length} verified metadata records; no thumbnail rights assumed.`);
  const wikiEntities: JsonObject = {};
  for (let offset = 0; offset < FEATURED_WIKI_TITLES.length; offset += 40) {
    Object.assign(wikiEntities, await entities(client, {
      sites: 'enwiki', titles: FEATURED_WIKI_TITLES.slice(offset, offset + 40).join('|'),
      props: 'labels|aliases|claims', languages: 'en|mul', redirects: 'yes',
    }));
  }
  console.log('Wikidata: featured title lookups retrieved; collecting bounded general selection.');
  const response = requiredObject(await client.json(apiUrl(WIKI, {
    action: 'query', list: 'search', srsearch: 'haswbstatement:P31=Q7889',
    srsort: 'incoming_links_desc', srlimit: String(WIKI_SEARCH_COUNT), srprop: '',
  })), 'Wikidata search');
  const hits = object(response.query)?.search;
  if (!Array.isArray(hits) || hits.length < 100) throw new Error('Wikidata selection was unexpectedly small; snapshot unchanged.');
  const ids = [...new Set(hits.map((hit) => requiredText(object(hit)?.title, 'Wikidata search identity')))];
  for (let offset = 0; offset < ids.length; offset += 20) {
    Object.assign(wikiEntities, await entities(client, {
      ids: ids.slice(offset, offset + 20).join('|'), props: 'labels|aliases|claims', languages: 'en|mul',
    }));
  }
  const validEntities = Object.values(wikiEntities).map((value) => requiredObject(value, 'Wikidata entity'))
    .filter((entity) => related(entity, 'P31').includes('Q7889') && label(entity));
  const relatedIds = [...new Set(validEntities.flatMap((entity) => [...related(entity, 'P178'), ...related(entity, 'P136')]))];
  const names: JsonObject = {};
  for (let offset = 0; offset < relatedIds.length; offset += 50) {
    Object.assign(names, await entities(client, { ids: relatedIds.slice(offset, offset + 50).join('|'), props: 'labels', languages: 'en|mul' }));
  }
  const retrievedAt = new Date().toISOString();
  const freeTitles = new Set(free.map(({ record }) => record.title.normalize('NFKC').toLowerCase().trim()));
  const omittedTitleCollisions: string[] = [];
  const wiki = validEntities.flatMap((entity) => {
    const item = parseWikiEntity(entity, names, retrievedAt);
    // Omit ambiguous selection collisions; do not merge IDs, aliases, records or artwork.
    if (item && [item.record.title, ...item.aliases].some((title) => freeTitles.has(title.normalize('NFKC').toLowerCase().trim()))) {
      omittedTitleCollisions.push(item.record.id);
      return [];
    }
    if (related(entity, 'P629').length) return [];
    return item ? [{ item, entity }] : [];
  });
  console.log(`Wikidata: ${wiki.length} classified records after selection exclusions; checking per-file Commons licenses.`);
  const assets = new Map<string, Buffer>();
  const artCache = new Map<string, { artwork: CatalogArtwork; bytes: Buffer } | string>();
  for (const { item, entity } of wiki) {
    const files = [...new Set([...claims(entity, 'P154'), ...claims(entity, 'P18')].flatMap((value) => string(value) ?? []))].slice(0, 2);
    for (const file of files) {
      const cached = artCache.get(file);
      if (cached) {
        if (typeof cached === 'string') { item.provenance.artworkMissingReason = cached; continue; }
        item.artwork = { ...cached.artwork, alt: `${item.record.title} - source image` };
        item.provenance.artworkMissingReason = null;
        break;
      }
      if (artCache.size >= MAX_ART_FILES) {
        item.provenance.artworkMissingReason = 'The bounded Commons file-review budget was reached; no image license assumed.';
        continue;
      }
      const result = requiredObject(await client.json(apiUrl(COMMONS, {
        action: 'query', titles: `File:${file}`, prop: 'imageinfo',
        iiprop: 'url|extmetadata|size|mime', iiurlwidth: '480',
        iiextmetadatafilter: 'Artist|Credit|Attribution|LicenseShortName|LicenseUrl|Copyrighted|Restrictions',
      })), 'Commons file response');
      const pages = requiredObject(object(result.query)?.pages, 'Commons file pages');
      const page = object(Object.values(pages)[0]);
      const imageinfo = page?.imageinfo;
      const info = Array.isArray(imageinfo) ? object(imageinfo[0]) : null;
      const permission = info ? commonsPermission(info) : 'Referenced Commons file is missing or has no image information.';
      if (typeof permission === 'string') {
        artCache.set(file, permission); item.provenance.artworkMissingReason = permission; continue;
      }
      try {
        const converted = await makeArtwork(await client.bytes(permission.downloadUrl, true), permission, item.record.title, new Date().toISOString());
        artCache.set(file, converted);
        assets.set(converted.artwork.src, converted.bytes);
        item.artwork = converted.artwork;
        item.provenance.artworkMissingReason = null;
        if (assets.size % 25 === 0) console.log(`Commons: ${assets.size} licensed raster assets decoded; ${client.requests} requests total.`);
        break;
      } catch (error) {
        if (!(error instanceof UpstreamError) || ![404, 410].includes(error.status)) throw error;
        const reason = `Commons raster derivative is gone (HTTP ${error.status}); no stale image retained.`;
        artCache.set(file, reason); item.provenance.artworkMissingReason = reason;
      }
    }
  }
  const items = [...wiki.map(({ item }) => item), ...free].sort((a, b) =>
    a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0);
  if (items.length < 500) throw new Error(`Only ${items.length} records obtained; expected >=500. Last good snapshot preserved.`);
  if (!items.some(({ record }) => record.id === 'wikidata:Q15408545')) throw new Error('Required Kingdom Come source entity missing.');
  const catalog = parseDiscoveryCatalog({ schemaVersion: 1, generatedAt: new Date().toISOString(), items });
  return {
    catalog, assets, report: {
      requests: client.requests, transferredBytes: client.transferredBytes, omittedTitleCollisions,
      reviewedCommonsFiles: artCache.size, maximumReviewedCommonsFiles: MAX_ART_FILES,
      featuredLookupTitles: FEATURED_WIKI_TITLES.length, classifiedWikidataRecords: wiki.length,
    },
  };
}

function imagePath(root: string, src: string): string {
  if (!/^\/images\/discovery\/[a-f0-9]{64}\.webp$/.test(src)) throw new Error('Invalid output asset path.');
  return path.join(root, 'public', 'images', 'discovery', path.basename(src));
}

export async function verifySnapshot(root = ROOT): Promise<JsonObject> {
  const manifest = await readFile(path.join(root, 'public', 'data', 'discovery', 'catalog.v1.json'));
  const catalog = parseDiscoveryCatalogJson(manifest.toString('utf8'));
  const assets = new Map(catalog.items.flatMap(({ artwork }) => artwork ? [[artwork.src, artwork] as const] : []));
  let localBytes = 0;
  for (const [src, artwork] of assets) {
    const bytes = await readFile(imagePath(root, src));
    const image = await sharp(bytes, { failOn: 'warning' }).metadata();
    await sharp(bytes, { failOn: 'warning' }).raw().toBuffer();
    if (checksum(bytes) !== artwork.sha256 || bytes.length !== artwork.bytes || image.format !== 'webp' ||
      image.width !== artwork.width || image.height !== artwork.height || (image.pages ?? 1) !== 1) {
      throw new Error(`Asset verification failed: ${src}`);
    }
    localBytes += bytes.length;
  }
  let allLocalBytes = 0;
  const imageDirectory = path.join(root, 'public', 'images', 'discovery');
  for (const name of await readdir(imageDirectory)) {
    if (/^[a-f0-9]{64}\.webp$/.test(name)) allLocalBytes += (await stat(path.join(imageDirectory, name))).size;
  }
  if (allLocalBytes > DISCOVERY_LIMITS.totalImageBytes) throw new Error('All local images, including retained older assets, exceed 35 MiB.');
  const sourceCounts = Object.fromEntries(['wikidata', 'freetogame'].map((source) => [source, catalog.items.filter(({ record }) => record.source === source).length]));
  const licenses = Object.fromEntries([...new Set([...assets.values()].map((asset) => asset.license))].sort().map((license) =>
    [license, [...assets.values()].filter((asset) => asset.license === license).length]));
  return {
    generatedAt: catalog.generatedAt, records: catalog.items.length, sourceCounts,
    illustratedRecords: catalog.items.filter(({ artwork }) => artwork !== null).length,
    missingArtwork: catalog.items.filter(({ artwork }) => artwork === null).length,
    uniqueImages: assets.size, localBytes, allLocalBytes, metadataBytes: manifest.length,
    manifestSha256: checksum(manifest), licenses,
    kingdomCome: catalog.items.find(({ record }) => record.id === 'wikidata:Q15408545'),
  };
}

export async function writeSnapshot(
  catalog: DiscoveryCatalog, assets: ReadonlyMap<string, Buffer>, root = ROOT,
): Promise<void> {
  const validated = parseDiscoveryCatalog(catalog);
  const manifest = Buffer.from(`${JSON.stringify(validated)}\n`);
  if (manifest.length > DISCOVERY_LIMITS.metadataBytes) throw new Error('Serialized manifest exceeds 3 MiB.');
  const referenced = new Map(validated.items.flatMap(({ artwork }) => artwork ? [[artwork.src, artwork] as const] : []));
  if (assets.size !== referenced.size) throw new Error('Assets and manifest reference counts differ.');
  for (const [src, artwork] of referenced) {
    const bytes = assets.get(src);
    if (!bytes || bytes.length !== artwork.bytes || checksum(bytes) !== artwork.sha256) throw new Error(`Missing or mismatched asset ${src}.`);
    const image = await sharp(bytes, { failOn: 'warning' }).metadata();
    await sharp(bytes, { failOn: 'warning' }).raw().toBuffer();
    if (image.format !== 'webp' || image.width !== artwork.width || image.height !== artwork.height || (image.pages ?? 1) !== 1) {
      throw new Error(`Invalid generated raster ${src}.`);
    }
  }
  const directory = path.join(root, 'public', 'images', 'discovery');
  const manifestDirectory = path.join(root, 'public', 'data', 'discovery');
  await mkdir(directory, { recursive: true });
  await mkdir(manifestDirectory, { recursive: true });
  let diskBytes = 0;
  const existing = new Set(await readdir(directory));
  for (const name of existing) if (/^[a-f0-9]{64}\.webp$/.test(name)) diskBytes += (await stat(path.join(directory, name))).size;
  for (const [src, bytes] of assets) if (!existing.has(path.basename(src))) diskBytes += bytes.length;
  if (diskBytes > DISCOVERY_LIMITS.totalImageBytes) throw new Error('Retained and new assets exceed 35 MiB; review unused old assets before rerunning.');
  const stagedManifest = path.join(manifestDirectory, `.catalog-${randomUUID()}.tmp`);
  try {
    // Immutable hash paths publish before the single atomic manifest rename.
    for (const [src, bytes] of assets) {
      const destination = imagePath(root, src);
      if (existing.has(path.basename(src))) {
        if (checksum(await readFile(destination)) !== checksum(bytes)) throw new Error(`Corrupt existing immutable asset: ${src}`);
      } else {
        const temporary = `${destination}.${randomUUID()}.tmp`;
        try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, destination); }
        finally { await rm(temporary, { force: true }); }
      }
    }
    await writeFile(stagedManifest, manifest, { flag: 'wx' });
    await rename(stagedManifest, path.join(manifestDirectory, 'catalog.v1.json'));
  } finally { await rm(stagedManifest, { force: true }); }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg !== '--verify' && arg !== '--dry-run')) {
    throw new Error('Usage: tsx scripts/collect-discovery-catalog.ts [--verify|--dry-run]');
  }
  if (args[0] === '--verify') { console.log(JSON.stringify(await verifySnapshot(), null, 2)); return; }
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Collection cancelled; last good manifest preserved.'));
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const client = new BoundedClient(AbortSignal.any([controller.signal, AbortSignal.timeout(20 * 60_000)]));
  try {
    const result = await collect(client);
    client.signal.throwIfAborted();
    if (args[0] !== '--dry-run') await writeSnapshot(result.catalog, result.assets);
    console.log(JSON.stringify({
      ...result.report,
      ...(args[0] === '--dry-run' ? {
        dryRun: true, records: result.catalog.items.length, images: result.assets.size,
        localBytes: [...result.assets.values()].reduce((sum, bytes) => sum + bytes.length, 0),
        metadataBytes: Buffer.byteLength(JSON.stringify(result.catalog)),
      } : await verifySnapshot()),
    }, null, 2));
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Discovery collection failed.');
    process.exitCode = 1;
  });
}

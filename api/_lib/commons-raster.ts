import { ENRICHMENT_LIMITS } from '../../src/lib/catalog-enrichment.js';
import type { ExternalCatalogArtwork } from '../../src/lib/catalog-enrichment.ts';
import { jsonObject } from './catalog-detail-data.js';
import { CatalogError, publicBytes, requirePublicUrl } from './public-http.js';

const RASTER_HOSTS = ['upload.wikimedia.org', 'thumb.wikimedia.org'];
const RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const INPUT_BYTES = 512 * 1024;
interface CommonsRasterPermission {
  sourceUrl: string;
  originalUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  selection: 'original' | 'thumbnail';
  mime: string;
  bytes: number | null;
  credit: string;
  license: string;
  licenseUrl: string;
}
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function plainCredit(value: string): string {
  return value.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, title: string) => {
    const link = href.startsWith('//') ? `https:${href}` : href.startsWith('/') ? `https://commons.wikimedia.org${href}` : href;
    return `${title} (${link})`;
  }).replace(/<[^>]*>/g, ' ').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
    const point = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
    return point >= 32 && point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, name: string) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[name]!)
    .replace(/\s+/g, ' ').trim();
}
function reject(message: string): never { throw new CatalogError(message, 502, 'unsupported'); }

export function commonsRasterPermission(payload: unknown, expectedFile?: string): CommonsRasterPermission {
  const pages = jsonObject(jsonObject(jsonObject(payload)?.query)?.pages);
  const values = pages ? Object.values(pages) : [];
  if (values.length !== 1) return reject('Commons did not return one exact image.');
  const page = jsonObject(values[0]);
  if (expectedFile && (typeof page?.title !== 'string' ||
    page.title.normalize('NFC').replaceAll('_', ' ') !== `File:${expectedFile}`.normalize('NFC').replaceAll('_', ' '))) {
    return reject('Commons returned a different file identity. No replacement image was chosen.');
  }
  const images = page?.imageinfo;
  const info = Array.isArray(images) && images.length === 1 ? jsonObject(images[0]) : null;
  if (!info || page?.imagerepository !== 'local') return reject('No local Commons image information is available.');
  const metadata = jsonObject(info.extmetadata);
  const field = (name: string) => text(jsonObject(metadata?.[name])?.value);
  const license = field('LicenseShortName');
  const artist = plainCredit(field('Artist') ?? '');
  const restrictions = field('Restrictions');
  if (!license || !artist || restrictions && restrictions !== 'trademarked') return reject('This image needs a clear reusable license and complete attribution.');
  const cc = /^CC (BY|BY-SA) (2\.0|2\.5|3\.0|4\.0)$/.exec(license);
  const licenseUrl = cc ? `https://creativecommons.org/licenses/${cc[1]!.toLowerCase()}/${cc[2]}/`
    : license === 'CC0' ? 'https://creativecommons.org/publicdomain/zero/1.0/'
      : license === 'Public domain' && field('Copyrighted') === 'False' ? 'https://creativecommons.org/publicdomain/mark/1.0/' : null;
  const declaredUrl = field('LicenseUrl')?.replace(/^http:/, 'https:');
  if (!licenseUrl || license !== 'Public domain' && declaredUrl?.replace(/\/$/, '') !== licenseUrl.replace(/\/$/, '')) return reject('This image license is not approved for reuse here.');
  const sourceUrl = requirePublicUrl(text(info.descriptionurl) ?? '', ['commons.wikimedia.org']);
  const originalUrl = requirePublicUrl(text(info.url) ?? '', ['upload.wikimedia.org']);
  if (typeof info.width !== 'number' || typeof info.height !== 'number' || !Number.isSafeInteger(info.width) ||
    !Number.isSafeInteger(info.height) || info.width < 1 || info.height < 1 || info.width * info.height > 25_000_000) {
    return reject('Commons did not supply verified original image dimensions.');
  }
  const original = typeof info.mime === 'string' && RASTER_TYPES.includes(info.mime) &&
    /\.(?:png|jpe?g|webp)$/i.test(originalUrl.pathname) && info.width <= 640 && info.height <= 640 &&
    typeof info.size === 'number' && Number.isSafeInteger(info.size) && info.size > 0 && info.size <= INPUT_BYTES;
  if (!original && !text(info.thumburl)) return reject('Commons did not supply a bounded original or permitted thumbnail.');
  const downloadUrl = original ? originalUrl : requirePublicUrl(text(info.thumburl) ?? '', RASTER_HOSTS);
  const width = original ? info.width : info.thumbwidth;
  const height = original ? info.height : info.thumbheight;
  const mime = original ? info.mime : info.thumbmime;
  const bytes = original && typeof info.size === 'number' ? info.size : null;
  if (!sourceUrl.pathname.startsWith('/wiki/File:') || !originalUrl.pathname.startsWith('/wikipedia/commons/') ||
    !downloadUrl.pathname.startsWith('/wikipedia/commons/') || !/\.(?:png|jpe?g|webp)$/i.test(downloadUrl.pathname) ||
    typeof mime !== 'string' || !RASTER_TYPES.includes(mime) ||
    typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
    width < 1 || height < 1 || width > 640 || height > 640) return reject('Commons did not supply a bounded supported raster image.');
  const parts = [artist, ...[field('Credit'), field('Attribution')].filter((part): part is string => Boolean(part)).map(plainCredit)].filter(Boolean);
  parts.push('Resized and converted to WebP; original license retained.');
  if (restrictions === 'trademarked') parts.push('Trademark rights are not granted by the copyright license.');
  const credit = [...new Set(parts)].join(' | ');
  if (credit.length > ENRICHMENT_LIMITS.creditLength) return reject('The complete image credit exceeds the supported length; the image was not copied.');
  return {
    sourceUrl: sourceUrl.href, originalUrl: originalUrl.href, downloadUrl: downloadUrl.href,
    selection: original ? 'original' : 'thumbnail', width, height, mime, bytes, credit, license, licenseUrl,
  };
}

export function patchedDecoder(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return Boolean(match && (Number(match[1]) > 0 || Number(match[2]) > 35 || Number(match[2]) === 35 && Number(match[3]) >= 4));
}

export function verifiedRaster(input: Buffer, contentType: string): boolean {
  if (contentType === 'image/jpeg') return input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff && !input.includes(Buffer.from('MPF\0'));
  const png = contentType === 'image/png' && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = contentType === 'image/webp' && input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !webp) return false;
  if (png && (input.length < 33 || input.toString('ascii', 12, 16) !== 'IHDR' || input.readUInt32BE(8) !== 13 ||
    input.readUInt32BE(16) < 1 || input.readUInt32BE(16) > 640 || input.readUInt32BE(20) < 1 || input.readUInt32BE(20) > 640)) return false;
  if (webp && input.readUInt32LE(4) + 8 !== input.length) return false;
  let offset = png ? 8 : 12;
  while (offset + (png ? 12 : 8) <= input.length) {
    const size = png ? input.readUInt32BE(offset) : input.readUInt32LE(offset + 4);
    const kind = input.toString('ascii', offset + (png ? 4 : 0), offset + (png ? 8 : 4));
    if (kind === 'VP8X' && (size !== 10 || offset + 18 > input.length || input.readUIntLE(offset + 12, 3) + 1 > 640 ||
      input.readUIntLE(offset + 15, 3) + 1 > 640)) return false;
    if (kind === 'acTL' || kind === 'ANIM' || kind === 'ANMF' ||
      kind === 'VP8X' && (input[offset + 8]! & 2) !== 0) return false;
    const end = offset + size + (png ? 12 : 8 + (size % 2));
    if (end <= offset || end > input.length) return false;
    offset = end;
  }
  return offset === input.length;
}

export async function fetchCommonsRaster(permission: CommonsRasterPermission, signal: AbortSignal, fetchedAt: string): Promise<ExternalCatalogArtwork> {
  const { default: sharp } = await import('sharp');
  if (!patchedDecoder(sharp.versions.sharp)) throw new CatalogError('A patched image decoder is required before new artwork can be loaded. Existing artwork is unchanged.', 503, 'unsupported');
  const { bytes, contentType } = await publicBytes(permission.downloadUrl, signal, {
    hosts: RASTER_HOSTS, maxBytes: permission.bytes ?? INPUT_BYTES, timeoutMs: 3500, contentTypes: [permission.mime],
  });
  signal.throwIfAborted();
  const input = Buffer.from(bytes);
  if (permission.bytes !== null && input.length !== permission.bytes) throw new CatalogError('The original image byte length did not match its verified metadata.', 502, 'invalid');
  if (!verifiedRaster(input, contentType)) throw new CatalogError('The image was not a supported single-frame raster matching its declared type.', 502, 'invalid');
  const decoder = sharp(input, { limitInputPixels: 640 * 640, failOn: 'warning', animated: false }).timeout({ seconds: 2 });
  let fail: (reason: unknown) => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => { fail = reject; });
  const stop = () => { decoder.destroy(); fail(signal.reason ?? new CatalogError('Image processing was cancelled.', 504, 'timeout')); };
  signal.addEventListener('abort', stop, { once: true });
  const timeout = setTimeout(() => {
    decoder.destroy();
    fail(new CatalogError('The reusable image took too long to process.', 504, 'timeout'));
  }, 2500);
  const encode = async (): Promise<ExternalCatalogArtwork> => {
    const metadata = await decoder.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || !metadata.width || !metadata.height ||
      metadata.width > 640 || metadata.height > 640 || (metadata.pages ?? 1) !== 1 ||
      metadata.width !== permission.width || metadata.height !== permission.height) {
      throw new CatalogError('The image dimensions or page count did not match its public metadata.', 502, 'invalid');
    }
    signal.throwIfAborted();
    const { data, info } = await decoder.rotate().resize({ width: 320, height: 240, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76, effort: 3 }).toBuffer({ resolveWithObject: true });
    signal.throwIfAborted();
    if (data.length > ENRICHMENT_LIMITS.imageBytes) throw new CatalogError('The reusable image exceeded the detail image budget.', 502, 'invalid');
    console.info('Verified public raster transformation.', {
      selection: permission.selection,
      input: { bytes: input.length, width: metadata.width, height: metadata.height, format: metadata.format, pages: metadata.pages ?? 1 },
      output: { bytes: data.length, width: info.width, height: info.height, format: info.format },
      decoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips, platform: process.platform, arch: process.arch },
    });
    return {
      kind: 'commons-raster', src: `data:image/webp;base64,${data.toString('base64')}`, width: info.width, height: info.height,
      alt: 'Licensed game artwork from Wikimedia Commons', sourceUrl: permission.sourceUrl, originalUrl: permission.originalUrl, credit: permission.credit,
      license: permission.license, licenseUrl: permission.licenseUrl, retrievedAt: fetchedAt,
    };
  };
  try { return await Promise.race([encode(), aborted]); }
  finally { clearTimeout(timeout); signal.removeEventListener('abort', stop); }
}

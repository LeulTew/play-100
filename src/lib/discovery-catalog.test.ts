import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_LIMITS, indexDiscoveryArtwork, parseCatalogArtwork, parseDiscoveryCatalog,
  parseDiscoveryCatalogJson, type CatalogArtwork, type DiscoveryCatalog,
} from './discovery-catalog';

const date = '2026-09-17T18:00:00.000Z';
const hash = 'a'.repeat(64);
const artwork: CatalogArtwork = {
  src: `/images/discovery/${hash}.webp`, width: 320, height: 180, alt: 'Game logo',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Game.svg',
  credit: 'Creator; resized to WebP', license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Game.svg',
  retrievedAt: date, sha256: hash, bytes: 200,
};
function fixture(): DiscoveryCatalog {
  return {
    schemaVersion: 1, generatedAt: date, items: [{
      record: {
        id: 'wikidata:Q123', title: 'Kingdom Come: Deliverance', sourceId: 'Q123', source: 'wikidata',
        sourceUrl: 'https://www.wikidata.org/wiki/Q123', year: 2018, studio: null, genre: null, collectionRank: null,
      },
      aliases: ['KCD'], artwork: null,
      provenance: {
        retrievedAt: date, metadataLicense: 'CC0-1.0',
        metadataLicenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        artworkMissingReason: 'No verified reusable artwork',
      },
    }],
  };
}

describe('discovery catalog boundary', () => {
  it('preserves the strict image-free personal record and indexes only exact IDs', () => {
    const catalog = fixture();
    catalog.items[0]!.artwork = artwork;
    catalog.items[0]!.provenance.artworkMissingReason = null;
    const parsed = parseDiscoveryCatalogJson(JSON.stringify(catalog));
    expect(parsed).toEqual(catalog);
    expect(indexDiscoveryArtwork(parsed).get('wikidata:Q123')).toEqual(artwork);
    expect(indexDiscoveryArtwork(parsed).get('Kingdom Come: Deliverance')).toBeUndefined();
    expect(Object.keys(parsed.items[0]!.record)).toHaveLength(9);
  });
  it.each([
    ['unknown root field', (x: DiscoveryCatalog) => Object.assign(x, { private: true })],
    ['unknown item field', (x: DiscoveryCatalog) => Object.assign(x.items[0]!, { notes: 'private' })],
    ['unknown record field', (x: DiscoveryCatalog) => Object.assign(x.items[0]!.record, { image: 'x' })],
    ['duplicate record', (x: DiscoveryCatalog) => x.items.push(x.items[0]!)],
    ['wrong identity', (x: DiscoveryCatalog) => { x.items[0]!.record.id = 'wikidata:Q456'; }],
    ['wrong URL identity', (x: DiscoveryCatalog) => { x.items[0]!.record.sourceUrl = 'https://www.wikidata.org/wiki/Q456'; }],
    ['duplicate aliases', (x: DiscoveryCatalog) => { x.items[0]!.aliases = ['KCD', 'KCD']; }],
    ['too many aliases', (x: DiscoveryCatalog) => { x.items[0]!.aliases = Array.from({ length: 31 }, (_, i) => String(i)); }],
    ['bad year', (x: DiscoveryCatalog) => { x.items[0]!.record.year = 1800; }],
    ['ranked import', (x: DiscoveryCatalog) => { x.items[0]!.record.collectionRank = 1; }],
    ['missing-art reason omitted', (x: DiscoveryCatalog) => { x.items[0]!.provenance.artworkMissingReason = null; }],
    ['bad metadata license', (x: DiscoveryCatalog) => { x.items[0]!.provenance.metadataLicense = 'FreeToGame API terms'; }],
    ['bad timestamp', (x: DiscoveryCatalog) => { x.generatedAt = '2026-02-31T18:00:00.000Z'; }],
    ['future retrieval', (x: DiscoveryCatalog) => { x.generatedAt = '2025-09-17T18:00:00.000Z'; }],
    ['too many records', (x: DiscoveryCatalog) => { x.items = Array(1001).fill(x.items[0]); }],
  ])('rejects %s', (_, change) => {
    const catalog = fixture();
    change(catalog);
    expect(() => parseDiscoveryCatalog(catalog)).toThrow();
  });
  it.each([
    '//evil.example/image.webp', 'https://evil.example/image.webp',
    '/images/discovery/../file.webp', `/images/discovery/${hash}.svg`,
    `/images/discovery/${hash}.webp?url=https://evil.example`,
  ])('rejects unsafe artwork path %s', (src) => {
    expect(() => parseCatalogArtwork({ ...artwork, src })).toThrow();
  });
  it.each([
    'http://commons.wikimedia.org/wiki/File:X',
    'https://commons.wikimedia.org.evil.example/wiki/File:X',
    'https://user@commons.wikimedia.org/wiki/File:X',
    'https://commons.wikimedia.org:444/wiki/File:X',
    'javascript:alert(1)',
  ])('rejects unsafe provenance URL %s', (sourceUrl) => {
    expect(() => parseCatalogArtwork({ ...artwork, sourceUrl })).toThrow();
  });
  it('rejects invalid dimensions, size, unknown fields and unlicensed art', () => {
    for (const patch of [
      { width: 0 }, { height: 641 }, { width: 3.2 }, { bytes: 81921 },
      { score: 10 }, { license: 'CC0' }, { licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/' },
    ]) expect(() => parseCatalogArtwork({ ...artwork, ...patch })).toThrow();
  });
  it('rejects oversized JSON and accessors without invoking them', () => {
    expect(() => parseDiscoveryCatalogJson(' '.repeat(DISCOVERY_LIMITS.metadataBytes + 1))).toThrow(/3 MiB/);
    const catalog = fixture();
    Object.defineProperty(catalog, 'items', { enumerable: true, get() { throw new Error('getter invoked'); } });
    expect(() => parseDiscoveryCatalog(catalog)).toThrow(/enumerable data/);
  });
});

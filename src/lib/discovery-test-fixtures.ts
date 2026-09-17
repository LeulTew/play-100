import type { CatalogArtwork, DiscoveryCatalog, DiscoveryItem } from './discovery-catalog';

export const discoveryFixture: DiscoveryItem = {
  record: {
    id: 'wikidata:Q15408545', source: 'wikidata', sourceId: 'Q15408545',
    title: 'Kingdom Come: Deliverance', year: 2018, studio: 'Warhorse Studios', genre: 'RPG',
    sourceUrl: 'https://www.wikidata.org/wiki/Q15408545', collectionRank: null,
  },
  aliases: ['Kingdom Come Deliverance', 'Kingdom Come Deliverance: Royal Edition', 'KCD', 'KCD1'],
  artwork: null,
  provenance: {
    retrievedAt: '2026-09-17T00:00:00.000Z', metadataLicense: 'CC0-1.0',
    metadataLicenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', artworkMissingReason: 'No verified reusable image in this test fixture.',
  },
};

export const artworkFixture: CatalogArtwork = {
  src: `/images/discovery/${'a'.repeat(64)}.webp`, sha256: 'a'.repeat(64),
  width: 320, height: 180, bytes: 1024, alt: 'Fixture artwork',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fixture.png',
  originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Fixture.png',
  credit: 'Fixture artist', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  retrievedAt: '2026-09-17T00:00:00.000Z',
};

export const catalogFixture: DiscoveryCatalog = { schemaVersion: 1, generatedAt: '2026-09-17T00:00:00.000Z', items: [discoveryFixture] };

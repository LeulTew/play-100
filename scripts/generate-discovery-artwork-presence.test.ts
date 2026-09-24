import { expect, it } from 'vitest';
import { discoveryArtworkPresenceJson } from './generate-discovery-artwork-presence';

const row = (id: string, artwork: object | null = null) => ({ record: { id }, artwork });

it('derives artwork presence across sources without provider assumptions or copying credits', () => {
  expect(
    discoveryArtworkPresenceJson({
      schemaVersion: 1,
      items: [
        row('wikidata:Q2', { credit: 'Not duplicated', src: '/not-copied' }),
        row('freetogame:615', { credit: 'Future licensed provider artwork' }),
        row('wikidata:Q1'),
      ],
    }),
  ).toBe('["freetogame:615","wikidata:Q2"]\n');
  expect(discoveryArtworkPresenceJson({ schemaVersion: 1, items: [] })).toBe('[]\n');
});

it('rejects invalid shapes, IDs, duplicate records and ambiguous missing artwork rather than generating an incomplete hint', () => {
  for (const value of [
    null,
    {},
    { schemaVersion: 2, items: [] },
    { schemaVersion: 1, items: [row('wikidata:Q1'), row('wikidata:Q1', {})] },
    ...[
      null,
      row('manual:private'),
      row('wikidata:Q0'),
      row('freetogame:01'),
      { record: { id: 'wikidata:Q1' } },
      { record: { id: 'wikidata:Q1' }, artwork: false },
      { record: { id: 'wikidata:Q1' }, artwork: [] },
    ].map((item) => ({ schemaVersion: 1, items: [item] })),
  ]) {
    expect(() => discoveryArtworkPresenceJson(value)).toThrow();
  }
});

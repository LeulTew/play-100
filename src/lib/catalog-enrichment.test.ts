import { describe, expect, it } from 'vitest';
import { enrichmentIdentity, parseCatalogEnrichment, parseReportedScore } from './catalog-enrichment';
import { enrichmentFixture } from './discovery-test-fixtures';

describe('exact public enrichment identity', () => {
  it('rejects curated IDs and reviewed provider aliases before any lookup', () => {
    expect(enrichmentIdentity('red-dead-redemption-2')).toBeNull();
    expect(enrichmentIdentity('wikidata:Q27438121')).toBeNull();
    expect(enrichmentIdentity('manual:kingdom-come')).toBeNull();
  });
  it('keeps unknown editions separate and never accepts a title or URL', () => {
    expect(enrichmentIdentity('wikidata:Q15408545')).toEqual({
      source: 'wikidata',
      sourceId: 'Q15408545',
      id: 'wikidata:Q15408545',
    });
    expect(enrichmentIdentity('freetogame:540')?.id).toBe('freetogame:540');
    for (const value of [
      'Kingdom Come',
      'https://localhost/',
      'wikidata:Q0',
      'wikidata:Q1/../Q2',
      'freetogame:01',
      'manual:Q15408545',
    ]) {
      expect(enrichmentIdentity(value)).toBeNull();
    }
  });
});

describe('literal external score scales', () => {
  it.each([
    ['83/100', 83, 100, 'points'],
    ['8.5 / 10', 8.5, 10, 'points'],
    ['49%', 49, 100, 'percent'],
    ['0/5', 0, 5, 'points'],
  ])('preserves %s without a normalized aggregate', (text, value, scale, unit) => {
    expect(parseReportedScore(text)).toEqual({ text, value, scale, unit });
  });
  it.each(['Recommended', '83', 'A+', '105/100', '-1/10', '1/0', '4 stars', 'NaN%', '<b>9/10</b>'])(
    'does not invent a score/scale for %s',
    (text) => {
      expect(parseReportedScore(text)).toBeNull();
    },
  );
});

describe('bounded public enrichment response', () => {
  it('retains secondary provenance, platform, method and missing dates', () => {
    const fixture = enrichmentFixture();
    const parsed = parseCatalogEnrichment(fixture, fixture.id);
    expect(parsed.ratings[0]).toEqual(fixture.ratings[0]);
    expect(parsed.artwork).toBeNull();
    expect(parsed.sources[1]?.code).toBe('ambiguous');
  });
  it('keeps Steam user recommendations separate from reported review scores', () => {
    const fixture = enrichmentFixture();
    const rating = {
      ...fixture.ratings[0],
      id: 'steam:379430',
      source: 'steam',
      kind: 'user-recommendations',
      publisher: 'Steam',
      publisherId: null,
      score: { text: '91.2%', value: 91.2, scale: 100, unit: 'percent' },
      platforms: ['Steam'],
      method: 'Steam purchases; all languages; off-topic activity excluded',
      count: 250,
      asOf: null,
      referenceDate: null,
      sourceUrl: 'https://store.steampowered.com/app/379430/#app_reviews_hash',
      referenceUrl: null,
    };
    expect(
      parseCatalogEnrichment({ ...fixture, ratings: [...fixture.ratings, rating] }, fixture.id).ratings[1]?.kind,
    ).toBe('user-recommendations');
  });
  it.each([
    (value: ReturnType<typeof enrichmentFixture>) => ({ ...value, id: 'wikidata:Q1' }),
    (value: ReturnType<typeof enrichmentFixture>) => ({ ...value, notes: 'private' }),
    (value: ReturnType<typeof enrichmentFixture>) => ({
      ...value,
      ratings: Array.from({ length: 25 }, () => value.ratings[0]),
    }),
    (value: ReturnType<typeof enrichmentFixture>) => ({
      ...value,
      ratings: [{ ...value.ratings[0], referenceUrl: 'javascript:alert(1)' }],
    }),
    (value: ReturnType<typeof enrichmentFixture>) => ({
      ...value,
      ratings: [{ ...value.ratings[0], score: { text: '90/100', value: 91, scale: 100, unit: 'points' } }],
    }),
    (value: ReturnType<typeof enrichmentFixture>) => ({
      ...value,
      ratings: [{ ...value.ratings[0], asOf: '2026-99-99' }],
    }),
    (value: ReturnType<typeof enrichmentFixture>) => ({
      ...value,
      sources: [{ ...value.sources[0], retryAfter: 999999 }],
    }),
  ])('rejects mismatched, unsafe or unbounded data', (mutate) => {
    const fixture = enrichmentFixture();
    expect(() => parseCatalogEnrichment(mutate(fixture), fixture.id)).toThrow();
  });
});

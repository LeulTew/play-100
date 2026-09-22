import { describe, expect, it } from 'vitest';
import { commonsFile, exactSteamApp, publicGameEntity, reviewLabelIds, steamRating, wikidataRatings } from '../../api/_lib/catalog-detail-data';

const snak = (value: unknown) => ({ snaktype: 'value', datavalue: { value } });
const claim = (value: unknown, qualifiers = {}, rank = 'normal') => ({ rank, mainsnak: snak(value), qualifiers });
const entity = (claims = {}) => ({ id: 'Q15408545', claims: { P31: [claim({ id: 'Q7889' })], ...claims } });
const date = (time: string, precision = 11) => ({ time, precision, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' });
const now = '2026-09-22T12:00:00.000Z';

describe('literal Wikidata game and review claims', () => {
  it('requires the exact nonredirected video-game entity', () => {
    expect(publicGameEntity({ entities: { Q15408545: entity() } }, 'Q15408545')).toEqual(entity());
    expect(publicGameEntity({ entities: { Q15408545: { ...entity(), id: 'Q1' } } }, 'Q15408545')).toBeNull();
    expect(publicGameEntity({ entities: { Q15408545: entity({ P31: [claim({ id: 'Q5' })] }) } }, 'Q15408545')).toBeNull();
    expect(publicGameEntity({ entities: { Q15408545: { ...entity(), redirect: true } } }, 'Q15408545')).toBeNull();
  });
  it('preserves exact issuer, platform, scale, explicit method, date and reference without invented classification', () => {
    const review = { ...claim('8.5/10', {
      P447: [snak({ id: 'Q100' })], P400: [snak({ id: 'Q200' })],
      P459: [snak({ id: 'Q300' })], P585: [snak(date('+2024-02-29T00:00:00Z'))],
      P7887: [snak({ amount: '+25' })],
    }), references: [{ snaks: { P854: [snak('https://example.com/review')] } }] };
    const game = entity({ P444: [review] });
    const labels = Object.fromEntries([['Q100', 'Review site'], ['Q200', 'PC'], ['Q300', 'User average']].map(([id, value]) => [id, { labels: { en: { value } } }]));
    expect(reviewLabelIds(game)).toEqual(['Q100', 'Q200', 'Q300']);
    expect(wikidataRatings(game, labels, now)[0]).toMatchObject({
      kind: 'review-score', publisher: 'Review site', publisherId: 'Q100', score: { text: '8.5/10', value: 8.5, scale: 10 },
      method: 'User average', platforms: ['PC'], count: 25, asOf: '2024-02-29', referenceUrl: 'https://example.com/review',
    });
  });
  it('keeps unspecified dates/platforms/type explicit and never treats zero as missing', () => {
    const game = entity({ P444: [claim('0/100', { P447: [snak({ id: 'Q100' })] })] });
    expect(wikidataRatings(game, {}, now)[0]).toMatchObject({ publisher: 'Q100', score: { value: 0 }, platforms: [], method: null, count: null, asOf: null });
  });
  it.each([
    {
      name: 'an undated URL cannot borrow a later citation date',
      references: [
        { snaks: { P854: [snak('https://critic.example/review')] } },
        { snaks: { P854: [snak('https://archive.example/entry')], P813: [snak(date('+2024-04-21T00:00:00Z'))] } },
      ],
      referenceUrl: 'https://critic.example/review', referenceDate: null,
    },
    {
      name: 'an undated URL cannot borrow an earlier unlinked reference date',
      references: [
        { snaks: { P813: [snak(date('+2024-04-21T00:00:00Z'))] } },
        { snaks: { P854: [snak('https://critic.example/review')] } },
      ],
      referenceUrl: 'https://critic.example/review', referenceDate: null,
    },
    {
      name: 'a selected citation keeps its own date despite another citation date',
      references: [
        { snaks: { P854: [snak('https://critic.example/review')], P813: [snak(date('+2024-04-20T00:00:00Z'))] } },
        { snaks: { P854: [snak('https://archive.example/entry')], P813: [snak(date('+2024-04-21T00:00:00Z'))] } },
      ],
      referenceUrl: 'https://critic.example/review', referenceDate: '2024-04-20',
    },
    {
      name: 'ambiguous dates inside the selected reference remain unspecified',
      references: [
        { snaks: { P854: [snak('https://critic.example/review')], P813: [snak(date('+2024-04-20T00:00:00Z')), snak(date('+2024-04-21T00:00:00Z'))] } },
      ],
      referenceUrl: 'https://critic.example/review', referenceDate: null,
    },
    {
      name: 'a sole dated reference without a URL remains unlinked',
      references: [{ snaks: { P813: [snak(date('+2024-04-21T00:00:00Z'))] } }],
      referenceUrl: null, referenceDate: '2024-04-21',
    },
  ])('preserves per-reference provenance: $name', ({ references, referenceUrl, referenceDate }) => {
    const review = {
      ...claim('8.5/10', { P447: [snak({ id: 'Q100' })], P585: [snak(date('+2024-02-29T00:00:00Z'))] }),
      references,
    };
    expect(wikidataRatings(entity({ P444: [review] }), {}, now)[0]).toMatchObject({
      referenceUrl, referenceDate, asOf: '2024-02-29', retrievedAt: now,
    });
  });
  it('omits deprecated, ambiguous-issuer and malformed claims instead of inventing ratings', () => {
    const qualifiers = { P447: [snak({ id: 'Q100' })] };
    const game = entity({ P444: [
      claim('9/10', qualifiers, 'deprecated'), claim('Recommended', qualifiers), claim('9/10'),
      claim('9/10', { P447: [snak({ id: 'Q100' }), snak({ id: 'Q200' })] }),
    ] });
    expect(wikidataRatings(game, {}, now)).toEqual([]);
  });
  it('deduplicates identical claims but retains different platforms and source methods', () => {
    const review = claim('83/100', { P447: [snak({ id: 'Q100' })], P400: [snak({ id: 'Q200' })] });
    const consoleReview = claim('72/100', { P447: [snak({ id: 'Q100' })], P400: [snak({ id: 'Q201' })] });
    expect(wikidataRatings(entity({ P444: [review, review, consoleReview] }), {}, now)).toHaveLength(2);
  });
});

describe('exact secondary-provider bridges', () => {
  it('selects only one nondeprecated/preferred Steam app, never a guessed title match', () => {
    expect(exactSteamApp(entity({ P1733: [claim('379430')] }))).toEqual({ id: '379430', ambiguous: false });
    expect(exactSteamApp(entity({ P1733: [claim('379430'), claim('286860')] }))).toEqual({ id: null, ambiguous: true });
    expect(exactSteamApp(entity({ P1733: [claim('379430', {}, 'preferred'), claim('286860')] })).id).toBe('379430');
    expect(exactSteamApp(entity({ P1733: [claim('379430', {}, 'deprecated')] })).id).toBeNull();
    expect(exactSteamApp(entity({ P1733: [claim('https://localhost')] })).id).toBeNull();
  });
  it('uses one exact Commons filename and rejects ambiguous media', () => {
    expect(commonsFile(entity({ P154: [claim('Approved logo.svg')], P18: [claim('Screenshot.png')] }))).toBe('Approved logo.svg');
    expect(commonsFile(entity({ P154: [claim('A.png'), claim('B.png')] }))).toBeNull();
    expect(commonsFile(entity({ P18: [claim('file.svg|Other.png')] }))).toBeNull();
  });
  it('keeps only Steam aggregate counts, not reviews or user identifiers', () => {
    const result = steamRating({ success: 1, query_summary: { total_positive: 91, total_negative: 9, total_reviews: 100 }, reviews: [{ author: { steamid: 'private-user' }, review: 'Do not persist' }] }, '379430', now);
    expect(result).toMatchObject({ kind: 'user-recommendations', count: 100, score: { value: 91, scale: 100, unit: 'percent' }, asOf: null });
    expect(JSON.stringify(result)).not.toMatch(/private-user|Do not persist/);
  });
  it('does not invent a score for zero or inconsistent Steam counts', () => {
    expect(steamRating({ success: 1, query_summary: { total_positive: 0, total_negative: 0, total_reviews: 0 } }, '379430', now)).toBeNull();
    expect(() => steamRating({ success: 1, query_summary: { total_positive: 3, total_negative: 2, total_reviews: 8 } }, '379430', now)).toThrow();
  });
});

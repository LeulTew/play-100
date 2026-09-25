import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCatalogPage } from '../../api/catalog';
import { parseCatalogPage } from './catalog-types';

const gameClaim = { rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q7889' } } } };
const dateClaim = (year: number, rank = 'normal') => ({
  rank,
  mainsnak: { snaktype: 'value', datavalue: { value: { time: `+${year}-01-01T00:00:00Z`, precision: 11 } } },
});
const signal = () => new AbortController().signal;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('typed, bounded public catalog lookup', () => {
  it('constrains Wikidata to videogames and uses multilingual labels and preferred dates', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          query: { search: [{ title: 'Q1' }, { title: 'Q2' }], searchinfo: { totalhits: 8 } },
          continue: { sroffset: 5 },
        }),
      )
      .mockResolvedValueOnce(
        json({
          entities: {
            Q1: {
              labels: { mul: { value: 'A real source title' } },
              claims: { P31: [gameClaim], P577: [dateClaim(2018), dateClaim(2020, 'preferred')] },
            },
            Q2: { labels: { en: { value: 'Not a videogame' } }, claims: { P31: [] } },
          },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    const result = await getCatalogPage('wikidata', 'A "quoted" title', 0, signal());
    const request = new URL(fetcher.mock.calls[0]![0]);
    expect(request.hostname).toBe('www.wikidata.org');
    expect(request.searchParams.get('srsearch')).toBe('"A \\"quoted\\" title" haswbstatement:P31=Q7889');
    expect(request.searchParams.get('srlimit')).toBe('5');
    expect(request.searchParams.get('smaxage')).toBe('300');
    // Interactive lookups omit maxlag (MediaWiki Manual:Maxlag_parameter); only the batch collector sends it.
    const entities = new URL(fetcher.mock.calls[1]![0]);
    expect(entities.searchParams.get('action')).toBe('wbgetentities');
    for (const url of [request, entities]) expect(url.searchParams.has('maxlag')).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'wikidata:Q1',
      title: 'A real source title',
      year: 2020,
      sourceUrl: 'https://www.wikidata.org/wiki/Q1',
      collectionRank: null,
    });
    expect(result.nextOffset).toBe(5);
    expect(result.notices).toContain(
      'Some search hits lacked a usable title or current video-game classification and were not imported.',
    );
    expect(parseCatalogPage(result)).toEqual(result);
  });
  it('does not guess a year when source dates disagree, and accepts historical games', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ query: { search: [{ title: 'Q3' }, { title: 'Q4' }], searchinfo: { totalhits: 2 } } }),
        )
        .mockResolvedValueOnce(
          json({
            entities: {
              Q3: {
                labels: { en: { value: 'Ambiguous edition' } },
                claims: { P31: [gameClaim], P577: [dateClaim(2000), dateClaim(2003)] },
              },
              Q4: {
                labels: { en: { value: 'Historical game' } },
                claims: { P31: [gameClaim], P577: [dateClaim(1962)] },
              },
            },
          }),
        ),
    );
    const result = await getCatalogPage('wikidata', '', 0, signal());
    expect(result.items[0]?.year).toBeNull();
    expect(result.items[1]?.year).toBe(1962);
    expect(parseCatalogPage(result).items[1]?.year).toBe(1962);
  });
  it('filters and pages FreeToGame facts without copying artwork or scores', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          Array.from({ length: 24 }, (_, index) => ({
            id: index + 1,
            title: `Game ${String(index).padStart(2, '0')}`,
            developer: 'A developer',
            genre: 'RPG',
            release_date: '2020-03-02',
            freetogame_profile_url: `https://www.freetogame.com/game-${index}`,
            thumbnail: 'https://images.invalid/do-not-copy.jpg',
            metascore: 99,
          })),
        ),
      ),
    );
    const first = await getCatalogPage('freetogame', '', 0, signal());
    const next = await getCatalogPage('freetogame', '', 20, signal());
    expect(first.items).toHaveLength(20);
    expect(first.nextOffset).toBe(20);
    expect(next.items).toHaveLength(4);
    expect(next.nextOffset).toBeNull();
    expect(first.items[0]).not.toHaveProperty('thumbnail');
    expect(first.items[0]).not.toHaveProperty('metascore');
    expect(parseCatalogPage(first)).toEqual(first);
    expect((await getCatalogPage('freetogame', 'Game 23', 0, signal())).items).toHaveLength(1);
  });
  it.each([429, 503])('surfaces source HTTP %s rather than claiming no results', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, status)));
    await expect(getCatalogPage('wikidata', 'Hades', 0, signal())).rejects.toThrow(/rate-limiting|unavailable/);
  });
  it('surfaces source JSON errors even on HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'maxlag', info: 'Busy' } })));
    await expect(getCatalogPage('wikidata', 'Hades', 0, signal())).rejects.toThrow(/temporarily busy/);
  });
  it('rejects malformed source results at the client boundary', () => {
    expect(() => parseCatalogPage({ source: 'steam', items: [] })).toThrow();
    expect(() =>
      parseCatalogPage({ source: 'wikidata', query: '', items: [], total: 0, offset: 5, nextOffset: 2, notices: [] }),
    ).toThrow();
  });
});

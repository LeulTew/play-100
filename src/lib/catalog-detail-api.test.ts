import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenOnFetchSafePort } from './test-server-ports';

const nativeFetch = globalThis.fetch;
let server: Server;
let base: string;
const snak = (value: unknown) => ({ snaktype: 'value', datavalue: { value } });
const claim = (value: unknown, qualifiers = {}) => ({ rank: 'normal', mainsnak: snak(value), qualifiers });
const entity = (id = 'Q90000001', extra = {}) => ({
  id,
  claims: {
    P31: [claim({ id: 'Q7889' })],
    P444: [claim('8/10', { P447: [snak({ id: 'Q100' })], P400: [snak({ id: 'Q200' })] })],
    ...extra,
  },
});
function json(data: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
beforeEach(async () => {
  vi.resetModules();
  const { default: handler } = await import('../../api/catalog-detail');
  server = createServer((request, response) => {
    void handler(request, response);
  });
  await listenOnFetchSafePort(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test API address.');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('public-only catalog detail endpoint', () => {
  it.each([
    '',
    'id=manual%3Asecret',
    'id=Kingdom+Come',
    'id=https%3A%2F%2Flocalhost',
    'id=wikidata%3AQ1&id=wikidata%3AQ2',
    'id=wikidata%3AQ1&title=private',
    'id=wikidata%3AQ1&url=https%3A%2F%2Flocalhost',
    'id=red-dead-redemption-2',
  ])('rejects unsupported input before any upstream: %s', async (query) => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const response = await nativeFetch(`${base}/api/catalog-detail?${query}`);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects a reviewed The100 alias without enrichment and preserves its canonical target', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const response = await nativeFetch(`${base}/api/catalog-detail?id=wikidata%3AQ27438121`);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'canonical' });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('uses GET only and never invents FreeToGame review or image rights', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    expect((await nativeFetch(`${base}/api/catalog-detail?id=freetogame%3A540`, { method: 'POST' })).status).toBe(405);
    const response = await nativeFetch(`${base}/api/catalog-detail?id=freetogame%3A540`);
    expect(await response.json()).toMatchObject({
      ratings: [],
      artwork: null,
      sources: [{ source: 'freetogame', status: 'unavailable', code: 'unsupported' }],
    });
    expect(upstream).not.toHaveBeenCalled();
  });
  it('returns source-labelled scores and never fetches an ambiguous Steam bridge', async () => {
    const upstream = vi.fn(async (input: URL, options: RequestInit) => {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return input.searchParams.get('props') === 'claims'
        ? json({ entities: { Q90000001: entity('Q90000001', { P1733: [claim('10'), claim('20')] }) } })
        : json({
            entities: {
              Q100: { labels: { en: { value: 'Example critic' } } },
              Q200: { labels: { en: { value: 'PC' } } },
            },
          });
    });
    vi.stubGlobal('fetch', upstream);
    const response = await nativeFetch(`${base}/api/catalog-detail?id=wikidata%3AQ90000001`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ratings[0]).toMatchObject({
      publisher: 'Example critic',
      score: { value: 8, scale: 10 },
      platforms: ['PC'],
      asOf: null,
      referenceDate: null,
    });
    expect(data.sources).toContainEqual(expect.objectContaining({ source: 'steam', code: 'ambiguous' }));
    expect(upstream).toHaveBeenCalledTimes(2);
    for (const [url, options] of upstream.mock.calls) {
      expect(url.origin).toBe('https://www.wikidata.org');
      // An interactive lookup omits maxlag (MediaWiki Manual:Maxlag_parameter).
      expect(url.searchParams.has('maxlag')).toBe(false);
      expect(options).toMatchObject({ redirect: 'error', credentials: 'omit' });
    }
    expect(response.headers.get('cache-control')).toContain('s-maxage=900');
    await nativeFetch(`${base}/api/catalog-detail?id=wikidata%3AQ90000001`);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('keeps a Steam429 partial error and valid Wikidata scores with no success cache', async () => {
    const cancel = vi.fn(async () => undefined);
    const upstream = vi.fn(async (input: URL) => {
      if (input.hostname === 'store.steampowered.com')
        return new Response(new ReadableStream({ cancel }), { status: 429, headers: { 'Retry-After': '3' } });
      return input.searchParams.get('props') === 'claims'
        ? json({ entities: { Q90000001: entity('Q90000001', { P1733: [claim('379430')] }) } })
        : json({
            entities: { Q100: { labels: { en: { value: 'Source' } } }, Q200: { labels: { en: { value: 'PC' } } } },
          });
    });
    vi.stubGlobal('fetch', upstream);
    const response = await nativeFetch(`${base}/api/catalog-detail?id=wikidata%3AQ90000001`);
    const data = await response.json();
    expect(data.ratings).toHaveLength(1);
    expect(data.sources).toContainEqual(
      expect.objectContaining({ source: 'steam', status: 'error', code: 'rate-limited', retryAfter: 3 }),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(cancel).toHaveBeenCalledOnce();
    const steam = upstream.mock.calls.find(([url]) => url.hostname === 'store.steampowered.com')?.[0];
    expect(steam?.pathname).toBe('/appreviews/379430');
    expect(steam?.searchParams.get('num_per_page')).toBe('1');
    expect(steam?.searchParams.get('purchase_type')).toBe('steam');
  });
  it('does not use labels or facts from a different/redirected entity', async () => {
    const upstream = vi.fn().mockResolvedValue(json({ entities: { Q90000001: entity('Q90000002') } }));
    vi.stubGlobal('fetch', upstream);
    const response = await nativeFetch(`${base}/api/catalog-detail?id=wikidata%3AQ90000001`);
    const data = await response.json();
    expect(data.ratings).toEqual([]);
    expect(data.sources[0]).toMatchObject({ source: 'wikidata', status: 'error', code: 'invalid' });
    expect(upstream).toHaveBeenCalledOnce();
  });
  it('does not request new Commons media when the exact ID already has bundled licensed art', async () => {
    const upstream = vi.fn(async (input: URL) =>
      input.searchParams.get('props') === 'claims'
        ? json({ entities: { Q15408545: entity('Q15408545', { P154: [claim('New image.svg')] }) } })
        : json({ entities: {} }),
    );
    vi.stubGlobal('fetch', upstream);
    const response = await nativeFetch(`${base}/api/catalog-detail?id=wikidata%3AQ15408545`);
    expect(await response.json()).toMatchObject({
      artwork: null,
      sources: expect.arrayContaining([
        expect.objectContaining({
          source: 'commons',
          status: 'ready',
          message: 'The existing licensed bundled artwork is used.',
        }),
      ]),
    });
    expect(upstream.mock.calls.every(([url]) => url.hostname === 'www.wikidata.org')).toBe(true);
  });
  it('refuses the fifth concurrent uncached lookup locally and frees slots when lookups finish', async () => {
    const held: Array<(response: Response) => void> = [];
    const upstream = vi.fn(
      (_url: URL, options: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
          held.push(resolve);
        }),
    );
    vi.stubGlobal('fetch', upstream);
    const pending = [1, 2, 3, 4].map((index) =>
      nativeFetch(`${base}/api/catalog-detail?id=wikidata%3AQ9000001${index}`),
    );
    await vi.waitFor(() => expect(held).toHaveLength(4));
    const refused = await nativeFetch(`${base}/api/catalog-detail?id=wikidata%3AQ90000015`);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('15');
    expect(refused.headers.get('cache-control')).toBe('no-store');
    expect(await refused.json()).toMatchObject({ code: 'rate-limited' });
    expect(upstream).toHaveBeenCalledTimes(4);
    for (const resolve of held) resolve(json({ entities: {} }));
    for (const response of await Promise.all(pending)) expect(response.status).toBe(200);
    upstream.mockImplementation(async () => json({ entities: {} }));
    expect((await nativeFetch(`${base}/api/catalog-detail?id=wikidata%3AQ90000015`)).status).toBe(200);
  });
  it('refuses the thirty-first uncached lookup in one window before any upstream request', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    for (let index = 1; index <= 30; index += 1) {
      expect((await nativeFetch(`${base}/api/catalog-detail?id=freetogame%3A${index}`)).status).toBe(200);
    }
    const refused = await nativeFetch(`${base}/api/catalog-detail?id=freetogame%3A31`);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: 'rate-limited' });
    expect(upstream).not.toHaveBeenCalled();
  });
});

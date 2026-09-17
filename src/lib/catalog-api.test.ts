import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/catalog';

const nativeFetch = globalThis.fetch;
let server: Server;
let base = '';
beforeEach(async () => {
  server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing catalog test server address');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('same-origin catalog API boundary', () => {
  it.each(['source=steam', 'offset=-1', 'offset=10001', 'offset=1e2', 'source=wikidata&source=freetogame', 'token=private', 'q=A%00B', `q=${'x'.repeat(81)}`])('rejects invalid public request parameters: %s', async (query) => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const response = await nativeFetch(`${base}/api/catalog?${query}`);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(upstream).not.toHaveBeenCalled();
  });
  it('permits only GET requests', async () => {
    const response = await nativeFetch(`${base}/api/catalog`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
  it('echoes exact public query/source/offset, caches only success, identifies upstream and preserves literal query escaping', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ query: { search: [], searchinfo: { totalhits: 0 } } })));
    vi.stubGlobal('fetch', upstream);
    const q = 'KCD " OR haswbstatement:P31=Q5 \\';
    const response = await nativeFetch(`${base}/api/catalog?${new URLSearchParams({ source: 'wikidata', q, offset: '5' })}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: 'wikidata', query: q, offset: 5, items: [], total: 0 });
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
    const request = new URL(upstream.mock.calls[0]?.[0]);
    expect(request.searchParams.get('srsearch')).toBe(`"${q.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}" haswbstatement:P31=Q7889`);
    expect(upstream.mock.calls[0]?.[1].headers['User-Agent']).toContain('Play100Catalog');
  });
  it.each([429, 503])('reports HTTP %s truthfully with no success cache or empty array', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status, headers: { 'Retry-After': '3' } })));
    const response = await nativeFetch(`${base}/api/catalog?q=KCD`);
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).not.toHaveProperty('items');
    expect(body.code).toBe(status === 429 ? 'rate-limited' : 'unavailable');
    if (status === 429) expect(response.headers.get('retry-after')).toBe('3');
  });
  it('reports network failures without caching them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network unreachable')));
    const response = await nativeFetch(`${base}/api/catalog?q=KCD`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'unavailable' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('enforces the upstream timeout and returns a distinguishable timeout status', async () => {
    vi.useFakeTimers();
    let started: () => void = () => undefined;
    const start = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      started();
    })));
    const pending = nativeFetch(`${base}/api/catalog?q=KCD`);
    await start;
    await vi.advanceTimersByTimeAsync(9000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ code: 'timeout' });
  });
});

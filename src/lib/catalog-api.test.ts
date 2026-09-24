import { ServerResponse, createServer } from 'node:http';
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
  vi.restoreAllMocks();
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
  it.each([400, 500, 503])('cancels the owned upstream HTTP%s error body without reading it', async status => {
    const cancel = vi.fn(async () => undefined);
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status })));
    const response = await nativeFetch(`${base}/api/catalog?q=ErrorBody`);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ error: expect.stringContaining(`unavailable (${status})`), code: 'unavailable' });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([429, 503])('preserves the original HTTP%s response when cancellation rejects and logs no upstream details', async status => {
    const cancel = vi.fn(async () => { throw new Error('private-query-token-must-not-be-logged'); });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status, headers: { 'Retry-After': '3' },
    })));
    const response = await nativeFetch(`${base}/api/catalog?q=PrivateQueryMustNotBeLogged`);
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(status === 429 ? /rate-limiting requests/ : /unavailable \(503\)/),
      code: status === 429 ? 'rate-limited' : 'unavailable',
    });
    if (status === 429) expect(response.headers.get('retry-after')).toBe('3');
    expect(cancel).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledExactlyOnceWith('Catalog upstream response cleanup failed.', { status });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private-query-token');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('PrivateQuery');
  });
  it.each(['wikidata', 'freetogame'] as const)('uses only the fixed %s upstream with redirect rejection', async source => {
    const body = source === 'wikidata' ? { query: { search: [], searchinfo: { totalhits: 0 } } } : [];
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', upstream);
    const response = await nativeFetch(`${base}/api/catalog?${new URLSearchParams({ source, q: 'https://private.invalid/' })}`);
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
    const [raw, options] = upstream.mock.calls[0]!;
    const url = new URL(raw);
    expect(url.origin).toBe(source === 'wikidata' ? 'https://www.wikidata.org' : 'https://www.freetogame.com');
    expect(url.pathname).toBe(source === 'wikidata' ? '/w/api.php' : '/api/games');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(url.username).toBe('');
    expect(url.password).toBe('');
  });
  it('accepts an exactly4MiB streamed response and cancels4MiB plus one without caching an error', async () => {
    const limit = 4 * 1024 * 1024;
    const valid = JSON.stringify({ query: { search: [], searchinfo: { totalhits: 0 } } });
    const exact = valid + ' '.repeat(limit - valid.length);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(exact)));
    const accepted = await nativeFetch(`${base}/api/catalog?q=ExactLimit`);
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).items).toEqual([]);
    const cancel = vi.fn(async () => undefined);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(limit + 1)); },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(stream)));
    const rejected = await nativeFetch(`${base}/api/catalog?q=OverLimit`);
    expect(rejected.status).toBe(502);
    expect(rejected.headers.get('cache-control')).toBe('no-store');
    expect(await rejected.json()).toMatchObject({ error: expect.stringContaining('too large'), code: 'unavailable' });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('reports network failures without caching them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network unreachable')));
    const response = await nativeFetch(`${base}/api/catalog?q=KCD`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'unavailable' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('aborts the held upstream search when the client disconnects and writes nothing to the closed response', async () => {
    let handled: Promise<void> | undefined;
    const local = createServer((request, response) => { handled = handler(request, response); });
    await new Promise<void>((resolve) => local.listen(0, '127.0.0.1', resolve));
    const address = local.address();
    if (!address || typeof address === 'string') throw new Error('Missing catalog test server address');
    let upstreamSignal: AbortSignal | undefined;
    let started: () => void = () => undefined;
    const start = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_, reject) => {
      upstreamSignal = options.signal ?? undefined;
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      started();
    })));
    const writeHead = vi.spyOn(ServerResponse.prototype, 'writeHead');
    try {
      const client = new AbortController();
      const pending = nativeFetch(`http://127.0.0.1:${address.port}/api/catalog?q=Superseded`, { signal: client.signal });
      await start;
      expect(upstreamSignal?.aborted).toBe(false);
      const upstreamAborted = new Promise<void>((resolve) => upstreamSignal?.addEventListener('abort', () => resolve(), { once: true }));
      client.abort();
      await expect(pending).rejects.toThrow();
      await upstreamAborted;
      await handled;
      expect(upstreamSignal?.aborted).toBe(true);
      expect(writeHead).not.toHaveBeenCalled();
    } finally {
      local.closeAllConnections();
      await new Promise<void>((resolve, reject) => local.close((error) => error ? reject(error) : resolve()));
    }
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

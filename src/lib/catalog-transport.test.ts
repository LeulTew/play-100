import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalogJson } from './catalog-transport';
const signal = () => new AbortController().signal;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('bounded catalog transport failures', () => {
  for (const status of [429, 504]) {
    it.each([null, '', 'Proxy failure', '<html>Proxy failure</html>'])(
      `preserves HTTP ${status} and Retry-After with body %s`,
      async (body) => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(new Response(body, { status, headers: { 'Retry-After': '17' } })),
        );
        await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({
          kind: status === 429 ? 'rate-limited' : 'timeout',
          retryAfter: 17,
          message: 'The public catalog is temporarily unavailable.',
        });
      },
    );
  }
  it.each([null, '', '<html>Not JSON</html>'])('rejects malformed successful bodies: %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'invalid' });
  });
  it('keeps the HTTP failure when its bounded error body is too large', async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(10));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(stream, { status: 429, headers: { 'Retry-After': '12' } })),
    );
    await expect(fetchCatalogJson('/api/catalog', signal(), 8)).rejects.toMatchObject({
      kind: 'rate-limited',
      retryAfter: 12,
    });
    expect(cancelled).toBe(true);
  });
  it('keeps HTTP meaning when the error stream fails', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new TypeError('Broken proxy body'));
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 504 })));
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('bounds bytes while streaming, not only Content-Length', async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(10));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    await expect(fetchCatalogJson('/api/catalog', signal(), 8)).rejects.toMatchObject({ kind: 'invalid' });
    expect(cancelled).toBe(true);
  });
  it('rejects advertised oversize bodies before reading them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: { 'Content-Length': '1000000' } })));
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'invalid' });
  });
  it('times out even if a stalled fetch ignores cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise(() => undefined)),
    );
    const request = expect(fetchCatalogJson('/api/catalog', signal(), 1024, 10)).rejects.toMatchObject({
      kind: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(10);
    await request;
  });
  it('distinguishes offline, timeout, HTTP 429 and HTTP 503 from empty results', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Network failed'))
        .mockResolvedValueOnce(
          new Response('{"error":"rate limited"}', { status: 429, headers: { 'Retry-After': '9999' } }),
        )
        .mockResolvedValueOnce(new Response('{"error":"timeout","code":"timeout"}', { status: 504 }))
        .mockResolvedValueOnce(new Response('{"error":"unavailable"}', { status: 503 })),
    );
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'offline' });
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({
      kind: 'rate-limited',
      retryAfter: 60,
    });
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'timeout' });
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

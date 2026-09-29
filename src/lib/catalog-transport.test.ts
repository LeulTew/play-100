import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalogJson } from './catalog-transport';
const signal = () => new AbortController().signal;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('bounded catalog transport failures', () => {
  it('reads with no throwIfAborted method and rejects pre-aborted legacy signals before fetching', async () => {
    const controller = new AbortController();
    Object.defineProperties(controller.signal, {
      throwIfAborted: { value: undefined },
      reason: { value: undefined },
    });
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchCatalogJson('/api/catalog', controller.signal, 1024)).resolves.toEqual({ ok: true });
    controller.abort();
    await expect(fetchCatalogJson('/api/catalog', controller.signal, 1024)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each(['caller', 'timeout'] as const)(
    'preserves %s cancellation when controllers discard abort reasons',
    async (cause) => {
      vi.useFakeTimers();
      const NativeAbortController = AbortController;
      class LegacyAbortController extends NativeAbortController {
        constructor() {
          super();
          Object.defineProperties(this.signal, {
            throwIfAborted: { value: undefined },
            reason: { value: undefined },
          });
        }
        override abort() {
          super.abort();
        }
      }
      vi.stubGlobal('AbortController', LegacyAbortController);
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>(() => undefined)),
      );
      const controller = new AbortController();
      const rejected = expect(fetchCatalogJson('/api/catalog', controller.signal, 1024, 10)).rejects.toMatchObject(
        cause === 'caller' ? { name: 'AbortError' } : { kind: 'timeout' },
      );
      if (cause === 'caller') controller.abort();
      else await vi.advanceTimersByTimeAsync(10);
      await rejected;
    },
  );

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

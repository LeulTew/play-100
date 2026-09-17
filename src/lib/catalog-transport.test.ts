import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalogJson } from './catalog-transport';
const signal = () => new AbortController().signal;
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded catalog transport failures', () => {
  it('bounds bytes while streaming, not only Content-Length', async () => {
    let cancelled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(10)); }, cancel() { cancelled = true; } });
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
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => undefined)));
    const request = expect(fetchCatalogJson('/api/catalog', signal(), 1024, 10)).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(10);
    await request;
  });
  it('distinguishes offline, timeout, HTTP 429 and HTTP 503 from empty results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Network failed'))
      .mockResolvedValueOnce(new Response('{"error":"rate limited"}', { status: 429, headers: { 'Retry-After': '9999' } }))
      .mockResolvedValueOnce(new Response('{"error":"timeout","code":"timeout"}', { status: 504 }))
      .mockResolvedValueOnce(new Response('{"error":"unavailable"}', { status: 503 })));
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'offline' });
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'rate-limited', retryAfter: 60 });
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'timeout' });
    await expect(fetchCatalogJson('/api/catalog', signal(), 1024)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

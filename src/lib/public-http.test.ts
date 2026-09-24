import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicBytes, upstreamJson } from '../../api/_lib/public-http';

const url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q15408545';
const signal = () => new AbortController().signal;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('shared bounded public transport with S2 cleanup semantics', () => {
  it.each([
    'http://www.wikidata.org/w/api.php',
    'https://www.wikidata.org.evil.test/',
    'https://localhost/',
    'https://127.0.0.1/',
    'https://www.wikidata.org:8080/',
    'https://user:secret@www.wikidata.org/',
  ])('rejects unsafe upstream %s before fetch', async (input) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(upstreamJson(input, signal())).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses a fixed permitted origin, redirect rejection and no credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);
    expect(await upstreamJson(url, signal())).toEqual({ ok: true });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  });
  it.each([429, 400, 503])(
    'cancels HTTP%s without leaking source payloads or masking the original status',
    async (status) => {
      const cancel = vi.fn(async () => {
        throw new Error('secret-provider-body');
      });
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(new Response(new ReadableStream({ cancel }), { status, headers: { 'Retry-After': '3' } })),
      );
      await expect(upstreamJson(url, signal())).rejects.toMatchObject({
        status: status === 429 ? 429 : 503,
        retryAfter: status === 429 ? 3 : 0,
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(warning).toHaveBeenCalledExactlyOnceWith('Catalog upstream response cleanup failed.', { status });
      expect(JSON.stringify(warning.mock.calls)).not.toContain('secret');
    },
  );
  it('enforces exact stream bounds and cancels one byte over', async () => {
    const cancel = vi.fn(async () => undefined);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}  '))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{}   '));
            },
            cancel,
          }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    expect(await upstreamJson(url, signal(), { maxBytes: 4 })).toEqual({});
    await expect(upstreamJson(url, signal(), { maxBytes: 4 })).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('rejects Content-Length and MIME before reading a large or active response', async () => {
    const cancel = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          headers: { 'Content-Length': '100', 'Content-Type': 'text/html' },
        }),
      ),
    );
    await expect(publicBytes(url, signal(), { maxBytes: 4, contentTypes: ['application/json'] })).rejects.toMatchObject(
      { code: 'invalid' },
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('bounds a noncooperative fetch with a distinguishable timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const result = expect(upstreamJson(url, signal(), { timeoutMs: 25 })).rejects.toMatchObject({
      status: 504,
      code: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(25);
    await result;
  });
  it('propagates cancellation and never reads a pre-aborted request', async () => {
    const controller = new AbortController();
    controller.abort(new Error('closed'));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(upstreamJson(url, controller.signal)).rejects.toThrow('closed');
    expect(fetch).not.toHaveBeenCalled();
  });
});

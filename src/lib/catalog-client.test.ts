import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalogPage } from './catalog-client';
import type { CatalogPage } from './catalog-types';

const page: CatalogPage = { source: 'wikidata', query: 'Atlas', items: [], total: 0, offset: 0, nextOffset: null, notices: [] };
const signal = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

describe('shared catalog transport', () => {
  it('sends only a trimmed query, source and offset with the caller cancellation signal', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(page)));
    vi.stubGlobal('fetch', fetcher);
    const cancellation = signal();
    expect(await fetchCatalogPage('wikidata', ' Atlas ', 0, cancellation)).toEqual(page);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/catalog?source=wikidata&q=Atlas&offset=0', { signal: expect.any(AbortSignal), headers: { Accept: 'application/json' } });
  });

  it.each([{ query: 'Different' }, { source: 'freetogame' }, { offset: 5 }])('rejects a response for the wrong request: %j', async (change) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...page, ...change }))));
    await expect(fetchCatalogPage('wikidata', 'Atlas', 0, signal())).rejects.toThrow(/different search or page/);
  });

  it('surfaces source errors instead of reporting a successful empty catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Provider rate limit reached.' }), { status: 429 })));
    await expect(fetchCatalogPage('wikidata', 'Atlas', 0, signal())).rejects.toThrow('Provider rate limit reached.');
  });

  it('explains non-JSON responses and rejects invalid result structures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Unavailable</html>', { status: 503 })));
    await expect(fetchCatalogPage('wikidata', 'Atlas', 0, signal())).rejects.toThrow(/unreadable response/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...page, total: -1 }))));
    await expect(fetchCatalogPage('wikidata', 'Atlas', 0, signal())).rejects.toThrow(/invalid pagination/);
  });
});

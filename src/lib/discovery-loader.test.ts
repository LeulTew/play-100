import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiscoveryLoader } from './discovery-loader';
import { DISCOVERY_CATALOG_URL } from './discovery-catalog';
import { catalogFixture } from './discovery-test-fixtures';
import { searchDiscoveryItems, defaultDiscoveryFilters } from './discovery-search';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const signal = () => new AbortController().signal;

describe('lazy bounded public seed loading', () => {
  it.each(['fresh', 'returning', 'restricted'] as const)('loads and searches without auth or personal storage: %s profile', async (profile) => {
    const storage = { getItem: vi.fn(() => {
      if (profile === 'restricted') throw new DOMException('Blocked', 'SecurityError');
      return profile === 'returning' ? '{"old":"personal data"}' : null;
    }), setItem: vi.fn(() => { throw new Error('Seed search must not write storage'); }) };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('No DB required'); } });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalogFixture)));
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    expect(fetcher).not.toHaveBeenCalled();
    const first = await load(signal());
    expect(searchDiscoveryItems(first.items, { ...defaultDiscoveryFilters, q: 'Kingdomcome' })).toHaveLength(1);
    expect(await load(signal())).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(DISCOVERY_CATALOG_URL);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it.each(['<html>not a manifest</html>', JSON.stringify({ schemaVersion: 2 }), JSON.stringify({ ...catalogFixture, items: [] })])('rejects corrupt manifests and allows an explicit retry', async (bad) => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(bad)).mockResolvedValueOnce(new Response(JSON.stringify(catalogFixture)));
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    await expect(load(signal())).rejects.toThrow();
    expect(await load(signal())).toEqual(catalogFixture);
  });
  it('rejects an absent manifest rather than caching an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"missing"}', { status: 404 })));
    await expect(createDiscoveryLoader()(signal())).rejects.toThrow('missing');
  });
  it('cancels a obsolete manifest request and does not cache it', async () => {
    const fetcher = vi.fn().mockImplementationOnce((_url, options: RequestInit) => new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    })).mockResolvedValueOnce(new Response(JSON.stringify(catalogFixture)));
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    const controller = new AbortController();
    const first = load(controller.signal);
    controller.abort(new Error('obsolete'));
    await expect(first).rejects.toThrow('obsolete');
    expect(await load(signal())).toEqual(catalogFixture);
  });
});

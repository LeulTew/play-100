import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiscoveryLoader } from './discovery-loader';
import { DISCOVERY_CATALOG_URL } from './discovery-catalog';
import { catalogFixture } from './discovery-test-fixtures';
import { searchDiscoveryItems, defaultDiscoveryFilters } from './discovery-search';
import * as parserPreload from './discovery-parser-preload';
import { ModuleLoadFailure, isModuleLoadFailure } from './chunk-recovery';
import { createRetryableModule } from './retryable-module';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
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

  it('does not parse or cache a request canceled while its parser module loads', async () => {
    const parser = await import('./discovery-catalog');
    let release: (module: typeof parser) => void = () => { throw new Error('Parser was not requested'); };
    const preload = vi.spyOn(parserPreload, 'loadDiscoveryParser').mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const parse = vi.spyOn(parser, 'parseDiscoveryCatalog');
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(catalogFixture))));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const load = createDiscoveryLoader();
    const first = load(controller.signal);
    await vi.waitFor(() => expect(preload).toHaveBeenCalledOnce());
    controller.abort(new Error('obsolete parser load'));
    release(parser);
    await expect(first).rejects.toThrow('obsolete parser load');
    expect(parse).not.toHaveBeenCalled();
    expect(await load(signal())).toEqual(catalogFixture);
    expect(parse).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('distinguishes a terminal parser import from a retryable data request', async () => {
    const importer = vi.fn<() => ReturnType<typeof parserPreload.loadDiscoveryParser>>()
      .mockRejectedValue(new Error('Parser module unavailable'));
    const resource = createRetryableModule(importer);
    vi.spyOn(parserPreload, 'loadDiscoveryParser').mockImplementation(resource.load);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(catalogFixture)))));
    const load = createDiscoveryLoader();
    const error = await load(signal()).catch(error => error);
    expect(error).toBeInstanceOf(ModuleLoadFailure);
    expect(isModuleLoadFailure(error)).toBe(true);
    await expect(load(signal())).rejects.toBe(error);
    expect(importer).toHaveBeenCalledOnce();
  });
});

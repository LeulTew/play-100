import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiscoveryLoader } from './discovery-loader';
import { DISCOVERY_CATALOG_URL, DISCOVERY_LIMITS } from './discovery-catalog';
import { catalogFixture } from './discovery-test-fixtures';
import { searchDiscoveryItems, defaultDiscoveryFilters } from './discovery-search';
import * as parserPreload from './discovery-parser-preload';
import { ModuleLoadFailure, isModuleLoadFailure } from './chunk-recovery';
import { createMemoizedModule } from './memoized-module';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const signal = () => new AbortController().signal;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('lazy bounded public seed loading', () => {
  it('isolates legacy cancellation while other callers finish and reuse the catalog', async () => {
    const response = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    const canceled = new AbortController();
    const current = new AbortController();
    for (const controller of [canceled, current]) {
      Object.defineProperties(controller.signal, {
        throwIfAborted: { value: undefined },
        reason: { value: undefined },
      });
    }
    const first = load(canceled.signal);
    const second = load(current.signal);
    canceled.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    response.resolve(new Response(JSON.stringify(catalogFixture)));
    const catalog = await second;
    expect(catalog).toEqual(catalogFixture);
    expect(await load(current.signal)).toBe(catalog);
    await expect(load(canceled.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('shares one fetch and parse across concurrent first callers and then uses the cache', async () => {
    const response = deferred<Response>();
    const parser = await import('./discovery-catalog');
    const parse = vi.spyOn(parser, 'parseDiscoveryCatalog');
    const fetcher = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    const first = load(signal());
    const second = load(signal());
    const third = load(signal());
    expect(fetcher).toHaveBeenCalledOnce();
    response.resolve(new Response(JSON.stringify(catalogFixture)));
    const catalogs = await Promise.all([first, second, third]);
    expect(catalogs[0]).toEqual(catalogFixture);
    expect(catalogs.every((catalog) => catalog === catalogs[0])).toBe(true);
    expect(await load(signal())).toBe(catalogs[0]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledOnce();
  });

  it.each([false, true])('rejects a pre-aborted caller before fetching, cached=%s', async (cached) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalogFixture)));
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    if (cached) await load(signal());
    const controller = new AbortController();
    const reason = { obsolete: true };
    controller.abort(reason);
    await expect(load(controller.signal)).rejects.toBe(reason);
    expect(fetcher).toHaveBeenCalledTimes(cached ? 1 : 0);
  });

  it('shares a transport failure and refetches on the next concurrent retry', async () => {
    const response = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogFixture)));
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    const failed = Promise.allSettled([load(signal()), load(signal())]);
    response.reject(new TypeError('offline'));
    const results = await failed;
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]).toEqual(results[0]);
    expect(fetcher).toHaveBeenCalledOnce();
    const [first, second] = await Promise.all([load(signal()), load(signal())]);
    expect(first).toEqual(catalogFixture);
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['fresh', 'returning', 'restricted'] as const)(
    'loads and searches without auth or personal storage: %s profile',
    async (profile) => {
      const storage = {
        getItem: vi.fn(() => {
          if (profile === 'restricted') throw new DOMException('Blocked', 'SecurityError');
          return profile === 'returning' ? '{"old":"personal data"}' : null;
        }),
        setItem: vi.fn(() => {
          throw new Error('Seed search must not write storage');
        }),
      };
      vi.stubGlobal('localStorage', storage);
      vi.stubGlobal('indexedDB', {
        open: () => {
          throw new Error('No DB required');
        },
      });
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
    },
  );
  it.each([
    '<html>not a manifest</html>',
    JSON.stringify({ schemaVersion: 2 }),
    JSON.stringify({ ...catalogFixture, items: [] }),
  ])('rejects corrupt manifests and allows an explicit retry', async (bad) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(bad))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogFixture)));
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    await expect(load(signal())).rejects.toThrow();
    expect(await load(signal())).toEqual(catalogFixture);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects an absent manifest rather than caching an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"missing"}', { status: 404 })));
    await expect(createDiscoveryLoader()(signal())).rejects.toThrow('missing');
  });
  it('aborts only one caller while the other still receives and caches the shared catalog', async () => {
    const response = deferred<Response>();
    let transport: AbortSignal | null | undefined;
    const fetcher = vi.fn((_url: string, options: RequestInit) => {
      transport = options.signal;
      return response.promise;
    });
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const first = load(controller.signal);
    const waiting = new AbortController();
    const removeWaiting = vi.spyOn(waiting.signal, 'removeEventListener');
    const second = load(waiting.signal);
    const reason = new Error('obsolete');
    controller.abort(reason);
    await expect(first).rejects.toBe(reason);
    expect(transport?.aborted).toBe(false);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    response.resolve(new Response(JSON.stringify(catalogFixture)));
    const catalog = await second;
    expect(removeWaiting).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(catalog).toEqual(catalogFixture);
    expect(await load(signal())).toBe(catalog);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('lets an abandoned parser load finish and serve a later caller without fetching or parsing twice', async () => {
    const parser = await import('./discovery-catalog');
    let release: (module: typeof parser) => void = () => {
      throw new Error('Parser was not requested');
    };
    const preload = vi.spyOn(parserPreload, 'loadDiscoveryParser').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const parse = vi.spyOn(parser, 'parseDiscoveryCatalog');
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(catalogFixture))));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const load = createDiscoveryLoader();
    const first = load(controller.signal);
    await vi.waitFor(() => expect(preload).toHaveBeenCalledOnce());
    controller.abort(new Error('obsolete parser load'));
    await expect(first).rejects.toThrow('obsolete parser load');
    expect(parse).not.toHaveBeenCalled();
    const later = load(signal());
    release(parser);
    const catalog = await later;
    expect(catalog).toEqual(catalogFixture);
    expect(await load(signal())).toBe(catalog);
    expect(parse).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('bounds an abandoned shared fetch to 8000 ms and then permits a fresh load', async () => {
    vi.useFakeTimers();
    let transport: AbortSignal | undefined;
    const fetcher = vi
      .fn()
      .mockImplementationOnce((_url, options: RequestInit) => {
        transport = options.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      })
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogFixture)));
    vi.stubGlobal('fetch', fetcher);
    const load = createDiscoveryLoader();
    const controller = new AbortController();
    const abandoned = load(controller.signal);
    controller.abort();
    await expect(abandoned).rejects.toBe(controller.signal.reason);
    await vi.advanceTimersByTimeAsync(7999);
    expect(transport?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(transport?.aborted).toBe(true);
    expect(transport?.reason.kind).toBe('timeout');
    expect(await load(signal())).toEqual(catalogFixture);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the metadata byte limit on the shared transport', async () => {
    const response = new Response('{}', { headers: { 'content-length': String(DISCOVERY_LIMITS.metadataBytes + 1) } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const load = createDiscoveryLoader();
    const results = await Promise.allSettled([load(signal()), load(signal())]);
    expect(results[0]).toMatchObject({ status: 'rejected', reason: { kind: 'invalid' } });
    expect(results[1]).toEqual(results[0]);
  });

  it('distinguishes a terminal parser import from a retryable data request', async () => {
    const importer = vi
      .fn<() => ReturnType<typeof parserPreload.loadDiscoveryParser>>()
      .mockRejectedValue(new Error('Parser module unavailable'));
    const resource = createMemoizedModule(importer);
    vi.spyOn(parserPreload, 'loadDiscoveryParser').mockImplementation(resource.load);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(catalogFixture)))),
    );
    const load = createDiscoveryLoader();
    const errors = await Promise.all([load(signal()).catch((error) => error), load(signal()).catch((error) => error)]);
    const error = errors[0];
    expect(errors[1]).toBe(error);
    expect(error).toBeInstanceOf(ModuleLoadFailure);
    expect(isModuleLoadFailure(error)).toBe(true);
    await expect(load(signal())).rejects.toBe(error);
    expect(importer).toHaveBeenCalledOnce();
  });
});

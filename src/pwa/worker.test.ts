import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { libraryPageSearch, myGamesSearch, parseLibraryPage } from '../lib/my-games-navigation';
import { defaultFilters } from '../lib/url';
import {
  installPwaWorker,
  isPublicPwaFile,
  isPwaNotFoundNavigation,
  isPwaShellNavigation,
  pwaAppWindows,
  pwaAssetDeadlineMs,
  PWA_BUDGET,
  PWA_CACHE_PREFIX,
  PWA_NOT_FOUND_HTML,
  validatePwaManifest,
  verifiedPwaResponse,
} from './worker';
import type {
  PwaAsset,
  PwaBuildManifest,
  PwaDocumentPolicy,
  PwaFetchEvent,
  PwaMessageEvent,
  PwaWorkerClient,
  PwaWorkerHost,
} from './types';

const origin = 'https://play.test';
const version = 'a'.repeat(64);
const nextVersion = 'b'.repeat(64);
const fixtureBytes = new TextEncoder().encode('public fixture');
const hash = createHash('sha256').update(fixtureBytes).digest('hex');
const coreUrls = [
  '/index.html',
  '/pwa/offline.html',
  '/data/collection.json',
  '/data/discovery/catalog.v1.json',
  '/assets/index-12345678.js',
];
const assets: PwaAsset[] = coreUrls.map((url) => ({
  url,
  bytes: fixtureBytes.length,
  sha256: hash,
  type: url.endsWith('.html') ? 'html' : url.endsWith('.js') ? 'script' : 'json',
}));
function documentPolicy(csp = "default-src 'self'; style-src 'self' 'unsafe-inline'"): PwaDocumentPolicy {
  const headers = [
    { name: 'content-security-policy', value: csp },
    { name: 'cross-origin-opener-policy', value: 'same-origin' },
    { name: 'cross-origin-resource-policy', value: 'same-origin' },
    { name: 'x-content-type-options', value: 'nosniff' },
  ];
  return { headers, sha256: createHash('sha256').update(JSON.stringify(headers)).digest('hex') };
}
const policy = documentPolicy();
const manifest: PwaBuildManifest = { format: 1, version, documentPolicy: policy, core: assets, images: [] };
const cacheKey = (input: RequestInfo | URL) => (input instanceof Request ? input.url : String(input));

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((ready) => {
    resolve = ready;
  });
  return { promise, resolve };
}

function navigation(url: string): Request {
  const input = new Request(url);
  Object.defineProperty(input, 'mode', { value: 'navigate' });
  return input;
}

class MemoryCache {
  readonly entries = new Map<string, Response>();
  fail = false;
  async put(input: RequestInfo | URL, response: Response) {
    if (this.fail) throw new Error('Synthetic quota failure.');
    this.entries.set(cacheKey(input), response.clone());
  }
  async match(input: RequestInfo | URL) {
    return this.entries.get(cacheKey(input))?.clone();
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async delete(input: RequestInfo | URL) {
    return this.entries.delete(cacheKey(input));
  }
}

function workerFixture(active = false, chosen: PwaBuildManifest = manifest) {
  const stores = new Map<string, MemoryCache>();
  const clients: PwaWorkerClient[] = [
    { id: 'one', url: `${origin}/my-games`, type: 'window', frameType: 'top-level', postMessage: vi.fn() },
  ];
  const caches = {
    async open(key: string) {
      const cache = stores.get(key) ?? new MemoryCache();
      stores.set(key, cache);
      return cache;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(key: string) {
      return stores.delete(key);
    },
  };
  const fetch = vi.fn(async (input: Request) => {
    const url = new URL(input.url);
    const mime = url.pathname.endsWith('.html')
      ? 'text/html'
      : url.pathname.endsWith('.js')
        ? 'text/javascript'
        : url.pathname.endsWith('.webp')
          ? 'image/webp'
          : 'application/json';
    return new Response(fixtureBytes.slice(), { headers: { 'Content-Type': mime } });
  });
  const on = vi.fn<(type: string, handler: (event: unknown) => void) => void>();
  const host: PwaWorkerHost = {
    location: { origin },
    caches,
    crypto: webcrypto,
    registration: { active: active ? { state: 'activated' } : null },
    clients: { matchAll: async () => clients, claim: vi.fn(async () => {}) },
    fetch,
    skipWaiting: vi.fn(async () => {}),
    addEventListener: on,
  };
  installPwaWorker(host, chosen);
  const call = (name: string, event: unknown) => {
    const listener = on.mock.calls.find(([type]) => type === name)?.[1];
    if (!listener) throw new Error(`Missing worker listener ${name}.`);
    listener(event);
  };
  const lifetime = async (name: 'install' | 'activate') => {
    let task: Promise<unknown> | undefined;
    call(name, {
      waitUntil: (work: Promise<unknown>) => {
        task = work;
      },
    });
    await task;
  };
  const fetchTasks: Promise<unknown>[] = [];
  const settleFetches = async () => {
    await Promise.all(fetchTasks.splice(0));
  };
  const response = (input: Request, clientId = 'one', resultingClientId = clientId) => {
    let result: Promise<Response> | undefined;
    const event: PwaFetchEvent = {
      request: input,
      clientId,
      resultingClientId,
      respondWith: (value) => {
        result = value;
      },
      waitUntil: (work) => {
        fetchTasks.push(work);
      },
    };
    call('fetch', event);
    return result;
  };
  const message = async (data: unknown, source = clients[0]!) => {
    const ports = new MessageChannel();
    const reply = new Promise<unknown>((resolve) => {
      ports.port1.onmessage = (event) => resolve(event.data);
    });
    let task: Promise<unknown> | undefined;
    const event: PwaMessageEvent = {
      source,
      ports: [ports.port2],
      data,
      waitUntil: (work) => {
        task = work;
      },
    };
    call('message', event);
    try {
      await task;
      return await reply;
    } finally {
      ports.port1.close();
      ports.port2.close();
    }
  };
  return { host, fetch, on, clients, stores, lifetime, response, call, caches, message, settleFetches, fetchTasks };
}

describe('PWA positive cache boundaries', () => {
  it.each([
    '/api/catalog',
    '/api/enrichment',
    '/__/auth/handler',
    '/__/auth/iframe.js',
    '/account',
    '/friends',
    '/u/private',
    '/data-use',
    '/videos/film.mp4',
    '/downloads/Play-100-Collection.xlsx',
    '/data/collection.json?token=secret',
    '//evil.test/assets/x.js',
  ])('does not allow an unlisted public asset URL: %s', (value) => {
    expect(isPublicPwaFile(value)).toBe(false);
  });
  it('allows only known app navigation queries and never writes them as cache keys', () => {
    expect(isPwaShellNavigation(new URL('/my-games?tab=queue&game=one', origin), origin)).toBe(true);
    expect(
      isPwaShellNavigation(new URL('/discover?genreFamily=role-playing&include100=on&catalogs=off', origin), origin),
    ).toBe(true);
    expect(
      isPwaShellNavigation(new URL('/discover?genreFamily=role-playing&include100=on&code=private', origin), origin),
    ).toBe(false);
    expect(isPwaShellNavigation(new URL('/data-use', origin), origin)).toBe(true);
    for (const url of ['/account', '/?code=oauth', '/?access_token=token', '/?returnTo=private', '/data-use?next=x']) {
      expect(isPwaShellNavigation(new URL(url, origin), origin)).toBe(false);
    }
  });
  it.each([
    '/my-games?page=1',
    '/my-games?tab=library&page=2',
    '/my-games?tab=ranking&page=9999',
    '/my-library?page=2&catalogs=off',
    '/my-rankings?page=25',
  ])('allows a bounded Library page in its personal-workspace shell: %s', (path) => {
    expect(isPwaShellNavigation(new URL(path, origin), origin)).toBe(true);
  });
  it.each([
    '/my-games?page=',
    '/my-games?page=0',
    '/my-games?page=-1',
    '/my-games?page=1.5',
    '/my-games?page=01',
    '/my-games?page=1e2',
    '/my-games?page=10000',
    '/my-games?page=Infinity',
    '/my-games?page=private-note',
    '/my-games?page=2&page=3',
    '/my-games?tab=library&page=2&note=private',
    '/my-games?page=2&access_token=private',
    '/discover?page=2',
    '/?page=2',
    `/my-games?page=${'9'.repeat(2049)}`,
  ])('rejects invalid, ambiguous or out-of-scope page queries: %s', (path) => {
    expect(isPwaShellNavigation(new URL(path, origin), origin)).toBe(false);
  });
  it('agrees with every bounded Library page the URL writer can emit, including retained tab context', () => {
    for (let page = 1; page <= 9999; page += 1) {
      const search = libraryPageSearch('?tab=library&catalogs=off', page);
      expect(parseLibraryPage(search)).toBe(page);
      expect(isPwaShellNavigation(new URL(`/my-games${search}`, origin), origin)).toBe(true);
    }
    for (const tab of ['library', 'queue', 'ranking'] as const) {
      const search = myGamesSearch(defaultFilters, tab, null, 9999);
      expect(isPwaShellNavigation(new URL(`/my-games${search}`, origin), origin)).toBe(true);
    }
  });
  it('fails manifests outside byte/count/path/hash budgets', () => {
    expect(() => validatePwaManifest(manifest)).not.toThrow();
    expect(() =>
      validatePwaManifest({ ...manifest, core: [...assets, { ...assets[0]!, url: '/api/private' }] }),
    ).toThrow();
    expect(() =>
      validatePwaManifest({
        ...manifest,
        core: assets.map((asset) => ({ ...asset, bytes: PWA_BUDGET.coreFileBytes + 1 })),
      }),
    ).toThrow();
    expect(() => validatePwaManifest({ ...manifest, version: 'not-a-build' })).toThrow();
  });
  it('validates actual decoded bytes, type and release digest instead of trusting a 200/login page', async () => {
    const asset = assets[2]!;
    await expect(
      verifiedPwaResponse(
        new Response(fixtureBytes, { headers: { 'Content-Type': 'application/json' } }),
        asset,
        `${origin}${asset.url}`,
        webcrypto,
        policy,
      ),
    ).resolves.toBeInstanceOf(Response);
    for (const response of [
      new Response('login', { headers: { 'Content-Type': 'text/html' } }),
      new Response('changed', { headers: { 'Content-Type': 'application/json' } }),
      new Response(fixtureBytes, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private' } }),
      new Response(fixtureBytes, { status: 401, headers: { 'Content-Type': 'application/json' } }),
    ])
      await expect(verifiedPwaResponse(response, asset, `${origin}${asset.url}`, webcrypto, policy)).rejects.toThrow();
    const redirected = new Response(fixtureBytes, { headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(redirected, 'redirected', { value: true });
    await expect(verifiedPwaResponse(redirected, asset, `${origin}${asset.url}`, webcrypto, policy)).rejects.toThrow();
  });

  it('verifies an asset with a live signal without throwIfAborted or reason', async () => {
    const controller = new AbortController();
    Object.defineProperties(controller.signal, {
      throwIfAborted: { value: undefined },
      reason: { value: undefined },
    });
    const asset = assets[2]!;
    await expect(
      verifiedPwaResponse(
        new Response(fixtureBytes, { headers: { 'Content-Type': 'application/json' } }),
        asset,
        `${origin}${asset.url}`,
        webcrypto,
        policy,
        controller.signal,
      ),
    ).resolves.toBeInstanceOf(Response);
  });

  for (const phase of ['before-read', 'during-read', 'during-digest'] as const) {
    it.each([false, true])(
      `rejects cancellation ${phase} without throwIfAborted, reason supported=%s`,
      async (hasReason) => {
        const controller = new AbortController();
        Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined });
        if (!hasReason) Object.defineProperty(controller.signal, 'reason', { value: undefined });
        const reason = new Error('obsolete offline asset');
        const asset = assets[2]!;
        let reading: () => void = () => {};
        const started = new Promise<void>((resolve) => {
          reading = resolve;
        });
        const cancel = vi.fn();
        const body =
          phase === 'during-read'
            ? new ReadableStream<Uint8Array>({
                pull() {
                  reading();
                },
                cancel,
              })
            : fixtureBytes;
        const crypto: PwaWorkerHost['crypto'] = {
          subtle: {
            async digest(algorithm, data) {
              const result = await webcrypto.subtle.digest(algorithm, data);
              if (phase === 'during-digest') controller.abort(reason);
              return result;
            },
          },
        };
        if (phase === 'before-read') controller.abort(reason);
        const response = new Response(body, { headers: { 'Content-Type': 'application/json' } });
        const task = verifiedPwaResponse(response, asset, `${origin}${asset.url}`, crypto, policy, controller.signal);
        const rejected = hasReason
          ? expect(task).rejects.toBe(reason)
          : expect(task).rejects.toMatchObject({ name: 'AbortError' });
        if (phase === 'during-read') {
          await started;
          controller.abort(reason);
        }
        await rejected;
        expect(response.body?.locked).toBe(false);
        if (phase === 'during-read') expect(cancel).toHaveBeenCalledOnce();
      },
    );
  }
});

describe('version-bound offline security headers', () => {
  it('keeps the reporting endpoint with report-to in verified and cached document responses', async () => {
    const csp = "default-src 'self'; report-to csp; report-uri /api/csp-report";
    const reporting = documentPolicy(csp);
    const headers = [...reporting.headers, { name: 'reporting-endpoints', value: 'csp="/api/csp-report"' }];
    const withReports = { headers, sha256: createHash('sha256').update(JSON.stringify(headers)).digest('hex') };
    const fixture = workerFixture(false, { ...manifest, documentPolicy: withReports });
    await fixture.lifetime('install');
    const response = await fixture.caches
      .open(`${PWA_CACHE_PREFIX}core-${version}`)
      .then((cache) => cache.match(`${origin}/index.html`));
    expect(response?.headers.get('content-security-policy')).toBe(csp);
    expect(response?.headers.get('reporting-endpoints')).toBe('csp="/api/csp-report"');
    expect(() => validatePwaManifest({ ...manifest, documentPolicy: reporting })).toThrow(/Reporting-Endpoints/);
    expect(() =>
      validatePwaManifest({
        ...manifest,
        documentPolicy: {
          ...withReports,
          headers: headers.map((header) =>
            header.name === 'reporting-endpoints' ? { ...header, value: 'csp="https://third.test/report"' } : header,
          ),
        },
      }),
    ).toThrow(/Reporting-Endpoints/);
  });

  it('uses the embedded document policy and never copies cookies or arbitrary response headers', async () => {
    const asset = assets[0]!;
    const response = await verifiedPwaResponse(
      new Response(fixtureBytes, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': 'default-src *',
          'Set-Cookie': 'fixture=never-store',
          'X-Private-Fixture': 'never-store',
        },
      }),
      asset,
      `${origin}${asset.url}`,
      webcrypto,
      policy,
    );
    for (const header of policy.headers) expect(response.headers.get(header.name)).toBe(header.value);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(response.headers.get('X-Private-Fixture')).toBeNull();
  });

  it('refuses a malformed or disallowed policy instead of installing headerless HTML', async () => {
    expect(() => validatePwaManifest({ ...manifest, documentPolicy: { headers: [], sha256: policy.sha256 } })).toThrow(
      /no CSP/,
    );
    expect(() =>
      validatePwaManifest({
        ...manifest,
        documentPolicy: {
          ...policy,
          headers: [...policy.headers, { name: 'set-cookie', value: 'fixture=not-allowed' }],
        },
      }),
    ).toThrow(/unapproved/);
    const corrupted = workerFixture(false, { ...manifest, documentPolicy: { ...policy, sha256: '0'.repeat(64) } });
    await expect(corrupted.lifetime('install')).rejects.toThrow(/policy digest/);
    expect(corrupted.fetch).not.toHaveBeenCalled();
  });

  it('serves the embedded policy on the shell and offline fallback without relying on network headers', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    fixture.fetch.mockRejectedValue(new Error('Offline'));
    const shell = await fixture.response(navigation(`${origin}/my-games?tab=queue`));
    const fallback = await fixture.response(navigation(`${origin}/account`));
    expect(shell?.status).toBe(200);
    expect(fallback?.status).toBe(503);
    for (const response of [shell, fallback]) {
      for (const header of policy.headers) expect(response?.headers.get(header.name)).toBe(header.value);
      expect(response?.headers.get('Set-Cookie')).toBeNull();
    }
    expect(fallback?.headers.get('Cache-Control')).toBe('no-store');
  });
  it('serves the not-found page offline for unknown paths, with the embedded policy (UX-004)', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    fixture.fetch.mockRejectedValue(new Error('Offline'));
    const missing = await fixture.response(navigation(`${origin}/settings`));
    expect(missing?.status).toBe(404);
    expect(missing?.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(missing?.headers.get('Cache-Control')).toBe('no-store');
    for (const header of policy.headers) expect(missing?.headers.get(header.name)).toBe(header.value);
    expect(await missing?.text()).toBe(PWA_NOT_FOUND_HTML);
    // App routes that need a connection keep the offline page, and files keep failing as files.
    expect((await fixture.response(navigation(`${origin}/friends/someone`)))?.status).toBe(503);
    expect((await fixture.response(navigation(`${origin}/missing.png`)))?.status).toBe(503);
  });
  it('keeps the offline not-found page identical to public/404.html', () => {
    expect(PWA_NOT_FOUND_HTML).toBe(readFileSync(new URL('../../public/404.html', import.meta.url), 'utf8'));
  });
  it('treats exactly the app routes from vercel.json as known pages', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
      rewrites: { source: string; destination: string }[];
    };
    const routes = vercel.rewrites
      .filter((rewrite) => rewrite.destination === '/index.html')
      .map((rewrite) => rewrite.source.replace(/:[a-z]+/, 'value'));
    // trailingSlash: false redirects these online, so they aren't missing pages either.
    for (const path of ['/', '/index.html', '/my-games/', ...routes]) {
      expect(isPwaNotFoundNavigation(new URL(`${origin}${path}`), origin), path).toBe(false);
    }
    for (const path of ['/settings', '/discover/extra', '/friends/a/b', '/u/', '/ACCOUNT']) {
      expect(isPwaNotFoundNavigation(new URL(`${origin}${path}`), origin), path).toBe(true);
    }
    expect(isPwaNotFoundNavigation(new URL('https://elsewhere.test/settings'), origin)).toBe(false);
    expect(isPwaNotFoundNavigation(new URL(`${origin}/robots.txt`), origin)).toBe(false);
  });
  it('serves Data use offline from the app shell, without writing its path to the cache (UX-019)', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    fixture.fetch.mockClear().mockRejectedValue(new Error('Offline'));
    const page = await fixture.response(navigation(`${origin}/data-use`));
    expect(page?.status).toBe(200);
    expect(await page?.text()).toBe('public fixture');
    for (const header of policy.headers) expect(page?.headers.get(header.name)).toBe(header.value);
    expect(fixture.fetch).not.toHaveBeenCalled();
    for (const cache of fixture.stores.values()) {
      expect([...cache.entries.keys()].some((key) => key.includes('data-use'))).toBe(false);
    }
  });
  it('serves a paged Library offline without caching the query or allowing a private query key', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    fixture.fetch.mockRejectedValue(new Error('Offline'));
    const shell = await fixture.response(navigation(`${origin}/my-games?tab=library&page=2`));
    expect(shell?.status).toBe(200);
    expect(await shell?.text()).toBe('public fixture');
    const denied = await fixture.response(navigation(`${origin}/my-games?tab=library&page=2&note=private`));
    expect(denied?.status).toBe(503);
    for (const cache of fixture.stores.values()) {
      expect([...cache.entries.keys()].every((key) => new URL(key).search === '')).toBe(true);
    }
  });

  it('preserves the previous document policy instead of applying a newer policy to old HTML', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    const oldPolicy = documentPolicy("default-src 'self'; style-src 'none'");
    const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await old.put(
      `${origin}/pwa/__ready__`,
      new Response(
        JSON.stringify({
          version: nextVersion,
          created: 1,
          documentPolicy: oldPolicy,
        }),
      ),
    );
    await old.put(
      `${origin}/index.html`,
      new Response('old document', {
        headers: {
          'Content-Type': 'text/html',
          'Set-Cookie': 'fixture=not-preserved',
        },
      }),
    );
    await (
      await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`)
    ).put(`${origin}/pwa/__clients__`, new Response(JSON.stringify({ one: nextVersion })));
    const previous = await fixture.response(new Request(`${origin}/index.html`));
    expect(await previous?.text()).toBe('old document');
    expect(previous?.headers.get('Content-Security-Policy')).toBe(oldPolicy.headers[0]?.value);
    expect(previous?.headers.get('Content-Security-Policy')).not.toBe(policy.headers[0]?.value);
    expect(previous?.headers.get('Set-Cookie')).toBeNull();
  });

  it.each(['missing', 'corrupt', 'wrong-version'] as const)(
    'rejects a %s prior HTML policy while retaining correctly bound old metadata',
    async (kind) => {
      const fixture = workerFixture(true);
      await fixture.lifetime('install');
      const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
      await old.put(
        `${origin}/pwa/__ready__`,
        new Response(
          JSON.stringify({
            version: kind === 'wrong-version' ? version : nextVersion,
            created: 1,
            ...(kind === 'missing'
              ? {}
              : { documentPolicy: { ...policy, sha256: kind === 'corrupt' ? '0'.repeat(64) : policy.sha256 } }),
          }),
        ),
      );
      await old.put(`${origin}/index.html`, new Response('headerless old shell'));
      await old.put(`${origin}/data/collection.json`, new Response('old compatible metadata'));
      await (
        await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`)
      ).put(`${origin}/pwa/__clients__`, new Response(JSON.stringify({ one: nextVersion })));
      const previous = await fixture.response(new Request(`${origin}/index.html`));
      expect(previous?.status).toBe(503);
      expect(previous?.headers.get('Content-Security-Policy')).toBe(policy.headers[0]?.value);
      expect(await (await fixture.response(new Request(`${origin}/data/collection.json`)))?.text()).toBe(
        'old compatible metadata',
      );
    },
  );
});

describe('native worker install, offline and update lifetime', () => {
  it('budgets a minute of startup plus transfer at 4 KiB/s, bounded to six minutes', () => {
    expect(pwaAssetDeadlineMs(0)).toBe(60_000);
    expect(pwaAssetDeadlineMs(1)).toBe(61_000);
    expect(pwaAssetDeadlineMs(4096)).toBe(61_000);
    expect(pwaAssetDeadlineMs(4097)).toBe(62_000);
    expect(pwaAssetDeadlineMs(PWA_BUDGET.coreFileBytes)).toBe(316_000);
    expect(pwaAssetDeadlineMs(10 * 1024 * 1024)).toBe(360_000);
  });

  it.each(['headers', 'body'] as const)(
    'aborts stalled %s, discards the incomplete core and preserves the working version',
    async (phase) => {
      vi.useFakeTimers();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const cached = deferred();
      const save = MemoryCache.prototype.put;
      const saved = vi.spyOn(MemoryCache.prototype, 'put').mockImplementation(async function (
        this: MemoryCache,
        input,
        response,
      ) {
        await save.call(this, input, response);
        if (this.entries.size === assets.length - 1) cached.resolve();
      });
      try {
        const fixture = workerFixture(true);
        const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
        await old.put(`${origin}/index.html`, new Response('working old shell'));
        await old.put(`${origin}/pwa/__ready__`, new Response('old ready marker'));
        await fixture.caches.open('unrelated-private-cache');
        const started = deferred();
        const cancelled = deferred();
        const cancel = vi.fn(() => {
          cancelled.resolve();
          return new Promise<void>(() => {});
        });
        const response = new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(fixtureBytes.slice(0, 3));
            },
            cancel,
          }),
          { headers: { 'Content-Type': 'text/html' } },
        );
        let releaseHeaders: (response: Response) => void = () => {};
        const headers = new Promise<Response>((resolve) => {
          releaseHeaders = resolve;
        });
        const normalFetch = fixture.fetch.getMockImplementation()!;
        let stalledRequest: Request | undefined;
        fixture.fetch.mockImplementation(async (input) => {
          // Hold one asset while the other install lanes cache their verified responses.
          if (input.url !== `${origin}${assets[1]!.url}`) return normalFetch(input);
          stalledRequest = input;
          started.resolve();
          return phase === 'headers' ? headers : response;
        });
        const outcome = expect(fixture.lifetime('install')).rejects.toThrow('Offline download took too long');
        await started.promise;
        await cached.promise;
        saved.mockRestore();
        const partial = fixture.stores.get(`${PWA_CACHE_PREFIX}core-${version}`)!;
        expect(partial.entries.has(`${origin}/index.html`)).toBe(true);
        const put = vi.spyOn(partial, 'put');
        await vi.advanceTimersByTimeAsync(pwaAssetDeadlineMs(assets[1]!.bytes) - 1);
        expect(stalledRequest?.signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await outcome;
        expect(stalledRequest?.signal.aborted).toBe(true);
        expect(fixture.stores.has(`${PWA_CACHE_PREFIX}core-${version}`)).toBe(false);
        expect(await (await old.match(`${origin}/index.html`))?.text()).toBe('working old shell');
        expect(await (await old.match(`${origin}/pwa/__ready__`))?.text()).toBe('old ready marker');
        expect(fixture.stores.has('unrelated-private-cache')).toBe(true);
        expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
        expect(fixture.clients[0]!.postMessage).toHaveBeenCalledWith({
          channel: 'play100-pwa-v1',
          version,
          status: 'error',
          message: 'Offline download took too long. Check your connection and retry.',
        });
        if (phase === 'headers') releaseHeaders(response);
        await cancelled.promise;
        expect(cancel).toHaveBeenCalledOnce();
        expect(put).not.toHaveBeenCalled();
        expect(fixture.stores.has(`${PWA_CACHE_PREFIX}core-${version}`)).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        fixture.fetch.mockImplementation(normalFetch);
        await fixture.lifetime('install');
        expect(fixture.stores.get(`${PWA_CACHE_PREFIX}core-${version}`)?.entries.has(`${origin}/pwa/__ready__`)).toBe(
          true,
        );
        expect(await (await old.match(`${origin}/index.html`))?.text()).toBe('working old shell');
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        saved.mockRestore();
        error.mockRestore();
        vi.useRealTimers();
      }
    },
  );

  it('accepts slow steady headers and body within one deadline and clears its timer', async () => {
    vi.useFakeTimers();
    try {
      const fixture = workerFixture();
      const started = deferred();
      const cancel = vi.fn();
      fixture.fetch.mockImplementationOnce(async () => {
        started.resolve();
        await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              setTimeout(() => controller.enqueue(fixtureBytes.slice(0, 3)), 10_000);
              setTimeout(() => controller.enqueue(fixtureBytes.slice(3)), 30_000);
              setTimeout(() => controller.close(), 40_000);
            },
            cancel,
          }),
          { headers: { 'Content-Type': 'text/html' } },
        );
      });
      const install = fixture.lifetime('install');
      await started.promise;
      await vi.advanceTimersByTimeAsync(50_000);
      await install;
      const core = fixture.stores.get(`${PWA_CACHE_PREFIX}core-${version}`)!;
      expect(core.entries.has(`${origin}/pwa/__ready__`)).toBe(true);
      const html = await core.match(`${origin}/index.html`);
      expect(await html?.text()).toBe(new TextDecoder().decode(fixtureBytes));
      expect(html?.headers.get('content-security-policy')).toBe(policy.headers[0]!.value);
      expect(cancel).not.toHaveBeenCalled();
      expect(fixture.fetch.mock.calls.every(([input]) => !input.signal.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('installs a complete version atomically without claiming an uncontrolled page of unknown version', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
    expect(fixture.fetch).toHaveBeenCalledTimes(assets.length);
    for (const [request] of fixture.fetch.mock.calls)
      expect([request.credentials, request.redirect, request.method]).toEqual(['omit', 'error', 'GET']);
    await fixture.lifetime('activate');
    expect(fixture.host.clients.claim).not.toHaveBeenCalled();
    expect(fixture.stores.get(`${PWA_CACHE_PREFIX}core-${version}`)?.entries.has(`${origin}/pwa/__ready__`)).toBe(true);
  });

  it('prepares at most four core assets at once and marks ready only after every verified put', async () => {
    const fixture = workerFixture();
    const fetch = fixture.fetch.getMockImplementation()!;
    const held: Array<() => Promise<void>> = [];
    let active = 0;
    let peak = 0;
    fixture.fetch.mockImplementation(
      (input) =>
        new Promise<Response>((resolve) => {
          peak = Math.max(peak, ++active);
          held.push(async () => {
            const response = await fetch(input);
            active--;
            resolve(response);
          });
        }),
    );
    const install = fixture.lifetime('install');
    await vi.waitFor(() => expect(held).toHaveLength(4));
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
    expect(cache.entries.has(`${origin}/pwa/__ready__`)).toBe(false);
    await held[0]!();
    await vi.waitFor(() => expect(held).toHaveLength(5));
    await Promise.all(held.slice(1, 4).map((release) => release()));
    await vi.waitFor(() => expect(cache.entries.size).toBe(4));
    expect(cache.entries.has(`${origin}/pwa/__ready__`)).toBe(false);
    await held[4]!();
    await install;
    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(cache.entries.size).toBe(assets.length + 1);
    expect(cache.entries.has(`${origin}/pwa/__ready__`)).toBe(true);
  });

  it('drains started core writes before cleaning up a concurrent checksum failure', async () => {
    const fixture = workerFixture(true);
    const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await old.put(`${origin}/index.html`, new Response('old verified shell'));
    const writing = deferred();
    const finishWrite = deferred();
    const checked = deferred();
    const corrupt = new Uint8Array(fixtureBytes.length);
    const corruptHash = createHash('sha256').update(corrupt).digest('hex');
    const digest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    const hashed = vi.spyOn(webcrypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      const result = await digest(algorithm, data);
      if (Buffer.from(result).toString('hex') === corruptHash) checked.resolve();
      return result;
    });
    const order: string[] = [];
    const remove = fixture.caches.delete.bind(fixture.caches);
    vi.spyOn(fixture.caches, 'delete').mockImplementation(async (key) => {
      order.push('delete');
      return remove(key);
    });
    const fetch = fixture.fetch.getMockImplementation()!;
    const save = MemoryCache.prototype.put;
    const saved = vi.spyOn(MemoryCache.prototype, 'put').mockImplementation(async function (
      this: MemoryCache,
      input,
      response,
    ) {
      if (cacheKey(input) === `${origin}/index.html`) {
        writing.resolve();
        await finishWrite.promise;
      }
      await save.call(this, input, response);
      if (cacheKey(input) === `${origin}/index.html`) order.push('put');
    });
    fixture.fetch.mockImplementation(async (input) => {
      if (input.url !== `${origin}/index.html`) {
        await writing.promise;
        if (input.url === `${origin}/pwa/offline.html`) {
          return new Response(corrupt, { headers: { 'Content-Type': 'text/html' } });
        }
      }
      return fetch(input);
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const outcome = expect(fixture.lifetime('install')).rejects.toThrow('did not match this release');
    try {
      await checked.promise;
      // The corrupt digest has completed; drain its rejection microtasks while the put stays held.
      await setImmediate();
      expect(order).toEqual(['delete']);
      expect(fixture.stores.has(`${PWA_CACHE_PREFIX}core-${version}`)).toBe(true);
      finishWrite.resolve();
      await outcome;
      expect(order).toEqual(['delete', 'put', 'delete']);
      expect(fixture.stores.has(`${PWA_CACHE_PREFIX}core-${version}`)).toBe(false);
      expect(await (await old.match(`${origin}/index.html`))?.text()).toBe('old verified shell');
      expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
    } finally {
      finishWrite.resolve();
      hashed.mockRestore();
      saved.mockRestore();
      error.mockRestore();
    }
  });

  it('preserves the working version and unrelated caches after failed precache', async () => {
    const fixture = workerFixture(true);
    const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await old.put(`${origin}/index.html`, new Response('working old shell'));
    await fixture.caches.open('unrelated-private-cache');
    fixture.fetch.mockRejectedValueOnce(new Error('Synthetic offline install.'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(fixture.lifetime('install')).rejects.toThrow(/offline/);
      expect(fixture.stores.has(`${PWA_CACHE_PREFIX}core-${version}`)).toBe(false);
      expect(await (await old.match(`${origin}/index.html`))?.text()).toBe('working old shell');
      expect(fixture.stores.has('unrelated-private-cache')).toBe(true);
      expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });

  it('fails parallel preparation closed when a core cache put fails', async () => {
    const fixture = workerFixture(true);
    const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await old.put(`${origin}/index.html`, new Response('working old shell'));
    const put = vi.spyOn(MemoryCache.prototype, 'put').mockRejectedValueOnce(new Error('Synthetic quota failure.'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(fixture.lifetime('install')).rejects.toThrow('Synthetic quota failure.');
      expect(fixture.stores.has(`${PWA_CACHE_PREFIX}core-${version}`)).toBe(false);
      expect(await (await old.match(`${origin}/index.html`))?.text()).toBe('working old shell');
      expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
      error.mockRestore();
    }
  });

  it('opens a previously prepared local route offline without caching the query or mutating IndexedDB', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    fixture.fetch.mockRejectedValue(new Error('Offline'));
    const input = new Request(`${origin}/my-games?tab=ranking&game=manual%3Aone`);
    Object.defineProperty(input, 'mode', { value: 'navigate' });
    expect(await (await fixture.response(input))?.text()).toBe('public fixture');
    const allKeys = [...fixture.stores.values()].flatMap((cache) => [...cache.entries.keys()]);
    expect(allKeys.some((key) => key.includes('?') || key.includes('manual'))).toBe(false);
    const account = new Request(`${origin}/account`);
    Object.defineProperty(account, 'mode', { value: 'navigate' });
    expect((await fixture.response(account))?.status).toBe(503);
  });

  it('never intercepts auth, enrichment APIs, cross-origin, non-GET or token-bearing asset requests', async () => {
    const fixture = workerFixture();
    for (const request of [
      new Request(`${origin}/api/enrichment?id=one`),
      new Request(`${origin}/`, { method: 'HEAD', cache: 'no-store' }),
      new Request(`${origin}/__/auth/handler?code=private`),
      new Request('https://firestore.googleapis.com/private'),
      new Request(`${origin}/data/collection.json?uid=private`),
      new Request(`${origin}/assets/index-12345678.js`, { headers: { Authorization: 'Bearer private' } }),
      new Request(`${origin}/assets/index-12345678.js`, { method: 'POST', body: 'private' }),
      new Request(`${origin}/data-use`),
    ])
      expect(fixture.response(request)).toBeUndefined();
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.stores.size).toBe(0);
  });

  it('refuses wrong-version and multi-client update commands, then accepts one trusted requester', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    await (
      await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`)
    ).put(`${origin}/pwa/__ready__`, new Response(JSON.stringify({ version: nextVersion, created: 1 })));
    const request = async (wanted: string) => {
      const ports = new MessageChannel();
      const reply = new Promise<unknown>((resolve) => {
        ports.port1.onmessage = (event) => resolve(event.data);
      });
      let task: Promise<unknown> | undefined;
      const event: PwaMessageEvent = {
        source: fixture.clients[0]!,
        ports: [ports.port2],
        data: { channel: 'play100-pwa-v1', type: 'ACTIVATE', version: wanted, previousVersion: nextVersion },
        waitUntil: (work) => {
          task = work;
        },
      };
      fixture.call('message', event);
      await task;
      const value = await reply;
      ports.port1.close();
      ports.port2.close();
      return value;
    };
    expect(await request(nextVersion)).toMatchObject({ accepted: false });
    fixture.clients.push({ ...fixture.clients[0]!, id: 'two' });
    expect(await request(version)).toMatchObject({ accepted: false, reason: 'other-tabs' });
    expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
    fixture.clients.pop();
    fixture.clients.push({
      ...fixture.clients[0]!,
      id: 'auth-frame',
      frameType: 'nested',
      url: `${origin}/__/auth/iframe?private-token=redacted`,
    });
    expect(await request(version)).toMatchObject({ accepted: true, version });
    expect(fixture.host.skipWaiting).toHaveBeenCalledOnce();
    await fixture.lifetime('activate');
    expect(fixture.host.clients.claim).not.toHaveBeenCalled();
  });

  it('bounds runtime artwork by both count and decoded bytes without precaching it', async () => {
    const imageAssets: PwaAsset[] = Array.from({ length: 54 }, (_, index) => ({
      url: `/images/discovery/${index.toString(16).padStart(64, '0')}.webp`,
      bytes: fixtureBytes.length,
      sha256: hash,
      type: 'image',
    }));
    const fixture = workerFixture(false, { ...manifest, images: imageAssets });
    await fixture.lifetime('install');
    expect(fixture.fetch).toHaveBeenCalledTimes(assets.length);
    for (const image of imageAssets)
      expect((await fixture.response(new Request(`${origin}${image.url}`)))?.ok).toBe(true);
    await fixture.settleFetches();
    expect((await fixture.caches.open(`${PWA_CACHE_PREFIX}images-${version}`)).entries.size).toBe(48);

    const largeBytes = new Uint8Array(PWA_BUDGET.imageFileBytes);
    const largeHash = createHash('sha256').update(largeBytes).digest('hex');
    const largeImages = imageAssets
      .slice(0, 30)
      .map((asset) => ({ ...asset, bytes: largeBytes.length, sha256: largeHash }));
    const large = workerFixture(false, { ...manifest, images: largeImages });
    await large.lifetime('install');
    large.fetch.mockImplementation(
      async () => new Response(largeBytes.slice(), { headers: { 'Content-Type': 'image/webp' } }),
    );
    for (const image of largeImages) await large.response(new Request(`${origin}${image.url}`));
    await large.settleFetches();
    const count = (await large.caches.open(`${PWA_CACHE_PREFIX}images-${version}`)).entries.size;
    expect(count).toBe(Math.floor(PWA_BUDGET.imageBytes / largeBytes.length));
    expect(count * largeBytes.length).toBeLessThanOrEqual(PWA_BUDGET.imageBytes);
  });

  it('returns verified artwork before serialized persistence finishes and keeps writes alive', async () => {
    const imageAssets: PwaAsset[] = [1, 2].map((value) => ({
      url: `/images/discovery/${String(value).repeat(64)}.webp`,
      bytes: fixtureBytes.length,
      sha256: hash,
      type: 'image',
    }));
    const fixture = workerFixture(false, { ...manifest, images: imageAssets });
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}images-${version}`);
    const entered = deferred();
    const resume = deferred();
    const keys = cache.keys.bind(cache);
    const inspect = vi.spyOn(cache, 'keys').mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return keys();
    });
    try {
      const first = fixture.response(new Request(`${origin}${imageAssets[0]!.url}`));
      expect(fixture.fetchTasks).toHaveLength(1);
      await entered.promise;
      expect(await (await first)?.text()).toBe(new TextDecoder().decode(fixtureBytes));
      const second = await fixture.response(new Request(`${origin}${imageAssets[1]!.url}`));
      expect(await second?.text()).toBe(new TextDecoder().decode(fixtureBytes));
      expect(fixture.fetchTasks).toHaveLength(2);
      expect(inspect).toHaveBeenCalledOnce();
      expect(cache.entries.size).toBe(0);
      resume.resolve();
      await fixture.settleFetches();
      expect([...cache.entries.keys()]).toEqual(imageAssets.map((asset) => `${origin}${asset.url}`));
      const calls = fixture.fetch.mock.calls.length;
      expect((await fixture.response(new Request(`${origin}${imageAssets[0]!.url}`)))?.ok).toBe(true);
      await fixture.settleFetches();
      expect(fixture.fetch).toHaveBeenCalledTimes(calls);
    } finally {
      resume.resolve();
      inspect.mockRestore();
    }
  });

  it('reports deferred artwork storage failure without failing its response or poisoning later writes', async () => {
    const image: PwaAsset = {
      url: `/images/discovery/${'1'.repeat(64)}.webp`,
      bytes: fixtureBytes.length,
      sha256: hash,
      type: 'image',
    };
    const fixture = workerFixture(false, { ...manifest, images: [image] });
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}images-${version}`);
    cache.fail = true;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await fixture.response(new Request(`${origin}${image.url}`)))?.ok).toBe(true);
      await fixture.settleFetches();
      expect(cache.entries.size).toBe(0);
      expect(error).toHaveBeenCalledOnce();
      expect(fixture.clients[0]!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'warning', message: expect.stringContaining('could not be saved offline') }),
      );
      cache.fail = false;
      expect((await fixture.response(new Request(`${origin}${image.url}`)))?.ok).toBe(true);
      await fixture.settleFetches();
      expect(cache.entries.size).toBe(1);
    } finally {
      error.mockRestore();
    }
  });

  it('never responds with or persists artwork that fails verification', async () => {
    const image: PwaAsset = {
      url: `/images/discovery/${'1'.repeat(64)}.webp`,
      bytes: fixtureBytes.length,
      sha256: hash,
      type: 'image',
    };
    const fixture = workerFixture(false, { ...manifest, images: [image] });
    fixture.fetch.mockResolvedValue(
      new Response(new Uint8Array(fixtureBytes.length), { headers: { 'Content-Type': 'image/webp' } }),
    );
    expect((await fixture.response(new Request(`${origin}${image.url}`)))?.status).toBe(503);
    await fixture.settleFetches();
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}images-${version}`);
    expect(cache.entries.size).toBe(0);
    expect(fixture.clients[0]!.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'warning', message: 'This public artwork is not available offline.' }),
    );
  });

  it('keeps one previous ready core and never deletes unrelated storage or serves old navigation HTML', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    const oldest = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${'c'.repeat(64)}`);
    await oldest.put(`${origin}/pwa/__ready__`, new Response(JSON.stringify({ created: 1 })));
    const previous = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await previous.put(`${origin}/pwa/__ready__`, new Response(JSON.stringify({ created: 2 })));
    await previous.put(`${origin}/assets/previous-12345678.js`, new Response('old hashed script'));
    await previous.put(`${origin}/index.html`, new Response('old shell'));
    await fixture.caches.open('another-app-cache');
    await fixture.lifetime('activate');
    expect(fixture.stores.has(`${PWA_CACHE_PREFIX}core-${'c'.repeat(64)}`)).toBe(false);
    expect(fixture.stores.has(`${PWA_CACHE_PREFIX}core-${nextVersion}`)).toBe(true);
    expect(fixture.stores.has('another-app-cache')).toBe(true);
    fixture.fetch.mockRejectedValue(new Error('Offline'));
    expect(await (await fixture.response(new Request(`${origin}/assets/previous-12345678.js`)))?.text()).toBe(
      'old hashed script',
    );
    const navigation = new Request(`${origin}/`);
    Object.defineProperty(navigation, 'mode', { value: 'navigate' });
    await fixture.response(navigation);
    expect(await (await fixture.response(new Request(`${origin}/index.html`)))?.text()).toBe('public fixture');
  });

  it('marks offline readiness false when a required cached file disappears', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    await (await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`)).delete(`${origin}/data/collection.json`);
    await expect(fixture.lifetime('activate')).rejects.toThrow(/incomplete/);
  });

  it('distinguishes genuine app windows from only known same-origin nested auth helpers', () => {
    const base: PwaWorkerClient = {
      id: 'one',
      url: `${origin}/`,
      type: 'window',
      frameType: 'top-level',
      postMessage() {},
    };
    expect(
      pwaAppWindows(
        [base, { ...base, id: 'iframe', frameType: 'nested', url: `${origin}/__/auth/iframe?code=not-logged` }],
        origin,
      ),
    ).toEqual([base]);
    expect(pwaAppWindows([base, { ...base, id: 'popup', frameType: 'auxiliary' }], origin)).toHaveLength(2);
    expect(pwaAppWindows([{ ...base, frameType: 'none' }], origin)).toBeNull();
    expect(pwaAppWindows([{ ...base, frameType: 'nested' }], origin)).toBeNull();
    expect(pwaAppWindows([{ ...base, url: 'https://unknown.test/' }], origin)).toBeNull();
    for (const url of ['/__/auth/not-a-known-helper', '/__/auth/iframe/', '/__/auth/iframe.js', '/__/auth/handler']) {
      expect(
        pwaAppWindows([base, { ...base, id: 'unknown', frameType: 'nested', url: `${origin}${url}` }], origin),
      ).toBeNull();
    }
  });

  it('keeps old unversioned HTML and JSON bound across restart while new navigation uses the new core', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await old.put(
      `${origin}/pwa/__ready__`,
      new Response(
        JSON.stringify({
          version: nextVersion,
          created: 1,
          documentPolicy: documentPolicy("default-src 'self'; style-src 'none'"),
        }),
      ),
    );
    await old.put(`${origin}/index.html`, new Response('previous shell'));
    await old.put(`${origin}/data/collection.json`, new Response('previous metadata'));
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
    await cache.put(`${origin}/pwa/__clients__`, new Response(JSON.stringify({ one: nextVersion })));
    // A new worker instance uses only persisted version metadata, not a surviving JS map.
    fixture.on.mockClear();
    installPwaWorker(fixture.host, manifest);
    fixture.fetch.mockRejectedValue(new Error('Offline'));
    expect(await (await fixture.response(new Request(`${origin}/data/collection.json`)))?.text()).toBe(
      'previous metadata',
    );
    expect(await (await fixture.response(new Request(`${origin}/index.html`)))?.text()).toBe('previous shell');
    expect((await fixture.response(new Request(`${origin}/data/collection.json`), 'unknown'))?.status).toBe(503);
    fixture.clients.push({ ...fixture.clients[0]!, id: 'new-page' });
    const navigation = new Request(`${origin}/my-games?tab=queue`);
    Object.defineProperty(navigation, 'mode', { value: 'navigate' });
    await fixture.response(navigation, 'one', 'new-page');
    expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), 'new-page'))?.text()).toBe(
      'public fixture',
    );
    expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), 'one'))?.text()).toBe(
      'previous metadata',
    );
  });

  it('refuses a new window appearing during ACTIVATE persistence instead of assigning it the requester version', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    const previous = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await previous.put(`${origin}/pwa/__ready__`, new Response(JSON.stringify({ version: nextVersion, created: 1 })));
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
    const reached = deferred();
    const resume = deferred();
    const put = cache.put.bind(cache);
    const pause = vi.spyOn(cache, 'put').mockImplementation(async (input, response) => {
      if (cacheKey(input) === `${origin}/pwa/__ready__`) {
        reached.resolve();
        await resume.promise;
      }
      await put(input, response);
    });
    try {
      const activation = fixture.message({
        channel: 'play100-pwa-v1',
        type: 'ACTIVATE',
        version,
        previousVersion: nextVersion,
      });
      await reached.promise;
      fixture.clients.push({
        ...fixture.clients[0]!,
        id: 'network-newcomer',
        url: `${origin}/account`,
        frameType: 'auxiliary',
      });
      await previous.put(`${origin}/pwa/__clients__`, new Response(JSON.stringify({ 'network-newcomer': 'network' })));
      resume.resolve();
      expect(await activation).toMatchObject({ accepted: false, reason: 'other-tabs' });
      expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
      const bindings = (await (await cache.match(`${origin}/pwa/__clients__`))?.json()) as Record<string, unknown>;
      expect(bindings).toHaveProperty('one');
      expect(bindings).not.toHaveProperty('network-newcomer');
    } finally {
      resume.resolve();
      pause.mockRestore();
    }
  });

  it('does not infer an old version for a newcomer after the final activation census', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    const previous = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await previous.put(`${origin}/pwa/__ready__`, new Response(JSON.stringify({ version: nextVersion, created: 1 })));
    await previous.put(`${origin}/data/collection.json`, new Response('old metadata'));
    const skip = vi.spyOn(fixture.host, 'skipWaiting').mockImplementation(async () => {
      fixture.clients.push({ ...fixture.clients[0]!, id: 'late-window', url: `${origin}/account` });
    });
    expect(
      await fixture.message({
        channel: 'play100-pwa-v1',
        type: 'ACTIVATE',
        version,
        previousVersion: nextVersion,
      }),
    ).toMatchObject({ accepted: true });
    expect(skip).toHaveBeenCalledOnce();
    await fixture.lifetime('activate');
    expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), 'one'))?.text()).toBe(
      'old metadata',
    );
    expect((await fixture.response(new Request(`${origin}/data/collection.json`), 'late-window'))?.status).toBe(503);
    const bindings = (await (
      await (await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`)).match(`${origin}/pwa/__clients__`)
    )?.json()) as Record<string, unknown>;
    expect(bindings).not.toHaveProperty('late-window');
    skip.mockRestore();
  });

  it('preserves interleaved reserved navigation IDs before matchAll can enumerate their documents', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
    const reached = deferred();
    const resume = deferred();
    const match = cache.match.bind(cache);
    let paused = false;
    const pause = vi.spyOn(cache, 'match').mockImplementation(async (input) => {
      if (!paused && cacheKey(input) === `${origin}/index.html`) {
        paused = true;
        reached.resolve();
        await resume.promise;
      }
      return match(input);
    });
    try {
      const first = fixture.response(navigation(`${origin}/my-games?tab=queue`), 'one', 'reserved-one');
      await reached.promise;
      expect(
        await (await fixture.response(navigation(`${origin}/my-games?tab=ranking`), 'one', 'reserved-two'))?.text(),
      ).toBe('public fixture');
      const reservations = (await (await match(`${origin}/pwa/__clients__`))?.json()) as Record<string, unknown>;
      expect(reservations).toHaveProperty('reserved-one');
      expect(reservations).toHaveProperty('reserved-two');
      resume.resolve();
      expect(await (await first)?.text()).toBe('public fixture');
      // Restart before either reserved document appears in clients.matchAll.
      fixture.on.mockClear();
      installPwaWorker(fixture.host, manifest);
      for (const id of ['reserved-one', 'reserved-two']) {
        expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), id))?.text()).toBe(
          'public fixture',
        );
      }
    } finally {
      resume.resolve();
      pause.mockRestore();
    }
  });

  it('retains the reservation hard limit without evicting a still-unobserved document', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    for (let index = 0; index < PWA_BUDGET.clients; index += 1) {
      expect((await fixture.response(navigation(`${origin}/`), 'one', `reserved-${index}`))?.status).toBe(200);
    }
    expect((await fixture.response(navigation(`${origin}/`), 'one', 'extra-reservation'))?.status).toBe(503);
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
    const bindings = (await (await cache.match(`${origin}/pwa/__clients__`))?.json()) as Record<string, unknown>;
    expect(Object.keys(bindings)).toHaveLength(PWA_BUDGET.clients);
    expect(bindings).toHaveProperty('reserved-0');
    expect(bindings).not.toHaveProperty('extra-reservation');
  });

  it('serializes overlapping reserved-navigation metadata writes without dropping either client', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
    const reached = deferred();
    const resume = deferred();
    const put = cache.put.bind(cache);
    let paused = false;
    const pause = vi.spyOn(cache, 'put').mockImplementation(async (input, response) => {
      if (!paused && cacheKey(input) === `${origin}/pwa/__clients__`) {
        paused = true;
        reached.resolve();
        await resume.promise;
      }
      await put(input, response);
    });
    try {
      const first = fixture.response(navigation(`${origin}/`), 'one', 'writing-one');
      await reached.promise;
      const second = fixture.response(navigation(`${origin}/discover`), 'one', 'writing-two');
      resume.resolve();
      const results = await Promise.all([first, second]);
      expect(results.map((response) => response?.status)).toEqual([200, 200]);
      for (const id of ['writing-one', 'writing-two']) {
        expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), id))?.text()).toBe(
          'public fixture',
        );
      }
    } finally {
      resume.resolve();
      pause.mockRestore();
    }
  });

  it('preserves a held navigation beyond reservation expiry and reclaims only inactive expired reservations', async () => {
    const fixture = workerFixture();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const resume = deferred();
    let restore = () => {};
    try {
      await fixture.lifetime('install');
      const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
      const reached = deferred();
      const match = cache.match.bind(cache);
      let held = false;
      const pause = vi.spyOn(cache, 'match').mockImplementation(async (input) => {
        if (!held && cacheKey(input) === `${origin}/index.html`) {
          held = true;
          reached.resolve();
          await resume.promise;
        }
        return match(input);
      });
      restore = () => {
        pause.mockRestore();
      };
      const pending = fixture.response(navigation(`${origin}/`), 'one', 'held-page');
      await reached.promise;
      await fixture.response(navigation(`${origin}/discover`), 'one', 'abandoned-page');
      clock.mockReturnValue(121001);
      await fixture.response(navigation(`${origin}/my-games`), 'one', 'fresh-page');
      const bindings = (await (await match(`${origin}/pwa/__clients__`))?.json()) as Record<string, unknown>;
      expect(bindings).toHaveProperty('held-page');
      expect(bindings).not.toHaveProperty('abandoned-page');
      resume.resolve();
      expect((await pending)?.status).toBe(200);
      // HTML has settled, but the browser still has not exposed the new document.
      await fixture.response(navigation(`${origin}/discover`), 'one', 'after-response-page');
      expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), 'held-page'))?.text()).toBe(
        'public fixture',
      );
    } finally {
      resume.resolve();
      restore();
      clock.mockRestore();
    }
  });

  it('bounds unobserved post-response grace without pretending the document was observed', async () => {
    const fixture = workerFixture();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const resume = deferred();
    let restore = () => {};
    try {
      await fixture.lifetime('install');
      const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
      const reached = deferred();
      const match = cache.match.bind(cache);
      let held = false;
      const pause = vi.spyOn(cache, 'match').mockImplementation(async (input) => {
        if (!held && cacheKey(input) === `${origin}/index.html`) {
          held = true;
          reached.resolve();
          await resume.promise;
        }
        return match(input);
      });
      restore = () => {
        pause.mockRestore();
      };
      const pending = fixture.response(navigation(`${origin}/`), 'one', 'post-response-page');
      await reached.promise;
      clock.mockReturnValue(121001);
      resume.resolve();
      expect((await pending)?.status).toBe(200);

      fixture.on.mockClear();
      installPwaWorker(fixture.host, manifest);
      clock.mockReturnValue(241000);
      await fixture.response(navigation(`${origin}/discover`), 'one', 'before-grace-end');
      const during = (await (await match(`${origin}/pwa/__clients__`))?.json()) as Record<string, unknown>;
      expect(during).toHaveProperty('post-response-page');
      expect(during['post-response-page']).toMatchObject({ version, observed: false });

      clock.mockReturnValue(241002);
      await fixture.response(navigation(`${origin}/my-games`), 'one', 'after-grace-end');
      const after = (await (await match(`${origin}/pwa/__clients__`))?.json()) as Record<string, unknown>;
      expect(after).not.toHaveProperty('post-response-page');
      expect(Object.keys(after).length).toBeLessThanOrEqual(PWA_BUDGET.clients);
    } finally {
      resume.resolve();
      restore();
      clock.mockRestore();
    }
  });
});

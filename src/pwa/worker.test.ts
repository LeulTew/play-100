import { createHash, webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { installPwaWorker, isPublicPwaFile, isPwaShellNavigation, pwaAppWindows, PWA_BUDGET, PWA_CACHE_PREFIX, validatePwaManifest, verifiedPwaResponse } from './worker';
import type { PwaAsset, PwaBuildManifest, PwaDocumentPolicy, PwaFetchEvent, PwaMessageEvent, PwaWorkerClient, PwaWorkerHost } from './types';

const origin = 'https://play.test';
const version = 'a'.repeat(64);
const nextVersion = 'b'.repeat(64);
const fixtureBytes = new TextEncoder().encode('public fixture');
const hash = createHash('sha256').update(fixtureBytes).digest('hex');
const coreUrls = ['/index.html', '/pwa/offline.html', '/data/collection.json', '/data/discovery/catalog.v1.json', '/assets/index-12345678.js'];
const assets: PwaAsset[] = coreUrls.map(url => ({
  url, bytes: fixtureBytes.length, sha256: hash, type: url.endsWith('.html') ? 'html' : url.endsWith('.js') ? 'script' : 'json',
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
const cacheKey = (input: RequestInfo | URL) => input instanceof Request ? input.url : String(input);

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(ready => { resolve = ready; });
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
  async match(input: RequestInfo | URL) { return this.entries.get(cacheKey(input))?.clone(); }
  async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
  async delete(input: RequestInfo | URL) { return this.entries.delete(cacheKey(input)); }
}

function workerFixture(active = false, chosen: PwaBuildManifest = manifest) {
  const stores = new Map<string, MemoryCache>();
  const clients: PwaWorkerClient[] = [{ id: 'one', url: `${origin}/my-games`, type: 'window', frameType: 'top-level', postMessage: vi.fn() }];
  const caches = {
    async open(key: string) {
      const cache = stores.get(key) ?? new MemoryCache();
      stores.set(key, cache);
      return cache;
    },
    async keys() { return [...stores.keys()]; },
    async delete(key: string) { return stores.delete(key); },
  };
  const fetch = vi.fn(async (input: Request) => {
    const url = new URL(input.url);
    const mime = url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.js') ? 'text/javascript'
      : url.pathname.endsWith('.webp') ? 'image/webp' : 'application/json';
    return new Response(fixtureBytes.slice(), { headers: { 'Content-Type': mime } });
  });
  const on = vi.fn();
  const host: PwaWorkerHost = {
    location: { origin }, caches, crypto: webcrypto,
    registration: { active: active ? { state: 'activated' } : null },
    clients: { matchAll: async () => clients, claim: vi.fn(async () => {}) },
    fetch, skipWaiting: vi.fn(async () => {}), addEventListener: on,
  };
  installPwaWorker(host, chosen);
  const call = (name: string, event: unknown) => {
    const listener = on.mock.calls.find(([type]) => type === name)?.[1];
    if (!listener) throw new Error(`Missing worker listener ${name}.`);
    listener(event);
  };
  const lifetime = async (name: 'install' | 'activate') => {
    let task: Promise<unknown> | undefined;
    call(name, { waitUntil: (work: Promise<unknown>) => { task = work; } });
    await task;
  };
  const response = (input: Request, clientId = 'one', resultingClientId = clientId) => {
    let result: Promise<Response> | undefined;
    const event: PwaFetchEvent = {
      request: input, clientId, resultingClientId, respondWith: value => { result = value; }, waitUntil: work => { void work; },
    };
    call('fetch', event);
    return result;
  };
  const message = async (data: unknown, source = clients[0]!) => {
    const ports = new MessageChannel();
    const reply = new Promise<unknown>(resolve => { ports.port1.onmessage = event => resolve(event.data); });
    let task: Promise<unknown> | undefined;
    const event: PwaMessageEvent = { source, ports: [ports.port2], data, waitUntil: work => { task = work; } };
    call('message', event);
    try { await task; return await reply; }
    finally { ports.port1.close(); ports.port2.close(); }
  };
  return { host, fetch, on, clients, stores, lifetime, response, call, caches, message };
}

describe('PWA positive cache boundaries', () => {
  it.each([
    '/api/catalog', '/api/enrichment', '/__/auth/handler', '/__/auth/iframe.js',
    '/account', '/friends', '/u/private', '/data-use', '/videos/film.mp4',
    '/downloads/Play-100-Collection.xlsx', '/data/collection.json?token=secret', '//evil.test/assets/x.js',
  ])('does not allow an unlisted public asset URL: %s', value => {
    expect(isPublicPwaFile(value)).toBe(false);
  });
  it('allows only known app navigation queries and never writes them as cache keys', () => {
    expect(isPwaShellNavigation(new URL('/my-games?tab=queue&game=one', origin), origin)).toBe(true);
    expect(isPwaShellNavigation(new URL('/discover?genreFamily=role-playing&include100=on&catalogs=off', origin), origin)).toBe(true);
    expect(isPwaShellNavigation(new URL('/discover?genreFamily=role-playing&include100=on&code=private', origin), origin)).toBe(false);
    for (const url of ['/account', '/?code=oauth', '/?access_token=token', '/?returnTo=private', '/data-use']) {
      expect(isPwaShellNavigation(new URL(url, origin), origin)).toBe(false);
    }
  });
  it('fails manifests outside byte/count/path/hash budgets', () => {
    expect(() => validatePwaManifest(manifest)).not.toThrow();
    expect(() => validatePwaManifest({ ...manifest, core: [...assets, { ...assets[0]!, url: '/api/private' }] })).toThrow();
    expect(() => validatePwaManifest({ ...manifest, core: assets.map(asset => ({ ...asset, bytes: PWA_BUDGET.coreFileBytes + 1 })) })).toThrow();
    expect(() => validatePwaManifest({ ...manifest, version: 'not-a-build' })).toThrow();
  });
  it('validates actual decoded bytes, type and release digest instead of trusting a 200/login page', async () => {
    const asset = assets[2]!;
    await expect(verifiedPwaResponse(new Response(fixtureBytes, { headers: { 'Content-Type': 'application/json' } }), asset, `${origin}${asset.url}`, webcrypto, policy)).resolves.toBeInstanceOf(Response);
    for (const response of [
      new Response('login', { headers: { 'Content-Type': 'text/html' } }),
      new Response('changed', { headers: { 'Content-Type': 'application/json' } }),
      new Response(fixtureBytes, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private' } }),
      new Response(fixtureBytes, { status: 401, headers: { 'Content-Type': 'application/json' } }),
    ]) await expect(verifiedPwaResponse(response, asset, `${origin}${asset.url}`, webcrypto, policy)).rejects.toThrow();
    const redirected = new Response(fixtureBytes, { headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(redirected, 'redirected', { value: true });
    await expect(verifiedPwaResponse(redirected, asset, `${origin}${asset.url}`, webcrypto, policy)).rejects.toThrow();
  });
});

describe('version-bound offline security headers', () => {
  it('uses the embedded document policy and never copies cookies or arbitrary response headers', async () => {
    const asset = assets[0]!;
    const response = await verifiedPwaResponse(new Response(fixtureBytes, { headers: {
      'Content-Type': 'text/html', 'Content-Security-Policy': 'default-src *',
      'Set-Cookie': 'fixture=never-store', 'X-Private-Fixture': 'never-store',
    } }), asset, `${origin}${asset.url}`, webcrypto, policy);
    for (const header of policy.headers) expect(response.headers.get(header.name)).toBe(header.value);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(response.headers.get('X-Private-Fixture')).toBeNull();
  });

  it('refuses a malformed or disallowed policy instead of installing headerless HTML', async () => {
    expect(() => validatePwaManifest({ ...manifest, documentPolicy: { headers: [], sha256: policy.sha256 } })).toThrow(/no CSP/);
    expect(() => validatePwaManifest({ ...manifest, documentPolicy: {
      ...policy, headers: [...policy.headers, { name: 'set-cookie', value: 'fixture=not-allowed' }],
    } })).toThrow(/unapproved/);
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

  it('preserves the previous document policy instead of applying a newer policy to old HTML', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    const oldPolicy = documentPolicy("default-src 'self'; style-src 'none'");
    const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await old.put(`${origin}/pwa/__ready__`, new Response(JSON.stringify({
      version: nextVersion, created: 1, documentPolicy: oldPolicy,
    })));
    await old.put(`${origin}/index.html`, new Response('old document', { headers: {
      'Content-Type': 'text/html', 'Set-Cookie': 'fixture=not-preserved',
    } }));
    await (await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`))
      .put(`${origin}/pwa/__clients__`, new Response(JSON.stringify({ one: nextVersion })));
    const previous = await fixture.response(new Request(`${origin}/index.html`));
    expect(await previous?.text()).toBe('old document');
    expect(previous?.headers.get('Content-Security-Policy')).toBe(oldPolicy.headers[0]?.value);
    expect(previous?.headers.get('Content-Security-Policy')).not.toBe(policy.headers[0]?.value);
    expect(previous?.headers.get('Set-Cookie')).toBeNull();
  });

  it.each(['missing', 'corrupt', 'wrong-version'] as const)('rejects a %s prior HTML policy while retaining correctly bound old metadata', async kind => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await old.put(`${origin}/pwa/__ready__`, new Response(JSON.stringify({
      version: kind === 'wrong-version' ? version : nextVersion, created: 1,
      ...(kind === 'missing' ? {} : { documentPolicy: { ...policy, sha256: kind === 'corrupt' ? '0'.repeat(64) : policy.sha256 } }),
    })));
    await old.put(`${origin}/index.html`, new Response('headerless old shell'));
    await old.put(`${origin}/data/collection.json`, new Response('old compatible metadata'));
    await (await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`))
      .put(`${origin}/pwa/__clients__`, new Response(JSON.stringify({ one: nextVersion })));
    const previous = await fixture.response(new Request(`${origin}/index.html`));
    expect(previous?.status).toBe(503);
    expect(previous?.headers.get('Content-Security-Policy')).toBe(policy.headers[0]?.value);
    expect(await (await fixture.response(new Request(`${origin}/data/collection.json`)))?.text()).toBe('old compatible metadata');
  });
});

describe('native worker install, offline and update lifetime', () => {
  it('installs a complete version atomically without claiming an uncontrolled page of unknown version', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
    expect(fixture.fetch).toHaveBeenCalledTimes(assets.length);
    for (const [request] of fixture.fetch.mock.calls) expect([request.credentials, request.redirect, request.method]).toEqual(['omit', 'error', 'GET']);
    await fixture.lifetime('activate');
    expect(fixture.host.clients.claim).not.toHaveBeenCalled();
    expect(fixture.stores.get(`${PWA_CACHE_PREFIX}core-${version}`)?.entries.has(`${origin}/pwa/__ready__`)).toBe(true);
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
    } finally { error.mockRestore(); }
  });

  it('opens a previously prepared local route offline without caching the query or mutating IndexedDB', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    fixture.fetch.mockRejectedValue(new Error('Offline'));
    const input = new Request(`${origin}/my-games?tab=ranking&game=manual%3Aone`);
    Object.defineProperty(input, 'mode', { value: 'navigate' });
    expect(await (await fixture.response(input))?.text()).toBe('public fixture');
    const allKeys = [...fixture.stores.values()].flatMap(cache => [...cache.entries.keys()]);
    expect(allKeys.some(key => key.includes('?') || key.includes('manual'))).toBe(false);
    const account = new Request(`${origin}/account`);
    Object.defineProperty(account, 'mode', { value: 'navigate' });
    expect((await fixture.response(account))?.status).toBe(503);
  });

  it('never intercepts auth, enrichment APIs, cross-origin, non-GET or token-bearing asset requests', async () => {
    const fixture = workerFixture();
    for (const request of [
      new Request(`${origin}/api/enrichment?id=one`),
      new Request(`${origin}/__/auth/handler?code=private`),
      new Request('https://firestore.googleapis.com/private'),
      new Request(`${origin}/data/collection.json?uid=private`),
      new Request(`${origin}/assets/index-12345678.js`, { headers: { Authorization: 'Bearer private' } }),
      new Request(`${origin}/assets/index-12345678.js`, { method: 'POST', body: 'private' }),
      new Request(`${origin}/data-use`),
    ]) expect(fixture.response(request)).toBeUndefined();
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.stores.size).toBe(0);
  });

  it('refuses wrong-version and multi-client update commands, then accepts one trusted requester', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    await (await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`))
      .put(`${origin}/pwa/__ready__`, new Response(JSON.stringify({ version: nextVersion, created: 1 })));
    const request = async (wanted: string) => {
      const ports = new MessageChannel();
      const reply = new Promise<unknown>(resolve => { ports.port1.onmessage = event => resolve(event.data); });
      let task: Promise<unknown> | undefined;
      const event: PwaMessageEvent = {
        source: fixture.clients[0]!, ports: [ports.port2],
        data: { channel: 'play100-pwa-v1', type: 'ACTIVATE', version: wanted, previousVersion: nextVersion },
        waitUntil: work => { task = work; },
      };
      fixture.call('message', event);
      await task;
      const value = await reply;
      ports.port1.close(); ports.port2.close();
      return value;
    };
    expect(await request(nextVersion)).toMatchObject({ accepted: false });
    fixture.clients.push({ ...fixture.clients[0]!, id: 'two' });
    expect(await request(version)).toMatchObject({ accepted: false, reason: 'other-tabs' });
    expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
    fixture.clients.pop();
    fixture.clients.push({ ...fixture.clients[0]!, id: 'auth-frame', frameType: 'nested', url: `${origin}/__/auth/iframe?private-token=redacted` });
    expect(await request(version)).toMatchObject({ accepted: true, version });
    expect(fixture.host.skipWaiting).toHaveBeenCalledOnce();
    await fixture.lifetime('activate');
    expect(fixture.host.clients.claim).not.toHaveBeenCalled();
  });

  it('bounds runtime artwork by both count and decoded bytes without precaching it', async () => {
    const imageAssets: PwaAsset[] = Array.from({ length: 54 }, (_, index) => ({
      url: `/images/discovery/${index.toString(16).padStart(64, '0')}.webp`,
      bytes: fixtureBytes.length, sha256: hash, type: 'image',
    }));
    const fixture = workerFixture(false, { ...manifest, images: imageAssets });
    await fixture.lifetime('install');
    expect(fixture.fetch).toHaveBeenCalledTimes(assets.length);
    for (const image of imageAssets) expect((await fixture.response(new Request(`${origin}${image.url}`)))?.ok).toBe(true);
    expect((await fixture.caches.open(`${PWA_CACHE_PREFIX}images-${version}`)).entries.size).toBe(48);

    const largeBytes = new Uint8Array(PWA_BUDGET.imageFileBytes);
    const largeHash = createHash('sha256').update(largeBytes).digest('hex');
    const largeImages = imageAssets.slice(0, 30).map(asset => ({ ...asset, bytes: largeBytes.length, sha256: largeHash }));
    const large = workerFixture(false, { ...manifest, images: largeImages });
    await large.lifetime('install');
    large.fetch.mockImplementation(async () => new Response(largeBytes.slice(), { headers: { 'Content-Type': 'image/webp' } }));
    for (const image of largeImages) await large.response(new Request(`${origin}${image.url}`));
    const count = (await large.caches.open(`${PWA_CACHE_PREFIX}images-${version}`)).entries.size;
    expect(count).toBe(Math.floor(PWA_BUDGET.imageBytes / largeBytes.length));
    expect(count * largeBytes.length).toBeLessThanOrEqual(PWA_BUDGET.imageBytes);
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
    expect(await (await fixture.response(new Request(`${origin}/assets/previous-12345678.js`)))?.text()).toBe('old hashed script');
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
    const base: PwaWorkerClient = { id: 'one', url: `${origin}/`, type: 'window', frameType: 'top-level', postMessage() {} };
    expect(pwaAppWindows([base, { ...base, id: 'iframe', frameType: 'nested', url: `${origin}/__/auth/iframe?code=not-logged` }], origin)).toEqual([base]);
    expect(pwaAppWindows([base, { ...base, id: 'popup', frameType: 'auxiliary' }], origin)).toHaveLength(2);
    expect(pwaAppWindows([{ ...base, frameType: 'none' }], origin)).toBeNull();
    expect(pwaAppWindows([{ ...base, frameType: 'nested' }], origin)).toBeNull();
    expect(pwaAppWindows([{ ...base, url: 'https://unknown.test/' }], origin)).toBeNull();
    for (const url of ['/__/auth/not-a-known-helper', '/__/auth/iframe/', '/__/auth/iframe.js', '/__/auth/handler']) {
      expect(pwaAppWindows([base, { ...base, id: 'unknown', frameType: 'nested', url: `${origin}${url}` }], origin)).toBeNull();
    }
  });

  it('keeps old unversioned HTML and JSON bound across restart while new navigation uses the new core', async () => {
    const fixture = workerFixture(true);
    await fixture.lifetime('install');
    const old = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${nextVersion}`);
    await old.put(`${origin}/pwa/__ready__`, new Response(JSON.stringify({
      version: nextVersion, created: 1, documentPolicy: documentPolicy("default-src 'self'; style-src 'none'"),
    })));
    await old.put(`${origin}/index.html`, new Response('previous shell'));
    await old.put(`${origin}/data/collection.json`, new Response('previous metadata'));
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
    await cache.put(`${origin}/pwa/__clients__`, new Response(JSON.stringify({ one: nextVersion })));
    // A new worker instance uses only persisted version metadata, not a surviving JS map.
    fixture.on.mockClear();
    installPwaWorker(fixture.host, manifest);
    fixture.fetch.mockRejectedValue(new Error('Offline'));
    expect(await (await fixture.response(new Request(`${origin}/data/collection.json`)))?.text()).toBe('previous metadata');
    expect(await (await fixture.response(new Request(`${origin}/index.html`)))?.text()).toBe('previous shell');
    expect((await fixture.response(new Request(`${origin}/data/collection.json`), 'unknown'))?.status).toBe(503);
    fixture.clients.push({ ...fixture.clients[0]!, id: 'new-page' });
    const navigation = new Request(`${origin}/my-games?tab=queue`);
    Object.defineProperty(navigation, 'mode', { value: 'navigate' });
    await fixture.response(navigation, 'one', 'new-page');
    expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), 'new-page'))?.text()).toBe('public fixture');
    expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), 'one'))?.text()).toBe('previous metadata');
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
      if (cacheKey(input) === `${origin}/pwa/__ready__`) { reached.resolve(); await resume.promise; }
      await put(input, response);
    });
    try {
      const activation = fixture.message({
        channel: 'play100-pwa-v1', type: 'ACTIVATE', version, previousVersion: nextVersion,
      });
      await reached.promise;
      fixture.clients.push({ ...fixture.clients[0]!, id: 'network-newcomer', url: `${origin}/account`, frameType: 'auxiliary' });
      await previous.put(`${origin}/pwa/__clients__`, new Response(JSON.stringify({ 'network-newcomer': 'network' })));
      resume.resolve();
      expect(await activation).toMatchObject({ accepted: false, reason: 'other-tabs' });
      expect(fixture.host.skipWaiting).not.toHaveBeenCalled();
      const bindings = await (await cache.match(`${origin}/pwa/__clients__`))?.json();
      expect(bindings).toHaveProperty('one');
      expect(bindings).not.toHaveProperty('network-newcomer');
    } finally { resume.resolve(); pause.mockRestore(); }
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
    expect(await fixture.message({
      channel: 'play100-pwa-v1', type: 'ACTIVATE', version, previousVersion: nextVersion,
    })).toMatchObject({ accepted: true });
    expect(skip).toHaveBeenCalledOnce();
    await fixture.lifetime('activate');
    expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), 'one'))?.text()).toBe('old metadata');
    expect((await fixture.response(new Request(`${origin}/data/collection.json`), 'late-window'))?.status).toBe(503);
    const bindings = await (await (await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`)).match(`${origin}/pwa/__clients__`))?.json();
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
    const pause = vi.spyOn(cache, 'match').mockImplementation(async input => {
      if (!paused && cacheKey(input) === `${origin}/index.html`) {
        paused = true; reached.resolve(); await resume.promise;
      }
      return match(input);
    });
    try {
      const first = fixture.response(navigation(`${origin}/my-games?tab=queue`), 'one', 'reserved-one');
      await reached.promise;
      expect(await (await fixture.response(navigation(`${origin}/my-games?tab=ranking`), 'one', 'reserved-two'))?.text())
        .toBe('public fixture');
      const reservations = await (await match(`${origin}/pwa/__clients__`))?.json();
      expect(reservations).toHaveProperty('reserved-one');
      expect(reservations).toHaveProperty('reserved-two');
      resume.resolve();
      expect(await (await first)?.text()).toBe('public fixture');
      // Restart before either reserved document appears in clients.matchAll.
      fixture.on.mockClear();
      installPwaWorker(fixture.host, manifest);
      for (const id of ['reserved-one', 'reserved-two']) {
        expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), id))?.text()).toBe('public fixture');
      }
    } finally { resume.resolve(); pause.mockRestore(); }
  });

  it('retains the reservation hard limit without evicting a still-unobserved document', async () => {
    const fixture = workerFixture();
    await fixture.lifetime('install');
    for (let index = 0; index < PWA_BUDGET.clients; index += 1) {
      expect((await fixture.response(navigation(`${origin}/`), 'one', `reserved-${index}`))?.status).toBe(200);
    }
    expect((await fixture.response(navigation(`${origin}/`), 'one', 'extra-reservation'))?.status).toBe(503);
    const cache = await fixture.caches.open(`${PWA_CACHE_PREFIX}core-${version}`);
    const bindings = await (await cache.match(`${origin}/pwa/__clients__`))?.json();
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
        paused = true; reached.resolve(); await resume.promise;
      }
      await put(input, response);
    });
    try {
      const first = fixture.response(navigation(`${origin}/`), 'one', 'writing-one');
      await reached.promise;
      const second = fixture.response(navigation(`${origin}/discover`), 'one', 'writing-two');
      resume.resolve();
      const results = await Promise.all([first, second]);
      expect(results.map(response => response?.status)).toEqual([200, 200]);
      for (const id of ['writing-one', 'writing-two']) {
        expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), id))?.text()).toBe('public fixture');
      }
    } finally { resume.resolve(); pause.mockRestore(); }
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
      const pause = vi.spyOn(cache, 'match').mockImplementation(async input => {
        if (!held && cacheKey(input) === `${origin}/index.html`) {
          held = true; reached.resolve(); await resume.promise;
        }
        return match(input);
      });
      restore = () => { pause.mockRestore(); };
      const pending = fixture.response(navigation(`${origin}/`), 'one', 'held-page');
      await reached.promise;
      await fixture.response(navigation(`${origin}/discover`), 'one', 'abandoned-page');
      clock.mockReturnValue(121001);
      await fixture.response(navigation(`${origin}/my-games`), 'one', 'fresh-page');
      const bindings = await (await match(`${origin}/pwa/__clients__`))?.json();
      expect(bindings).toHaveProperty('held-page');
      expect(bindings).not.toHaveProperty('abandoned-page');
      resume.resolve();
      expect((await pending)?.status).toBe(200);
      // HTML has settled, but the browser still has not exposed the new document.
      await fixture.response(navigation(`${origin}/discover`), 'one', 'after-response-page');
      expect(await (await fixture.response(new Request(`${origin}/data/collection.json`), 'held-page'))?.text()).toBe('public fixture');
    } finally { resume.resolve(); restore(); clock.mockRestore(); }
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
      const pause = vi.spyOn(cache, 'match').mockImplementation(async input => {
        if (!held && cacheKey(input) === `${origin}/index.html`) {
          held = true; reached.resolve(); await resume.promise;
        }
        return match(input);
      });
      restore = () => { pause.mockRestore(); };
      const pending = fixture.response(navigation(`${origin}/`), 'one', 'post-response-page');
      await reached.promise;
      clock.mockReturnValue(121001);
      resume.resolve();
      expect((await pending)?.status).toBe(200);

      fixture.on.mockClear();
      installPwaWorker(fixture.host, manifest);
      clock.mockReturnValue(241000);
      await fixture.response(navigation(`${origin}/discover`), 'one', 'before-grace-end');
      const during = await (await match(`${origin}/pwa/__clients__`))?.json();
      expect(during).toHaveProperty('post-response-page');
      expect(during['post-response-page']).toMatchObject({ version, observed: false });

      clock.mockReturnValue(241002);
      await fixture.response(navigation(`${origin}/my-games`), 'one', 'after-grace-end');
      const after = await (await match(`${origin}/pwa/__clients__`))?.json();
      expect(after).not.toHaveProperty('post-response-page');
      expect(Object.keys(after).length).toBeLessThanOrEqual(PWA_BUDGET.clients);
    } finally { resume.resolve(); restore(); clock.mockRestore(); }
  });
});

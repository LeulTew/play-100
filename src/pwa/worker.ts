import type { PwaAsset, PwaBuildManifest, PwaDocumentPolicy, PwaWorkerClient, PwaWorkerHost } from './types';

export const PWA_CACHE_PREFIX = 'play100-pwa-v1-';
export const PWA_BUDGET = {
  coreFiles: 51,
  coreBytes: 2 * 1024 * 1024,
  coreFileBytes: 1024 * 1024,
  imageFiles: 48,
  imageBytes: 4 * 1024 * 1024,
  imageFileBytes: 192 * 1024,
  metadataBytes: 32 * 1024,
  clients: 16,
} as const;
const channel = 'play100-pwa-v1';
export const PWA_DOCUMENT_HEADERS = [
  'content-security-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'referrer-policy',
  'x-content-type-options',
  'x-frame-options',
  'permissions-policy',
] as const;
const queryKeys = new Set([
  'q',
  'genre',
  'year',
  'tier',
  'list',
  'sort',
  'direction',
  'view',
  'catalogs',
  'progress',
  'game',
  'tab',
  'source',
  'offset',
  'online',
  'info',
  'genreFamily',
  'include100',
]);
const shellRoutes = new Set(['/', '/index.html', '/discover', '/my-games', '/my-library', '/my-rankings']);
const publicFiles = new Set([
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/pwa/offline.html',
  '/pwa/fallback.css',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/icon-maskable-192.png',
  '/pwa/icon-maskable-512.png',
  '/pwa/apple-touch-icon.png',
  '/data/collection.json',
  '/data/discovery/catalog.v1.json',
]);

export function isPublicPwaFile(path: string): boolean {
  return (
    publicFiles.has(path) ||
    /^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2)$/.test(path) ||
    /^\/covers\/[a-z0-9][a-z0-9-]*\.webp$/.test(path) ||
    /^\/images\/discovery\/[a-f0-9]{64}\.webp$/.test(path)
  );
}

export function isPwaShellNavigation(url: URL, origin: string): boolean {
  return (
    url.origin === origin &&
    !url.username &&
    !url.password &&
    shellRoutes.has(url.pathname) &&
    url.search.length <= 2048 &&
    [...url.searchParams.keys()].every((key) => queryKeys.has(key))
  );
}

export function pwaAppWindows(clients: readonly PwaWorkerClient[], origin: string): PwaWorkerClient[] | null {
  const windows: PwaWorkerClient[] = [];
  for (const client of clients) {
    let url: URL;
    try {
      url = new URL(client.url);
    } catch {
      return null;
    }
    if (url.origin !== origin || url.username || url.password || client.type !== 'window') return null;
    if (client.frameType === 'nested' && url.pathname === '/__/auth/iframe') continue;
    if (client.frameType !== 'top-level' && client.frameType !== 'auxiliary') return null;
    windows.push(client);
  }
  return windows;
}

export function parsePwaDocumentPolicy(input: unknown): PwaDocumentPolicy {
  if (
    !input ||
    typeof input !== 'object' ||
    !('headers' in input) ||
    !Array.isArray(input.headers) ||
    !('sha256' in input) ||
    typeof input.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    input.headers.length > PWA_DOCUMENT_HEADERS.length ||
    new TextEncoder().encode(JSON.stringify(input.headers)).length > 8192
  ) {
    throw new Error('The offline document security policy is invalid.');
  }
  const names = new Set<string>();
  const headers: Array<{ name: string; value: string }> = [];
  for (const entry of input.headers) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('name' in entry) ||
      typeof entry.name !== 'string' ||
      !PWA_DOCUMENT_HEADERS.some((name) => name === entry.name) ||
      names.has(entry.name) ||
      !('value' in entry) ||
      typeof entry.value !== 'string' ||
      !entry.value.trim() ||
      /[\r\n\0]/.test(entry.value)
    ) {
      throw new Error('The offline document security policy contains an unapproved header.');
    }
    names.add(entry.name);
    headers.push({ name: entry.name, value: entry.value });
  }
  if (!names.has('content-security-policy')) throw new Error('The offline document security policy has no CSP.');
  return { headers, sha256: input.sha256 };
}

export function validatePwaManifest(manifest: PwaBuildManifest): void {
  parsePwaDocumentPolicy(manifest.documentPolicy);
  if (
    manifest.format !== 1 ||
    !/^[a-f0-9]{64}$/.test(manifest.version) ||
    manifest.core.length + 2 > PWA_BUDGET.coreFiles ||
    manifest.images.length > 1024
  ) {
    throw new Error('The offline manifest is invalid or exceeds its entry budget.');
  }
  const urls = new Set<string>();
  for (const [kind, assets] of [
    ['core', manifest.core],
    ['images', manifest.images],
  ] as const) {
    for (const asset of assets) {
      if (
        !isPublicPwaFile(asset.url) ||
        asset.url.length > 256 ||
        urls.has(asset.url) ||
        !/^[a-f0-9]{64}$/.test(asset.sha256) ||
        !Number.isSafeInteger(asset.bytes) ||
        asset.bytes < 1 ||
        asset.bytes > (kind === 'core' ? PWA_BUDGET.coreFileBytes : PWA_BUDGET.imageFileBytes) ||
        (kind === 'images' && (asset.type !== 'image' || !asset.url.endsWith('.webp')))
      ) {
        throw new Error('The offline manifest contains a disallowed or oversized asset.');
      }
      urls.add(asset.url);
    }
  }
  if (
    manifest.core.reduce((sum, asset) => sum + asset.bytes, 0) > PWA_BUDGET.coreBytes - PWA_BUDGET.metadataBytes ||
    !['/index.html', '/pwa/offline.html', '/data/collection.json', '/data/discovery/catalog.v1.json'].every((url) =>
      manifest.core.some((asset) => asset.url === url),
    )
  ) {
    throw new Error('The complete offline core is missing or exceeds its byte budget.');
  }
}

function contentTypeMatches(asset: PwaAsset, contentType: string): boolean {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  const types: Record<PwaAsset['type'], readonly string[]> = {
    html: ['text/html'],
    script: ['text/javascript', 'application/javascript'],
    style: ['text/css'],
    font: ['font/woff2', 'application/font-woff2'],
    json: ['application/json'],
    manifest: ['application/manifest+json', 'application/json'],
    image: ['image/png', 'image/webp', 'image/svg+xml'],
  };
  return types[asset.type].includes(mime);
}

function documentResponse(response: Response, policy: PwaDocumentPolicy, status = response.status): Response {
  const headers = new Headers();
  for (const name of ['content-type', 'content-length', 'cache-control']) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  for (const header of policy.headers) headers.set(header.name, header.value);
  return new Response(response.body, { status, headers });
}

export async function verifiedPwaResponse(
  response: Response,
  asset: PwaAsset,
  expectedUrl: string,
  crypto: PwaWorkerHost['crypto'],
  documentPolicy: PwaDocumentPolicy,
): Promise<Response> {
  if (
    response.status !== 200 ||
    response.redirected ||
    !['basic', 'default'].includes(response.type) ||
    (response.url && response.url !== expectedUrl) ||
    /(?:private|no-store)/i.test(response.headers.get('cache-control') ?? '') ||
    !contentTypeMatches(asset, response.headers.get('content-type') ?? '') ||
    !response.body
  ) {
    throw new Error('An offline asset was not a public, non-redirected response of the expected type.');
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(asset.bytes);
  let offset = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      if (offset + part.value.byteLength > asset.bytes) {
        await reader.cancel();
        throw new Error('An offline asset exceeded its declared byte budget.');
      }
      bytes.set(part.value, offset);
      offset += part.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  if (offset !== asset.bytes || hash !== asset.sha256) throw new Error('An offline asset did not match this release.');
  const headers = new Headers({
    'Content-Type': response.headers.get('content-type') ?? '',
    'Content-Length': String(bytes.length),
  });
  if (asset.type !== 'html')
    for (const name of PWA_DOCUMENT_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
  const verified = new Response(bytes, { status: 200, headers });
  return asset.type === 'html' ? documentResponse(verified, documentPolicy) : verified;
}

interface ClientBinding {
  readonly version: string;
  readonly observed: boolean;
  readonly reservedAt: number;
}

export function installPwaWorker(scope: PwaWorkerHost, manifest: PwaBuildManifest) {
  validatePwaManifest(manifest);
  const origin = scope.location.origin;
  const coreName = `${PWA_CACHE_PREFIX}core-${manifest.version}`;
  const imageName = `${PWA_CACHE_PREFIX}images-${manifest.version}`;
  const readyUrl = `${origin}/pwa/__ready__`;
  const clientsUrl = `${origin}/pwa/__clients__`;
  const core = new Map(manifest.core.map((asset) => [asset.url, asset]));
  const images = new Map(manifest.images.map((asset) => [asset.url, asset]));
  const corePattern = new RegExp(`^${PWA_CACHE_PREFIX}core-[a-f0-9]{64}$`);
  const imagePattern = new RegExp(`^${PWA_CACHE_PREFIX}images-[a-f0-9]{64}$`);
  let writes: Promise<void> = Promise.resolve();
  let clientWrites: Promise<void> = Promise.resolve();
  const activeNavigations = new Set<string>();
  const reservationLifetimeMs = 120_000;
  const request = (url: string) =>
    new Request(new URL(url, origin), {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  const tell = async (status: string, message: string) => {
    for (const client of await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      client.postMessage({ channel, version: manifest.version, status, message });
    }
  };
  const fetchAsset = async (asset: PwaAsset) => {
    const input = request(asset.url);
    return verifiedPwaResponse(await scope.fetch(input), asset, input.url, scope.crypto, manifest.documentPolicy);
  };
  const verifyPolicy = async (policy: PwaDocumentPolicy) => {
    const bytes = new TextEncoder().encode(JSON.stringify(policy.headers));
    const hash = [...new Uint8Array(await scope.crypto.subtle.digest('SHA-256', bytes))]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    if (hash !== policy.sha256) throw new Error('The offline document policy digest does not match this version.');
  };
  const ready = async () => {
    const cache = await scope.caches.open(coreName);
    const marker = await cache.match(readyUrl);
    if (!marker) return false;
    const value: unknown = await marker.json();
    if (
      !value ||
      typeof value !== 'object' ||
      !('version' in value) ||
      value.version !== manifest.version ||
      !('documentPolicy' in value)
    )
      return false;
    const policy = parsePwaDocumentPolicy(value.documentPolicy);
    if (policy.sha256 !== manifest.documentPolicy.sha256) return false;
    const entries = await cache.keys();
    const urls = new Set(entries.map((entry) => entry.url));
    return manifest.core.every((asset) => urls.has(new URL(asset.url, origin).href));
  };
  const clientBindings = async (): Promise<Record<string, ClientBinding>> => {
    const response = await (await scope.caches.open(coreName)).match(clientsUrl);
    if (!response) return {};
    const input: unknown = await response.json();
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > PWA_BUDGET.clients) {
      throw new Error('Offline page-version ownership could not be confirmed.');
    }
    const result: Record<string, ClientBinding> = {};
    for (const [id, value] of Object.entries(input)) {
      const binding: unknown =
        typeof value === 'string' ? { version: value, observed: false, reservedAt: Date.now() } : value;
      if (
        !/^[A-Za-z0-9-]{1,128}$/.test(id) ||
        !binding ||
        typeof binding !== 'object' ||
        !('version' in binding) ||
        typeof binding.version !== 'string' ||
        (binding.version !== 'network' && !/^[a-f0-9]{64}$/.test(binding.version)) ||
        !('observed' in binding) ||
        typeof binding.observed !== 'boolean' ||
        !('reservedAt' in binding) ||
        typeof binding.reservedAt !== 'number' ||
        !Number.isSafeInteger(binding.reservedAt) ||
        binding.reservedAt < 0
      ) {
        throw new Error('Offline page-version ownership could not be confirmed.');
      }
      Object.defineProperty(result, id, {
        value: { version: binding.version, observed: binding.observed, reservedAt: binding.reservedAt },
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  };
  const serializeClientWrite = <T>(write: () => Promise<T>): Promise<T> => {
    const task = clientWrites.then(write);
    // The caller reports rejection; a later safe write must still be able to retry.
    clientWrites = task.then(
      () => {},
      () => {},
    );
    return task;
  };
  const bindClients = (ids: readonly string[], version: string): Promise<void> => {
    return serializeClientWrite(async () => {
      if (!ids.length || ids.some((id) => !/^[A-Za-z0-9-]{1,128}$/.test(id)))
        throw new Error('Offline page identity is unavailable.');
      const alive = new Set(
        (await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })).map((client) => client.id),
      );
      const now = Date.now();
      const current: Record<string, ClientBinding> = Object.fromEntries(
        Object.entries(await clientBindings())
          .filter(
            ([id, binding]) =>
              alive.has(id) ||
              activeNavigations.has(id) ||
              (!binding.observed && now - binding.reservedAt < reservationLifetimeMs),
          )
          .map(([id, binding]) => [id, { ...binding, observed: binding.observed || alive.has(id) }]),
      );
      // matchAll excludes reserved navigation IDs until their documents are execution-ready.
      for (const id of ids)
        Object.defineProperty(current, id, {
          value: { version, observed: alive.has(id), reservedAt: now },
          enumerable: true,
          configurable: true,
          writable: true,
        });
      if (Object.keys(current).length > PWA_BUDGET.clients)
        throw new Error('Close extra Play 100 windows before preparing offline pages.');
      await (await scope.caches.open(coreName)).put(clientsUrl, new Response(JSON.stringify(current)));
    });
  };
  const renewNavigationGrace = (id: string): Promise<void> => {
    return serializeClientWrite(async () => {
      const bindings = await clientBindings();
      const binding = Object.hasOwn(bindings, id) ? bindings[id] : undefined;
      if (!binding) throw new Error('The navigation version is no longer available.');
      if (binding.observed) return;
      const reservedAt = Date.now();
      bindings[id] = { ...binding, reservedAt };
      await (await scope.caches.open(coreName)).put(clientsUrl, new Response(JSON.stringify(bindings)));
      if (Date.now() - reservedAt >= reservationLifetimeMs)
        throw new Error('The navigation grace could not be saved in time.');
    });
  };
  const documentVersion = (id: string): Promise<string | undefined> => {
    return serializeClientWrite(async () => {
      const bindings = await clientBindings();
      const binding = Object.hasOwn(bindings, id) ? bindings[id] : undefined;
      if (!binding) return;
      if (!binding.observed) {
        bindings[id] = { ...binding, observed: true };
        await (await scope.caches.open(coreName)).put(clientsUrl, new Response(JSON.stringify(bindings)));
      }
      return binding.version;
    });
  };
  const soleRequester = async (id: string): Promise<boolean> => {
    const windows = pwaAppWindows(await scope.clients.matchAll({ type: 'window', includeUncontrolled: true }), origin);
    return windows !== null && windows.length === 1 && windows[0]?.id === id;
  };
  const fallback = async () => {
    const html = await (await scope.caches.open(coreName)).match(`${origin}/pwa/offline.html`);
    return documentResponse(
      new Response(html?.body ?? 'This page needs a connection. Offline access is not ready.', {
        status: 503,
        headers: {
          'Content-Type': html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }),
      manifest.documentPolicy,
    );
  };

  scope.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        await verifyPolicy(manifest.documentPolicy);
        const keys = (await scope.caches.keys()).filter((key) => corePattern.test(key) && key !== coreName);
        if (keys.length >= 3) {
          await tell('error', 'Apply the waiting update or close other tabs before preparing another offline version.');
          throw new Error('Apply or close the pending offline update before preparing another.');
        }
        if (await ready()) return;
        await scope.caches.delete(coreName);
        try {
          const cache = await scope.caches.open(coreName);
          // A failed fetch never leaves a ready marker or replaces the working version.
          for (const asset of manifest.core) await cache.put(request(asset.url), await fetchAsset(asset));
          await cache.put(
            readyUrl,
            new Response(
              JSON.stringify({
                version: manifest.version,
                created: Date.now(),
                core: manifest.core,
                documentPolicy: manifest.documentPolicy,
              }),
              { headers: { 'Content-Type': 'application/json' } },
            ),
          );
          await tell('ready', 'Offline public files are ready. Reopen the page or installed app to use them offline.');
        } catch (cause) {
          await scope.caches.delete(coreName);
          console.error(
            'Offline preparation failed; the previous version remains available.',
            cause instanceof Error ? cause.message : 'Cache failure.',
          );
          await tell('error', 'Offline preparation failed. Check the connection or available storage, then retry.');
          throw cause;
        }
      })(),
    );
  });

  scope.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        if (!(await ready())) throw new Error('The offline core is incomplete; activation cannot continue.');
        const keys = await scope.caches.keys();
        const marker = await (await scope.caches.open(coreName)).match(readyUrl);
        const own: unknown = marker ? await marker.json() : null;
        const previousVersion =
          own &&
          typeof own === 'object' &&
          'previousVersion' in own &&
          typeof own.previousVersion === 'string' &&
          /^[a-f0-9]{64}$/.test(own.previousVersion)
            ? own.previousVersion
            : null;
        // Only ACTIVATE's verified requester was bound. Newcomers have no inferred document version.
        const prior: Array<{ key: string; created: number }> = [];
        for (const key of keys.filter((key) => corePattern.test(key) && key !== coreName)) {
          const marker = await (await scope.caches.open(key)).match(readyUrl);
          if (marker) {
            const value: unknown = await marker.json();
            if (value && typeof value === 'object' && 'created' in value && typeof value.created === 'number') {
              prior.push({ key, created: value.created });
            }
          }
        }
        prior.sort((a, b) => b.created - a.created);
        const previousName = previousVersion ? `${PWA_CACHE_PREFIX}core-${previousVersion}` : prior[0]?.key;
        const keep = new Set([coreName, previousName, imageName]);
        for (const key of keys) {
          if ((corePattern.test(key) || imagePattern.test(key)) && !keep.has(key)) await scope.caches.delete(key);
        }
      })(),
    );
  });

  const previousChunk = async (url: URL): Promise<Response | undefined> => {
    if (!/^\/assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2)$/.test(url.pathname)) return;
    for (const key of (await scope.caches.keys()).filter((key) => corePattern.test(key) && key !== coreName)) {
      const cache = await scope.caches.open(key);
      if (!(await cache.match(readyUrl))) continue;
      const match = await cache.match(url.href);
      if (match) return match;
    }
  };
  const imageResponse = async (asset: PwaAsset): Promise<Response> => {
    const cache = await scope.caches.open(imageName);
    const hit = await cache.match(request(asset.url));
    if (hit) return hit;
    const response = await fetchAsset(asset);
    const copy = response.clone();
    const update = writes.then(async () => {
      await cache.delete(request(asset.url));
      const entries = await cache.keys();
      let bytes = asset.bytes;
      for (const entry of entries) bytes += images.get(new URL(entry.url).pathname)?.bytes ?? PWA_BUDGET.imageFileBytes;
      while (entries.length >= PWA_BUDGET.imageFiles || bytes > PWA_BUDGET.imageBytes) {
        const oldest = entries.shift();
        if (!oldest) break;
        bytes -= images.get(new URL(oldest.url).pathname)?.bytes ?? PWA_BUDGET.imageFileBytes;
        await cache.delete(oldest);
      }
      await cache.put(request(asset.url), copy);
    });
    writes = update.catch(async () => {
      console.error('The bounded public image cache could not be saved.');
      await tell('warning', 'Public artwork could not be saved offline. Your library is unchanged.');
    });
    await writes;
    return response;
  };

  scope.addEventListener('fetch', (event) => {
    const input = event.request;
    const url = new URL(input.url);
    if (
      input.method !== 'GET' ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      input.headers.has('authorization') ||
      input.headers.has('range') ||
      /^\/(?:api|__|data-use)(?:\/|$)/.test(url.pathname)
    )
      return;
    if (input.mode === 'navigate') {
      const id = event.resultingClientId ?? event.clientId ?? '';
      if (
        !/^[A-Za-z0-9-]{1,128}$/.test(id) ||
        activeNavigations.has(id) ||
        activeNavigations.size >= PWA_BUDGET.clients
      ) {
        event.waitUntil(
          tell(
            'error',
            'This offline navigation could not be assigned a safe page identity. Retry after other pages finish opening.',
          ),
        );
        event.respondWith(fallback());
        return;
      }
      activeNavigations.add(id);
      let response: Promise<Response>;
      if (isPwaShellNavigation(url, origin)) {
        response = (async () => {
          const cache = await scope.caches.open(coreName);
          try {
            await bindClients([id], manifest.version);
          } catch {
            await tell(
              'error',
              'This offline page could not be assigned a safe version. Reconnect or close extra windows, then retry.',
            );
            return fallback();
          }
          const shell = await cache.match(`${origin}/index.html`);
          return shell ? documentResponse(shell, manifest.documentPolicy) : fallback();
        })();
      } else
        response = (async () => {
          try {
            const online = await scope.fetch(input);
            await bindClients([id], 'network');
            return online;
          } catch {
            return fallback();
          }
        })();
      event.respondWith(
        response
          .then(async (ready) => {
            if (ready.ok) {
              try {
                await renewNavigationGrace(id);
              } catch {
                await tell(
                  'error',
                  'This offline page could not retain its safe version while opening. Retry when storage is available.',
                );
                return fallback();
              }
            }
            return ready;
          })
          .finally(() => {
            activeNavigations.delete(id);
          }),
      );
      return;
    }
    if (url.search || url.hash) return;
    const asset = core.get(url.pathname);
    if (asset) {
      event.respondWith(
        (async () => {
          if (asset.type === 'json' || asset.type === 'html') {
            let version: string | undefined;
            try {
              version = await documentVersion(event.clientId ?? '');
            } catch {
              await tell(
                'error',
                'Offline page ownership could not be confirmed. Your page was not assigned newer data.',
              );
              return new Response('This page version could not be confirmed.', { status: 503 });
            }
            if (!version) return new Response('Reopen Play 100 to establish this page version.', { status: 503 });
            if (version === 'network') return scope.fetch(input);
            if (version !== manifest.version) {
              const name = `${PWA_CACHE_PREFIX}core-${version}`;
              if (!(await scope.caches.keys()).includes(name)) {
                return new Response('The previous page version is unavailable. Save your work before reloading.', {
                  status: 503,
                });
              }
              const prior = await scope.caches.open(name);
              const response = await prior.match(request(asset.url));
              if (!response)
                return new Response('The previous page version is unavailable. Save your work before reloading.', {
                  status: 503,
                });
              if (asset.type !== 'html') return response;
              try {
                const marker = await prior.match(readyUrl);
                const previous: unknown = marker ? await marker.json() : null;
                if (
                  !previous ||
                  typeof previous !== 'object' ||
                  !('version' in previous) ||
                  previous.version !== version ||
                  !('documentPolicy' in previous)
                )
                  throw new Error('The previous document policy is not bound to this version.');
                const policy = parsePwaDocumentPolicy(previous.documentPolicy);
                await verifyPolicy(policy);
                return documentResponse(response, policy);
              } catch {
                await tell(
                  'error',
                  'The previous offline document has no verified security policy. Save your work before reloading.',
                );
                return fallback();
              }
            }
          }
          const cache = await scope.caches.open(coreName);
          const hit = await cache.match(request(asset.url));
          if (hit) return asset.type === 'html' ? documentResponse(hit, manifest.documentPolicy) : hit;
          try {
            const response = await fetchAsset(asset);
            try {
              await cache.put(request(asset.url), response.clone());
            } catch {
              await tell('error', 'Offline storage is unavailable. The online page remains usable.');
            }
            return response;
          } catch {
            await tell('error', 'A file from this version is unavailable. Reconnect and check for an update.');
            return new Response('This offline file is unavailable.', { status: 503 });
          }
        })(),
      );
    } else if (images.has(url.pathname)) {
      const image = images.get(url.pathname);
      if (image)
        event.respondWith(
          imageResponse(image).catch(async () => {
            await tell('warning', 'This public artwork is not available offline.');
            return new Response(null, { status: 503 });
          }),
        );
    } else if (/^\/assets\/.*\.(?:js|css|woff2)$/.test(url.pathname)) {
      event.respondWith((async () => (await previousChunk(url)) ?? scope.fetch(input))());
    }
  });

  scope.addEventListener('message', (event) => {
    const data: unknown = event.data;
    const source = event.source;
    if (
      !source ||
      source.type !== 'window' ||
      new URL(source.url).origin !== origin ||
      !data ||
      typeof data !== 'object' ||
      !('channel' in data) ||
      data.channel !== channel ||
      !('type' in data) ||
      !event.ports[0]
    )
      return;
    const port = event.ports[0];
    event.waitUntil(
      (async () => {
        const coreReady = await ready();
        if (data.type === 'STATUS') {
          port.postMessage({
            channel,
            version: manifest.version,
            ready: coreReady,
            clientVersion: (await documentVersion(source.id)) ?? null,
          });
        } else if (
          data.type === 'ACTIVATE' &&
          'version' in data &&
          data.version === manifest.version &&
          coreReady &&
          'previousVersion' in data &&
          typeof data.previousVersion === 'string' &&
          /^[a-f0-9]{64}$/.test(data.previousVersion)
        ) {
          if (!(await soleRequester(source.id))) {
            port.postMessage({ channel, version: manifest.version, accepted: false, reason: 'other-tabs' });
            return;
          }
          const previousName = `${PWA_CACHE_PREFIX}core-${data.previousVersion}`;
          if (data.previousVersion === manifest.version || !(await scope.caches.keys()).includes(previousName)) {
            port.postMessage({ channel, version: manifest.version, accepted: false, reason: 'previous-version' });
            return;
          }
          const previous = await scope.caches.open(previousName);
          if (!(await previous.match(readyUrl))) {
            port.postMessage({ channel, version: manifest.version, accepted: false, reason: 'previous-version' });
            return;
          }
          await bindClients([source.id], data.previousVersion);
          await (
            await scope.caches.open(coreName)
          ).put(
            readyUrl,
            new Response(
              JSON.stringify({
                version: manifest.version,
                created: Date.now(),
                core: manifest.core,
                previousVersion: data.previousVersion,
                documentPolicy: manifest.documentPolicy,
              }),
            ),
          );
          // No cache await may separate this last census from requesting activation.
          if (!(await soleRequester(source.id))) {
            port.postMessage({ channel, version: manifest.version, accepted: false, reason: 'other-tabs' });
            return;
          }
          await scope.skipWaiting();
          port.postMessage({ channel, version: manifest.version, accepted: true });
        } else port.postMessage({ channel, version: manifest.version, accepted: false, reason: 'not-ready' });
      })().catch(() => {
        console.error('Offline worker request failed; page-version ownership or storage could not be confirmed.');
        port.postMessage({ channel, version: manifest.version, accepted: false, reason: 'storage' });
      }),
    );
  });
}

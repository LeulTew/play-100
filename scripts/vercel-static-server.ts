/**
 * One local emulation of the Vercel deployment, shared by the low-end phone profile (HTTP/2 with Brotli, as production
 * serves a build to a phone) and the release service-worker probe (plain HTTP on a fixed loopback port). It serves a
 * build directory the way vercel.json declares: its filesystem first, then `cleanUrls`, `trailingSlash` and the
 * rewrites in order, and the header rules that match the path (src/lib/vercel-routes.ts). It has no upstream: API
 * routes, and rewrites to /api/ or to another origin, answer 503, and it never authenticates a visitor.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import { createSecureServer } from 'node:http2';
import type { Http2ServerRequest, ServerHttp2Session } from 'node:http2';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { requireObject, requireText } from '../src/lib/guards.ts';
import { matchingRules, routePattern } from '../src/lib/vercel-routes.ts';

export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|manifest\+json|xml)|image\/svg\+xml)/;
// Vercel's default for a static file that no header rule caches.
const DEFAULT_CACHE_CONTROL = 'public, max-age=0';

export interface VercelDeployment {
  readonly rewrites: readonly { readonly source: string; readonly destination: string }[];
  readonly headers: readonly {
    readonly source: string;
    readonly headers: readonly { readonly key: string; readonly value: string }[];
  }[];
  readonly cleanUrls: boolean;
  /** true adds a trailing slash, false removes one and undefined leaves the path as it came. */
  readonly trailingSlash: boolean | undefined;
}

/** The parts of a vercel.json this emulation applies, validated. */
export function parseDeployment(value: unknown): VercelDeployment {
  const config = requireObject(value);
  const list = (field: string) => {
    const rows = config[field] ?? [];
    if (!Array.isArray(rows)) throw new Error(`Invalid deployment ${field}.`);
    return rows.map((row) => requireObject(row));
  };
  const flag = (field: string) => {
    const setting = config[field];
    if (setting !== undefined && typeof setting !== 'boolean') throw new Error(`Invalid deployment ${field}.`);
    return setting;
  };
  return {
    rewrites: list('rewrites').map((rule) => ({
      source: requireText(rule.source),
      destination: requireText(rule.destination),
    })),
    headers: list('headers').map((rule) => {
      if (!Array.isArray(rule.headers)) throw new Error('Invalid deployment header rule.');
      return {
        source: requireText(rule.source),
        headers: rule.headers.map((row) => {
          const header = requireObject(row);
          return { key: requireText(header.key), value: requireText(header.value) };
        }),
      };
    }),
    cleanUrls: flag('cleanUrls') ?? false,
    trailingSlash: flag('trailingSlash'),
  };
}

/** A request's decoded path, refusing anything that could reach outside the served directory. */
export function safePathname(url: string): string {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname);
  } catch {
    throw new Error('Unsafe request path.');
  }
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..'))
    throw new Error('Unsafe request path.');
  return pathname;
}

export type Route =
  | { readonly kind: 'file'; readonly file: string; readonly status: 200 | 404 }
  | { readonly kind: 'redirect'; readonly location: string }
  | { readonly kind: 'upstream'; readonly destination: string };

/**
 * Where Vercel sends a path in this deployment, given which files the build has (`file` takes a path below the build
 * root, such as /index.html). Redirects are permanent (308), as Vercel's for these settings are.
 */
export function resolveRoute(deployment: VercelDeployment, pathname: string, file: (path: string) => boolean): Route {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (deployment.trailingSlash === false && pathname !== '/' && pathname.endsWith('/'))
    return { kind: 'redirect', location: pathname.replace(/\/+$/, '') || '/' };
  if (deployment.trailingSlash === true && !pathname.endsWith('/') && !last.includes('.'))
    return { kind: 'redirect', location: `${pathname}/` };
  if (deployment.cleanUrls && pathname.endsWith('.html') && file(pathname)) {
    const clean = pathname.slice(0, -'.html'.length).replace(/\/index$/, '/');
    return { kind: 'redirect', location: clean || '/' };
  }
  const directory = pathname.endsWith('/') ? `${pathname}index.html` : null;
  if (directory && file(directory)) return { kind: 'file', file: directory, status: 200 };
  if (!directory && file(pathname)) return { kind: 'file', file: pathname, status: 200 };
  const bare = pathname.replace(/\/$/, '');
  if (deployment.cleanUrls && bare && file(`${bare}.html`)) return { kind: 'file', file: `${bare}.html`, status: 200 };
  if (pathname.startsWith('/api/')) return { kind: 'upstream', destination: pathname };
  const rewrite = deployment.rewrites.find((rule) => routePattern(rule.source).test(bare || '/'));
  if (rewrite) {
    const destination = rewrite.destination.replace(/[?#].*$/, '');
    if (/^https?:\/\//.test(destination) || destination.startsWith('/api/'))
      return { kind: 'upstream', destination: rewrite.destination };
    if (file(destination)) return { kind: 'file', file: destination, status: 200 };
  }
  return { kind: 'file', file: '/404.html', status: 404 };
}

/** The headers vercel.json's rules give a path, later rules overriding earlier ones, keyed in lower case. */
export function routeHeaders(deployment: VercelDeployment, pathname: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of matchingRules(deployment.headers, pathname))
    for (const { key, value } of rule.headers) headers[key.toLowerCase()] = value;
  return headers;
}

export interface StaticResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | Buffer;
}

export interface StaticServerOptions {
  readonly root: string;
  readonly deployment: VercelDeployment;
  /** HTTP/2 over TLS with a throwaway loopback certificate, accepting HTTP/1.1 too, or plain HTTP/1.1. */
  readonly protocol: 'http2' | 'http1';
  /** Brotli-encode text responses for clients that accept it, as Vercel does. */
  readonly brotli: boolean;
  /** 0 picks a free port. */
  readonly port?: number;
  /** The body of the 503 an API route or upstream rewrite answers. */
  readonly upstreamBody?: string;
  /** Answers a path before the deployment does, or returns undefined to leave it to the deployment. */
  readonly intercept?: (pathname: string) => StaticResponse | undefined;
}

function certificate() {
  const key = path.join(tmpdir(), 'play100-low-end-profile.key');
  const cert = path.join(tmpdir(), 'play100-low-end-profile.crt');
  if (!existsSync(key) || !existsSync(cert)) {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '7', '-subj', '/CN=127.0.0.1'].concat([
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-keyout',
        key,
        '-out',
        cert,
      ]),
      { stdio: 'ignore' },
    );
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

/** Serves a build directory as its deployment config declares, recording each response's path and status. */
// The HTTP/1 and HTTP/2 responses overload writeHead differently; this is the part both share.
interface LoopbackResponse {
  readonly headersSent: boolean;
  writeHead(status: number, headers?: OutgoingHttpHeaders): unknown;
  end(): unknown;
  end(body: Uint8Array): unknown;
}

export async function startVercelStaticServer(options: StaticServerOptions) {
  const { root, deployment } = options;
  const requests: { path: string; status: number }[] = [];
  const errors: string[] = [];
  const files = new Map<string, { body: Buffer; brotli: Buffer | null; type: string }>();
  const isFile = (pathname: string) => {
    const file = path.join(root, pathname);
    return existsSync(file) && statSync(file).isFile();
  };
  const read = (pathname: string) => {
    let entry = files.get(pathname);
    if (!entry) {
      const body = readFileSync(path.join(root, pathname));
      const type = CONTENT_TYPES[path.extname(pathname)] ?? 'application/octet-stream';
      const brotli =
        options.brotli && COMPRESSIBLE.test(type)
          ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
          : null;
      entry = { body, brotli, type };
      files.set(pathname, entry);
    }
    return entry;
  };
  const respond = (method: string, url: string, acceptEncoding: string): StaticResponse & { path: string } => {
    let pathname: string;
    try {
      pathname = safePathname(url);
    } catch {
      return { path: url, status: 400, headers: {}, body: '' };
    }
    if (!['GET', 'HEAD'].includes(method)) return { path: pathname, status: 405, headers: {}, body: '' };
    const intercepted = options.intercept?.(pathname);
    if (intercepted) return { path: pathname, ...intercepted };
    const route = resolveRoute(deployment, pathname, isFile);
    if (route.kind === 'redirect')
      return { path: pathname, status: 308, headers: { location: route.location }, body: '' };
    if (route.kind === 'upstream')
      return {
        path: pathname,
        status: 503,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: options.upstreamBody ?? '{}',
      };
    const entry = read(route.file);
    const headers: Record<string, string> = {
      'content-type': entry.type,
      'cache-control': DEFAULT_CACHE_CONTROL,
      ...routeHeaders(deployment, pathname),
    };
    const encoded = entry.brotli !== null && /\bbr\b/.test(acceptEncoding);
    if (encoded) {
      headers['content-encoding'] = 'br';
      headers.vary = 'Accept-Encoding';
    }
    return { path: pathname, status: route.status, headers, body: encoded && entry.brotli ? entry.brotli : entry.body };
  };
  const handle = (request: IncomingMessage | Http2ServerRequest, response: LoopbackResponse): void => {
    try {
      const method = request.method ?? 'GET';
      const accept = request.headers['accept-encoding'];
      const result = respond(method, request.url ?? '/', Array.isArray(accept) ? accept.join(',') : (accept ?? ''));
      requests.push({ path: result.path, status: result.status });
      const body = typeof result.body === 'string' ? Buffer.from(result.body) : result.body;
      response.writeHead(result.status, { ...result.headers, 'content-length': String(body.length) });
      if (method === 'HEAD') response.end();
      else response.end(body);
    } catch (error) {
      errors.push(String(error));
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  };
  const sessions = new Set<ServerHttp2Session>();
  const server =
    options.protocol === 'http2'
      ? createSecureServer({ ...certificate(), allowHTTP1: true }, handle).on('session', (session) => {
          sessions.add(session);
          session.once('close', () => sessions.delete(session));
        })
      : createServer(handle);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  server.on('error', (error) => errors.push(String(error)));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback server address.');
  return {
    origin: `${options.protocol === 'http2' ? 'https' : 'http'}://127.0.0.1:${address.port}`,
    requests,
    errors,
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        if ('closeAllConnections' in server) server.closeAllConnections();
        for (const session of sessions) session.destroy();
      });
    },
  };
}

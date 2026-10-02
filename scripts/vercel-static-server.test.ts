import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  parseDeployment,
  resolveRoute,
  routeHeaders,
  safePathname,
  startVercelStaticServer,
} from './vercel-static-server';
import { MAIN_DOCUMENT_RULE } from '../src/lib/vercel-routes';

const repository = parseDeployment(JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')));
const built = new Set(['/index.html', '/404.html', '/sw.js', '/assets/app-abc.js', '/about.html', '/docs/index.html']);
const file = (pathname: string) => built.has(pathname);

describe('the local Vercel emulation', () => {
  it("reads vercel.json's rewrites, headers and URL settings, and refuses malformed ones", () => {
    expect(repository.trailingSlash).toBe(false);
    expect(repository.cleanUrls).toBe(false);
    expect(repository.rewrites.length).toBeGreaterThan(0);
    expect(repository.headers[0]?.source).toBe(MAIN_DOCUMENT_RULE);
    expect(() => parseDeployment({ rewrites: {} })).toThrow('rewrites');
    expect(() => parseDeployment({ headers: [{ source: '/(.*)' }] })).toThrow('header rule');
    expect(() => parseDeployment({ cleanUrls: 'yes' })).toThrow('cleanUrls');
    expect(parseDeployment({})).toEqual({ rewrites: [], headers: [], cleanUrls: false, trailingSlash: undefined });
  });

  it('serves files first, then the rewrites in order, then the 404 page', () => {
    expect(resolveRoute(repository, '/', file)).toEqual({ kind: 'file', file: '/index.html', status: 200 });
    expect(resolveRoute(repository, '/sw.js', file)).toEqual({ kind: 'file', file: '/sw.js', status: 200 });
    for (const pathname of ['/my-games', '/data-use', '/friends/abc123', '/u/someone'])
      expect(resolveRoute(repository, pathname, file)).toEqual({ kind: 'file', file: '/index.html', status: 200 });
    expect(resolveRoute(repository, '/unknown', file)).toEqual({ kind: 'file', file: '/404.html', status: 404 });
    expect(resolveRoute(repository, '/assets/missing.js', file)).toMatchObject({ status: 404 });
  });

  it('has no upstream: API routes and rewrites to a Function or another origin are not served locally', () => {
    expect(resolveRoute(repository, '/api/catalog', file)).toEqual({ kind: 'upstream', destination: '/api/catalog' });
    expect(resolveRoute(repository, '/__/auth/handler', file)).toEqual({
      kind: 'upstream',
      destination: '/api/auth-helper?page=handler',
    });
    expect(resolveRoute(repository, '/__/auth/iframe.js', file)).toMatchObject({ kind: 'upstream' });
  });

  it('applies trailingSlash and cleanUrls as Vercel does', () => {
    expect(resolveRoute(repository, '/discover/', file)).toEqual({ kind: 'redirect', location: '/discover' });
    const adding = { ...repository, trailingSlash: true };
    expect(resolveRoute(adding, '/discover', file)).toEqual({ kind: 'redirect', location: '/discover/' });
    expect(resolveRoute(adding, '/sw.js', file)).toMatchObject({ kind: 'file' });
    expect(resolveRoute(adding, '/docs/', file)).toEqual({ kind: 'file', file: '/docs/index.html', status: 200 });
    const clean = { ...repository, cleanUrls: true };
    expect(resolveRoute(clean, '/about.html', file)).toEqual({ kind: 'redirect', location: '/about' });
    expect(resolveRoute(clean, '/about', file)).toEqual({ kind: 'file', file: '/about.html', status: 200 });
    expect(resolveRoute(clean, '/index.html', file)).toEqual({ kind: 'redirect', location: '/' });
  });

  it("gives each path the headers of vercel.json's matching rules, later rules winning", () => {
    const document = routeHeaders(repository, '/');
    expect(document['content-security-policy']).toBeTruthy();
    expect(routeHeaders(repository, '/__/auth/handler')['content-security-policy']).toBeUndefined();
    expect(routeHeaders(repository, '/assets/app-abc.js')['cache-control']).toContain('immutable');
    const layered = parseDeployment({
      headers: [
        { source: '/(.*)', headers: [{ key: 'X-Layer', value: 'first' }] },
        { source: '/sw.js', headers: [{ key: 'x-layer', value: 'second' }] },
      ],
    });
    expect(routeHeaders(layered, '/sw.js')).toEqual({ 'x-layer': 'second' });
  });

  it('refuses request paths that could leave the build directory', () => {
    expect(safePathname('/friends/a%20b?x=1')).toBe('/friends/a b');
    for (const url of ['/%5C..%5Csecret', '/%00', '/a/..%2Fb', '/%E0%A4%A'])
      expect(() => safePathname(url)).toThrow('Unsafe');
  });
});

describe('the local Vercel server', () => {
  let root: string;
  const deployment = parseDeployment({
    trailingSlash: false,
    rewrites: [{ source: '/my-games', destination: '/index.html' }],
    headers: [
      { source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'" }] },
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ],
  });
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'vercel-static-'));
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'index.html'), '<!doctype html><title>Home</title>');
    await writeFile(path.join(root, '404.html'), '<!doctype html><title>Not found</title>');
    await writeFile(path.join(root, 'assets', 'app.js'), 'console.log("app");'.repeat(50));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('answers as the deployment declares, Brotli-encoding text for clients that accept it', async () => {
    const server = await startVercelStaticServer({
      root,
      deployment,
      protocol: 'http1',
      brotli: true,
      upstreamBody: '{"error":"none"}',
      intercept: (pathname) =>
        pathname === '/probe' ? { status: 200, headers: { 'cache-control': 'no-store' }, body: 'ok' } : undefined,
    });
    try {
      const home = await fetch(`${server.origin}/my-games`);
      expect(home.status).toBe(200);
      expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(home.headers.get('cache-control')).toBe('public, max-age=0');
      expect(home.headers.get('content-security-policy')).toBe("default-src 'self'");
      expect(await home.text()).toContain('Home');
      const asset = await fetch(`${server.origin}/assets/app.js`, { headers: { 'accept-encoding': 'br' } });
      expect(asset.headers.get('cache-control')).toContain('immutable');
      expect([asset.headers.get('content-encoding'), asset.headers.get('vary')]).toEqual(['br', 'Accept-Encoding']);
      expect(await asset.text()).toBe('console.log("app");'.repeat(50));
      const missing = await fetch(`${server.origin}/missing`);
      expect(missing.status).toBe(404);
      expect(await missing.text()).toContain('Not found');
      const slash = await fetch(`${server.origin}/my-games/`, { redirect: 'manual' });
      expect([slash.status, slash.headers.get('location')]).toEqual([308, '/my-games']);
      const api = await fetch(`${server.origin}/api/anything`);
      expect([api.status, await api.text()]).toEqual([503, '{"error":"none"}']);
      expect((await fetch(`${server.origin}/my-games`, { method: 'POST' })).status).toBe(405);
      expect(await (await fetch(`${server.origin}/probe`)).text()).toBe('ok');
      expect((await fetch(`${server.origin}/%5C..%5Csecret`)).status).toBe(400);
      const head = await fetch(`${server.origin}/`, { method: 'HEAD' });
      expect(head.headers.get('content-length')).toBe(String('<!doctype html><title>Home</title>'.length));
      expect(server.errors).toEqual([]);
      expect(server.requests.map((request) => request.status)).toEqual([200, 200, 404, 308, 503, 405, 200, 400, 200]);
    } finally {
      await server.stop();
    }
  });
});

import { ServerResponse, createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { AUTH_HELPER_MAX_BYTES, AUTH_HELPER_TIMEOUT_MS, AUTH_HELPER_UPSTREAM, authHelperCsp } from '../../api/auth-helper';

// Synthetic templates with the same structural markers as the captured Firebase helpers; not Google's bytes.
const HANDLER = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Synthetic handler</title>\n'
  + '<script src="/__/auth/handler.js"></script>\n'
  + "<script nonce=\"firebase-auth-helper\">var POST_BODY = '{{POST_BODY}}'; window.syntheticHandler && window.syntheticHandler(POST_BODY);</script>\n"
  + '</head><body></body></html>\n';
const IFRAME = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Synthetic iframe</title>\n'
  + '<script src="/__/auth/iframe.js"></script>\n'
  + '<script nonce="firebase-auth-helper">window.syntheticIframe && window.syntheticIframe();</script>\n'
  + '</head><body></body></html>\n';
const NONCE = /^[A-Za-z0-9+/]{22}==$/;
const EXPECTED_HEADERS = [
  'cache-control', 'cdn-cache-control', 'content-length', 'content-security-policy', 'content-type', 'permissions-policy',
  'referrer-policy', 'strict-transport-security', 'vercel-cdn-cache-control', 'x-content-type-options', 'x-frame-options',
];

const nativeFetch = globalThis.fetch;
let server: Server;
let base = '';
beforeEach(async () => {
  server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing auth helper test server address');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function upstreamHtml(body: BodyInit, init: ResponseInit = {}) {
  const upstream = vi.fn().mockImplementation(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init }));
  vi.stubGlobal('fetch', upstream);
  return upstream;
}

function nonceOf(response: Response): string {
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get('content-security-policy') ?? '')?.[1];
  if (!nonce) throw new Error('Missing response nonce');
  return nonce;
}

function headerNames(response: Response): string[] {
  return [...response.headers.keys()].filter(name => !['connection', 'date', 'keep-alive', 'transfer-encoding'].includes(name)).sort();
}

describe('fresh-nonce Firebase Auth helper function', () => {
  it.each([['handler', HANDLER], ['iframe', IFRAME]] as const)('serves %s with a fresh 128-bit nonce and otherwise identical bytes', async (page, template) => {
    const upstream = upstreamHtml(template);
    const response = await nativeFetch(`${base}/api/auth-helper?page=${page}`);
    expect(response.status).toBe(200);
    const nonce = nonceOf(response);
    expect(nonce).toMatch(NONCE);
    expect(Buffer.from(nonce, 'base64')).toHaveLength(16);
    expect(response.headers.get('content-security-policy')).toBe(authHelperCsp(nonce));
    const body = await response.text();
    expect(body).toBe(template.replace('nonce="firebase-auth-helper"', `nonce="${nonce}"`));
    expect(body).not.toContain('firebase-auth-helper');
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0]?.[0]).toBe(`${AUTH_HELPER_UPSTREAM}/__/auth/${page}`);
  });
  it('uses a different nonce on every response', async () => {
    upstreamHtml(HANDLER);
    const first = await nativeFetch(`${base}/api/auth-helper?page=handler`);
    const second = await nativeFetch(`${base}/api/auth-helper?page=handler`);
    expect(nonceOf(first)).not.toBe(nonceOf(second));
    expect((await first.text()).replace(nonceOf(first), 'N')).toBe((await second.text()).replace(nonceOf(second), 'N'));
  });
  it('sends exactly the helper header set on success', async () => {
    upstreamHtml(IFRAME);
    const response = await nativeFetch(`${base}/api/auth-helper?page=iframe`);
    expect(headerNames(response)).toEqual(EXPECTED_HEADERS);
    expect(Object.fromEntries(['cache-control', 'cdn-cache-control', 'vercel-cdn-cache-control', 'content-type', 'permissions-policy',
      'referrer-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options'].map(name => [name, response.headers.get(name)]))).toEqual({
      'cache-control': 'private, no-store, max-age=0', 'cdn-cache-control': 'no-store', 'vercel-cdn-cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8', 'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'referrer-policy': 'no-referrer', 'strict-transport-security': 'max-age=63072000; includeSubDomains',
      'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN',
    });
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    expect(response.headers.get('content-security-policy')).not.toContain('unsafe-eval');
    expect(Number(response.headers.get('content-length'))).toBe(Buffer.byteLength(await response.text()));
  });
  it('answers HEAD with the GET headers and no body', async () => {
    upstreamHtml(HANDLER);
    const response = await nativeFetch(`${base}/api/auth-helper?page=handler`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(headerNames(response)).toEqual(EXPECTED_HEADERS);
    expect(nonceOf(response)).toMatch(NONCE);
    expect(Number(response.headers.get('content-length'))).toBe(Buffer.byteLength(HANDLER) - 'firebase-auth-helper'.length + 24);
    expect(await response.text()).toBe('');
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('refuses %s with 405 before any upstream request', async (method) => {
    const upstream = upstreamHtml(HANDLER);
    const response = await nativeFetch(`${base}/api/auth-helper?page=handler`, { method, ...(method === 'POST' ? { body: 'state=x&code=<script>' } : {}) });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('Only GET and HEAD are supported for this sign-in helper.\n');
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each(['', '?page=links', '?page=handler.js', '?page=HANDLER', '?page=handler&page=iframe'])('returns 404 for an unknown helper page %j', async (query) => {
    const upstream = upstreamHtml(HANDLER);
    const response = await nativeFetch(`${base}/api/auth-helper${query}`);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(upstream).not.toHaveBeenCalled();
  });
  it('forwards no query, cookie, authorization or other client header upstream', async () => {
    const upstream = upstreamHtml(HANDLER);
    const response = await nativeFetch(`${base}/api/auth-helper?page=handler&apiKey=k&redirectUrl=https%3A%2F%2Fevil.example`, {
      headers: { Cookie: 'session=secret', Authorization: 'Bearer secret', 'X-Forwarded-For': '203.0.113.9', 'Accept-Language': 'am' },
    });
    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${AUTH_HELPER_UPSTREAM}/__/auth/handler`);
    expect(init).toMatchObject({ method: 'GET', headers: { Accept: 'text/html' }, redirect: 'manual', credentials: 'omit' });
    expect(init.headers).toEqual({ Accept: 'text/html' });
  });
  it('replaces every matching nonce attribute with the same fresh value', async () => {
    const template = HANDLER.replace('</head>', '<script nonce="firebase-auth-helper">window.second = 1;</script></head>');
    upstreamHtml(template);
    const response = await nativeFetch(`${base}/api/auth-helper?page=handler`);
    const nonce = nonceOf(response);
    expect(await response.text()).toBe(template.split('nonce="firebase-auth-helper"').join(`nonce="${nonce}"`));
  });
  it('keeps a byte-order mark and non-ASCII text byte-identical', async () => {
    const template = `\uFEFF${IFRAME.replace('Synthetic iframe', 'Synthetic ሰላም iframe')}`;
    upstreamHtml(template);
    const response = await nativeFetch(`${base}/api/auth-helper?page=iframe`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const nonce = nonceOf(response);
    expect(bytes.equals(Buffer.from(template.replace('firebase-auth-helper', nonce), 'utf8'))).toBe(true);
  });
  it.each([
    ['no nonce attribute', 'handler', HANDLER.replace(' nonce="firebase-auth-helper"', '')],
    ['a stray literal', 'handler', HANDLER.replace('</body>', '<!-- firebase-auth-helper --></body>')],
    ['another nonce attribute', 'handler', HANDLER.replace('<script src=', '<script nonce="other" src=')],
    ['a spaced uppercase nonce attribute', 'iframe', IFRAME.replace('<script src=', '<script NONCE = "x" src=')],
    ['an unquoted literal attribute', 'iframe', IFRAME.replace('nonce="firebase-auth-helper"', 'nonce=firebase-auth-helper')],
    ['a POST_BODY slot in the iframe', 'iframe', IFRAME.replace('window.syntheticIframe', "var POST_BODY = '{{POST_BODY}}'; window.syntheticIframe")],
    ['another placeholder', 'handler', HANDLER.replace('<title>', '<title>{{TITLE}}')],
    ['two POST_BODY slots', 'handler', HANDLER.replace('</body>', "<script>'{{POST_BODY}}'</script></body>")],
    ['an already substituted POST_BODY', 'handler', HANDLER.replace('{{POST_BODY}}', 'state={{x')],
  ])('fails closed with 502 and a counts-only log on %s', async (_label, page, template) => {
    upstreamHtml(template);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await nativeFetch(`${base}/api/auth-helper?page=${page}`);
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('The sign-in helper is unavailable. Please try again later.\n');
    expect(warn).toHaveBeenCalledTimes(1);
    const detail = warn.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(detail).sort()).toEqual(['attributes', 'literals', 'nonceAttributes', 'page', 'placeholders', 'reason', 'status']);
    expect(Object.values(detail).every(value => typeof value === 'number' || ['drift', 'handler', 'iframe'].includes(String(value)))).toBe(true);
  });
  it.each([
    ['invalid UTF-8', () => new Response(new Uint8Array([0x3c, 0xff, 0x3e]), { headers: { 'content-type': 'text/html' } })],
    ['a non-HTML type', () => new Response(HANDLER, { headers: { 'content-type': 'application/json' } })],
    ['a missing type', () => new Response(HANDLER)],
    ['an upstream 404', () => new Response(HANDLER, { status: 404, headers: { 'content-type': 'text/html' } })],
    ['an upstream 500', () => new Response(HANDLER, { status: 500, headers: { 'content-type': 'text/html' } })],
    ['an upstream 204', () => new Response(null, { status: 204, headers: { 'content-type': 'text/html' } })],
  ])('returns 502 for %s', async (_label, make) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => make()));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await nativeFetch(`${base}/api/auth-helper?page=handler`);
    expect(response.status).toBe(502);
    expect(response.headers.get('content-security-policy')).not.toContain('nonce-');
  });
  it.each([
    ['/__/auth/handler?mode=x', '/__/auth/handler?mode=x'],
    [`${AUTH_HELPER_UPSTREAM}/__/auth/iframe`, '/__/auth/iframe'],
  ])('passes an allowlisted upstream redirect %s through as same-origin %s', async (location, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(null, { status: 302, headers: { location } })));
    const response = await nativeFetch(`${base}/api/auth-helper?page=handler`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(expected);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });
  it.each([
    'https://evil.example/__/auth/handler', '//evil.example/__/auth/handler', `${AUTH_HELPER_UPSTREAM}/other`,
    `https://user:pass@${new URL(AUTH_HELPER_UPSTREAM).host}/__/auth/handler`, 'javascript:alert(1)', null,
  ])('refuses the upstream redirect to %s with 502', async (location) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(null, { status: 307, headers: location ? { location } : {} })));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await nativeFetch(`${base}/api/auth-helper?page=iframe`, { redirect: 'manual' });
    expect(response.status).toBe(502);
    expect(response.headers.get('location')).toBeNull();
  });
  it('accepts a template of exactly the size cap and refuses one byte more, streamed or declared', async () => {
    const padded = HANDLER.replace('<body>', `<body>${' '.repeat(AUTH_HELPER_MAX_BYTES - Buffer.byteLength(HANDLER))}`);
    expect(Buffer.byteLength(padded)).toBe(AUTH_HELPER_MAX_BYTES);
    upstreamHtml(padded);
    expect((await nativeFetch(`${base}/api/auth-helper?page=handler`)).status).toBe(200);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const oversized = `${padded} `;
    const chunks = [oversized.slice(0, 1000), oversized.slice(1000)];
    upstreamHtml(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }));
    expect((await nativeFetch(`${base}/api/auth-helper?page=handler`)).status).toBe(502);
    upstreamHtml(HANDLER, { headers: { 'content-type': 'text/html', 'content-length': String(AUTH_HELPER_MAX_BYTES + 1) } });
    expect((await nativeFetch(`${base}/api/auth-helper?page=handler`)).status).toBe(502);
  });
  it('times out a held upstream with 504', async () => {
    vi.useFakeTimers();
    let started: () => void = () => undefined;
    const start = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      started();
    })));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pending = nativeFetch(`${base}/api/auth-helper?page=handler`);
    await start;
    await vi.advanceTimersByTimeAsync(AUTH_HELPER_TIMEOUT_MS);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(await response.text()).toBe('The sign-in helper took too long to load. Please try again.\n');
  });
  it('aborts the held upstream when the client disconnects and writes nothing', async () => {
    let handled: Promise<void> | undefined;
    const local = createServer((request, response) => { handled = handler(request, response); });
    await new Promise<void>((resolve) => local.listen(0, '127.0.0.1', resolve));
    const address = local.address();
    if (!address || typeof address === 'string') throw new Error('Missing auth helper test server address');
    let upstreamSignal: AbortSignal | undefined;
    let started: () => void = () => undefined;
    const start = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_, reject) => {
      upstreamSignal = options.signal ?? undefined;
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      started();
    })));
    const writeHead = vi.spyOn(ServerResponse.prototype, 'writeHead');
    try {
      const client = new AbortController();
      const pending = nativeFetch(`http://127.0.0.1:${address.port}/api/auth-helper?page=iframe`, { signal: client.signal });
      await start;
      expect(upstreamSignal?.aborted).toBe(false);
      const upstreamAborted = new Promise<void>((resolve) => upstreamSignal?.addEventListener('abort', () => resolve(), { once: true }));
      client.abort();
      await expect(pending).rejects.toThrow();
      await upstreamAborted;
      await handled;
      expect(upstreamSignal?.aborted).toBe(true);
      expect(writeHead).not.toHaveBeenCalled();
    } finally {
      local.closeAllConnections();
      await new Promise<void>((resolve, reject) => local.close((error) => error ? reject(error) : resolve()));
    }
  });
});

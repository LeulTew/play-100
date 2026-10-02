import { ServerResponse, createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_HELPER_ADMISSION,
  AUTH_HELPER_MAX_BYTES,
  AUTH_HELPER_REFRESH_BACKOFF_MS,
  AUTH_HELPER_REPORTING_ENDPOINTS,
  AUTH_HELPER_RETRY_AFTER_SECONDS,
  AUTH_HELPER_TEMPLATE_MAX_AGE_MS,
  AUTH_HELPER_TEMPLATE_TTL_MS,
  AUTH_HELPER_TIMEOUT_MS,
  AUTH_HELPER_UPSTREAM,
  authHelperCsp,
  createAuthHelperHandler,
} from '../../api/auth-helper';
import type { AdmissionLimits } from '../../api/_lib/admission';
import configuration from '../../vercel.json';
import { MAIN_DOCUMENT_RULE, directiveSources } from '../../scripts/first-paint/csp';
import { listenOnFetchSafePort } from './test-server-ports';

// Synthetic templates with the same structural markers as the captured Firebase helpers; not Google's bytes.
const HANDLER =
  '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Synthetic handler</title>\n' +
  '<script src="/__/auth/handler.js"></script>\n' +
  '<script nonce="firebase-auth-helper">var POST_BODY = \'{{POST_BODY}}\'; window.syntheticHandler && window.syntheticHandler(POST_BODY);</script>\n' +
  '</head><body></body></html>\n';
const IFRAME =
  '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Synthetic iframe</title>\n' +
  '<script src="/__/auth/iframe.js"></script>\n' +
  '<script nonce="firebase-auth-helper">window.syntheticIframe && window.syntheticIframe();</script>\n' +
  '</head><body></body></html>\n';
const NONCE = /^[A-Za-z0-9+/]{22}==$/;
const EXPECTED_HEADERS = [
  'cache-control',
  'cdn-cache-control',
  'content-length',
  'content-security-policy',
  'content-type',
  'permissions-policy',
  'referrer-policy',
  'reporting-endpoints',
  'strict-transport-security',
  'vercel-cdn-cache-control',
  'x-content-type-options',
  'x-frame-options',
];

const nativeFetch = globalThis.fetch;
let server: Server;
let base = '';
beforeEach(async () => {
  // Each test gets its own helper instance, so no test is served a template another test cached.
  const handle = createAuthHelperHandler();
  server = createServer((request, response) => {
    void handle(request, response);
  });
  await listenOnFetchSafePort(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing auth helper test server address');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

function upstreamHtml(body: BodyInit, init: ResponseInit = {}) {
  const upstream = vi
    .fn()
    .mockImplementation(
      async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init }),
    );
  vi.stubGlobal('fetch', upstream);
  return upstream;
}

function nonceOf(response: Response): string {
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get('content-security-policy') ?? '')?.[1];
  if (!nonce) throw new Error('Missing response nonce');
  return nonce;
}

function headerNames(response: Response): string[] {
  return [...response.headers.keys()]
    .filter((name) => !['connection', 'date', 'keep-alive', 'transfer-encoding'].includes(name))
    .sort();
}

// Another helper instance on its own server, with its own template cache, admission and, if given, clock.
async function helperServer(options: { admission?: AdmissionLimits; now?: () => number } = {}) {
  const handle = createAuthHelperHandler(options);
  let handled: Promise<void> = Promise.resolve();
  let last: ServerResponse | undefined;
  let requests = 0;
  const instance = createServer((request, response) => {
    requests += 1;
    last = response;
    handled = handle(request, response);
  });
  await listenOnFetchSafePort(instance);
  const address = instance.address();
  if (!address || typeof address === 'string') throw new Error('Missing auth helper test server address');
  return {
    url: (page: string) => `http://127.0.0.1:${address.port}/api/auth-helper?page=${page}`,
    handled: () => handled,
    response: () => last,
    requests: () => requests,
    close: async () => {
      instance.closeAllConnections();
      await new Promise<void>((resolve, reject) => instance.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

describe('fresh-nonce Firebase Auth helper function', () => {
  it.each([
    ['handler', HANDLER],
    ['iframe', IFRAME],
  ] as const)('serves %s with a fresh 128-bit nonce and otherwise identical bytes', async (page, template) => {
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
    expect(
      Object.fromEntries(
        [
          'cache-control',
          'cdn-cache-control',
          'vercel-cdn-cache-control',
          'content-type',
          'permissions-policy',
          'referrer-policy',
          'reporting-endpoints',
          'strict-transport-security',
          'x-content-type-options',
          'x-frame-options',
        ].map((name) => [name, response.headers.get(name)]),
      ),
    ).toEqual({
      'cache-control': 'private, no-store, max-age=0',
      'cdn-cache-control': 'no-store',
      'vercel-cdn-cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'permissions-policy':
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), display-capture=()',
      'referrer-policy': 'no-referrer',
      'reporting-endpoints': 'csp="/api/csp-report"',
      'strict-transport-security': 'max-age=63072000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
    });
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    expect(response.headers.get('content-security-policy')).not.toContain('unsafe-eval');
    expect(Number(response.headers.get('content-length'))).toBe(Buffer.byteLength(await response.text()));
  });
  it('reports violations in the helper documents to the main document endpoint, and only from those documents', async () => {
    // The same first-party endpoint, report-to group and report-uri fallback as the main policy in vercel.json.
    const main = configuration.headers.find((rule) => rule.source === MAIN_DOCUMENT_RULE)!;
    const mainHeaders = Object.fromEntries(main.headers.map(({ key, value }) => [key.toLowerCase(), value]));
    for (const directive of ['report-to', 'report-uri']) {
      expect(directiveSources(authHelperCsp('n'), directive)).toEqual(
        directiveSources(mainHeaders['content-security-policy']!, directive),
      );
    }
    expect(AUTH_HELPER_REPORTING_ENDPOINTS).toBe(mainHeaders['reporting-endpoints']);
    upstreamHtml(HANDLER);
    const helperPage = await nativeFetch(`${base}/api/auth-helper?page=handler`);
    expect(helperPage.headers.get('reporting-endpoints')).toBe('csp="/api/csp-report"');
    expect(directiveSources(helperPage.headers.get('content-security-policy')!, 'report-to')).toEqual(['csp']);
    expect(directiveSources(helperPage.headers.get('content-security-policy')!, 'report-uri')).toEqual([
      '/api/csp-report',
    ]);
    // A plain-text refusal has nothing to report and keeps its own policy.
    for (const refused of [
      await nativeFetch(`${base}/api/auth-helper?page=links`),
      await nativeFetch(`${base}/api/auth-helper?page=handler`, { method: 'POST' }),
    ]) {
      expect(refused.headers.get('reporting-endpoints')).toBeNull();
      expect(refused.headers.get('content-security-policy')).not.toContain('report');
    }
  });
  it('answers HEAD with the success headers and a fresh nonce but no upstream request, body or length', async () => {
    const upstream = upstreamHtml(HANDLER);
    const responses: Response[] = [];
    for (const page of ['handler', 'iframe', 'handler'])
      responses.push(await nativeFetch(`${base}/api/auth-helper?page=${page}`, { method: 'HEAD' }));
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(headerNames(response)).toEqual(EXPECTED_HEADERS.filter((name) => name !== 'content-length'));
      expect(nonceOf(response)).toMatch(NONCE);
      expect(response.headers.get('content-security-policy')).toBe(authHelperCsp(nonceOf(response)));
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await response.text()).toBe('');
    }
    expect(new Set(responses.map(nonceOf)).size).toBe(3);
    expect((await nativeFetch(`${base}/api/auth-helper?page=links`, { method: 'HEAD' })).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'refuses %s with 405 before any upstream request',
    async (method) => {
      const upstream = upstreamHtml(HANDLER);
      const response = await nativeFetch(`${base}/api/auth-helper?page=handler`, {
        method,
        ...(method === 'POST' ? { body: 'state=x&code=<script>' } : {}),
      });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(await response.text()).toBe('Only GET and HEAD are supported for this sign-in helper.\n');
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each(['', '?page=links', '?page=handler.js', '?page=HANDLER', '?page=handler&page=iframe'])(
    'returns 404 for an unknown helper page %j',
    async (query) => {
      const upstream = upstreamHtml(HANDLER);
      const response = await nativeFetch(`${base}/api/auth-helper${query}`);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('forwards no query, cookie, authorization or other client header upstream', async () => {
    const upstream = upstreamHtml(HANDLER);
    const response = await nativeFetch(
      `${base}/api/auth-helper?page=handler&apiKey=k&redirectUrl=https%3A%2F%2Fevil.example`,
      {
        headers: {
          Cookie: 'session=secret',
          Authorization: 'Bearer secret',
          'X-Forwarded-For': '203.0.113.9',
          'Accept-Language': 'am',
        },
      },
    );
    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${AUTH_HELPER_UPSTREAM}/__/auth/handler`);
    expect(init).toMatchObject({
      method: 'GET',
      headers: { Accept: 'text/html' },
      redirect: 'manual',
      credentials: 'omit',
    });
    expect(init.headers).toEqual({ Accept: 'text/html' });
  });
  it('replaces every matching nonce attribute with the same fresh value', async () => {
    const template = HANDLER.replace(
      '</head>',
      '<script nonce="firebase-auth-helper">window.second = 1;</script></head>',
    );
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
    [
      'an unquoted literal attribute',
      'iframe',
      IFRAME.replace('nonce="firebase-auth-helper"', 'nonce=firebase-auth-helper'),
    ],
    [
      'a POST_BODY slot in the iframe',
      'iframe',
      IFRAME.replace('window.syntheticIframe', "var POST_BODY = '{{POST_BODY}}'; window.syntheticIframe"),
    ],
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
    expect(Object.keys(detail).sort()).toEqual([
      'attributes',
      'literals',
      'nonceAttributes',
      'page',
      'placeholders',
      'reason',
      'status',
    ]);
    expect(
      Object.values(detail).every(
        (value) => typeof value === 'number' || ['drift', 'handler', 'iframe'].includes(String(value)),
      ),
    ).toBe(true);
  });
  it.each([
    [
      'invalid UTF-8',
      () => new Response(new Uint8Array([0x3c, 0xff, 0x3e]), { headers: { 'content-type': 'text/html' } }),
    ],
    ['a non-HTML type', () => new Response(HANDLER, { headers: { 'content-type': 'application/json' } })],
    ['a missing type', () => new Response(HANDLER)],
    ['an upstream 404', () => new Response(HANDLER, { status: 404, headers: { 'content-type': 'text/html' } })],
    ['an upstream 500', () => new Response(HANDLER, { status: 500, headers: { 'content-type': 'text/html' } })],
    ['an upstream 204', () => new Response(null, { status: 204, headers: { 'content-type': 'text/html' } })],
  ])('returns 502 for %s', async (_label, make) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => make()),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await nativeFetch(`${base}/api/auth-helper?page=handler`);
    expect(response.status).toBe(502);
    expect(response.headers.get('content-security-policy')).not.toContain('nonce-');
  });
  it.each([
    ['/__/auth/handler?mode=x', '/__/auth/handler?mode=x'],
    [`${AUTH_HELPER_UPSTREAM}/__/auth/iframe`, '/__/auth/iframe'],
  ])('passes an allowlisted upstream redirect %s through as same-origin %s', async (location, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(null, { status: 302, headers: { location } })),
    );
    const response = await nativeFetch(`${base}/api/auth-helper?page=handler`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(expected);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });
  it.each([
    'https://evil.example/__/auth/handler',
    '//evil.example/__/auth/handler',
    `${AUTH_HELPER_UPSTREAM}/other`,
    `https://user:pass@${new URL(AUTH_HELPER_UPSTREAM).host}/__/auth/handler`,
    'javascript:alert(1)',
    null,
  ])('refuses the upstream redirect to %s with 502', async (location) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async () => new Response(null, { status: 307, headers: location ? { location } : {} })),
    );
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
    // Each refusal runs on a helper with nothing cached, since the first instance now serves the accepted template.
    const streamed = await helperServer();
    const declared = await helperServer();
    try {
      upstreamHtml(
        new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
            controller.close();
          },
        }),
      );
      expect((await nativeFetch(streamed.url('handler'))).status).toBe(502);
      upstreamHtml(HANDLER, {
        headers: { 'content-type': 'text/html', 'content-length': String(AUTH_HELPER_MAX_BYTES + 1) },
      });
      expect((await nativeFetch(declared.url('handler'))).status).toBe(502);
    } finally {
      await streamed.close();
      await declared.close();
    }
  });
  it('times out a held upstream with 504', async () => {
    vi.useFakeTimers();
    let started: () => void = () => undefined;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url, options: RequestInit) =>
          new Promise((_, reject) => {
            options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
            started();
          }),
      ),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pending = nativeFetch(`${base}/api/auth-helper?page=handler`);
    await start;
    await vi.advanceTimersByTimeAsync(AUTH_HELPER_TIMEOUT_MS);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(await response.text()).toBe('The sign-in helper took too long to load. Please try again.\n');
  });
  it('writes nothing to a client that disconnects, and still caches the refresh it started for the next request', async () => {
    const helper = await helperServer();
    let upstreamSignal: AbortSignal | undefined;
    let answer: (response: Response) => void = () => undefined;
    let started: () => void = () => undefined;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    const upstream = vi.fn().mockImplementation(
      (_url, options: RequestInit) =>
        new Promise<Response>((resolve) => {
          upstreamSignal = options.signal ?? undefined;
          answer = resolve;
          started();
        }),
    );
    vi.stubGlobal('fetch', upstream);
    const writeHead = vi.spyOn(ServerResponse.prototype, 'writeHead');
    try {
      const client = new AbortController();
      const pending = nativeFetch(helper.url('iframe'), { signal: client.signal });
      await start;
      client.abort();
      await expect(pending).rejects.toThrow();
      await vi.waitFor(() => expect(helper.response()?.destroyed).toBe(true));
      // Other requests may be waiting for the same refresh, so a disconnect does not abort it; the timeout bounds it.
      expect(upstreamSignal?.aborted).toBe(false);
      answer(new Response(IFRAME, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
      await helper.handled();
      expect(writeHead).not.toHaveBeenCalled();
      const next = await nativeFetch(helper.url('iframe'));
      expect(next.status).toBe(200);
      expect(await next.text()).toBe(IFRAME.replace('nonce="firebase-auth-helper"', `nonce="${nonceOf(next)}"`));
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      await helper.close();
    }
  });
});

describe('per-instance template cache and admission', () => {
  const START = new Date('2030-01-01T00:00:00Z').getTime();
  const REFRESHED = HANDLER.replace('Synthetic handler', 'Refreshed synthetic handler');
  const html = (template: string) =>
    new Response(template, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  const served = (template: string, response: Response) =>
    template.replace('nonce="firebase-auth-helper"', `nonce="${nonceOf(response)}"`);
  async function read(url: string, init?: RequestInit) {
    const response = await nativeFetch(url, init);
    return { response, text: await response.text() };
  }
  // Upstream requests the test answers one at a time.
  function heldUpstream() {
    const answers: Array<(response: Response) => void> = [];
    const upstream = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answers.push(resolve);
        }),
    );
    vi.stubGlobal('fetch', upstream);
    return { upstream, answers };
  }

  it("serves page loads from one validated template per page, so one client's burst cannot refuse another client", async () => {
    const upstream = vi.fn(async (url: string) => html(url.endsWith('/iframe') ? IFRAME : HANDLER));
    vi.stubGlobal('fetch', upstream);
    const helper = await helperServer();
    try {
      const { maxActive, maxPerWindow } = AUTH_HELPER_ADMISSION;
      const burst = await Promise.all(
        Array.from({ length: maxPerWindow + maxActive + 1 }, () =>
          read(helper.url('handler'), { headers: { 'X-Forwarded-For': '203.0.113.7' } }),
        ),
      );
      for (const { response, text } of burst) {
        expect(response.status).toBe(200);
        expect(text).toBe(served(HANDLER, response));
      }
      expect(new Set(burst.map(({ response }) => nonceOf(response))).size).toBe(burst.length);
      for (const page of ['handler', 'iframe']) {
        const other = await read(helper.url(page), { headers: { 'X-Forwarded-For': '198.51.100.23' } });
        expect(other.response.status).toBe(200);
        expect(other.text).toBe(served(page === 'iframe' ? IFRAME : HANDLER, other.response));
      }
      expect(upstream.mock.calls.map(([url]) => url)).toEqual([
        `${AUTH_HELPER_UPSTREAM}/__/auth/handler`,
        `${AUTH_HELPER_UPSTREAM}/__/auth/iframe`,
      ]);
    } finally {
      await helper.close();
    }
  });

  it('refreshes a template older than the TTL with one upstream request, however many page loads wait for it', async () => {
    const clock = { time: START };
    const { upstream, answers } = heldUpstream();
    const helper = await helperServer({ now: () => clock.time });
    try {
      const first = read(helper.url('handler'));
      await vi.waitFor(() => expect(answers).toHaveLength(1));
      answers.shift()!(html(HANDLER));
      const loaded = await first;
      expect(loaded.text).toBe(served(HANDLER, loaded.response));
      clock.time = START + AUTH_HELPER_TEMPLATE_TTL_MS - 1;
      const cached = await read(helper.url('handler'));
      expect(cached.text).toBe(served(HANDLER, cached.response));
      expect(upstream).toHaveBeenCalledTimes(1);
      clock.time = START + AUTH_HELPER_TEMPLATE_TTL_MS;
      const before = helper.requests();
      const waiting = Array.from({ length: 5 }, () => read(helper.url('handler')));
      await vi.waitFor(() => expect(helper.requests()).toBe(before + 5));
      expect(answers).toHaveLength(1);
      answers.shift()!(html(REFRESHED));
      for (const { response, text } of await Promise.all(waiting)) {
        expect(response.status).toBe(200);
        expect(text).toBe(served(REFRESHED, response));
      }
      const after = await read(helper.url('handler'));
      expect(after.text).toBe(served(REFRESHED, after.response));
      expect(upstream).toHaveBeenCalledTimes(2);
    } finally {
      await helper.close();
    }
  });

  it("keeps serving the last template while refreshes fail, up to upstream's max-age, and retries only after the backoff", async () => {
    const clock = { time: START };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let failing = false;
    const upstream = vi.fn(async () =>
      failing ? new Response('Unavailable', { status: 503, headers: { 'content-type': 'text/html' } }) : html(HANDLER),
    );
    vi.stubGlobal('fetch', upstream);
    const helper = await helperServer({ now: () => clock.time });
    const at = async (offset: number) => {
      clock.time = START + offset;
      return read(helper.url('handler'));
    };
    try {
      expect((await at(0)).response.status).toBe(200);
      failing = true;
      const stale = await at(AUTH_HELPER_TEMPLATE_TTL_MS);
      expect(stale.response.status).toBe(200);
      expect(stale.text).toBe(served(HANDLER, stale.response));
      expect(upstream).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);
      expect((await at(AUTH_HELPER_TEMPLATE_TTL_MS + AUTH_HELPER_REFRESH_BACKOFF_MS - 1)).response.status).toBe(200);
      expect(upstream).toHaveBeenCalledTimes(2);
      expect((await at(AUTH_HELPER_TEMPLATE_TTL_MS + AUTH_HELPER_REFRESH_BACKOFF_MS)).response.status).toBe(200);
      expect(upstream).toHaveBeenCalledTimes(3);
      // A template as old as upstream's max-age is not served, even when its refresh fails.
      const expired = await at(AUTH_HELPER_TEMPLATE_MAX_AGE_MS);
      expect(expired.response.status).toBe(502);
      expect(expired.text).toBe('The sign-in helper is unavailable. Please try again later.\n');
      expect(upstream).toHaveBeenCalledTimes(4);
      expect((await at(AUTH_HELPER_TEMPLATE_MAX_AGE_MS + AUTH_HELPER_REFRESH_BACKOFF_MS - 1)).response.status).toBe(
        502,
      );
      expect(upstream).toHaveBeenCalledTimes(4);
      failing = false;
      expect((await at(AUTH_HELPER_TEMPLATE_MAX_AGE_MS + AUTH_HELPER_REFRESH_BACKOFF_MS)).response.status).toBe(200);
      expect(upstream).toHaveBeenCalledTimes(5);
    } finally {
      await helper.close();
    }
  });

  it('repeats an upstream redirect until the backoff ends instead of asking upstream on every page load', async () => {
    const clock = { time: START };
    const upstream = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: '/__/auth/handler?mode=x' } }),
    );
    vi.stubGlobal('fetch', upstream);
    const helper = await helperServer({ now: () => clock.time });
    try {
      // The last offset is a clock that stepped back: it ends the backoff instead of stretching it.
      for (const offset of [0, AUTH_HELPER_REFRESH_BACKOFF_MS - 1, AUTH_HELPER_REFRESH_BACKOFF_MS, 0]) {
        clock.time = START + offset;
        const response = await nativeFetch(helper.url('handler'), { redirect: 'manual' });
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/__/auth/handler?mode=x');
      }
      expect(upstream).toHaveBeenCalledTimes(3);
    } finally {
      await helper.close();
    }
  });

  it('takes an admission slot only for an upstream refresh, so cached pages answer while refreshes are refused', async () => {
    const clock = { time: START };
    const { upstream, answers } = heldUpstream();
    // One refresh at a time and two in a window longer than the test, so both limits are reached.
    const helper = await helperServer({
      admission: { maxActive: 1, maxPerWindow: 2, windowMs: 24 * 60 * 60_000 },
      now: () => clock.time,
    });
    try {
      const first = read(helper.url('handler'));
      await vi.waitFor(() => expect(answers).toHaveLength(1));
      const refused = await read(helper.url('iframe'));
      expect(refused.response.status).toBe(429);
      expect(refused.response.headers.get('retry-after')).toBe(String(AUTH_HELPER_RETRY_AFTER_SECONDS));
      expect(refused.response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(refused.response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(refused.text).toBe('The sign-in helper is busy. Please wait a few seconds and try again.\n');
      expect((await nativeFetch(helper.url('iframe'), { method: 'HEAD' })).status).toBe(200);
      expect(upstream).toHaveBeenCalledTimes(1);
      answers.shift()!(html(HANDLER));
      expect((await first).response.status).toBe(200);
      const frame = read(helper.url('iframe'));
      await vi.waitFor(() => expect(answers).toHaveLength(1));
      answers.shift()!(html(IFRAME));
      expect((await frame).response.status).toBe(200);
      for (const page of ['handler', 'iframe', 'handler'])
        expect((await read(helper.url(page))).response.status).toBe(200);
      // With the window spent, a due refresh keeps the cached template within upstream's max-age, then answers 429.
      clock.time = START + AUTH_HELPER_TEMPLATE_TTL_MS;
      const stale = await read(helper.url('handler'));
      expect(stale.response.status).toBe(200);
      expect(stale.text).toBe(served(HANDLER, stale.response));
      clock.time = START + AUTH_HELPER_TEMPLATE_MAX_AGE_MS;
      const spent = await read(helper.url('handler'));
      expect(spent.response.status).toBe(429);
      expect(spent.response.headers.get('retry-after')).toBe(String(AUTH_HELPER_RETRY_AFTER_SECONDS));
      expect(upstream).toHaveBeenCalledTimes(2);
    } finally {
      await helper.close();
    }
  });
});

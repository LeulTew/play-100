import { createServer, IncomingMessage, ServerResponse, request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockedOrigin, createCspReportHandler, cspCounts, reportRoute } from '../../api/csp-report';
import { createOperationalProbe, probeProduction } from '../../api/operational-probe';
import { createClientErrorHandler } from '../../api/client-error-report';
import { createAdmission } from '../../api/_lib/admission';
import { listenOnFetchSafePort } from './test-server-ports';

const nativeFetch = globalThis.fetch;
const servers: Server[] = [];
async function serve(handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>) {
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  servers.push(server);
  await listenOnFetchSafePort(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address.');
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((cause) => (cause ? reject(cause) : resolve())));
  }
});
const legacy = {
  'csp-report': {
    'effective-directive': 'script-src-elem',
    'blocked-uri': 'https://cdn.test/private.js?token=secret#private',
    'document-uri': 'https://play-100-collection.vercel.app/u/private-handle?token=secret#private',
    'script-sample': 'secret sample',
    'source-file': 'private',
    referrer: 'private',
  },
};

describe('first-party client error endpoint', () => {
  const report = { buildVersion: 'entry:AbCd_123', counts: [{ errorClass: 'TypeError', area: 'app', route: '/u/:handle', count: 2 }] };
  it('logs only validated counts, rejects private payload fields and bounds instance admission', async () => {
    const log = vi.fn();
    const base = await serve(createClientErrorHandler(createAdmission({ maxActive: 1, maxPerWindow: 3 }), log));
    const send = (body: unknown) => nativeFetch(base, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'user-agent': 'private agent', 'x-forwarded-for': '192.0.2.1' },
    });
    expect((await nativeFetch(base)).status).toBe(405);
    expect((await nativeFetch(base, { method: 'POST', body: '{}' })).status).toBe(415);
    expect((await send(report)).status).toBe(204);
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'client-error-count', ...report }));
    expect((await send({ ...report, url: 'https://private.test/?secret' })).status).toBe(400);
    expect((await send({ ...report, counts: [{ ...report.counts[0], message: 'private' }] })).status).toBe(400);
    expect((await send(report)).status).toBe(429);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]![0]).not.toMatch(/private|192\.0|secret|agent/);
  });

  it('caps body size and releases admission after the three-second read deadline', async () => {
    const log = vi.fn();
    const base = await serve(createClientErrorHandler(undefined, log));
    expect((await nativeFetch(base, {
      method: 'POST', body: 'x'.repeat(8193), headers: { 'content-type': 'application/json' },
    })).status).toBe(413);
    vi.useFakeTimers();
    const request = new IncomingMessage(new Socket());
    request.method = 'POST';
    request.headers['content-type'] = 'application/json';
    const response = new ServerResponse(request);
    const release = vi.fn();
    const task = createClientErrorHandler({ acquire: () => release }, log)(request, response);
    request.emit('data', Buffer.from('{'));
    await vi.advanceTimersByTimeAsync(3_000);
    await task;
    expect(response.statusCode).toBe(408);
    expect(release).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('anonymous first-party CSP counts', () => {
  it('bounds an unfinished body read and releases its admission slot', async () => {
    vi.useFakeTimers();
    const socket = new Socket();
    const request = new IncomingMessage(socket);
    request.method = 'POST';
    request.headers['content-type'] = 'application/csp-report';
    const response = new ServerResponse(request);
    const release = vi.fn();
    const log = vi.fn();
    const task = createCspReportHandler({ acquire: () => release }, log)(request, response);
    request.emit('data', Buffer.from('{'));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(release).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await task;
    expect(response.statusCode).toBe(408);
    expect(release).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    socket.destroy();
  });
  it('retains only fixed directives, blocked origin and templated route, aggregating a batch', () => {
    const expected = [
      { directive: 'script-src-elem', blockedOrigin: 'other-origin', route: '/u/:handle', count: 1 },
    ];
    expect(cspCounts(legacy, false)).toEqual(expected);
    const report = {
      type: 'csp-violation',
      url: legacy['csp-report']['document-uri'],
      user_agent: 'private',
      body: { effectiveDirective: 'script-src-elem', blockedURL: legacy['csp-report']['blocked-uri'] },
    };
    expect(cspCounts([report, report], true)).toEqual([{ ...expected[0], count: 2 }]);
    expect(JSON.stringify(cspCounts(legacy, false))).not.toMatch(/secret|private|token|sample/);
  });

  it.each([
    'https://127.0.0.1/path',
    'http://[::1]/',
    'data:secret',
    'blob:https://example.test/id',
    'bad',
    'http://localhost/',
  ])('discards IP literals and non-origin identifiers %s', (value) => expect(blockedOrigin(value)).toBe('other'));

  it('normalizes known routes and strips credentials, queries and arbitrary paths', () => {
    expect(blockedOrigin('inline')).toBe('inline');
    expect(blockedOrigin('eval')).toBe('eval');
    expect(reportRoute('https://play-100-collection.vercel.app/friends/uid?private=yes')).toBe('/friends/:uid');
    expect(reportRoute('https://play-100-collection.vercel.app/invite?token=secret')).toBe('/invite');
    expect(reportRoute('https://other.test/account')).toBe('other');
    expect(reportRoute('https://play-100-collection.vercel.app/unknown-private')).toBe('other');
    expect(() => cspCounts(Array(17).fill(legacy), true)).toThrow();
    expect(() => cspCounts([{ type: 'crash', body: {} }], true)).toThrow();
    expect(() => cspCounts({ 'csp-report': { 'effective-directive': 'private' } }, false)).toThrow();
  });

  it('never retains visitor-controlled hostname labels, including subdomains of diagnostic hosts', () => {
    for (const host of [
      'visitor-unique-id.example.test',
      'visitor-unique-id.googleapis.com',
      'visitor-unique-id.accounts.google.com',
      'accounts.google.com.visitor-unique-id.test',
    ]) {
      const report = { 'csp-report': { ...legacy['csp-report'], 'blocked-uri': `https://${host}/private?token=secret` } };
      const counts = cspCounts(report, false);
      expect(counts[0]?.blockedOrigin).toBe('other-origin');
      expect(JSON.stringify(counts)).not.toContain('visitor-unique-id');
    }
    expect(blockedOrigin('https://accounts.google.com/private?token=secret')).toBe('https://accounts.google.com');
    expect(blockedOrigin('https://firestore.googleapis.com/private')).toBe('https://firestore.googleapis.com');
    expect(blockedOrigin('https://www.wikidata.org/private')).toBe('https://www.wikidata.org');
    expect(blockedOrigin('https://accounts.google.com:8443/private')).toBe('other-origin');
    expect(blockedOrigin('http://accounts.google.com/private')).toBe('other-origin');
  });

  it('accepts both CSP types, logs one safe line, rejects other types/methods and limits admission', async () => {
    const log = vi.fn();
    const base = await serve(
      createCspReportHandler(createAdmission({ maxActive: 1, maxPerWindow: 2, windowMs: 60_000 }), log),
    );
    expect((await nativeFetch(base)).status).toBe(405);
    expect(
      (await nativeFetch(base, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status,
    ).toBe(415);
    const send = (body: string, type = 'application/csp-report') =>
      nativeFetch(base, {
        method: 'POST',
        body,
        headers: { 'content-type': type, 'user-agent': 'private agent', 'x-forwarded-for': '192.0.2.1' },
      });
    const accepted = await send(JSON.stringify(legacy));
    expect(accepted.status).toBe(204);
    expect(await accepted.text()).toBe('');
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]![0]).not.toMatch(/private|192\.0|secret|agent/);
    expect(
      (
        await send(
          JSON.stringify([
            {
              type: 'csp-violation',
              body: {
                effectiveDirective: 'style-src-attr',
                blockedURL: 'inline',
                documentURL: 'https://play-100-collection.vercel.app/',
              },
            },
          ]),
          'application/reports+json',
        )
      ).status,
    ).toBe(204);
    expect((await send(JSON.stringify(legacy))).status).toBe(429);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('enforces the byte limit with declared length and streamed chunks, never logging invalid bodies', async () => {
    const log = vi.fn();
    const base = await serve(createCspReportHandler(undefined, log));
    expect(
      (
        await nativeFetch(base, {
          method: 'POST',
          body: 'x'.repeat(16 * 1024 + 1),
          headers: { 'content-type': 'application/csp-report' },
        })
      ).status,
    ).toBe(413);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(
        base,
        { method: 'POST', headers: { 'content-type': 'application/csp-report' } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.once('error', reject);
      request.write('x'.repeat(10 * 1024));
      request.end('x'.repeat(10 * 1024));
    });
    expect(status).toBe(413);
    expect(
      (
        await nativeFetch(base, {
          method: 'POST',
          body: '{private invalid',
          headers: { 'content-type': 'application/csp-report' },
        })
      ).status,
    ).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('credential-free operational probe', () => {
  it('coalesces concurrent callers, caches failures too and admits only a bounded public request rate', async () => {
    let time = 1;
    let release!: (result: { auth: boolean; wikidata: boolean; freetogame: boolean }) => void;
    const probe = vi.fn(
      () =>
        new Promise<{ auth: boolean; wikidata: boolean; freetogame: boolean }>((resolve) => {
          release = resolve;
        }),
    );
    const log = vi.fn();
    const base = await serve(createOperationalProbe(probe, () => time, log));
    const first = nativeFetch(base);
    await vi.waitFor(() => expect(probe).toHaveBeenCalledOnce());
    const second = nativeFetch(base);
    release({ auth: false, wikidata: true, freetogame: true });
    expect((await first).status).toBe(503);
    expect((await second).status).toBe(503);
    expect((await nativeFetch(base)).status).toBe(503);
    expect(probe).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ event: 'operational-probe', status: 'FAIL', auth: false, wikidata: true, freetogame: true }),
    );
    for (let i = 0; i < 9; i++) await nativeFetch(base);
    expect((await nativeFetch(base)).status).toBe(429);
    expect((await nativeFetch(`${base}?url=https://other.test`)).status).toBe(400);
    expect((await nativeFetch(base, { method: 'POST' })).status).toBe(405);
    time += 15 * 60_000;
    probe.mockResolvedValue({ auth: true, wikidata: true, freetogame: true });
    expect((await nativeFetch(base)).status).toBe(200);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('uses only four fixed credential-free requests and requires fresh nonce CSPs', async () => {
    let nonce = 0;
    const upstream = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      expect(options?.credentials).toBe('omit');
      expect(options?.redirect).toBe('error');
      const url = String(input);
      if (url.endsWith('/__/auth/handler')) {
        return new Response('helper', {
          headers: {
            'content-security-policy': `script-src 'nonce-${String(++nonce).repeat(22)}=='; frame-ancestors 'self'`,
          },
        });
      }
      return new Response(
        JSON.stringify(url.includes('wikidata') ? { query: { general: {} } } : { id: 1, title: 'Public' }),
        { headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', upstream);
    expect(await probeProduction()).toEqual({ auth: true, wikidata: true, freetogame: true });
    expect(upstream).toHaveBeenCalledTimes(4);
    expect(upstream.mock.calls.map(([url]) => new URL(String(url)).hostname).sort()).toEqual([
      'play-100-collection.vercel.app',
      'play-100-collection.vercel.app',
      'www.freetogame.com',
      'www.wikidata.org',
    ]);
    upstream.mockImplementation(
      async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    expect(await probeProduction()).toEqual({ auth: false, wikidata: false, freetogame: false });
  });

  it('records only failed booleans when a probe throws private diagnostics', async () => {
    const log = vi.fn();
    const base = await serve(
      createOperationalProbe(
        async () => {
          throw new Error('private-token');
        },
        Date.now,
        log,
      ),
    );
    expect((await nativeFetch(base)).status).toBe(503);
    expect(log.mock.calls[0]![0]).not.toContain('private-token');
  });
});

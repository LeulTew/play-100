import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authHelperCsp } from '../api/auth-helper';
import {
  compareDocumentHeaders,
  entryLiteralCounts,
  expectedDocumentHeaders,
  expectedHelperScriptHeaders,
  exposurePaths,
  freshNonces,
  helperNonce,
  inspectHtml,
  parseVerifyArguments,
  reportsCspViolations,
  serializeReceipt,
  sourcemapNotServed,
  verifyDeployment,
} from './release-verify';

const config: unknown = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const policy = expectedDocumentHeaders(config);
const nonce = 'abcdefghijklmnopqrstuv==';
const nonceHeaders = (value: string) =>
  new Headers({ 'content-security-policy': `default-src 'none'; script-src 'nonce-${value}'; frame-ancestors 'self'` });
const html = [
  '<template id="p100-deferred"><script crossorigin type="module" src="/assets/index-good.js"></script></template>',
  '<div class="first-paint-shell" hidden><button disabled>Menu</button>',
  '<div><button disabled="">Pick</button></div></div>',
  '<main id="p100-boot-error" hidden><button>Reload</button></main>',
].join('');

describe('deployed release verification, without network', () => {
  it('compares every declared document header and every CSP hash exactly', () => {
    expect(compareDocumentHeaders(new Headers(policy), policy).every((check) => check.pass)).toBe(true);
    const actual = new Headers(policy);
    actual.set('content-security-policy', policy['content-security-policy']!.replace(/sha256-[^']+/, 'sha256-wrong'));
    const csp = compareDocumentHeaders(actual, policy).find((check) => check.name.endsWith('content-security-policy'));
    expect(csp?.pass).toBe(false);
  });

  it.each(['x-frame-options', 'strict-transport-security', 'cross-origin-opener-policy', 'reporting-endpoints'])(
    'fails a missing %s header',
    (name) => {
      const headers = new Headers(policy);
      headers.delete(name);
      expect(compareDocumentHeaders(headers, policy).some((check) => !check.pass)).toBe(true);
    },
  );

  it('rejects firebaseinstallations even if mistakenly declared locally', () => {
    const csp = `${policy['content-security-policy']}; connect-src https://firebaseinstallations.googleapis.com`;
    const wrong = {
      ...policy,
      'content-security-policy': csp,
    };
    expect(
      compareDocumentHeaders(new Headers(wrong), wrong).find(
        (check) => check.name === 'CSP excludes firebaseinstallations',
      )?.pass,
    ).toBe(false);
  });

  it('fails a main CSP that frames accounts.google.com, even if declared locally', () => {
    const check = (headers: Record<string, string>) =>
      compareDocumentHeaders(new Headers(headers), headers).find(
        (entry) => entry.name === 'CSP excludes the Google accounts frame host',
      );
    expect(check(policy)).toMatchObject({ pass: true, measured: { framesGoogleAccounts: false } });
    const csp = policy['content-security-policy']!;
    expect(csp).toContain("frame-src 'self';");
    const wrong = {
      ...policy,
      'content-security-policy': csp.replace("frame-src 'self';", "frame-src 'self' https://accounts.google.com;"),
    };
    expect(check(wrong)).toMatchObject({ pass: false, measured: { framesGoogleAccounts: true } });
  });

  it.each([null, {}, { headers: [] }])('rejects incomplete header policy %#', (value) => {
    expect(() => expectedDocumentHeaders(value)).toThrow();
  });

  it('requires the helper documents to report CSP violations to the first-party endpoint', () => {
    const helper = { 'content-security-policy': authHelperCsp(nonce), 'reporting-endpoints': 'csp="/api/csp-report"' };
    expect(reportsCspViolations(new Headers(helper))).toBe(true);
    expect(reportsCspViolations(new Headers({ ...helper, 'reporting-endpoints': 'csp="https://other.test/r"' }))).toBe(
      false,
    );
    const withoutEndpoints = { 'content-security-policy': helper['content-security-policy'] };
    expect(reportsCspViolations(new Headers(withoutEndpoints))).toBe(false);
    for (const directive of ['; report-to csp', '; report-uri /api/csp-report']) {
      expect(helper['content-security-policy']).toContain(directive);
      const csp = helper['content-security-policy'].replace(directive, '');
      expect(reportsCspViolations(new Headers({ ...helper, 'content-security-policy': csp }))).toBe(false);
    }
  });

  it('requires a single well-formed nonce CSP and fresh values across all requests', () => {
    expect(helperNonce(nonceHeaders(nonce))).toBe(nonce);
    expect(freshNonces([nonce, 'zyxwvutsrqponmlkjihgfe=='])).toBe(true);
    expect(freshNonces([nonce, nonce])).toBe(false);
    expect(freshNonces([nonce, null])).toBe(false);
    expect(freshNonces([nonce, ''])).toBe(false);
    expect(freshNonces([])).toBe(false);
    const headers = nonceHeaders(nonce);
    headers.append('content-security-policy', "default-src 'none'");
    expect(helperNonce(headers)).toBeNull();
    expect(helperNonce(nonceHeaders('too-short'))).toBeNull();
    expect(helperNonce(new Headers({ 'content-security-policy': `script-src 'nonce-${nonce}'` }))).toBeNull();
  });

  it.each(['const x={BASE_URL:"/"}', 'const x={"BASE_URL" : "/"}', 'const x="VITE_VERCEL_URL";'])(
    'detects forbidden entry literal %#',
    (source) => {
      const result = entryLiteralCounts(source);
      expect(Boolean(result.baseUrl || result.vercelEnv || result.wholeEnv)).toBe(true);
    },
  );

  it('does not mistake ordinary base URL variables for whole-env literals', () => {
    expect(entryLiteralCounts('const baseUrl = "/";')).toEqual({ baseUrl: 0, vercelEnv: 0, wholeEnv: false });
  });

  it('reads the deferred entry and shell without requiring the recovery button to be disabled', () => {
    expect(inspectHtml(html)).toEqual({
      entry: '/assets/index-good.js',
      bootErrorHidden: true,
      shellDisabled: true,
      shellButtons: 2,
    });
  });

  it('ignores script text, comments and noscript decoys', () => {
    const decoy = '<button inert>Bad</button><script type="module" src="/assets/fake.js"></script>';
    const input = `${html}<!--${decoy}--><noscript>${decoy}</noscript><script>"<button inert>";</script>`;
    expect(inspectHtml(input)).toEqual(inspectHtml(html));
  });

  it('skips raw text to its literal end tag when minified code has "<" before a letter', () => {
    const boot = "<script>for(var d=0;d<n.length;d+=1){if(n[d].id)s='</scriptx>'}</SCRIPT >";
    const style = '<style>a<b{content:"x"}</style>';
    expect(inspectHtml(`${boot}${style}${html}`)).toEqual(inspectHtml(html));
    expect(inspectHtml(`${html}<script>if(a<b)c="it's"`)).toEqual(inspectHtml(html));
  });

  it.each(['disabled', ' hidden'])('fails a missing required HTML attribute %s', (attribute) => {
    const changed =
      attribute === 'disabled'
        ? html.replace(' disabled', '')
        : html.replace('p100-boot-error" hidden', 'p100-boot-error"');
    const result = inspectHtml(changed);
    expect(result.shellDisabled && result.bootErrorHidden).toBe(false);
  });

  it('fails inert, duplicate attributes and missing shell/entry rather than passing an empty response', () => {
    const inert = html.replace('first-paint-shell" hidden', 'first-paint-shell" hidden inert');
    expect(inspectHtml(inert).shellDisabled).toBe(false);
    const findable = html.replace('p100-boot-error" hidden', 'p100-boot-error" hidden="UNTIL-FOUND"');
    expect(inspectHtml(findable).bootErrorHidden).toBe(false);
    expect(() => inspectHtml(html.replace(' disabled>', ' disabled disabled>'))).toThrow();
    expect(inspectHtml('')).toEqual({ entry: null, bootErrorHidden: false, shellDisabled: false, shellButtons: 0 });
  });

  it('includes all documented private exposure paths and the removed provider asset', () => {
    expect(exposurePaths).toEqual([
      '/.vite/manifest.json',
      '/package.json',
      '/vercel.json',
      '/firebase.json',
      '/firestore.rules',
      '/.git/HEAD',
      '/provider/google.svg',
    ]);
  });

  it('treats the entry sourcemap as served unless it is 404 or refused exactly like an absent map', () => {
    const refusal = { status: 403, body: new Uint8Array([10]) };
    expect(sourcemapNotServed({ status: 404, body: new Uint8Array() }, null)).toBe(true);
    expect(sourcemapNotServed(refusal, { status: 403, body: new Uint8Array([10]) })).toBe(true);
    expect(sourcemapNotServed(refusal, { status: 404, body: new Uint8Array() })).toBe(false);
    expect(sourcemapNotServed(refusal, { status: 403, body: new Uint8Array([32]) })).toBe(false);
    expect(sourcemapNotServed(refusal, null)).toBe(false);
    const large = { status: 403, body: new Uint8Array(65) };
    expect(sourcemapNotServed(large, { status: 403, body: new Uint8Array(65) })).toBe(false);
    expect(sourcemapNotServed({ status: 200, body: new Uint8Array([123]) }, refusal)).toBe(false);
    expect(sourcemapNotServed(null, refusal)).toBe(false);
  });

  it('accepts a protected HTTPS candidate without adding the bypass variable to the receipt', () => {
    const args = ['--url', 'https://candidate.vercel.app', '--bypass-env', 'VERCEL_AUTOMATION_BYPASS_SECRET'];
    expect(parseVerifyArguments(args)).toEqual({
      url: 'https://candidate.vercel.app',
      bypassEnv: 'VERCEL_AUTOMATION_BYPASS_SECRET',
      expectIndex: undefined,
      json: undefined,
    });
  });

  it.each([
    'http://site.test',
    'https://user:password@site.test',
    'https://site.test/?token=x',
    'https://site.test/path',
    'https://site.test/#secret',
  ])('rejects a non-origin or credential-bearing target %#', (url) => {
    expect(() => parseVerifyArguments(['--url', url])).toThrow();
  });

  it('rejects missing, duplicate and unknown flags', () => {
    expect(() => parseVerifyArguments([])).toThrow();
    expect(() => parseVerifyArguments(['--url', 'https://site.test', '--url', 'https://other.test'])).toThrow();
    expect(() => parseVerifyArguments(['--token', 'secret'])).toThrow();
    expect(() => parseVerifyArguments(['--url'])).toThrow();
  });

  it('redacts reflected credentials in JSON, including escaped and URL-encoded values', () => {
    const secret = 'synthetic/"credential';
    const receipt = {
      url: 'https://site.test',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      passed: false,
      checks: [
        { name: 'Fixed check', pass: false, measured: { reflected: secret, encoded: encodeURIComponent(secret) } },
      ],
    };
    const serialized = serializeReceipt(receipt, secret);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(JSON.stringify(secret).slice(1, -1));
    expect(serialized).not.toContain(encodeURIComponent(secret));
    expect((JSON.parse(serialized) as typeof receipt).checks[0]?.measured).toEqual({
      reflected: '[REDACTED]',
      encoded: '[REDACTED]',
    });
  });
});

const helperScripts = expectedHelperScriptHeaders(config);

type Answer = { status: number; headers?: Record<string, string>; body?: string };

/** A deployment that answers every verifier request as production does, unless `overrides` answers it. */
function fakeDeployment(overrides: Record<string, Answer> = {}) {
  let nonces = 0;
  const json = { 'content-type': 'application/json' };
  const helperDocument = (): Answer => {
    nonces += 1;
    return {
      status: 200,
      headers: {
        'content-security-policy': authHelperCsp(`${String(nonces).padStart(22, 'n')}==`),
        'reporting-endpoints': 'csp="/api/csp-report"',
        'x-frame-options': 'SAMEORIGIN',
        'cache-control': 'private, no-store, max-age=0',
      },
      body: '<!doctype html>',
    };
    const helperScript = (): Answer => ({
      status: 200,
      headers: { ...helperScripts, 'content-type': 'text/javascript; charset=utf-8', vary: 'accept-encoding' },
      body: '/*! @license Firebase */',
    });
  };
  const answers: Record<string, () => Answer> = {
    'GET /': () => ({ status: 200, headers: { ...policy, 'content-type': 'text/html' }, body: html }),
    'GET /.well-known/security.txt': () => ({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'x' }),
    'GET /sw.js': () => ({ status: 200, body: 'self' }),
    'GET /pwa-assets.json': () => ({ status: 200, headers: json, body: JSON.stringify({ version: 'a'.repeat(64) }) }),
    'GET /__/auth/handler': helperDocument,
    'GET /__/auth/iframe': helperDocument,
    'POST /__/auth/handler': () => ({ status: 405, headers: { allow: 'GET, HEAD' } }),
    'POST /api/catalog': () => ({ status: 405 }),
    'GET /api/catalog?source=freetogame&q=zelda': () => ({ status: 200, headers: json, body: '{"items":[]}' }),
    'GET /api/catalog?q=zelda': () => ({ status: 200, headers: json, body: '{"items":[{"id":"wikidata:Q42"}]}' }),
    'GET /api/catalog-detail?id=wikidata%3AQ42': () => ({ status: 200, headers: json, body: '{"id":"wikidata:Q42"}' }),
    'GET /assets/index-good.js': () => ({ status: 200, headers: { 'content-type': 'text/javascript' }, body: '0' }),
    // As production answered both on 2026-10-02: the 404 page with the main headers, and Firebase's script with its
    // rule's headers (Vercel keeps the two directives addressed to its own CDN) plus upstream ones.
    'GET /__/auth/unknown': () => ({
      status: 404,
      headers: { ...policy, 'content-type': 'text/html; charset=utf-8' },
      body: '<!doctype html>',
    }),
    'GET /__/auth/handler.js': helperScript,
    'GET /__/auth/iframe.js': helperScript,
    'GET /__/auth/experiments.js': helperScript,
  };
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const key = `${init?.method ?? 'GET'} ${url.pathname}${url.search}`;
    const answer = overrides[key] ?? answers[key]?.() ?? { status: 404 };
    return new Response(answer.body ?? null, { status: answer.status, headers: answer.headers });
  });
}

const failing = (receipt: Awaited<ReturnType<typeof verifyDeployment>>) =>
  receipt.checks.filter((check) => !check.pass).map((check) => check.name);

describe('deployed release verification of the auth helper paths', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('expects the helper script rule headers except the directives addressed to Vercel itself', () => {
    const rule = (
      config as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> }
    ).headers.find((group) => group.source === '/__/auth/(handler|iframe|experiments)\\.js')!;
    const declared = Object.fromEntries(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
    const vercelOnly = ['vercel-cdn-cache-control', 'x-vercel-enable-rewrite-caching'];
    for (const name of vercelOnly) expect(declared[name]).toBeDefined();
    expect(helperScripts).toEqual(
      Object.fromEntries(Object.entries(declared).filter(([name]) => !vercelOnly.includes(name))),
    );
    expect(helperScripts).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'cache-control': 'private, no-store, max-age=0',
      'cdn-cache-control': 'no-store',
    });
    expect(() => expectedHelperScriptHeaders({ headers: [] })).toThrow();
  });

  it('passes a deployment that serves both auth helper paths as production does', async () => {
    vi.stubGlobal('fetch', fakeDeployment());
    const receipt = await verifyDeployment({ url: 'https://candidate.example.test' }, config);
    expect(failing(receipt)).toEqual([]);
    const names = receipt.checks.map((check) => check.name);
    expect(names).toEqual(
      expect.arrayContaining([
        '/__/auth/unknown 404',
        ...Object.keys(policy).map((name) => `/__/auth/unknown header ${name}`),
        '/__/auth/handler.js 200 JavaScript',
        ...Object.keys(helperScripts).map((name) => `/__/auth/handler.js header ${name}`),
        '/__/auth/handler.js without main document headers',
        '/__/auth/experiments.js 200 JavaScript',
        '/__/auth/experiments.js header x-content-type-options',
        '/__/auth/iframe.js header x-content-type-options',
      ]),
    );
    expect(names).not.toContain('/__/auth/handler.js header vercel-cdn-cache-control');
  });

  it.each(['handler', 'iframe', 'experiments'])('rejects missing or wrong nosniff on %s.js', async (name) => {
    for (const value of [null, 'invalid']) {
      const headers: Record<string, string> = { ...helperScripts, 'content-type': 'text/javascript' };
      if (value === null) delete headers['x-content-type-options'];
      else headers['x-content-type-options'] = value;
      vi.stubGlobal('fetch', fakeDeployment({ [`GET /__/auth/${name}.js`]: { status: 200, headers } }));
      const receipt = await verifyDeployment({ url: 'https://candidate.example.test' }, config);
      expect(failing(receipt)).toContain(`/__/auth/${name}.js header x-content-type-options`);
    }
  });

  it('refuses a configuration that would accept a non-nosniff script header', () => {
    const changed = structuredClone(config);
    const rule = changed.headers.find((group) => group.source === '/__/auth/(handler|iframe|experiments)\\.js')!;
    rule.headers.find((header) => header.key === 'X-Content-Type-Options')!.value = 'invalid';
    expect(() => expectedHelperScriptHeaders(changed)).toThrow('must declare X-Content-Type-Options: nosniff');
  });

  it.each([
    [
      'an unknown auth path with the helper script headers',
      { 'GET /__/auth/unknown': { status: 404, headers: helperScripts } },
      ['/__/auth/unknown header x-frame-options', '/__/auth/unknown header content-security-policy'],
    ],
    [
      'an unknown auth path that is served',
      { 'GET /__/auth/unknown': { status: 200, headers: policy } },
      ['/__/auth/unknown 404'],
    ],
    [
      'handler.js with the main document headers',
      { 'GET /__/auth/handler.js': { status: 200, headers: { ...policy, 'content-type': 'text/javascript' } } },
      ['/__/auth/handler.js header x-frame-options', '/__/auth/handler.js without main document headers'],
    ],
    [
      'handler.js with upstream headers only',
      { 'GET /__/auth/handler.js': { status: 200, headers: { 'content-type': 'text/javascript' } } },
      ['/__/auth/handler.js header x-content-type-options', '/__/auth/handler.js header cache-control'],
    ],
    [
      'handler.js answered with HTML',
      { 'GET /__/auth/handler.js': { status: 200, headers: { ...helperScripts, 'content-type': 'text/html' } } },
      ['/__/auth/handler.js 200 JavaScript'],
    ],
  ])('fails %s', async (_label, overrides, expected) => {
    vi.stubGlobal('fetch', fakeDeployment(overrides));
    const receipt = await verifyDeployment({ url: 'https://candidate.example.test' }, config);
    expect(receipt.passed).toBe(false);
    expect(failing(receipt)).toEqual(expect.arrayContaining(expected));
  });
});

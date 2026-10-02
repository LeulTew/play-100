import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { authHelperCsp } from '../api/auth-helper';
import {
  compareDocumentHeaders,
  entryLiteralCounts,
  expectedDocumentHeaders,
  exposurePaths,
  freshNonces,
  helperNonce,
  inspectHtml,
  parseVerifyArguments,
  reportsCspViolations,
  serializeReceipt,
  sourcemapNotServed,
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

  it('keeps Google to the gapi script host, failing either unused host even if declared locally', () => {
    const name = 'CSP excludes the unused Google connect and frame hosts';
    const check = (headers: Record<string, string>) =>
      compareDocumentHeaders(new Headers(headers), headers).find((entry) => entry.name === name);
    expect(check(policy)).toMatchObject({
      pass: true,
      measured: { connectsToGapi: false, framesGoogleAccounts: false },
    });
    const csp = policy['content-security-policy']!;
    expect(csp).toContain("script-src 'self' https://apis.google.com");
    for (const [from, to, measured] of [
      [
        'https://firestore.googleapis.com;',
        'https://firestore.googleapis.com https://apis.google.com;',
        'connectsToGapi',
      ],
      ["frame-src 'self';", "frame-src 'self' https://accounts.google.com;", 'framesGoogleAccounts'],
    ] as const) {
      expect(csp).toContain(from);
      const wrong = { ...policy, 'content-security-policy': csp.replace(from, to) };
      expect(check(wrong)).toMatchObject({ pass: false, measured: { [measured]: true } });
    }
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

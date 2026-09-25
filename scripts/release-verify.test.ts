import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  compareDocumentHeaders,
  entryLiteralCounts,
  expectedDocumentHeaders,
  exposurePaths,
  freshNonces,
  helperNonce,
  inspectHtml,
  parseVerifyArguments,
  serializeReceipt,
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
    actual.set('content-security-policy', policy['content-security-policy'].replace(/sha256-[^']+/, 'sha256-wrong'));
    const csp = compareDocumentHeaders(actual, policy).find((check) => check.name.endsWith('content-security-policy'));
    expect(csp?.pass).toBe(false);
  });

  it.each(['x-frame-options', 'strict-transport-security', 'cross-origin-opener-policy'])(
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
    expect(compareDocumentHeaders(new Headers(wrong), wrong).at(-1)?.pass).toBe(false);
  });

  it.each([null, {}, { headers: [] }])('rejects incomplete header policy %#', (value) => {
    expect(() => expectedDocumentHeaders(value)).toThrow();
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
    expect(JSON.parse(serialized).checks[0].measured).toEqual({ reflected: '[REDACTED]', encoded: '[REDACTED]' });
  });
});

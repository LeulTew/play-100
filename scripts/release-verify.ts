import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshNonces, helperNonce } from '../src/lib/auth-helper-nonce.js';
import { directiveSources } from './first-paint/csp.ts';
export { freshNonces, helperNonce } from '../src/lib/auth-helper-nonce.js';
import { isMainDocumentRule } from '../src/lib/vercel-routes.js';

interface Check {
  name: string;
  pass: boolean;
  measured: Record<string, string | number | boolean | null>;
}
export interface VerifyOptions {
  url: string;
  bypassEnv?: string;
  expectIndex?: string;
  json?: string;
}
export interface VerificationReceipt {
  url: string;
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  checks: Check[];
}
const securityHeaders = [
  'x-content-type-options',
  'referrer-policy',
  'x-frame-options',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'permissions-policy',
  'strict-transport-security',
  'content-security-policy',
  'reporting-endpoints',
];
export const exposurePaths = [
  '/.vite/manifest.json',
  '/package.json',
  '/vercel.json',
  '/firebase.json',
  '/firestore.rules',
  '/.git/HEAD',
  '/provider/google.svg',
];
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

type MapProbe = { status: number; body: Uint8Array } | null;

// Vercel's protected source maps refuse every *.map path with the same short 403, whether or not the
// file exists, so an identical 403 for a random absent map shows the entry map is not served either.
export function sourcemapNotServed(map: MapProbe, absent: MapProbe): boolean {
  if (map?.status === 404) return true;
  return (
    map?.status === 403 && absent?.status === 403 && map.body.length <= 64 && digest(map.body) === digest(absent.body)
  );
}

export function parseVerifyArguments(args: string[]): VerifyOptions {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (
      !flag ||
      !['--url', '--bypass-env', '--expect-index', '--json'].includes(flag) ||
      flags.has(flag) ||
      !value ||
      value.startsWith('--')
    ) {
      throw new Error('Use --url ORIGIN [--bypass-env NAME] [--expect-index FILE] [--json FILE]; no duplicate flags.');
    }
    flags.set(flag, value);
  }
  const raw = flags.get('--url');
  if (!raw) throw new Error('A deployment --url is required.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch (cause) {
    throw new Error('The deployment URL is invalid.', { cause });
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (raw !== url.origin && raw !== `${url.origin}/`)
  ) {
    throw new Error('Use an HTTPS origin only, without credentials, paths, query parameters or fragments.');
  }
  const bypassEnv = flags.get('--bypass-env');
  if (bypassEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(bypassEnv)) throw new Error('Invalid bypass variable name.');
  return { url: url.origin, bypassEnv, expectIndex: flags.get('--expect-index'), json: flags.get('--json') };
}

function declaredHeaders(entries: unknown[], kind: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    if (!object(entry) || typeof entry.key !== 'string' || typeof entry.value !== 'string') {
      throw new Error(`Invalid ${kind} header entry.`);
    }
    const name = entry.key.toLowerCase();
    if (Object.hasOwn(result, name)) throw new Error(`Duplicate ${kind} header declaration.`);
    result[name] = entry.value;
  }
  return result;
}

export function expectedDocumentHeaders(config: unknown): Record<string, string> {
  if (!object(config) || !Array.isArray(config.headers)) throw new Error('Invalid Vercel header configuration.');
  const groups = config.headers.filter(isMainDocumentRule);
  if (groups.length !== 1 || !object(groups[0]) || !Array.isArray(groups[0].headers)) {
    throw new Error('Expected exactly one non-auth document header group.');
  }
  const result = declaredHeaders(groups[0].headers, 'document');
  if (securityHeaders.some((name) => !result[name])) throw new Error('A required security header is missing.');
  return result;
}

const HELPER_SCRIPT_RULE = '/__/auth/(handler|iframe|experiments)\\.js';
// Directives to Vercel's own CDN, which it applies and never sends on: production served /__/auth/handler.js with
// every other header of its rule (capture 2026-10-02).
const vercelOnlyHeaders = new Set(['vercel-cdn-cache-control', 'x-vercel-enable-rewrite-caching']);

/** The headers the auth helper script rule makes Vercel send with /__/auth/handler.js, iframe.js and experiments.js. */
export function expectedHelperScriptHeaders(config: unknown): Record<string, string> {
  if (!object(config) || !Array.isArray(config.headers)) throw new Error('Invalid Vercel header configuration.');
  const groups = config.headers.filter((group: unknown) => object(group) && group.source === HELPER_SCRIPT_RULE);
  if (groups.length !== 1 || !object(groups[0]) || !Array.isArray(groups[0].headers)) {
    throw new Error('Expected exactly one auth helper script header group.');
  }
  const declared = declaredHeaders(groups[0].headers, 'auth helper script');
  const result = Object.fromEntries(Object.entries(declared).filter(([name]) => !vercelOnlyHeaders.has(name)));
  if (['x-content-type-options', 'x-frame-options', 'cache-control'].some((name) => !result[name]))
    throw new Error('A required auth helper script header is missing.');
  return result;
}

function compareHeaders(actual: Headers, expected: Record<string, string>, label: string): Check[] {
  return Object.entries(expected).map(([name, value]) => ({
    name: `${label} header ${name}`,
    pass: actual.get(name) === value,
    measured: {
      expectedSha256: digest(value),
      actualSha256: actual.has(name) ? digest(actual.get(name)!) : null,
    },
  }));
}

export function compareDocumentHeaders(actual: Headers, expected: Record<string, string>): Check[] {
  const checks = compareHeaders(actual, expected, 'Document');
  const csp = actual.get('content-security-policy') ?? '';
  checks.push({
    name: 'CSP excludes firebaseinstallations',
    pass: Boolean(csp) && !/firebaseinstallations/i.test(csp),
    measured: { present: /firebaseinstallations/i.test(csp) },
  });
  // R24: the main document frames only its own /__/auth/iframe. Like the check above, this fails even if vercel.json
  // lists the host again.
  const framesGoogleAccounts = (directiveSources(csp, 'frame-src') ?? []).includes('https://accounts.google.com');
  checks.push({
    name: 'CSP excludes the Google accounts frame host',
    pass: Boolean(csp) && !framesGoogleAccounts,
    measured: { framesGoogleAccounts },
  });
  return checks;
}

/** Whether a response's CSP reports to the first-party endpoint: the `csp` report-to group and the report-uri fallback. */
export function reportsCspViolations(headers: Headers): boolean {
  const csp = headers.get('content-security-policy') ?? '';
  return (
    headers.get('reporting-endpoints') === 'csp="/api/csp-report"' &&
    JSON.stringify(directiveSources(csp, 'report-to')) === '["csp"]' &&
    JSON.stringify(directiveSources(csp, 'report-uri')) === '["/api/csp-report"]'
  );
}

export function entryLiteralCounts(source: string) {
  return {
    baseUrl: source.split('BASE_URL:').length - 1,
    vercelEnv: source.split('VITE_VERCEL_').length - 1,
    wholeEnv: /[{,]\s*["']?BASE_URL["']?\s*:\s*["'`]/.test(source),
  };
}

// A scanner for the emitted document, not a DOM or JavaScript evaluator. Raw-text
// elements and comments cannot masquerade as tags; malformed/duplicate attributes fail closed.
export function inspectHtml(html: string) {
  const entries: string[] = [];
  const stack: Array<{ name: string; shell: boolean; inactive: boolean }> = [];
  let shellCount = 0;
  let shellButtons = 0;
  let enabledButtons = 0;
  let inert = 0;
  let notices = 0;
  let hiddenNotices = 0;
  const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
  let raw: string | null = null;
  for (let token = tokens.exec(html); token; token = tokens.exec(html)) {
    if (!token[1]) continue;
    const name = token[1].toLowerCase();
    const closing = token[0].startsWith('</');
    if (raw) {
      if (closing && name === raw) raw = null;
      else continue;
    }
    if (closing) {
      const last = stack.map((item) => item.name).lastIndexOf(name);
      if (last >= 0) stack.length = last;
      continue;
    }
    const attrs = new Map<string, string>();
    let rest = (token[2] ?? '').trim().replace(/\/$/, '').trim();
    while (rest) {
      const attr = /^([^\s=/'"<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(rest);
      const key = attr?.[1]?.toLowerCase();
      if (!attr || !key || attrs.has(key)) throw new Error('Malformed HTML attributes.');
      attrs.set(key, attr[2] ?? attr[3] ?? attr[4] ?? '');
      rest = rest.slice(attr[0].length).trimStart();
    }
    const inactive = Boolean(stack.at(-1)?.inactive) || name === 'noscript';
    const rootShell = (attrs.get('class') ?? '').split(/\s+/).includes('first-paint-shell');
    const shell = rootShell || Boolean(stack.at(-1)?.shell);
    if (!inactive) {
      if (rootShell) shellCount += 1;
      if (attrs.has('inert')) inert += 1;
      if (shell && name === 'button') {
        shellButtons += 1;
        if (!attrs.has('disabled')) enabledButtons += 1;
      }
      if (attrs.get('id') === 'p100-boot-error') {
        notices += 1;
        if (attrs.has('hidden') && attrs.get('hidden')?.toLowerCase() !== 'until-found') hiddenNotices += 1;
      }
      if (name === 'script' && attrs.get('type')?.toLowerCase() === 'module') {
        const src = attrs.get('src') ?? '';
        if (!/^\/assets\/[\w.-]+\.js$/.test(src)) throw new Error('Invalid local module entry.');
        entries.push(src);
      }
    }
    if (['script', 'style', 'textarea', 'title'].includes(name)) {
      raw = name;
      // Raw text ends only at its literal end tag. Tokenizing it could read `d<n.length` in a
      // minified script as a tag whose quoted "attributes" run past the real end tag.
      const end = new RegExp(`</${name}[\\t\\n\\f\\r />]`, 'gi');
      end.lastIndex = tokens.lastIndex;
      const found = end.exec(html);
      if (!found) break;
      tokens.lastIndex = found.index;
    }
    const voidTags = [
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ];
    if (!voidTags.includes(name)) {
      stack.push({ name, shell, inactive });
    }
  }
  return {
    entry: entries.length === 1 ? (entries[0] ?? null) : null,
    bootErrorHidden: notices === 1 && hiddenNotices === 1,
    shellDisabled: shellCount === 1 && shellButtons > 0 && enabledButtons === 0 && inert === 0,
    shellButtons,
  };
}

function redact(text: string, secret?: string): string {
  if (secret) {
    for (const value of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]) {
      text = text.split(value).join('[REDACTED]');
    }
  }
  return text;
}

export function serializeReceipt(receipt: VerificationReceipt, secret?: string): string {
  const serialized = JSON.stringify(
    receipt,
    (_key, value: unknown) => (typeof value === 'string' ? redact(value, secret) : value),
    2,
  );
  return `${serialized}\n`;
}

interface Sample {
  status: number;
  headers: Headers;
  body: Uint8Array;
}

async function sample(url: URL, secret: string | undefined, method = 'GET'): Promise<Sample> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const headers = new Headers({ 'Cache-Control': 'no-cache' });
    if (secret) headers.set('x-vercel-protection-bypass', secret);
    if (method === 'POST') headers.set('Content-Type', 'application/json');
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? '{}' : undefined,
      redirect: 'manual',
      credentials: 'omit',
      signal: controller.signal,
    });
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body?.getReader();
    if (reader) {
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 8 * 1024 * 1024) {
            controller.abort();
            throw new Error('Response exceeds verifier byte limit.');
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    return { status: response.status, headers: response.headers, body: Buffer.concat(chunks) };
  } finally {
    clearTimeout(timer);
  }
}

function parsed(sample: Sample): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(sample.body));
  } catch {
    return null;
  }
}

function jsonObject(sample: Sample | null): boolean {
  return (
    sample?.status === 200 &&
    /^application\/(?:[\w.+-]+\+)?json\b/i.test(sample.headers.get('content-type') ?? '') &&
    object(parsed(sample))
  );
}

export async function verifyDeployment(options: VerifyOptions, config: unknown, secret?: string) {
  const expected = expectedDocumentHeaders(config);
  const helperScriptHeaders = expectedHelperScriptHeaders(config);
  const expectedIndex = options.expectIndex ? digest(await readFile(options.expectIndex)) : null;
  const checks: Check[] = [];
  const startedAt = new Date().toISOString();
  const record = (name: string, pass: boolean, measured: Check['measured'] = {}) => {
    checks.push({ name, pass, measured });
  };
  const get = async (pathname: string, label: string, method = 'GET'): Promise<Sample | null> => {
    try {
      return await sample(new URL(pathname, options.url), secret, method);
    } catch {
      // Fetch errors and server bodies may reflect credentials. Emit only fixed labels.
      record(label, false, { transportFailure: true });
      return null;
    }
  };
  const home = await get('/', 'GET / transport');
  record('GET / 200', home?.status === 200, { status: home?.status ?? null });
  let entry: string | null = null;
  if (home) {
    checks.push(...compareDocumentHeaders(home.headers, expected));
    record(
      'No deployment challenge',
      !home.headers.has('x-vercel-mitigated') &&
        !home.headers.has('x-vercel-challenge') &&
        !home.headers.has('x-vercel-challenge-token'),
    );
    record('Served index identity', expectedIndex === null || digest(home.body) === expectedIndex, {
      sha256: digest(home.body),
      expectedSha256: expectedIndex,
      compared: expectedIndex !== null,
    });
    try {
      const html = inspectHtml(new TextDecoder().decode(home.body));
      entry = html.entry;
      record('Exactly one local entry chunk', entry !== null);
      record('Boot error initially hidden', html.bootErrorHidden);
      record('Shell buttons disabled without inert', html.shellDisabled, { buttons: html.shellButtons });
    } catch {
      record('Emitted HTML structure', false);
    }
  }
  for (const pathname of exposurePaths) {
    const result = await get(pathname, `Exposure ${pathname} transport`);
    record(`Exposure ${pathname} 404`, result?.status === 404, { status: result?.status ?? null });
  }
  if (entry) {
    const map = await get(`${entry}.map`, `Exposure ${entry}.map transport`);
    const absent =
      map?.status === 403
        ? await get(`/assets/p100-absent-${randomUUID()}.js.map`, 'Absent sourcemap transport')
        : null;
    record(`Exposure ${entry}.map not served`, sourcemapNotServed(map, absent), {
      status: map?.status ?? null,
      absentStatus: absent?.status ?? null,
    });
  } else record('Entry sourcemap exposure', false, { entryMissing: true });
  const security = await get('/.well-known/security.txt', 'Security contact transport');
  record(
    'Security contact 200 text/plain',
    security?.status === 200 && /^text\/plain\b/.test(security.headers.get('content-type') ?? ''),
    { status: security?.status ?? null },
  );
  for (const pathname of ['/sw.js', '/pwa-assets.json']) {
    const result = await get(pathname, `${pathname} transport`);
    record(`${pathname} 200`, result?.status === 200, {
      status: result?.status ?? null,
      sha256: result ? digest(result.body) : null,
    });
    if (pathname === '/pwa-assets.json') {
      const value = result ? parsed(result) : null;
      const version =
        object(value) && typeof value.version === 'string' && /^[a-f0-9]{64}$/.test(value.version)
          ? value.version
          : null;
      record('PWA manifest JSON and version', version !== null, { version });
    }
  }
  const nonces: Array<string | null> = [];
  for (const pathname of ['/__/auth/handler', '/__/auth/iframe']) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await get(pathname, `${pathname} ${attempt} transport`);
      const nonce = result ? helperNonce(result.headers) : null;
      nonces.push(nonce);
      record(
        `${pathname} ${attempt}: 200 with one nonce CSP and self framing`,
        result?.status === 200 && nonce !== null,
        { status: result?.status ?? null, nonceLength: nonce?.length ?? null },
      );
      record(
        `${pathname} ${attempt}: private cache and SAMEORIGIN`,
        result?.headers.get('x-frame-options') === 'SAMEORIGIN' &&
          result.headers.get('cache-control') === 'private, no-store, max-age=0',
      );
      record(
        `${pathname} ${attempt}: CSP reports to /api/csp-report`,
        Boolean(result && reportsCspViolations(result.headers)),
      );
    }
  }
  record('Four fresh auth-helper nonces', freshNonces(nonces), { requests: nonces.length });
  // Vercel compiles header sources with path-to-regexp, so only the deployment proves the narrowed /__/auth/ exclusion:
  // an unknown helper path gets the 404 page with the main document headers, and handler.js, an external rewrite to
  // Firebase Hosting, gets its own rule's headers and none of the main document's.
  const unknownAuth = await get('/__/auth/unknown', '/__/auth/unknown transport');
  record('/__/auth/unknown 404', unknownAuth?.status === 404, {
    status: unknownAuth?.status ?? null,
    sha256: unknownAuth ? digest(unknownAuth.body) : null,
  });
  if (unknownAuth) checks.push(...compareHeaders(unknownAuth.headers, expected, '/__/auth/unknown'));
  const helperScript = await get('/__/auth/handler.js', '/__/auth/handler.js transport');
  record(
    '/__/auth/handler.js 200 JavaScript',
    helperScript?.status === 200 &&
      /^(?:text|application)\/javascript\b/i.test(helperScript.headers.get('content-type') ?? ''),
    { status: helperScript?.status ?? null, bytes: helperScript?.body.length ?? 0 },
  );
  if (helperScript) {
    checks.push(...compareHeaders(helperScript.headers, helperScriptHeaders, '/__/auth/handler.js'));
    record(
      '/__/auth/handler.js without main document headers',
      !helperScript.headers.has('cross-origin-opener-policy') && !helperScript.headers.has('reporting-endpoints'),
    );
  }
  for (const pathname of ['/__/auth/handler', '/api/catalog']) {
    const result = await get(pathname, `${pathname} POST transport`, 'POST');
    record(`POST ${pathname} 405`, result?.status === 405, { status: result?.status ?? null });
    if (pathname === '/__/auth/handler') {
      record('Auth helper Allow GET, HEAD', result?.headers.get('allow') === 'GET, HEAD');
    }
  }
  const ftg = await get('/api/catalog?source=freetogame&q=zelda', 'FreeToGame transport');
  record('FreeToGame 200 JSON', jsonObject(ftg), { status: ftg?.status ?? null });
  const catalog = await get('/api/catalog?q=zelda', 'Wikidata transport');
  const value = catalog ? parsed(catalog) : null;
  const items = object(value) && Array.isArray(value.items) ? value.items.filter(object) : [];
  const wikidata = items.filter((item) => typeof item.id === 'string' && /^wikidata:Q\d+$/.test(item.id));
  record('Wikidata search 200 JSON with items', jsonObject(catalog) && wikidata.length > 0, {
    status: catalog?.status ?? null,
    items: items.length,
    wikidataItems: wikidata.length,
  });
  const id = wikidata[0]?.id;
  const detail =
    typeof id === 'string'
      ? await get(`/api/catalog-detail?id=${encodeURIComponent(id)}`, 'Catalog detail transport')
      : null;
  record('Wikidata detail 200 JSON', jsonObject(detail), { status: detail?.status ?? null });
  const chunk = entry ? await get(entry, 'Entry chunk transport') : null;
  const literals = entryLiteralCounts(chunk ? new TextDecoder().decode(chunk.body) : '');
  record(
    'Entry chunk excludes whole-env literals',
    chunk?.status === 200 && !literals.baseUrl && !literals.vercelEnv && !literals.wholeEnv,
    { ...literals, bytes: chunk?.body.length ?? 0, sha256: chunk ? digest(chunk.body) : null },
  );
  return {
    url: options.url,
    startedAt,
    finishedAt: new Date().toISOString(),
    passed: checks.every((check) => check.pass),
    checks,
  };
}

async function main() {
  const options = parseVerifyArguments(process.argv.slice(2));
  const secret = options.bypassEnv ? process.env[options.bypassEnv] : undefined;
  if (options.bypassEnv && (!secret || /[\r\n]/.test(secret))) {
    throw new Error('Bypass credential is missing or invalid.');
  }
  const config: unknown = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const receipt = await verifyDeployment(options, config, secret);
  const safe = serializeReceipt(receipt, secret);
  if (options.json) await writeFile(options.json, safe, { flag: 'wx' });
  for (const check of receipt.checks) {
    const row = `${check.pass ? 'PASS' : 'FAIL'} | ${check.name} | ${JSON.stringify(check.measured)}`;
    console.log(redact(row, secret));
  }
  const passed = receipt.checks.filter((check) => check.pass).length;
  console.log(`${receipt.passed ? 'PASS' : 'FAIL'} | ${passed}/${receipt.checks.length}`);
  if (!receipt.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    console.error(
      'FAIL | Verification could not complete. Check arguments, local inputs, credential setup and output path.',
    );
    process.exitCode = 1;
  });
}

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function parseVerifyArguments(args: string[]): VerifyOptions {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (
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

export function expectedDocumentHeaders(config: unknown): Record<string, string> {
  if (!object(config) || !Array.isArray(config.headers)) throw new Error('Invalid Vercel header configuration.');
  const groups = config.headers.filter((group: unknown) => object(group) && group.source === '/((?!__/auth/).*)');
  if (groups.length !== 1 || !object(groups[0]) || !Array.isArray(groups[0].headers)) {
    throw new Error('Expected exactly one non-auth document header group.');
  }
  const result: Record<string, string> = {};
  for (const entry of groups[0].headers) {
    if (!object(entry) || typeof entry.key !== 'string' || typeof entry.value !== 'string') {
      throw new Error('Invalid document header entry.');
    }
    const name = entry.key.toLowerCase();
    if (Object.hasOwn(result, name)) throw new Error('Duplicate document header declaration.');
    result[name] = entry.value;
  }
  if (securityHeaders.some((name) => !result[name])) throw new Error('A required security header is missing.');
  return result;
}

export function compareDocumentHeaders(actual: Headers, expected: Record<string, string>): Check[] {
  const checks: Check[] = Object.entries(expected).map(([name, value]) => ({
    name: `Document header ${name}`,
    pass: actual.get(name) === value,
    measured: {
      expectedSha256: digest(value),
      actualSha256: actual.has(name) ? digest(actual.get(name)!) : null,
    },
  }));
  const csp = actual.get('content-security-policy') ?? '';
  checks.push({
    name: 'CSP excludes firebaseinstallations',
    pass: Boolean(csp) && !/firebaseinstallations/i.test(csp),
    measured: { present: /firebaseinstallations/i.test(csp) },
  });
  return checks;
}

export function helperNonce(headers: Headers): string | null {
  const csp = headers.get('content-security-policy') ?? '';
  const nonces = [...csp.matchAll(/'nonce-([A-Za-z0-9+/]{22}==|[A-Za-z0-9+/]{23}=|[A-Za-z0-9+/]{24})'/g)];
  if (csp.includes(',') || nonces.length !== 1 || !/(?:^|;)\s*frame-ancestors 'self'\s*(?:;|$)/.test(csp)) return null;
  return nonces[0][1];
}

export function freshNonces(values: readonly (string | null)[]): boolean {
  return values.length >= 2 && values.every((value) => Boolean(value)) && new Set(values).size === values.length;
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
  for (const token of html.matchAll(tokens)) {
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
    let rest = token[2].trim().replace(/\/$/, '').trim();
    while (rest) {
      const attr = /^([^\s=/'"<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(rest);
      if (!attr || attrs.has(attr[1].toLowerCase())) throw new Error('Malformed HTML attributes.');
      attrs.set(attr[1].toLowerCase(), attr[2] ?? attr[3] ?? attr[4] ?? '');
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
    if (['script', 'style', 'textarea', 'title'].includes(name)) raw = name;
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
    entry: entries.length === 1 ? entries[0] : null,
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
  for (const pathname of [...exposurePaths, ...(entry ? [`${entry}.map`] : [])]) {
    const result = await get(pathname, `Exposure ${pathname} transport`);
    record(`Exposure ${pathname} 404`, result?.status === 404, { status: result?.status ?? null });
  }
  if (!entry) record('Entry sourcemap exposure', false, { entryMissing: true });
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
    }
  }
  record('Four fresh auth-helper nonces', freshNonces(nonces), { requests: nonces.length });
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

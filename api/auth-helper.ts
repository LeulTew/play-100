import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Serves the Firebase Auth redirect helper documents (/__/auth/handler and /__/auth/iframe) on the app
// origin with a fresh CSP nonce per response. The JS helper paths stay plain vercel.json rewrites.
export const AUTH_HELPER_UPSTREAM = 'https://play100-online-48823b32.firebaseapp.com';
export const AUTH_HELPER_PAGES = ['handler', 'iframe'] as const;
export type AuthHelperPage = typeof AUTH_HELPER_PAGES[number];
export const AUTH_HELPER_TEMPLATE_NONCE = 'firebase-auth-helper';
export const AUTH_HELPER_MAX_BYTES = 256 * 1024;
export const AUTH_HELPER_TIMEOUT_MS = 5000;

const NONCE_ATTRIBUTE = `nonce="${AUTH_HELPER_TEMPLATE_NONCE}"`;
const POST_BODY_PLACEHOLDER = '{{POST_BODY}}';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function authHelperCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://apis.google.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com",
    "frame-src 'self' https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
    "form-action 'self' https://accounts.google.com",
  ].join('; ');
}

const ERROR_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) found.push(index);
  return found;
}

export interface TemplateCounts { attributes: number; literals: number; nonceAttributes: number; placeholders: number }

export function templateCounts(html: string): TemplateCounts {
  return {
    attributes: occurrences(html, NONCE_ATTRIBUTE).length,
    literals: occurrences(html, AUTH_HELPER_TEMPLATE_NONCE).length,
    nonceAttributes: html.match(/nonce\s*=/gi)?.length ?? 0,
    placeholders: occurrences(html, '{{').length,
  };
}

// Fail closed unless the template has exactly the structure the parent's capture recorded: every nonce literal is
// the one attribute value, no other nonce attribute exists, and the only `{{` is the handler's GET POST_BODY slot.
export function rewriteTemplateNonce(html: string, page: AuthHelperPage, nonce: string): string | null {
  const counts = templateCounts(html);
  if (counts.attributes < 1 || counts.literals !== counts.attributes || counts.nonceAttributes !== counts.attributes) return null;
  const placeholders = occurrences(html, '{{');
  if (page === 'iframe' ? placeholders.length !== 0
    : placeholders.length > 1 || placeholders.some(index => !html.startsWith(POST_BODY_PLACEHOLDER, index))) return null;
  return html.split(NONCE_ATTRIBUTE).join(`nonce="${nonce}"`);
}

function baseHeaders(response: ServerResponse): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('CDN-Cache-Control', 'no-store');
  response.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}

function sendText(request: IncomingMessage, response: ServerResponse, status: number, body: string): void {
  if (response.destroyed) return;
  const bytes = Buffer.from(body, 'utf8');
  response.setHeader('Content-Security-Policy', ERROR_CSP);
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Content-Length', String(bytes.byteLength));
  response.writeHead(status).end(request.method === 'HEAD' ? undefined : bytes);
}

class HelperFailure extends Error {
  constructor(readonly status: 502 | 504, readonly detail: Record<string, number | string>) { super('auth helper upstream failure'); }
}

async function readCapped(upstream: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (Number(upstream.headers.get('content-length')) > AUTH_HELPER_MAX_BYTES) {
    await upstream.body?.cancel().catch(() => undefined);
    throw new HelperFailure(502, { reason: 'too-large' });
  }
  if (!upstream.body) throw new HelperFailure(502, { reason: 'empty' });
  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > AUTH_HELPER_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new HelperFailure(502, { reason: 'too-large' });
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function allowedRedirect(location: string | null): string | null {
  if (!location) return null;
  let target: URL;
  try { target = new URL(location, AUTH_HELPER_UPSTREAM); } catch { return null; }
  if (target.origin !== AUTH_HELPER_UPSTREAM || target.username || target.password || !target.pathname.startsWith('/__/auth/')) return null;
  return `${target.pathname}${target.search}`;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  baseHeaders(response);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Firebase Hosting reflects a POST body into the nonced handler script; this app's providers return via GET.
    response.setHeader('Allow', 'GET, HEAD');
    sendText(request, response, 405, 'Only GET and HEAD are supported for this sign-in helper.\n');
    return;
  }
  const url = new URL(request.url ?? '/', 'https://play-100-collection.vercel.app');
  const pages = url.searchParams.getAll('page');
  const page = pages.length === 1 ? pages[0] : null;
  if (!AUTH_HELPER_PAGES.includes(page as AuthHelperPage)) {
    sendText(request, response, 404, 'Not found.\n');
    return;
  }
  const helper = page as AuthHelperPage;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new HelperFailure(504, { reason: 'timeout' })), AUTH_HELPER_TIMEOUT_MS);
  const disconnect = () => { if (!response.writableEnded) controller.abort(); };
  request.once('aborted', disconnect);
  response.once('close', disconnect);
  try {
    // A fixed upstream URL: no client query, cookies, authorization or other request headers are forwarded.
    const upstream = await fetch(`${AUTH_HELPER_UPSTREAM}/__/auth/${helper}`, {
      method: 'GET', headers: { Accept: 'text/html' }, redirect: 'manual', credentials: 'omit', signal: controller.signal,
    });
    if (REDIRECT_STATUSES.has(upstream.status)) {
      await upstream.body?.cancel().catch(() => undefined);
      const location = allowedRedirect(upstream.headers.get('location'));
      if (!location) throw new HelperFailure(502, { reason: 'redirect', status: upstream.status });
      if (response.destroyed) return;
      response.setHeader('Location', location);
      sendText(request, response, upstream.status, 'Redirecting.\n');
      return;
    }
    const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (upstream.status !== 200 || contentType !== 'text/html') {
      await upstream.body?.cancel().catch(() => undefined);
      throw new HelperFailure(502, { reason: 'status', status: upstream.status });
    }
    const bytes = await readCapped(upstream, controller.signal);
    let html: string;
    try { html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new HelperFailure(502, { reason: 'encoding' }); }
    const nonce = randomBytes(16).toString('base64');
    const rewritten = rewriteTemplateNonce(html, helper, nonce);
    if (rewritten === null) throw new HelperFailure(502, { reason: 'drift', page: helper, ...templateCounts(html) });
    if (response.destroyed) return;
    const body = Buffer.from(rewritten, 'utf8');
    response.setHeader('Content-Security-Policy', authHelperCsp(nonce));
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Length', String(body.byteLength));
    response.writeHead(200).end(request.method === 'HEAD' ? undefined : body);
  } catch (error: unknown) {
    if (response.destroyed) return;
    const failure = error instanceof HelperFailure ? error
      : controller.signal.reason instanceof HelperFailure ? controller.signal.reason
        : new HelperFailure(502, { reason: 'unreachable' });
    console.warn('Auth helper upstream refused.', { page: helper, status: failure.status, ...failure.detail });
    sendText(request, response, failure.status, failure.status === 504
      ? 'The sign-in helper took too long to load. Please try again.\n'
      : 'The sign-in helper is unavailable. Please try again later.\n');
  } finally {
    clearTimeout(timeout);
    request.removeListener('aborted', disconnect);
    response.removeListener('close', disconnect);
  }
}

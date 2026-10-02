import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createAdmission } from './_lib/admission.js';
import type { AdmissionLimits } from './_lib/admission.js';

// Serves the Firebase Auth redirect helper documents (/__/auth/handler and /__/auth/iframe) on the app
// origin with a fresh CSP nonce per response. The JS helper paths stay plain vercel.json rewrites.
export const AUTH_HELPER_UPSTREAM = 'https://play100-online-48823b32.firebaseapp.com';
export const AUTH_HELPER_PAGES = ['handler', 'iframe'] as const;
export type AuthHelperPage = (typeof AUTH_HELPER_PAGES)[number];
export const AUTH_HELPER_TEMPLATE_NONCE = 'firebase-auth-helper';
export const AUTH_HELPER_MAX_BYTES = 256 * 1024;
export const AUTH_HELPER_TIMEOUT_MS = 5000;
// Every user gets the same helper template, which upstream serves with Cache-Control: max-age=1800. Each instance
// keeps the last validated template per page and refreshes it once it is older than the TTL, one refresh per page at a
// time. If a refresh fails, the instance keeps serving that template until it is as old as upstream's max-age, and
// the next refresh waits for the backoff; without a usable template, the failure is repeated until then.
export const AUTH_HELPER_TEMPLATE_TTL_MS = 10 * 60_000;
export const AUTH_HELPER_TEMPLATE_MAX_AGE_MS = 30 * 60_000;
export const AUTH_HELPER_REFRESH_BACKOFF_MS = 15_000;
// Per-instance, and taken only by an upstream refresh. Refreshes are shared per page and spaced by the TTL or the
// backoff, so this is a backstop that page loads never reach. The WAF rule is the global limit.
export const AUTH_HELPER_ADMISSION = { maxActive: 8, maxPerWindow: 120, windowMs: 60_000 };
export const AUTH_HELPER_RETRY_AFTER_SECONDS = 15;

const NONCE_ATTRIBUTE = `nonce="${AUTH_HELPER_TEMPLATE_NONCE}"`;
const POST_BODY_PLACEHOLDER = '{{POST_BODY}}';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// The helper documents report CSP violations to the same first-party endpoint as the main document (vercel.json), which
// keeps only the directive, the blocked origin and the route template (/__/auth/handler or /__/auth/iframe).
export const AUTH_HELPER_REPORTING_ENDPOINTS = 'csp="/api/csp-report"';

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
    'report-to csp',
    'report-uri /api/csp-report',
  ].join('; ');
}

function setHelperPolicy(response: ServerResponse, nonce: string): void {
  response.setHeader('Content-Security-Policy', authHelperCsp(nonce));
  response.setHeader('Reporting-Endpoints', AUTH_HELPER_REPORTING_ENDPOINTS);
}

const ERROR_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length))
    found.push(index);
  return found;
}

export interface TemplateCounts {
  attributes: number;
  literals: number;
  nonceAttributes: number;
  placeholders: number;
}

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
export function templateMatches(html: string, page: AuthHelperPage): boolean {
  const counts = templateCounts(html);
  if (counts.attributes < 1 || counts.literals !== counts.attributes || counts.nonceAttributes !== counts.attributes)
    return false;
  const placeholders = occurrences(html, '{{');
  return page === 'iframe'
    ? placeholders.length === 0
    : placeholders.length <= 1 && placeholders.every((index) => html.startsWith(POST_BODY_PLACEHOLDER, index));
}

export function rewriteTemplateNonce(html: string, page: AuthHelperPage, nonce: string): string | null {
  return templateMatches(html, page) ? html.split(NONCE_ATTRIBUTE).join(`nonce="${nonce}"`) : null;
}

function baseHeaders(response: ServerResponse): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('CDN-Cache-Control', 'no-store');
  response.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), display-capture=()',
  );
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
  constructor(
    readonly status: 502 | 504,
    readonly detail: Record<string, number | string>,
  ) {
    super('auth helper upstream failure');
  }
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
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function allowedRedirect(location: string | null): string | null {
  if (!location) return null;
  let target: URL;
  try {
    target = new URL(location, AUTH_HELPER_UPSTREAM);
  } catch {
    return null;
  }
  if (
    target.origin !== AUTH_HELPER_UPSTREAM ||
    target.username ||
    target.password ||
    !target.pathname.startsWith('/__/auth/')
  )
    return null;
  return `${target.pathname}${target.search}`;
}

type Refresh =
  | { kind: 'template'; html: string }
  | { kind: 'redirect'; status: number; location: string }
  | { kind: 'failure'; failure: HelperFailure }
  | { kind: 'busy' };

interface PageCache {
  template: { html: string; fetchedAt: number } | null;
  refresh: Promise<Refresh> | null;
  /** The last refresh's redirect or failure and when it came, repeated without an upstream request for the backoff. */
  held: { result: Extract<Refresh, { kind: 'redirect' | 'failure' }>; at: number } | null;
}

/** One helper instance with its own template cache, admission and clock; the default export is the deployed one. */
export function createAuthHelperHandler({
  admission: limits = AUTH_HELPER_ADMISSION,
  now = () => Date.now(),
}: { admission?: AdmissionLimits; now?: () => number } = {}) {
  const admission = createAdmission(limits, now);
  const pages: Record<AuthHelperPage, PageCache> = {
    handler: { template: null, refresh: null, held: null },
    iframe: { template: null, refresh: null, held: null },
  };

  async function refreshTemplate(page: AuthHelperPage): Promise<Refresh> {
    // Only an upstream request takes a slot.
    const release = admission.acquire();
    if (!release) return { kind: 'busy' };
    const cache = pages[page];
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new HelperFailure(504, { reason: 'timeout' })),
      AUTH_HELPER_TIMEOUT_MS,
    );
    try {
      // A fixed upstream URL: no client query, cookies, authorization or other request headers are forwarded.
      const upstream = await fetch(`${AUTH_HELPER_UPSTREAM}/__/auth/${page}`, {
        method: 'GET',
        headers: { Accept: 'text/html' },
        redirect: 'manual',
        credentials: 'omit',
        signal: controller.signal,
      });
      if (REDIRECT_STATUSES.has(upstream.status)) {
        await upstream.body?.cancel().catch(() => undefined);
        const location = allowedRedirect(upstream.headers.get('location'));
        if (!location) throw new HelperFailure(502, { reason: 'redirect', status: upstream.status });
        const redirect = { kind: 'redirect', status: upstream.status, location } as const;
        cache.held = { result: redirect, at: now() };
        return redirect;
      }
      const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (upstream.status !== 200 || contentType !== 'text/html') {
        await upstream.body?.cancel().catch(() => undefined);
        throw new HelperFailure(502, { reason: 'status', status: upstream.status });
      }
      const bytes = await readCapped(upstream, controller.signal);
      let html: string;
      try {
        html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw new HelperFailure(502, { reason: 'encoding' });
      }
      if (!templateMatches(html, page))
        throw new HelperFailure(502, { reason: 'drift', page, ...templateCounts(html) });
      cache.template = { html, fetchedAt: now() };
      cache.held = null;
      return { kind: 'template', html };
    } catch (error: unknown) {
      const failure =
        error instanceof HelperFailure
          ? error
          : controller.signal.reason instanceof HelperFailure
            ? controller.signal.reason
            : new HelperFailure(502, { reason: 'unreachable' });
      console.warn('Auth helper upstream refused.', { page, status: failure.status, ...failure.detail });
      const result = { kind: 'failure', failure } as const;
      cache.held = { result, at: now() };
      return result;
    } finally {
      release();
      clearTimeout(timeout);
    }
  }

  function sendTemplate(request: IncomingMessage, response: ServerResponse, page: AuthHelperPage, html: string) {
    if (response.destroyed) return;
    const nonce = randomBytes(16).toString('base64');
    const rewritten = rewriteTemplateNonce(html, page, nonce);
    if (rewritten === null) {
      sendText(request, response, 502, 'The sign-in helper is unavailable. Please try again later.\n');
      return;
    }
    const body = Buffer.from(rewritten, 'utf8');
    setHelperPolicy(response, nonce);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Length', String(body.byteLength));
    response.writeHead(200).end(body);
  }

  return async function handler(request: IncomingMessage, response: ServerResponse) {
    baseHeaders(response);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      // Firebase Hosting reflects a POST body into the nonced handler script; this app's providers return via GET.
      response.setHeader('Allow', 'GET, HEAD');
      sendText(request, response, 405, 'Only GET and HEAD are supported for this sign-in helper.\n');
      return;
    }
    const url = new URL(request.url ?? '/', 'https://play-100-collection.vercel.app');
    const pageParams = url.searchParams.getAll('page');
    const page = pageParams.length === 1 ? pageParams[0] : null;
    if (!AUTH_HELPER_PAGES.includes(page as AuthHelperPage)) {
      sendText(request, response, 404, 'Not found.\n');
      return;
    }
    const helper = page as AuthHelperPage;
    if (request.method === 'HEAD') {
      // HEAD describes the helper document without fetching it, so it costs no upstream request. Only the fetched
      // template determines the length, so Content-Length is omitted (RFC 9110 sections 8.6 and 9.3.2).
      setHelperPolicy(response, randomBytes(16).toString('base64'));
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.writeHead(200).end();
      return;
    }
    const cache = pages[helper];
    const time = now();
    const age = cache.template ? time - cache.template.fetchedAt : Number.POSITIVE_INFINITY;
    // A clock that moved backwards refreshes rather than trusting the copy's age.
    if (cache.template && age >= 0 && age < AUTH_HELPER_TEMPLATE_TTL_MS) {
      sendTemplate(request, response, helper, cache.template.html);
      return;
    }
    const usable = cache.template && age >= 0 && age < AUTH_HELPER_TEMPLATE_MAX_AGE_MS ? cache.template.html : null;
    const held = cache.held;
    let result: Refresh;
    // Like the copy's age, the backoff ends if the clock moved backwards.
    if (held && time >= held.at && time - held.at < AUTH_HELPER_REFRESH_BACKOFF_MS) result = held.result;
    else {
      // One refresh per page at a time serves everyone waiting. It is not aborted when one of them disconnects: the
      // others still need it, and the timeout bounds it.
      const refresh = (cache.refresh ??= refreshTemplate(helper).finally(() => {
        cache.refresh = null;
      }));
      result = await refresh;
    }
    if (response.destroyed) return;
    if (result.kind === 'template') sendTemplate(request, response, helper, result.html);
    else if (result.kind === 'redirect') {
      response.setHeader('Location', result.location);
      sendText(request, response, result.status, 'Redirecting.\n');
    } else if (usable) sendTemplate(request, response, helper, usable);
    else if (result.kind === 'busy') {
      response.setHeader('Retry-After', String(AUTH_HELPER_RETRY_AFTER_SECONDS));
      sendText(request, response, 429, 'The sign-in helper is busy. Please wait a few seconds and try again.\n');
    } else
      sendText(
        request,
        response,
        result.failure.status,
        result.failure.status === 504
          ? 'The sign-in helper took too long to load. Please try again.\n'
          : 'The sign-in helper is unavailable. Please try again later.\n',
      );
  };
}

export default createAuthHelperHandler();

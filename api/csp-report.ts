import { isIP } from 'node:net';
import { nullableObject } from '../src/lib/guards.js';
import type { Admission } from './_lib/admission.js';
import { createReportHandler } from './_lib/report-handler.js';
import { reportRouteTemplate } from '../src/lib/client-error-schema.js';

const MAX_BYTES = 16 * 1024;
const MAX_REPORTS = 16;
const ORIGIN = 'https://play-100-collection.vercel.app';
const diagnosticOrigins = new Set([
  ORIGIN,
  'https://apis.google.com',
  'https://accounts.google.com',
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://firestore.googleapis.com',
  'https://www.wikidata.org',
  'https://commons.wikimedia.org',
  'https://www.freetogame.com',
  'https://store.steampowered.com',
]);
const directives = new Set([
  'default-src',
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
  'img-src',
  'font-src',
  'media-src',
  'connect-src',
  'frame-src',
  'worker-src',
  'manifest-src',
  'object-src',
  'base-uri',
  'frame-ancestors',
  'form-action',
  'child-src',
  'upgrade-insecure-requests',
  'trusted-types',
  'require-trusted-types-for',
]);
export function reportRoute(value: unknown): string {
  if (typeof value !== 'string') return 'other';
  try {
    const url = new URL(value);
    if (url.origin !== ORIGIN || url.username || url.password) return 'other';
    return reportRouteTemplate(url.pathname);
  } catch {
    return 'other';
  }
}

export function blockedOrigin(value: unknown): string {
  if (value === 'inline' || value === 'eval') return value;
  if (typeof value !== 'string') return 'other';
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
      url.hostname === 'localhost' ||
      url.hostname.length > 253
    )
      return 'other';
    return diagnosticOrigins.has(url.origin) ? url.origin : 'other-origin';
  } catch {
    return 'other';
  }
}

export function cspCounts(input: unknown, batch: boolean) {
  const rows = batch ? input : [input];
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_REPORTS) throw new Error('Invalid CSP report count.');
  const counts = new Map<string, { directive: string; blockedOrigin: string; route: string; count: number }>();
  for (const value of rows) {
    const entry = nullableObject(value);
    const body = nullableObject(batch ? entry?.body : entry?.['csp-report']);
    if (!body || (batch && entry?.type !== 'csp-violation')) throw new Error('Invalid CSP report.');
    const directive = batch ? body.effectiveDirective : (body['effective-directive'] ?? body['violated-directive']);
    if (typeof directive !== 'string' || !directives.has(directive.split(' ')[0]!))
      throw new Error('Invalid CSP directive.');
    const row = {
      directive: directive.split(' ')[0]!,
      blockedOrigin: blockedOrigin(batch ? body.blockedURL : body['blocked-uri']),
      route: reportRoute(batch ? (body.documentURL ?? entry?.url) : body['document-uri']),
      count: 1,
    };
    const key = JSON.stringify([row.directive, row.blockedOrigin, row.route]);
    const prior = counts.get(key);
    if (prior) prior.count++;
    else counts.set(key, row);
  }
  return [...counts.values()];
}

export function createCspReportHandler(admission?: Admission, log?: (line: string) => void) {
  return createReportHandler({
    contentTypes: ['application/csp-report', 'application/reports+json'],
    maxBytes: MAX_BYTES,
    parse: (body, contentType) => cspCounts(body, contentType === 'application/reports+json'),
    entry: (counts) => ({ event: 'csp-count', counts }),
    errorEvent: 'csp-report-error',
    admission,
    log,
  });
}

export default createCspReportHandler();

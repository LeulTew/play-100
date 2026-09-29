import { nullableObject } from './guards.js';

export const CLIENT_ERROR_AREAS = ['app', 'route', 'online', 'chunk'] as const;
export type ClientErrorArea = (typeof CLIENT_ERROR_AREAS)[number];
export const CLIENT_ERROR_CLASSES = [
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'ModuleLoadFailure',
  'AbortError',
  'other',
] as const;
export const REPORT_ROUTES = [
  '/',
  '/index.html',
  '/my-games',
  '/my-library',
  '/my-rankings',
  '/discover',
  '/account',
  '/publish',
  '/community',
  '/creator',
  '/data-use',
  '/friends',
  '/friends/sharing',
  '/friends/sharing/games',
  '/invite',
  '/compare',
  '/pwa/offline.html',
  '/__/auth/handler',
  '/__/auth/iframe',
  '/u/:handle',
  '/friends/:uid',
  'other',
] as const;
export const MAX_CLIENT_ERRORS = 20;
export const CLIENT_REPORT_BYTES = 8 * 1024;
export type ClientErrorCount = {
  errorClass: (typeof CLIENT_ERROR_CLASSES)[number];
  area: ClientErrorArea;
  route: (typeof REPORT_ROUTES)[number];
  count: number;
};

export function reportRouteTemplate(pathname: string): ClientErrorCount['route'] {
  const known = REPORT_ROUTES.find((route) => route === pathname);
  if (known) return known;
  if (/^\/u\/[^/]+$/.test(pathname)) return '/u/:handle';
  if (/^\/friends\/[^/]+$/.test(pathname)) return '/friends/:uid';
  return 'other';
}

export function isBuildFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^entry:[A-Za-z0-9_-]{8,64}$/.test(value);
}

export function clientErrorCounts(input: unknown): { buildVersion: string; counts: ClientErrorCount[] } {
  const body = nullableObject(input);
  if (
    !body ||
    Object.keys(body).sort().join(',') !== 'buildVersion,counts' ||
    !isBuildFingerprint(body.buildVersion) ||
    !Array.isArray(body.counts) ||
    !body.counts.length ||
    body.counts.length > MAX_CLIENT_ERRORS
  )
    throw new Error('Invalid client error counts.');
  let total = 0;
  const counts = new Map<string, ClientErrorCount>();
  for (const value of body.counts) {
    const row = nullableObject(value);
    const errorClass = CLIENT_ERROR_CLASSES.find((item) => item === row?.errorClass);
    const area = CLIENT_ERROR_AREAS.find((item) => item === row?.area);
    const route = REPORT_ROUTES.find((item) => item === row?.route);
    if (
      !row ||
      Object.keys(row).sort().join(',') !== 'area,count,errorClass,route' ||
      !errorClass ||
      !area ||
      !route ||
      typeof row.count !== 'number' ||
      !Number.isSafeInteger(row.count) ||
      row.count < 1 ||
      (total += row.count) > MAX_CLIENT_ERRORS
    )
      throw new Error('Invalid client error count.');
    const key = JSON.stringify([errorClass, area, route]);
    const prior = counts.get(key);
    if (prior) prior.count += row.count;
    else counts.set(key, { errorClass, area, route, count: row.count });
  }
  return { buildVersion: body.buildVersion, counts: [...counts.values()] };
}

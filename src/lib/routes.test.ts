import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPORT_ROUTES, reportRouteTemplate } from './client-error-schema';
import { APP_ROUTES, appRoute } from './routes';
import { PAGE_PATHS, pageFromPath } from './url';

describe('the route manifest', () => {
  it('matches the pages vercel.json rewrites to index.html', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
      rewrites: { source: string; destination: string }[];
    };
    const rewritten = vercel.rewrites
      .filter((rewrite) => rewrite.destination === '/index.html')
      .map((rewrite) => rewrite.source)
      .sort();
    // index.html itself serves "/", so it needs no rewrite.
    const manifest = APP_ROUTES.map((route) => route.path)
      .filter((path) => path !== '/')
      .sort();
    expect(rewritten).toEqual(manifest);
  });

  it('routes every app page, and every page link targets a known route', () => {
    const pages = APP_ROUTES.flatMap((route) => (route.page ? [route.page] : [])).sort();
    expect(pages).toEqual(Object.keys(PAGE_PATHS).sort());
    for (const path of Object.values(PAGE_PATHS)) expect(appRoute(path), path).not.toBeNull();
    for (const route of APP_ROUTES) {
      const sample = route.path.replace(/:[a-z]+/g, 'value-1');
      expect(pageFromPath(sample), sample).toBe(route.page ?? 'collection');
      expect(reportRouteTemplate(sample), sample).toBe(route.path);
      expect(REPORT_ROUTES).toContain(route.path);
    }
  });

  it('matches exactly: parameters take one segment, and there is no case or slash folding', () => {
    expect(appRoute('/friends/sharing')?.page).toBe('friend-sharing');
    expect(appRoute('/friends/someone')?.page).toBe('friend');
    for (const path of ['/friends/a/b', '/u/', '/ACCOUNT', '/discover/', '/settings', '']) {
      expect(appRoute(path), path).toBeNull();
    }
  });

  it('keeps the router, report and friend-id rules the app had before the manifest', () => {
    expect(pageFromPath('/discover///')).toBe('discover');
    expect(pageFromPath('/friends/bad!id')).toBe('collection');
    expect(pageFromPath(`/friends/${'a'.repeat(129)}`)).toBe('collection');
    expect(pageFromPath('/data-use')).toBe('collection');
    expect(reportRouteTemplate('/friends/bad!id')).toBe('/friends/:uid');
    expect(reportRouteTemplate('/discover/')).toBe('other');
    expect(reportRouteTemplate('/pwa/offline.html')).toBe('/pwa/offline.html');
    expect(reportRouteTemplate('/__/auth/iframe')).toBe('/__/auth/iframe');
  });
});

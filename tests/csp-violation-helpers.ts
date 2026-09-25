import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { mainDocumentPolicy } from '../scripts/first-paint/csp';

/** The main-document policy exactly as vercel.json serves it. */
export const productionPolicy = mainDocumentPolicy(
  JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')),
);

/**
 * The Firebase authDomain the served build was configured with, read from its public config in the
 * built bundle (`dist/assets/*.js`, the directory the local preview serves); null for an offline build.
 * The minifier may quote the value with `"`, `'` or a template literal's backtick; the same delimiter
 * must close it.
 */
export function builtAuthDomain(root = path.join(process.cwd(), 'dist')): string | null {
  const assets = path.join(root, 'assets');
  if (!existsSync(assets)) return null;
  const found = new Set<string>();
  for (const name of readdirSync(assets).filter((file) => file.endsWith('.js'))) {
    for (const match of readFileSync(path.join(assets, name), 'utf8').matchAll(
      /["'`]?VITE_FIREBASE_AUTH_DOMAIN["'`]?\s*:\s*(["'`])([^"'`]+)\1/g,
    ))
      found.add(match[2]!);
  }
  if (found.size > 1) throw new Error(`The built bundle names more than one authDomain: ${[...found].join(', ')}`);
  return [...found][0] ?? null;
}

/** The built authDomain's origin when the test runs on another origin; null offline or on the authDomain. */
export function localAuthOrigin(origin: string, authDomain = builtAuthDomain()): string | null {
  const helper = authDomain === null ? null : `https://${authDomain}`;
  return helper === origin ? null : helper;
}

/**
 * The single local-origin equivalence. Production serves the app on its authDomain, so frame-src 'self'
 * admits Firebase Auth's /__/auth/iframe. A local preview on another origin is served the exact same
 * policy, so it blocks that now cross-origin iframe just as production blocks any non-self frame, and
 * nothing is fetched from the production deployment. The resulting report is the only one ignored: a
 * frame-src (or its child-src fallback) report, from the securitypolicyviolation recorder or the console,
 * whose blocked URL is on `helper` (from localAuthOrigin). With no helper (an offline build, or a run on
 * the authDomain itself) nothing is ignored.
 */
export function isLocalAuthFrameReport(entry: string, helper: string | null): boolean {
  if (helper === null) return false;
  const recorded = /^\S+ (?:frame|child)-src (\S+) /.exec(entry)?.[1];
  const blocked = recorded ?? /^Refused to frame '([^']+)' because it violates .*"(?:frame|child)-src/.exec(entry)?.[1];
  if (blocked === undefined) return false;
  try {
    return new URL(blocked).origin === helper;
  } catch {
    return false;
  }
}

const storageKey = 'p100.csp-violations';

/**
 * Records every `<style>` element added to a document except the Vite development server's CSS
 * injection (`data-vite-dev-id`). The strict production style-src blocks any such element, so on a
 * development server, where Vite itself injects CSS, this stands in for the style-src-elem half.
 */
export async function recordStyleElements(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    new MutationObserver((records) => {
      const added = records
        .flatMap((record) => Array.from(record.addedNodes))
        .filter((node): node is Element => node instanceof Element);
      for (const node of added.flatMap((element) => [element, ...Array.from(element.querySelectorAll('style'))])) {
        if (!(node instanceof HTMLStyleElement) || node.hasAttribute('data-vite-dev-id')) continue;
        const entry = `${location.pathname} <style> element ${(node.textContent ?? '').slice(0, 60)}`;
        try {
          sessionStorage.setItem(
            key,
            JSON.stringify([...(JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[]), entry]),
          );
        } catch {
          document.documentElement.dataset.cspViolation = entry;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  }, storageKey);
}

/**
 * Replaces the CSP of `origin`'s documents with `policy` while they stay real network responses:
 * Chromium's Fetch domain pauses each document response and continues it with the edited headers,
 * instead of Playwright fulfilling it. A fulfilled document loses its network identity, so Chrome's
 * Local Network Access checks then block its loopback subresources (the Auth emulator's iframe).
 * Other origins' documents, such as the emulator's own sign-in page, are not paused.
 */
async function replaceDocumentPolicy(page: Page, policy: string, origin: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Fetch.requestPaused', (event) => {
    const own =
      event.resourceType === 'Document' &&
      new URL(event.request.url).origin === origin &&
      event.responseStatusCode !== undefined &&
      !event.responseErrorReason;
    const headers = (event.responseHeaders ?? []).filter(
      (header) => header.name.toLowerCase() !== 'content-security-policy',
    );
    void (
      own
        ? cdp.send('Fetch.continueResponse', {
            requestId: event.requestId,
            responseCode: event.responseStatusCode,
            responseHeaders: [...headers, { name: 'Content-Security-Policy', value: policy }],
          })
        : cdp.send('Fetch.continueRequest', { requestId: event.requestId })
    ).catch(() => undefined);
  });
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: `${origin}/*`, resourceType: 'Document', requestStage: 'Response' }],
  });
}

/**
 * Serves every same-origin document with `policy` (the local preview sends no CSP; pass null against a
 * deployment, which sends its real headers) and records each securitypolicyviolation from before any
 * page script runs. Reports persist in sessionStorage, so documents left by navigation or an auth
 * redirect still count; console CSP reports are collected too. read() leaves out only the local-origin
 * authDomain frame report (isLocalAuthFrameReport); authDomainContacts() counts requests that reached
 * the authDomain from another origin, which the exact policy keeps at 0. `network: 'continue'` edits
 * the real document responses over CDP rather than fulfilling them; use it wherever the page loads loopback
 * cross-origin resources (the emulator suites).
 */
export async function recordViolations(
  page: Page,
  policy: string | null,
  origin: string,
  { network = 'fulfill' }: { network?: 'fulfill' | 'continue' } = {},
): Promise<{ read: () => Promise<string[]>; authDomainContacts: () => number }> {
  const reports: string[] = [];
  const helper = localAuthOrigin(origin);
  let authDomainContacts = 0;
  page.on('console', (message) => {
    if (/Content Security Policy|violates the following/i.test(message.text()))
      reports.push(message.text().slice(0, 300));
  });
  // A request to the authDomain counts once it reaches the network: finished, or failed for any reason
  // but the policy blocking it.
  const onAuthDomain = (url: string) => helper !== null && new URL(url).origin === helper;
  page.on('requestfinished', (request) => {
    if (onAuthDomain(request.url())) authDomainContacts += 1;
  });
  page.on('requestfailed', (request) => {
    if (onAuthDomain(request.url()) && !/ERR_BLOCKED_BY_CSP/.test(request.failure()?.errorText ?? ''))
      authDomainContacts += 1;
  });
  await page.addInitScript((key) => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const entry = `${location.pathname} ${event.effectiveDirective} ${event.blockedURI || '(inline)'} ${event.sample.slice(0, 60)}`;
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify([...(JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[]), entry]),
        );
      } catch {
        document.documentElement.dataset.cspViolation = entry;
      }
    });
  }, storageKey);
  if (policy !== null && network === 'continue') await replaceDocumentPolicy(page, policy, origin);
  else if (policy !== null) {
    await page.route(
      (url) => url.origin === origin,
      async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        const headers = Object.fromEntries(
          Object.entries(response.headers()).filter(
            ([name]) => !['content-encoding', 'content-length', 'content-security-policy'].includes(name),
          ),
        );
        await route.fulfill({ response, headers: { ...headers, 'content-security-policy': policy } });
      },
    );
  }
  const read = async () => {
    const recorded = await page.evaluate((key) => {
      const fallback = document.documentElement.dataset.cspViolation;
      return [...(JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[]), ...(fallback ? [fallback] : [])];
    }, storageKey);
    return [...reports, ...recorded].filter((entry) => !isLocalAuthFrameReport(entry, helper));
  };
  return { read, authDomainContacts: () => authDomainContacts };
}

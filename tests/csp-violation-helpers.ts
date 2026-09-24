import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { mainDocumentPolicy } from '../scripts/first-paint/csp';

/** The main-document policy exactly as vercel.json serves it. */
export const productionPolicy = mainDocumentPolicy(JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')));

const storageKey = 'p100.csp-violations';

/**
 * Records every `<style>` element added to a document except the Vite development server's CSS
 * injection (`data-vite-dev-id`). The strict production style-src blocks any such element, so on a
 * development server, where Vite itself injects CSS, this stands in for the style-src-elem half.
 */
export async function recordStyleElements(page: Page): Promise<void> {
  await page.addInitScript(key => {
    new MutationObserver(records => {
      const added = records.flatMap(record => Array.from(record.addedNodes)).filter((node): node is Element => node instanceof Element);
      for (const node of added.flatMap(element => [element, ...Array.from(element.querySelectorAll('style'))])) {
        if (!(node instanceof HTMLStyleElement) || node.hasAttribute('data-vite-dev-id')) continue;
        const entry = `${location.pathname} <style> element ${(node.textContent ?? '').slice(0, 60)}`;
        try {
          sessionStorage.setItem(key, JSON.stringify([...JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[], entry]));
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
  cdp.on('Fetch.requestPaused', event => {
    const own = event.resourceType === 'Document' && new URL(event.request.url).origin === origin
      && event.responseStatusCode !== undefined && !event.responseErrorReason;
    const headers = (event.responseHeaders ?? []).filter(header => header.name.toLowerCase() !== 'content-security-policy');
    void (own
      ? cdp.send('Fetch.continueResponse', {
        requestId: event.requestId, responseCode: event.responseStatusCode,
        responseHeaders: [...headers, { name: 'Content-Security-Policy', value: policy }],
      })
      : cdp.send('Fetch.continueRequest', { requestId: event.requestId })
    ).catch(() => undefined);
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*`, resourceType: 'Document', requestStage: 'Response' }] });
}

/**
 * Serves every same-origin document with `policy` (the local preview sends no CSP; pass null against a
 * deployment, which sends its real headers) and records each securitypolicyviolation from before any
 * page script runs. Reports persist in sessionStorage, so documents left by navigation or an auth
 * redirect still count; console CSP reports are collected too. `network: 'continue'` edits the real
 * document responses over CDP rather than fulfilling them; use it wherever the page loads loopback
 * cross-origin resources (the emulator suites).
 */
export async function recordViolations(page: Page, policy: string | null, origin: string, { network = 'fulfill' }: { network?: 'fulfill' | 'continue' } = {}): Promise<{ read: () => Promise<string[]> }> {
  const reports: string[] = [];
  page.on('console', message => {
    if (/Content Security Policy|violates the following/i.test(message.text())) reports.push(message.text().slice(0, 300));
  });
  await page.addInitScript(key => {
    document.addEventListener('securitypolicyviolation', event => {
      const entry = `${location.pathname} ${event.effectiveDirective} ${event.blockedURI || '(inline)'} ${event.sample.slice(0, 60)}`;
      try {
        sessionStorage.setItem(key, JSON.stringify([...JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[], entry]));
      } catch {
        document.documentElement.dataset.cspViolation = entry;
      }
    });
  }, storageKey);
  if (policy !== null && network === 'continue') await replaceDocumentPolicy(page, policy, origin);
  else if (policy !== null) {
    await page.route(url => url.origin === origin, async route => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      const response = await route.fetch();
      const headers = Object.fromEntries(Object.entries(response.headers())
        .filter(([name]) => !['content-encoding', 'content-length', 'content-security-policy'].includes(name)));
      await route.fulfill({ response, headers: { ...headers, 'content-security-policy': policy } });
    });
  }
  return {
    read: async () => [...reports, ...await page.evaluate(key => {
      const fallback = document.documentElement.dataset.cspViolation;
      return [...JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[], ...fallback ? [fallback] : []];
    }, storageKey)],
  };
}
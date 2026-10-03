import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { parseDeployment, startVercelStaticServer } from '../scripts/vercel-static-server';

test.use({ serviceWorkers: 'allow' });

test('a worker-served offline collection enforces the network document CSP', async ({ page, context }, info) => {
  test.setTimeout(120000);
  const server = await startVercelStaticServer({
    root: path.resolve('dist'),
    deployment: parseDeployment(JSON.parse(readFileSync('vercel.json', 'utf8'))),
    protocol: 'http1',
    brotli: false,
  });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const network = await page.goto(`${server.origin}/?catalogs=off`);
    expect(network?.status()).toBe(200);
    expect(network?.fromServiceWorker()).toBe(false);
    const policy = await network!.headerValue('content-security-policy');
    expect(policy).toContain("script-src 'self'");
    await expect(page.locator('.game-card').first()).toBeVisible();
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((rows) => rows.length))).toBe(0);

    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Menu', exact: true })
      .getByRole('button', { name: 'Install & offline access', exact: true })
      .click();
    const settings = page.locator('dialog[aria-labelledby="settings-title"]');
    await settings.getByRole('button', { name: 'Enable offline access', exact: true }).click();
    await expect(settings.getByRole('button', { name: 'Offline files ready', exact: true })).toBeDisabled({
      timeout: 45000,
    });
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state))
      .toBe('activated');
    await page.keyboard.press('Escape');
    await context.setOffline(true);
    const offline = await page.reload();
    expect(offline?.status()).toBe(200);
    expect(offline?.fromServiceWorker()).toBe(true);
    expect(await offline!.headerValue('content-security-policy')).toBe(policy);
    await expect(page.locator('.game-card').first()).toBeVisible();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    const cachedPolicy = await page.evaluate(async () => {
      const response = await caches.match(new URL('/index.html', location.origin).href);
      return response?.headers.get('content-security-policy') ?? null;
    });
    expect(cachedPolicy).toBe(policy);

    const violation = await page.evaluate(
      () =>
        new Promise<{ effectiveDirective: string; blockedURI: string; disposition: string; originalPolicy: string }>(
          (resolve, reject) => {
            const receive = (event: SecurityPolicyViolationEvent) => {
              if (event.blockedURI !== 'inline' || event.effectiveDirective !== 'script-src-elem') return;
              clearTimeout(timeout);
              document.removeEventListener('securitypolicyviolation', receive);
              resolve({
                effectiveDirective: event.effectiveDirective,
                blockedURI: event.blockedURI,
                disposition: event.disposition,
                originalPolicy: event.originalPolicy,
              });
            };
            const timeout = setTimeout(() => {
              document.removeEventListener('securitypolicyviolation', receive);
              reject(new Error('The offline document did not report the blocked inline script.'));
            }, 10000);
            document.addEventListener('securitypolicyviolation', receive);
            const script = document.createElement('script');
            script.textContent = 'document.documentElement.dataset.offlineCspExecuted = "yes";';
            document.head.append(script);
          },
        ),
    );
    expect(violation).toEqual({
      effectiveDirective: 'script-src-elem',
      blockedURI: 'inline',
      disposition: 'enforce',
      originalPolicy: policy,
    });
    expect(await page.evaluate(() => document.documentElement.dataset.offlineCspExecuted)).toBeUndefined();
    await info.attach('offline-document-csp', {
      body: JSON.stringify({ networkPolicy: policy, cachedPolicy, violation, fromServiceWorker: true }),
      contentType: 'application/json',
    });
    expect(server.errors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await server.stop();
  }
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import configuration from '../../vercel.json';
import { AUTH_HELPER_UPSTREAM } from '../../api/auth-helper';

const HELPER_SCRIPTS = '/__/auth/(handler|iframe|experiments)\\.js';

const main = configuration.headers.find(rule => rule.source === '/((?!__/auth/).*)')!;
const headers = Object.fromEntries(main.headers.map(header => [header.key, header.value]));

describe('S3 header and supply-chain boundaries', () => {
  it('uses opener/resource isolation without COEP or a redundant cross-origin auth-frame permission', () => {
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(configuration.headers.flatMap(rule => rule.headers).some(header => header.key === 'Cross-Origin-Embedder-Policy')).toBe(false);
    expect(headers['Content-Security-Policy']).not.toContain('play100-online-48823b32.firebaseapp.com');
    expect(headers['Content-Security-Policy']).toContain("frame-src 'self' https://accounts.google.com");
    expect(configuration.installCommand).toBe('npm ci');
  });
  it('pins two-year HSTS on the app and auth helper without claiming preload for a shared suffix', () => {
    const hsts = 'max-age=63072000; includeSubDomains';
    const helper = configuration.headers.find(rule => rule.source === HELPER_SCRIPTS)!;
    for (const rule of [main, helper]) {
      expect(rule.headers.filter(header => header.key.toLowerCase() === 'strict-transport-security'))
        .toEqual([{ key: 'Strict-Transport-Security', value: hsts }]);
    }
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });
  it('keeps exact public share images and launcher icons readable cross-origin', () => {
    for (const source of [
      '/social-card.png', '/social-card.svg', '/favicon.svg',
      '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/icon-maskable-192.png',
      '/pwa/icon-maskable-512.png', '/pwa/apple-touch-icon.png',
    ]) {
      expect(configuration.headers.find(rule => rule.source === source)?.headers)
        .toContainEqual({ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' });
    }
  });
  it('serves the two helper documents through the fresh-nonce function and keeps the script paths as fixed no-store rewrites', () => {
    const rewrites = configuration.rewrites.filter(rule => rule.source.startsWith('/__/auth/'));
    expect(rewrites).toEqual([
      { source: '/__/auth/handler', destination: '/api/auth-helper?page=handler' },
      { source: '/__/auth/handler.js', destination: `${AUTH_HELPER_UPSTREAM}/__/auth/handler.js` },
      { source: '/__/auth/iframe', destination: '/api/auth-helper?page=iframe' },
      { source: '/__/auth/iframe.js', destination: `${AUTH_HELPER_UPSTREAM}/__/auth/iframe.js` },
      { source: '/__/auth/experiments.js', destination: `${AUTH_HELPER_UPSTREAM}/__/auth/experiments.js` },
    ]);
    const helper = configuration.headers.find(rule => rule.source === HELPER_SCRIPTS)!;
    expect(helper.headers).toContainEqual({ key: 'Cache-Control', value: 'private, no-store, max-age=0' });
    expect(helper.headers).toContainEqual({ key: 'X-Frame-Options', value: 'SAMEORIGIN' });
    expect(helper.headers.some(header => header.key === 'Cross-Origin-Opener-Policy')).toBe(false);
    expect(JSON.stringify(configuration)).not.toContain('nonce-');
  });
  it('lets no config header rule touch the helper documents, so the function sets their only CSP', () => {
    // Vercel matches header `source` against the incoming pathname. None of these sources use path-to-regexp
    // named parameters, so each reads as the same anchored JavaScript regular expression.
    expect(configuration.headers.every(rule => !rule.source.includes(':'))).toBe(true);
    const matching = (path: string) => configuration.headers.filter(rule => new RegExp(`^${rule.source}$`).test(path)).map(rule => rule.source);
    for (const document of ['/__/auth/handler', '/__/auth/iframe']) expect(matching(document)).toEqual([]);
    for (const script of ['/__/auth/handler.js', '/__/auth/iframe.js', '/__/auth/experiments.js']) expect(matching(script)).toEqual([HELPER_SCRIPTS]);
    for (const other of ['/__/auth/links', '/__/auth/handlerXjs', '/__/auth/handler.json']) expect(matching(other)).not.toContain(HELPER_SCRIPTS);
    expect(matching('/')).toContain(main.source);
  });
  it('verifies registry signatures immediately after every dependency install in CI', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const installs = workflow.match(/- run: npm ci --no-audit --no-fund/g) ?? [];
    expect(installs).toHaveLength(3);
    expect(workflow.match(/- run: npm ci --no-audit --no-fund\r?\n\s+- run: npm audit signatures/g)).toHaveLength(installs.length);
  });
});

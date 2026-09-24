import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import configuration from '../../vercel.json';

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
    const helper = configuration.headers.find(rule => rule.source === '/__/auth/:path*')!;
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
  it('keeps the fixed auth helpers no-store and retains their separate template nonce', () => {
    const rewrites = configuration.rewrites.filter(rule => rule.source.startsWith('/__/auth/'));
    expect(rewrites.map(rule => rule.source)).toEqual([
      '/__/auth/handler', '/__/auth/handler.js', '/__/auth/iframe', '/__/auth/iframe.js', '/__/auth/experiments.js',
    ]);
    expect(rewrites.every(rule => rule.destination === `https://play100-online-48823b32.firebaseapp.com${rule.source}`)).toBe(true);
    const helper = configuration.headers.find(rule => rule.source === '/__/auth/:path*')!;
    expect(helper.headers).toContainEqual({ key: 'Cache-Control', value: 'private, no-store, max-age=0' });
    expect(helper.headers.find(header => header.key === 'Content-Security-Policy')?.value).toContain("'nonce-firebase-auth-helper'");
    expect(helper.headers.some(header => header.key === 'Cross-Origin-Opener-Policy')).toBe(false);
  });
  it('verifies registry signatures immediately after every dependency install in CI', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const installs = workflow.match(/- run: npm ci --no-audit --no-fund/g) ?? [];
    expect(installs).toHaveLength(3);
    expect(workflow.match(/- run: npm ci --no-audit --no-fund\r?\n\s+- run: npm audit signatures/g)).toHaveLength(installs.length);
  });
});

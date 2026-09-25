import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { builtAuthDomain, isLocalAuthFrameReport, localAuthOrigin } from '../tests/csp-violation-helpers.ts';

const roots: string[] = [];

async function bundle(...chunks: string[]) {
  const root = await mkdtemp(path.join(tmpdir(), 'play100-auth-domain-'));
  roots.push(root);
  await mkdir(path.join(root, 'assets'));
  for (const [index, source] of chunks.entries()) {
    await writeFile(path.join(root, 'assets', `chunk-${index}.js`), source);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('builtAuthDomain', () => {
  it.each([
    ['double quotes', 'x={VITE_FIREBASE_AUTH_DOMAIN:"auth.example.test"}'],
    ['single quotes', "x={'VITE_FIREBASE_AUTH_DOMAIN': 'auth.example.test'}"],
    ['a template literal', 'x={VITE_FIREBASE_AUTH_DOMAIN:`auth.example.test`}'],
  ])('reads a value quoted with %s', async (_, source) => {
    expect(builtAuthDomain(await bundle(source, 'y=1'))).toBe('auth.example.test');
  });

  it('is null for an offline build, a missing dist and mismatched delimiters', async () => {
    expect(builtAuthDomain(await bundle('x={VITE_FIREBASE_API_KEY:""}'))).toBeNull();
    expect(builtAuthDomain(path.join(tmpdir(), 'play100-no-such-dist'))).toBeNull();
    expect(builtAuthDomain(await bundle('x={VITE_FIREBASE_AUTH_DOMAIN:"auth.example.test`}'))).toBeNull();
  });

  it('refuses a bundle naming two authDomains', async () => {
    const root = await bundle(
      'a={VITE_FIREBASE_AUTH_DOMAIN:`one.example.test`}',
      'b={VITE_FIREBASE_AUTH_DOMAIN:"two.example.test"}',
    );
    expect(() => builtAuthDomain(root)).toThrow('more than one authDomain');
  });
});

describe('the local authDomain frame report', () => {
  const policy = "frame-src 'self' https://accounts.google.com";
  const refused = (url: string, directive = policy) =>
    `Refused to frame '${url}' because it violates the following Content Security Policy directive: "${directive}".`;
  const helper = localAuthOrigin('http://127.0.0.1:4187', 'auth.example.test');

  it('names the authDomain origin only for another test origin', () => {
    expect(helper).toBe('https://auth.example.test');
    expect(localAuthOrigin('https://auth.example.test', 'auth.example.test')).toBeNull();
    expect(localAuthOrigin('http://127.0.0.1:4187', null)).toBeNull();
  });

  it('ignores only a frame-src report blocking the authDomain', () => {
    expect(isLocalAuthFrameReport('/invite frame-src https://auth.example.test/__/auth/iframe ', helper)).toBe(true);
    expect(isLocalAuthFrameReport('/invite child-src https://auth.example.test ', helper)).toBe(true);
    expect(isLocalAuthFrameReport(refused('https://auth.example.test/__/auth/iframe'), helper)).toBe(true);
    expect(isLocalAuthFrameReport('/invite frame-src https://other.example.test/ ', helper)).toBe(false);
    expect(isLocalAuthFrameReport(refused('https://other.example.test/'), helper)).toBe(false);
    expect(isLocalAuthFrameReport('/invite connect-src https://auth.example.test/x ', helper)).toBe(false);
    expect(isLocalAuthFrameReport('/invite style-src-attr (inline) color:red', helper)).toBe(false);
    const framing = `Framing 'https://auth.example.test/' violates the following Content Security Policy directive: "frame-ancestors 'self'".`;
    expect(isLocalAuthFrameReport(framing, helper)).toBe(false);
  });

  it('ignores nothing without a local authDomain', () => {
    expect(isLocalAuthFrameReport('/invite frame-src https://auth.example.test/ ', null)).toBe(false);
    expect(isLocalAuthFrameReport(refused('https://auth.example.test/'), null)).toBe(false);
  });
});

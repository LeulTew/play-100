import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import configuration from '../../vercel.json';
import { isMainDocumentRule, MAIN_DOCUMENT_RULE, matchingRules, routePattern } from './vercel-routes';

const root = fileURLToPath(new URL('../../', import.meta.url));
const own = new Set(['src/lib/vercel-routes.ts', 'src/lib/vercel-routes.test.ts']);

function sourceFiles(): string[] {
  const files = ['vite.config.ts', 'playwright.config.ts'];
  for (const directory of ['src', 'scripts', 'api', 'functions/src', 'tests', 'tests-cloud-ui']) {
    if (!existsSync(path.join(root, directory))) continue;
    for (const entry of readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && /\.(?:[cm]?[jt]s|tsx)$/.test(entry.name))
        files.push(path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
    }
  }
  return files.filter((file) => !own.has(file));
}

describe('vercel.json route matching', () => {
  it('matches every rewrite at its own paths and one segment per :name', () => {
    for (const { source } of configuration.rewrites) {
      expect(routePattern(source).test(source.replace(/:\w+/g, 'someone')), source).toBe(true);
      expect(routePattern(source).test(`${source}/extra`), source).toBe(false);
    }
    expect(matchingRules(configuration.rewrites, '/friends/abc123').map((rule) => rule.source)).toEqual([
      '/friends/:uid',
    ]);
    expect(matchingRules(configuration.rewrites, '/u/someone').map((rule) => rule.source)).toEqual(['/u/:handle']);
    expect(matchingRules(configuration.rewrites, '/u/someone/else')).toEqual([]);
    expect(matchingRules(configuration.rewrites, '/assets/app.js')).toEqual([]);
  });

  it('reads :name* and :name+ as Vercel does, and a (?: group as a group', () => {
    expect(routePattern('/__/auth/:path*').test('/__/auth/a/b')).toBe(true);
    expect(routePattern('/__/auth/:path*').test('/__/auth/')).toBe(true);
    expect(routePattern('/docs/:rest+').test('/docs/')).toBe(false);
    expect(routePattern('/docs/:rest+').test('/docs/a/b')).toBe(true);
    expect(routePattern(MAIN_DOCUMENT_RULE).source).toBe(new RegExp(`^${MAIN_DOCUMENT_RULE}$`).source);
  });

  it('reads a . outside groups and classes as a literal dot, as path-to-regexp does', () => {
    expect(routePattern('/social-card.png').test('/social-card.png')).toBe(true);
    expect(routePattern('/social-card.png').test('/social-cardXpng')).toBe(false);
    expect(routePattern('/data/discovery/catalog.v1.json').test('/data/discovery/catalogXv1Xjson')).toBe(false);
    expect(routePattern('/assets/(.*)').test('/assets/any/thing.js')).toBe(true);
    expect(routePattern('/__/auth/(handler|iframe|experiments)\\.js').test('/__/auth/handlerXjs')).toBe(false);
    expect(routePattern('/a[.]b').test('/a.b')).toBe(true);
    expect(routePattern('/a[.]b').test('/aXb')).toBe(false);
    expect(routePattern('/a[.(]b.c').test('/a(b.c')).toBe(true);
    expect(routePattern('/a[.(]b.c').test('/a(bXc')).toBe(false);
    for (const { source } of configuration.headers.filter((rule) => !/[()[\]\\:]/.test(rule.source)))
      expect(routePattern(source).test(source), source).toBe(true);
  });

  it('keeps the auth helpers out of the one main-document rule and everything else in it', () => {
    expect(configuration.headers.filter(isMainDocumentRule)).toHaveLength(1);
    expect(configuration.headers[0]!.source).toBe(MAIN_DOCUMENT_RULE);
    const main = routePattern(MAIN_DOCUMENT_RULE);
    for (const pathname of ['/', '/discover', '/u/someone', '/__/auth/unknown', '/__/auth/handler.js.map'])
      expect(main.test(pathname), pathname).toBe(true);
    for (const pathname of ['/__/auth/handler', '/__/auth/iframe', '/__/auth/handler.js', '/__/auth/experiments.js'])
      expect(main.test(pathname), pathname).toBe(false);
    expect(matchingRules(configuration.headers, '/covers/a.webp').map((rule) => rule.source)).toEqual([
      MAIN_DOCUMENT_RULE,
      '/covers/(.*)',
    ]);
    expect(isMainDocumentRule({ source: '/(.*)' })).toBe(false);
    expect(isMainDocumentRule(null)).toBe(false);
  });

  it('is the only copy of the main-document rule and of the source-to-pattern conversion', () => {
    // vercel.json cannot import, and the docs quote the rule; every script, test and config imports it from here.
    const conversion = /new RegExp\(`\^\$\{[^`]*\.source\b|\.source\.replace\(\/\(\?<!/;
    const copies = sourceFiles().filter((file) => {
      const text = readFileSync(path.join(root, file), 'utf8');
      return text.includes(MAIN_DOCUMENT_RULE) || conversion.test(text);
    });
    expect(copies).toEqual([]);
  });
});

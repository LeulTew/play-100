import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { sourceNodes, sourceTokens } from '../../scripts/source-contract';
import configuration from '../../vercel.json';
import { APP_CHECK_CSP_SOURCES, appCheckCspProblems, readAppCheckConfiguration } from './app-check-config';

const siteKey = `6L${'a'.repeat(38)}`;
const policy = configuration.headers.find(rule => rule.source === '/((?!__/auth/).*)')!.headers
  .find(header => header.key === 'Content-Security-Policy')!.value;

describe('optional App Check boundary', () => {
  it('stays off unless the build flag is exactly "true"', () => {
    for (const flag of [undefined, '', 'false', '1', 'TRUE', ' true']) {
      expect(readAppCheckConfiguration({ VITE_APP_CHECK_ENABLED: flag, VITE_APP_CHECK_SITE_KEY: siteKey }))
        .toEqual({ config: null, error: null });
    }
  });
  it('accepts only a public reCAPTCHA v3 site key once enabled', () => {
    expect(readAppCheckConfiguration({ VITE_APP_CHECK_ENABLED: 'true', VITE_APP_CHECK_SITE_KEY: ` ${siteKey} ` }))
      .toEqual({ config: { siteKey }, error: null });
    for (const key of [undefined, '', 'AIza'.padEnd(40, 'a'), `6L${'a'.repeat(37)}`, `6L${'a'.repeat(37)}<`]) {
      const result = readAppCheckConfiguration({ VITE_APP_CHECK_ENABLED: 'true', VITE_APP_CHECK_SITE_KEY: key });
      expect(result.config).toBeNull();
      expect(result.error).toBeTruthy();
    }
  });
  it('reports every CSP source enabling would need, and none once they are present', () => {
    expect(appCheckCspProblems(policy)).toHaveLength(Object.values(APP_CHECK_CSP_SOURCES).flat().length);
    const ready = policy.split(';').map(part => {
      const name = part.trim().split(/\s+/)[0] as keyof typeof APP_CHECK_CSP_SOURCES;
      return name in APP_CHECK_CSP_SOURCES ? `${part} ${APP_CHECK_CSP_SOURCES[name].join(' ')}` : part;
    }).join(';');
    expect(appCheckCspProblems(ready)).toEqual([]);
  });
  it('is not loaded by default and never runs against the emulator', () => {
    const client = readFileSync(new URL('../cloud/firebase-client.ts', import.meta.url), 'utf8');
    const source = ts.createSourceFile('firebase-client.ts', client, ts.ScriptTarget.Latest, true);
    const staticDependencies = [...sourceNodes(source, ts.isImportDeclaration), ...sourceNodes(source, ts.isExportDeclaration)];
    expect(staticDependencies.some(declaration => declaration.moduleSpecifier &&
      ts.isStringLiteral(declaration.moduleSpecifier) && declaration.moduleSpecifier.text === 'firebase/app-check')).toBe(false);
    expect(sourceNodes(source, ts.isIfStatement).map(statement => sourceTokens(statement.expression.getText(source))))
      .toContain(sourceTokens("import.meta.env.VITE_APP_CHECK_ENABLED === 'true' && !EMULATOR_MODE"));
    expect(sourceTokens(client)).toContain(sourceTokens("import('./app-check-client')"));
    const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    const viteSource = ts.createSourceFile('vite.config.ts', vite, ts.ScriptTarget.Latest, true);
    const flag = sourceNodes(viteSource, ts.isPropertyAssignment).find(property =>
      ts.isStringLiteral(property.name) && property.name.text === 'import.meta.env.VITE_APP_CHECK_ENABLED');
    expect(sourceTokens(flag?.initializer.getText(viteSource) ?? ''))
      .toBe(sourceTokens("JSON.stringify(appCheck.config ? 'true' : 'false')"));
  });
});

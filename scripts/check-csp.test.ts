import { describe, expect, it } from 'vitest';
import config from '../vercel.json';
import { authHeaderCoverageProblems } from './check-csp';
import { MAIN_DOCUMENT_RULE } from './first-paint/csp';

describe('auth namespace header coverage', () => {
  it('gives unknown auth documents main headers without overriding nonce or script helpers', () => {
    expect(authHeaderCoverageProblems(config)).toEqual([]);
  });
  it('rejects the old broad exemption and accidental helper coverage', () => {
    const changed = (source: string) => ({
      ...config,
      headers: config.headers.map((rule) => (rule.source === MAIN_DOCUMENT_RULE ? { ...rule, source } : rule)),
    });
    expect(authHeaderCoverageProblems(changed('/((?!__/auth/).*)'))).toContain(
      '/__/auth/unknown must receive the main document security headers.',
    );
    expect(authHeaderCoverageProblems(changed('/(.*)'))).toContain(
      '/__/auth/handler must keep its function-owned nonce headers only.',
    );
  });
});

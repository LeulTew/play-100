import { describe, expect, it } from 'vitest';
import configuration from '../../vercel.json';

describe('optional strict main-document style policy', () => {
  it('allows only self and the two first-paint variants\' critical CSS hashes, without an inline override', () => {
    const policy = configuration.headers.find(rule => rule.source === '/((?!__/auth/).*)')
      ?.headers.find(header => header.key === 'Content-Security-Policy')?.value ?? '';
    const directives = policy.split(';').map(directive => directive.trim().split(/\s+/));
    const styles = directives.find(([name]) => name === 'style-src')?.slice(1) ?? [];
    expect(styles).toContain("'self'");
    expect(styles).not.toContain("'unsafe-inline'");
    expect(styles.every(source => source === "'self'" || /^'sha256-[A-Za-z0-9+/]{43}='$/.test(source))).toBe(true);
    // One hash per shell variant; a single hash only when both variants inline identical CSS.
    const hashes = styles.filter(source => source !== "'self'");
    expect(hashes.length === 1 || hashes.length === 2).toBe(true);
    expect(new Set(styles).size).toBe(styles.length);
    expect(directives.some(([name]) => name === 'style-src-elem' || name === 'style-src-attr')).toBe(false);
  });
});

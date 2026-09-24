import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import configuration from '../../vercel.json';
import { isPublicPwaFile } from '../pwa/worker';

const source = readFileSync(new URL('../../public/.well-known/security.txt', import.meta.url), 'utf8');
const fields = source
  .trimEnd()
  .split('\n')
  .map((line) => {
    const match = /^([A-Za-z-]+): (\S+)$/.exec(line);
    if (!match) throw new Error(`Invalid security.txt line: ${line}`);
    return [match[1]!, match[2]!] as const;
  });

describe('RFC 9116 security.txt', () => {
  it('points reporters at the same private channel as SECURITY.md', () => {
    const policy = readFileSync(new URL('../../SECURITY.md', import.meta.url), 'utf8');
    const contact = fields.filter(([name]) => name === 'Contact').map(([, value]) => value);
    expect(contact).toEqual(['https://github.com/LeulTew/play-100/security/advisories/new']);
    expect(policy).toContain(`(${contact[0]})`);
    expect(Object.fromEntries(fields).Policy).toBe('https://github.com/LeulTew/play-100/blob/main/SECURITY.md');
    expect(Object.fromEntries(fields).Canonical).toBe(
      'https://play-100-collection.vercel.app/.well-known/security.txt',
    );
    expect(fields.every(([, value]) => !value.startsWith('http:'))).toBe(true);
  });
  it('has exactly one unexpired Expires within the RFC one-year guidance', () => {
    const expires = fields.filter(([name]) => name === 'Expires').map(([, value]) => value);
    expect(expires).toHaveLength(1);
    expect(expires[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const remaining = Date.parse(expires[0]!) - Date.now();
    expect(remaining, 'security.txt Expires has passed; renew it').toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(366 * 24 * 60 * 60 * 1000);
  });
  it('stays outside the offline precache and under the main security-header rule', () => {
    expect(isPublicPwaFile('/.well-known/security.txt')).toBe(false);
    const main = configuration.headers.find((rule) => rule.source === '/((?!__/auth/).*)')!;
    expect(new RegExp(`^${main.source}$`).test('/.well-known/security.txt')).toBe(true);
  });
});

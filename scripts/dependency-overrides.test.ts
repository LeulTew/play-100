import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface LockPackage {
  readonly version?: string;
}
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')) as {
  packages: Record<string, LockPackage>;
};

function versions(name: string): string[] {
  return Object.entries(lock.packages)
    .filter(([location]) => location === `node_modules/${name}` || location.endsWith(`/node_modules/${name}`))
    .map(([location, entry]) => `${location}@${entry.version ?? '?'}`);
}

function parts(entry: string): [number, number, number] {
  const match = /@(\d+)\.(\d+)\.(\d+)$/.exec(entry);
  if (!match) throw new Error(`Unexpected lock version ${entry}.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const atLeast = ([major, minor, patch]: [number, number, number], [a, b, c]: [number, number, number]) =>
  major !== a ? major > a : minor !== b ? minor > b : patch >= c;

// Dev-only advisories closed by the root overrides in package.json (docs/security.md).
describe('dependency advisories fixed by overrides', () => {
  it('resolves no uuid inside GHSA-w5hq-g745-h8pq (patched in 11.1.1, 12.0.1 and 13.0.1)', () => {
    const found = versions('uuid');
    expect(found.length).toBeGreaterThan(0);
    const vulnerable = found.filter((entry) => {
      const version = parts(entry);
      const [major] = version;
      return major < 11 ? true : major <= 13 ? !atLeast(version, [major, major === 11 ? 1 : 0, 1]) : false;
    });
    expect(vulnerable).toEqual([]);
  });

  it('resolves no @opentelemetry/core inside GHSA-8988-4f7v-96qf (patched in 2.8.0)', () => {
    expect(versions('@opentelemetry/core').filter((entry) => !atLeast(parts(entry), [2, 8, 0]))).toEqual([]);
  });
});

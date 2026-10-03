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

// Advisories closed by the root overrides in package.json (docs/security.md).
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

  it('resolves no @grpc/grpc-js inside GHSA-m9gg-hp2v-232j or GHSA-f596-whhp-79r4 (patched in 1.13.6 and 1.14.5)', () => {
    const found = versions('@grpc/grpc-js');
    expect(found.length).toBeGreaterThan(0);
    const vulnerable = found.filter((entry) => {
      const version = parts(entry);
      const [major, minor] = version;
      return !atLeast(version, [1, 13, 6]) || (major === 1 && minor === 14 && !atLeast(version, [1, 14, 5]));
    });
    expect(vulnerable).toEqual([]);
  });

  it('resolves no basic-ftp inside GHSA-c475-qrg2-pj4r (patched in 6.2.1)', () => {
    const found = versions('basic-ftp');
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((entry) => !atLeast(parts(entry), [6, 2, 1]))).toEqual([]);
  });

  it('resolves no braces, which GHSA-vfj7-8cjw-p6xm covers in every version (<= 3.0.3, no patch)', () => {
    // firebase-tools' chokidar 3 was the only path; its override to chokidar 4 drops the dependency.
    expect(versions('braces')).toEqual([]);
    expect(versions('chokidar').filter((entry) => !atLeast(parts(entry), [4, 0, 3]))).toEqual([]);
  });
});

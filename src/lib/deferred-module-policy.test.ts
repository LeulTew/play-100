import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFERRED_SOURCE_MODULES } from './deferred-module-policy';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const relative = (file: string) => path.relative(root, file).replaceAll('\\', '/');
// Static relative imports and re-exports, not type-only ones, which compile away, nor dynamic import(), which loads on
// first use (as in src/cloud/online-bridge-closure.test.ts).
const EDGE =
  /^(?:import\s+(?!type\b)(?:[^'";]*?\s+from\s+)?|export\s+(?!type\b)(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+)'(\.{1,2}\/[^']+)'/gm;
const ASSET = /\.(?:css|json|svg|png|webp|avif|woff2?)$|\?/;

function resolveModule(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier.replace(/\.js$/, ''));
  const file = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(
    (candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate),
  );
  if (!file) throw new Error(`${relative(from)} imports ${specifier}, which this check cannot resolve.`);
  return file;
}

// What every page loads: the entry's static closure, which the build ships as app-shared (scripts/app-shared-chunk.ts).
function eagerModules(): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(EDGE)) {
      if (!ASSET.test(specifier!)) visit(resolveModule(file, specifier!));
    }
  };
  visit(path.join(root, 'src/main.tsx'));
  return new Set([...seen].map(relative));
}

// The build rejects a deferred module it finds in an eager chunk (scripts/eager-module-guard.ts); this finds the import
// that would put it there before a build.
describe('deferred modules in the source', () => {
  const eager = eagerModules();

  it('follows the entry into the shared modules that lazy-only code was split from', () => {
    expect([...eager]).toEqual(
      expect.arrayContaining([
        'src/lib/personal-library.ts',
        'src/lib/catalog-identity.ts',
        'src/lib/result-range.ts',
        'src/hooks/useDiscoveryCatalog.ts',
      ]),
    );
  });

  it.each(DEFERRED_SOURCE_MODULES)('keeps %s out of what every page loads', (module) => {
    expect(existsSync(path.join(root, module))).toBe(true);
    expect(eager).not.toContain(module);
  });
});

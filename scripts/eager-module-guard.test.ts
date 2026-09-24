import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDeferredBundleModules } from './check-budgets';
import { DEFERRED_SOURCE_MODULES } from '../src/lib/deferred-module-policy';

function chunk(
  fileName: string,
  modules: Record<string, { renderedLength: number }> = {},
  imports: string[] = [],
  isEntry = false,
) {
  return { type: 'chunk' as const, fileName, modules, imports, isEntry };
}

describe('build-only exact eager module guard', () => {
  it.each(DEFERRED_SOURCE_MODULES)('rejects rendered %s inside an entry or shared static chunk', (module) => {
    const root = process.cwd();
    const modules = { [path.join(root, ...module.split('/'))]: { renderedLength: 1 } };
    const bundle = {
      'entry.js': chunk('entry.js', {}, ['shared.js'], true),
      'shared.js': chunk('shared.js', modules, ['entry.js']),
    };
    expect(() => assertDeferredBundleModules(root, bundle, [])).toThrow(
      `Deferred module is eager: ${module} in shared.js.`,
    );
  });

  it('includes explicit HTML preloads even when they are not entry imports', () => {
    const root = process.cwd();
    const deferred = path.join(root, ...DEFERRED_SOURCE_MODULES[0].split('/'));
    const bundle = {
      'entry.js': chunk('entry.js', {}, [], true),
      'preload.js': chunk('preload.js', { [deferred]: { renderedLength: 30 } }),
    };
    expect(() => assertDeferredBundleModules(root, bundle, ['preload.js'])).toThrow(/preload.js/);
    expect(() => assertDeferredBundleModules(root, bundle, ['styles.css'])).not.toThrow();
  });

  it('allows lazy code, erased imports, cycles and external source modules without exposing any inventory', () => {
    const root = process.cwd();
    const deferred = path.join(root, ...DEFERRED_SOURCE_MODULES[0].split('/'));
    const bundle = {
      'entry.js': chunk('entry.js', { [deferred]: { renderedLength: 0 } }, ['shared.js'], true),
      'shared.js': chunk(
        'shared.js',
        { [path.join(root, 'node_modules', 'react', 'index.js')]: { renderedLength: 100 } },
        ['entry.js'],
      ),
      'lazy.js': chunk('lazy.js', { [deferred]: { renderedLength: 100 } }),
    };
    expect(assertDeferredBundleModules(root, bundle, ['entry.js'])).toBeUndefined();
    expect(Object.keys(bundle)).toEqual(['entry.js', 'shared.js', 'lazy.js']);
  });

  it('fails closed when a static or HTML eager JS chunk has no bundle origin record', () => {
    expect(() =>
      assertDeferredBundleModules(process.cwd(), { 'entry.js': chunk('entry.js', {}, ['missing.js'], true) }, []),
    ).toThrow('Missing built eager chunk: missing.js.');
    expect(() => assertDeferredBundleModules(process.cwd(), {}, ['preload.js'])).toThrow(
      'Missing built eager chunk: preload.js.',
    );
  });
});

import path from 'node:path';
import { DEFERRED_SOURCE_MODULES } from '../src/lib/deferred-module-policy';

interface BuiltChunk {
  type: 'chunk';
  fileName: string;
  isEntry: boolean;
  imports: readonly string[];
  modules: Readonly<Record<string, { renderedLength: number }>>;
}
type BuiltOutput = BuiltChunk | { type: 'asset' };

export function assertDeferredBundleModules(root: string, bundle: Readonly<Record<string, BuiltOutput>>, htmlFiles: readonly string[]): void {
  const visited = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file) || !file.endsWith('.js')) return;
    visited.add(file);
    const chunk = bundle[file];
    if (!chunk || chunk.type !== 'chunk') throw new Error(`Missing built eager chunk: ${file}.`);
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (module.renderedLength <= 0) continue;
      const source = path.relative(root, id.split('?')[0]!).split(path.sep).join('/');
      if (DEFERRED_SOURCE_MODULES.some(deferred => deferred === source)) {
        throw new Error(`Deferred module is eager: ${source} in ${file}.`);
      }
    }
    for (const imported of chunk.imports) visit(imported);
  };
  for (const chunk of Object.values(bundle)) {
    if (chunk.type === 'chunk' && chunk.isEntry) visit(chunk.fileName);
  }
  for (const file of htmlFiles) visit(file);
}

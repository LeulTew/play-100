import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRELOADED_TOOL_CHUNKS } from '../../scripts/preloaded-tool-chunks';

const cloud = path.dirname(fileURLToPath(import.meta.url));
const relative = (file: string) => path.relative(cloud, file).replaceAll('\\', '/');
// A module's static relative imports and re-exports, leaving out type-only ones, which compile away. A dynamic import()
// loads on first use instead, so it is not an edge.
const EDGE =
  /^(?:import\s+(?!type\b)(?:[^'";]*?\s+from\s+)?|export\s+(?!type\b)(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+)'(\.{1,2}\/[^']+)'/gm;
// Relative imports that carry no code: stylesheets, data and asset URLs.
const ASSET = /\.(?:css|json|svg|png|webp|avif|woff2?)$|\?/;

function edges(source: string): string[] {
  return [...source.matchAll(EDGE)].map((match) => match[1]!).filter((specifier) => !ASSET.test(specifier));
}

function resolveModule(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier.replace(/\.js$/, ''));
  const file = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(
    (candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate),
  );
  if (!file) throw new Error(`${relative(from)} imports ${specifier}, which this check cannot resolve.`);
  return file;
}

// What loads with a module: its static imports, followed transitively.
function staticClosure(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const specifier of edges(readFileSync(file, 'utf8'))) visit(resolveModule(file, specifier));
  };
  visit(path.join(cloud, entry));
  return [...seen].map(relative);
}

describe('what the online bridge loads with it', () => {
  it('reads value, side-effect and re-export edges, but not type-only, dynamic or asset imports', () => {
    const source = [
      "import { a, type B } from './value';",
      "import {\n  c,\n  d,\n} from '../lines';",
      "import './effect';",
      "import type { E } from './type-only';",
      "export { f } from './re-export';",
      "export * from './star';",
      "export type { G } from './type-export';",
      "const h = () => import('./dynamic');",
      "import './style.css';",
    ].join('\n');
    expect(edges(source)).toEqual(['./value', '../lines', './effect', './re-export', './star']);
  });

  it('resolves .js specifiers and index modules, and fails on an import it cannot resolve', () => {
    const from = path.join(cloud, 'OnlineController.tsx');
    expect(relative(resolveModule(path.join(cloud, '../lib/personal-library.ts'), './ranking-order.js'))).toBe(
      '../lib/ranking-order.ts',
    );
    expect(relative(resolveModule(from, '../motion'))).toBe('../motion/index.ts');
    expect(() => resolveModule(from, './missing-module')).toThrow(
      'OnlineController.tsx imports ./missing-module, which this check cannot resolve.',
    );
  });

  it('leaves out publishing, moderation, reports and account deletion, which load with their pages', () => {
    const bridge = staticClosure('OnlineController.tsx');
    expect(bridge).toEqual(expect.arrayContaining(['social-store.ts', 'account-deletion.ts']));
    expect(bridge).not.toContain('social-publication.ts');
    expect(bridge).not.toContain('account-deletion-action.ts');
  });

  // The offline core precaches each module the idle preload imports dynamically as its own chunk
  // (scripts/pwa-build.ts). Loaded statically by the controller too, such a module loses that chunk to an unnamed
  // shared one unless the preloaded-tools group in vite.config.ts names it (scripts/preloaded-tool-chunks.ts).
  it('gives each preloaded module the controller also loads its own named chunk, and steers with no imports', () => {
    const preload = path.join(cloud, '../lib/app-tool-preload.ts');
    const preloaded = [...readFileSync(preload, 'utf8').matchAll(/import\('(\.{1,2}\/[^']+)'\)/g)].map((match) =>
      relative(resolveModule(preload, match[1]!)),
    );
    const shared = preloaded.filter((file) => staticClosure('OnlineController.tsx').includes(file));
    expect(shared).toEqual(
      expect.arrayContaining([
        '../lib/comparison-game-filter.ts',
        '../lib/friend-comparison-intent.ts',
        '../lib/google-intent.ts',
      ]),
    );
    const grouped = Object.keys(PRELOADED_TOOL_CHUNKS).map((file) => relative(path.join(cloud, '..', '..', file)));
    expect(shared.filter((file) => !grouped.includes(file))).toEqual([]);
    const controller = path.join(cloud, 'OnlineController.tsx');
    const own = edges(readFileSync(controller, 'utf8')).map((specifier) =>
      relative(resolveModule(controller, specifier)),
    );
    expect(own.filter((file) => grouped.includes(file))).toEqual([]);
  });
  it.each(['CommunityPage.tsx', 'PublicProfilePage.tsx', 'PublishPage.tsx', 'CreatorPage.tsx', 'AccountPage.tsx'])(
    'loads the publication methods with %s',
    (page) => {
      expect(staticClosure(page)).toContain('social-publication.ts');
    },
  );

  it('loads the deletion operation with Account, and neither with Compare', () => {
    expect(staticClosure('AccountPage.tsx')).toContain('account-deletion-action.ts');
    const compare = staticClosure('FriendComparisonPage.tsx');
    expect(compare).not.toContain('account-deletion-action.ts');
    expect(compare).not.toContain('social-publication.ts');
  });
});

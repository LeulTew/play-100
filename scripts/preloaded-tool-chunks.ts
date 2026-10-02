import type { Manifest, ManifestChunk } from 'vite';

/**
 * The tools the idle preload imports dynamically (src/lib/app-tool-preload.ts) that the online bridge also loads
 * statically, in named chunks (vite.config.ts, `build.rolldownOptions.output.codeSplitting`).
 *
 * Shared that way, Rolldown folds such a module into an unnamed shared chunk unless something pins it, and the offline
 * core (scripts/pwa-build.ts) could not find it. This group names their chunks and captures only the modules
 * themselves (`includeDependenciesRecursively: false`), so their dependencies stay where the rest of the app puts them.
 * The two comparison tools share a chunk, one file fewer in the offline core: they always load together, both by
 * `loadComparisonTools` and statically by the bridge. Sign-in's intent keeps its own, which the Account link warms.
 * A group chunk has no facade, so the Vite manifest keys it `_<file>` with this `name`; `manifestEntry` resolves it.
 * online-bridge-closure.test.ts fails when the bridge loads a preloaded module this list leaves out.
 */
export const PRELOADED_TOOL_CHUNKS: Readonly<Record<string, string>> = {
  'src/lib/comparison-game-filter.ts': 'comparison-tools',
  'src/lib/friend-comparison-intent.ts': 'comparison-tools',
  'src/lib/google-intent.ts': 'google-intent',
};

/** The chunk a preloaded tool module goes in, whatever the platform's path separator, or null for any other module. */
export function preloadedToolChunkName(id: string): string | null {
  const normalized = id.replaceAll('\\', '/');
  for (const [file, name] of Object.entries(PRELOADED_TOOL_CHUNKS)) {
    if (normalized.endsWith(`/${file}`)) return name;
  }
  return null;
}

/**
 * The manifest chunk of a source root: its own key when Vite emitted it as an entry, or, for a preloaded tool, the one
 * chunk its group produced. It fails on a group name that matches no chunk or more than one.
 */
export function manifestEntry(manifest: Manifest, root: string): { key: string; chunk: ManifestChunk } | undefined {
  const own = manifest[root];
  if (own) return { key: root, chunk: own };
  const name = PRELOADED_TOOL_CHUNKS[root];
  if (!name) return undefined;
  const file = new RegExp(`^assets/${name}-[\\w-]{8}\\.js$`);
  const matches = Object.entries(manifest).filter(
    ([key, chunk]) => key.startsWith('_') && !chunk.src && (chunk.name === name || file.test(chunk.file)),
  );
  if (matches.length > 1) throw new Error(`More than one Vite chunk is named ${name}.`);
  const [match] = matches;
  return match ? { key: match[0], chunk: match[1] } : undefined;
}

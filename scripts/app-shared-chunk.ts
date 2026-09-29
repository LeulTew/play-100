/**
 * Modules the entry chunk shares with most lazy chunks, which the build keeps together in one `app-shared` chunk
 * (vite.config.ts, `build.rolldownOptions.output.codeSplitting`).
 *
 * Rolldown merged these modules into the entry chunk until 3a12ac44 (ExtendedResults importing useDiscoveryArtwork)
 * stopped that merge. It then emitted them as four small chunks (Dialog, Icon, library-mode and useExitSave), which
 * pushed the offline core past its 51-file budget. One chunk, which the entry loads as it loaded the four, keeps the
 * file count within the budget without steering imports. A path that no longer exists fails
 * scripts/app-shared-chunk.test.ts, so the list cannot drift silently.
 */
export const APP_SHARED_MODULES: readonly string[] = [
  'src/components/Dialog.tsx',
  'src/components/dialog-layer.ts',
  'src/components/dialog-lifecycle.ts',
  'src/components/Icon.tsx',
  'src/hooks/useExitSave.ts',
  'src/hooks/useLatest.ts',
  'src/lib/dialog-focus.ts',
  'src/lib/library-mode.ts',
  'src/motion/context.ts',
  'src/motion/public-visual.ts',
  'src/motion/runtime.ts',
  'src/motion/types.ts',
  'src/motion/useMotion.ts',
];

/** Whether a module id is one of the app-shared modules, whatever the platform's path separator. */
export function isAppSharedModule(id: string): boolean {
  const normalized = id.replaceAll('\\', '/');
  return APP_SHARED_MODULES.some((file) => normalized.endsWith(`/${file}`));
}

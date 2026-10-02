/**
 * The entry and its shared modules form one static closure in `app-shared`
 * (vite.config.ts, `build.rolldownOptions.output.codeSplitting`).
 *
 * Separate shared chunks add gzip overhead and offline entries without deferring any code. Including the entry's
 * static dependencies compresses them together; dynamic imports remain separate. The eager-module guard rejects
 * deferred bodies and app-tool-loading checks the online graph. A missing path fails app-shared-chunk.test.ts.
 */
export const APP_SHARED_MODULES: readonly string[] = [
  'src/main.tsx',
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

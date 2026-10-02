import path from 'node:path';
import { runnerImport } from 'vite';
import type { Plugin } from 'vite';
import type { ShellVariant } from './shell-html.ts';

/** Renders the first-paint shell of one variant: renderShell of src/first-paint/shell-render.tsx. */
export type ShellRenderer = (variant: ShellVariant) => string;

// The shell's markup needs none of the stylesheets its components import.
const STYLESHEET_STUB = '\0play100-shell-stylesheet';
const stubStylesheets: Plugin = {
  name: 'play100-shell-stylesheet-stub',
  enforce: 'pre',
  resolveId: (id) => (/\.css(?:\?|$)/.test(id) ? STYLESHEET_STUB : undefined),
  load: (id) => (id === STYLESHEET_STUB ? 'export default ""' : undefined),
};

/**
 * Loads renderShell from the source tree through Vite's module runner, so a build renders the shell from the same
 * components as the app it bundles. The runner reads no vite.config.ts and no .env file, and loads packages natively.
 */
export async function loadShellRenderer(root: string): Promise<ShellRenderer> {
  const { module } = await runnerImport<{ renderShell: ShellRenderer }>(
    path.resolve(root, 'src/first-paint/shell-render.tsx'),
    {
      root,
      logLevel: 'error',
      plugins: [stubStylesheets],
      // React's production build, which a build loads, has no jsxDEV.
      oxc: { jsx: { runtime: 'automatic', development: false } },
    },
  );
  return module.renderShell;
}

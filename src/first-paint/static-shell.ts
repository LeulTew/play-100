import { createContext } from 'react';

/**
 * True only while the build renders the static first-paint shell (shell-render.tsx, docs/first-paint-shell.md). The
 * app never provides it, so its first commit renders exactly what it did before.
 */
export const StaticShellContext = createContext(false);

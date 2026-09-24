import type { AppPage } from '../../lib/types';

/**
 * Identity of a routed page's failure boundary. A new identity remounts the whole page, so every URL that
 * shows the one My games workspace (/my-games, /my-library, /my-rankings and their tabs) shares one identity:
 * switching between them must keep the workspace, its unsaved drafts and its open panels.
 */
export function routeBoundaryKey(route: AppPage, content: string, scope: string): string {
  return `${content === 'personal' ? 'personal' : route}:${scope}`;
}

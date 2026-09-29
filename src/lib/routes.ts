// The one list of pages the app serves from index.html. The router (url.ts), the offline worker and client error
// reports read it. vercel.json can't import it, so routes.test.ts checks its rewrites against this list.
// scripts/pwa-build.ts bundles this module into the self-contained sw.js, so keep it free of runtime imports.
export const APP_ROUTES = [
  { path: '/', page: 'collection', shell: true },
  { path: '/my-games', page: 'games', shell: true },
  { path: '/my-library', page: 'library', shell: true },
  { path: '/my-rankings', page: 'rankings', shell: true },
  { path: '/discover', page: 'discover', shell: true },
  { path: '/account', page: 'account', shell: false },
  { path: '/publish', page: 'publish', shell: false },
  { path: '/community', page: 'community', shell: false },
  { path: '/u/:handle', page: 'profile', shell: false },
  { path: '/creator', page: 'creator', shell: false },
  { path: '/data-use', page: null, shell: false },
  { path: '/friends', page: 'friends', shell: false },
  { path: '/friends/sharing', page: 'friend-sharing', shell: false },
  { path: '/friends/sharing/games', page: 'friend-shelf', shell: false },
  { path: '/friends/:uid', page: 'friend', shell: false },
  { path: '/invite', page: 'invite', shell: false },
  { path: '/compare', page: 'compare', shell: false },
] as const;

export type AppRoute = (typeof APP_ROUTES)[number];
export type AppRoutePath = AppRoute['path'];

const paramRoutes = APP_ROUTES.filter((route) => route.path.includes('/:')).map((route) => ({
  route,
  pattern: new RegExp(`^${route.path.replace(/:[a-z]+/g, '[^/]+')}$`),
}));

// Matches a pathname exactly (no trailing-slash or case folding); each caller normalises as it needs.
export function appRoute(pathname: string): AppRoute | null {
  return (
    APP_ROUTES.find((route) => route.path === pathname) ??
    paramRoutes.find(({ pattern }) => pattern.test(pathname))?.route ??
    null
  );
}

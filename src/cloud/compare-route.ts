import type { AppPage } from '../lib/types';

/** The Compare group the URL last named, and the generation Compare is keyed on, which remounts it. */
export interface CompareRoute {
  group: string;
  generation: number;
}
export const initialCompareRoute: CompareRoute = { group: '', generation: 0 };

/**
 * The route after a render of `page` whose URL names `urlGroup`. On Compare, a group other than the one last named is a
 * navigation, which opens that group afresh in a new generation. Other pages leave the route as it was.
 */
export function compareRouteFor(route: CompareRoute, page: AppPage, urlGroup: string): CompareRoute {
  if (page !== 'compare' || urlGroup === route.group) return route;
  return { group: urlGroup, generation: route.generation + 1 };
}

/** The route once Compare has put `group` in the URL itself: still the same page, so the same generation. */
export function keepCompareRouteGroup(route: CompareRoute, group: string): CompareRoute {
  return route.group === group ? route : { ...route, group };
}

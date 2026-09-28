import { describe, expect, it } from 'vitest';
import { compareRouteFor, initialCompareRoute, keepCompareRouteGroup } from './compare-route';

describe('the Compare route generation', () => {
  it('opens the group the URL names in a new generation, once', () => {
    const opened = compareRouteFor(initialCompareRoute, 'compare', 'six');
    expect(opened).toEqual({ group: 'six', generation: 1 });
    expect(compareRouteFor(opened, 'compare', 'six')).toBe(opened);
    expect(compareRouteFor(initialCompareRoute, 'compare', '')).toBe(initialCompareRoute);
  });

  it("keeps the generation for a group Compare put in the URL itself, so the page's draft survives", () => {
    const opened = compareRouteFor(initialCompareRoute, 'compare', 'two');
    const chosen = keepCompareRouteGroup(opened, 'six');
    expect(chosen).toEqual({ group: 'six', generation: 1 });
    expect(compareRouteFor(chosen, 'compare', 'six')).toBe(chosen);
    const cleared = keepCompareRouteGroup(chosen, '');
    expect(compareRouteFor(cleared, 'compare', '')).toBe(cleared);
    expect(keepCompareRouteGroup(cleared, '')).toBe(cleared);
  });

  it('opens a navigation to another group afresh', () => {
    const chosen = keepCompareRouteGroup(compareRouteFor(initialCompareRoute, 'compare', 'two'), 'six');
    expect(compareRouteFor(chosen, 'compare', 'two')).toEqual({ group: 'two', generation: 2 });
  });

  it('leaves the route alone on other pages', () => {
    const opened = compareRouteFor(initialCompareRoute, 'compare', 'six');
    expect(compareRouteFor(opened, 'friends', '')).toBe(opened);
    expect(compareRouteFor(opened, 'collection', 'other')).toBe(opened);
  });
});

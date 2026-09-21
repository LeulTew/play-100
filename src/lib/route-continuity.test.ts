import { describe, expect, it, vi } from 'vitest';
import type { MotionSession } from '../motion';
import { arrivalMotion, isRouteArrival, playArrival, routeFamily } from './route-continuity';
import type { CommittedRouteState } from './route-continuity';

const initial: CommittedRouteState = { family: 'collection', scopeEpoch: 0, navigationEpoch: 1, blocked: false };

describe('committed route arrival classification', () => {
  it('normalizes private aliases so a tab is not a second root route entrance', () => {
    expect((['games', 'library', 'rankings'] as const).map(routeFamily)).toEqual(['my-games', 'my-games', 'my-games']);
    expect(routeFamily('discover')).toBe('discover');
    expect(routeFamily('friend-sharing')).toBe('friend-sharing');
  });

  it('does not animate initial load or an unavailable route becoming ready', () => {
    expect(isRouteArrival(null, initial)).toBe(false);
    const loading = { ...initial, family: 'my-games' as const, blocked: true };
    expect(isRouteArrival(initial, loading)).toBe(false);
    expect(isRouteArrival(loading, { ...loading, blocked: false })).toBe(false);
  });

  it('starts only when a ready route family actually changes in the same scope', () => {
    expect(isRouteArrival(initial, { ...initial, family: 'discover', navigationEpoch: 2 })).toBe(true);
    expect(isRouteArrival({ ...initial, blocked: true }, { ...initial, family: 'discover', navigationEpoch: 2 })).toBe(true);
    expect(isRouteArrival(initial, { ...initial, family: 'discover', navigationEpoch: 2, scopeEpoch: 1 })).toBe(false);
  });

  it('does not use navigation counters, filters or detail changes as a route trigger', () => {
    expect(isRouteArrival(initial, { ...initial, navigationEpoch: 2 })).toBe(false);
    expect(isRouteArrival(initial, { ...initial, navigationEpoch: 40, blocked: true })).toBe(false);
    expect(isRouteArrival({ ...initial, blocked: true }, { ...initial, navigationEpoch: 41 })).toBe(false);
  });

  it('does not replay an old family after an account A-B-A epoch sequence', () => {
    const other = { ...initial, family: 'my-games' as const, scopeEpoch: 1, navigationEpoch: 2 };
    expect(isRouteArrival(initial, other)).toBe(false);
    expect(isRouteArrival(other, { ...initial, scopeEpoch: 2, navigationEpoch: 3 })).toBe(false);
  });
});

describe('bounded transform-only arrival recipes', () => {
  it.each([
    ['route', false, 160, 'translateY(4px)'],
    ['route', true, 120, 'translateY(2px)'],
    ['tab', false, 120, 'translateX(4px)'],
    ['tab', true, 100, 'translateX(2px)'],
    ['library-page', false, 120, 'translateX(4px)'],
    ['library-page', true, 100, 'translateX(2px)'],
  ] as const)('%s at coarse=%s uses the locked duration and bounded displacement', (kind, coarse, duration, transform) => {
    const recipe = arrivalMotion(kind, coarse);
    expect(recipe.timing).toEqual({ duration, easing: 'cubic-bezier(.16,1,.3,1)' });
    expect(recipe.frames[0]).toEqual({ transform });
    expect(recipe.frames[1]).toEqual({ transform: kind === 'route' ? 'translateY(0px)' : 'translateX(0px)' });
    expect(recipe.frames.every(frame => Object.keys(frame).every(key => key === 'transform'))).toBe(true);
  });

  it('reverses a local cue without interpolating numbers or moving list rows', () => {
    expect(arrivalMotion('tab', false, -1).frames[0]).toEqual({ transform: 'translateX(-4px)' });
    expect(arrivalMotion('library-page', true, -1).frames[0]).toEqual({ transform: 'translateX(-2px)' });
  });
});

describe('owned animation lifecycle', () => {
  it('releases a static fallback without awaiting an animation', () => {
    const session: MotionSession = {
      signal: new AbortController().signal, isCurrent: () => true,
      animate: vi.fn(() => null), addCleanup: vi.fn(), finish: vi.fn(), cancel: vi.fn(),
    };
    const target = {} as HTMLElement;
    playArrival(session, target, arrivalMotion('route', false));
    expect(session.animate).toHaveBeenCalledWith(target, [{ transform: 'translateY(4px)' }, { transform: 'translateY(0px)' }], {
      duration: 160, easing: 'cubic-bezier(.16,1,.3,1)',
    });
    expect(session.finish).toHaveBeenCalledOnce();
  });

  it('completion and teardown touch only their own session', () => {
    const animation = new EventTarget();
    const disposers: Array<() => void> = [];
    const session: MotionSession = {
      signal: new AbortController().signal, isCurrent: () => true,
      animate: () => animation as Animation, addCleanup: dispose => { disposers.push(dispose); },
      finish: vi.fn(), cancel: vi.fn(),
    };
    playArrival(session, {} as HTMLElement, arrivalMotion('tab', true));
    expect(session.finish).not.toHaveBeenCalled();
    animation.dispatchEvent(new Event('finish'));
    expect(session.finish).toHaveBeenCalledOnce();
    for (const dispose of disposers) dispose();
    animation.dispatchEvent(new Event('finish'));
    expect(session.finish).toHaveBeenCalledOnce();
    expect(session.cancel).not.toHaveBeenCalled();
  });
});

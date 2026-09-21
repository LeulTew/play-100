import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useMotionPolicy, useMotionRuntime } from '../motion';
import { arrivalMotion, isRouteArrival, playArrival, visibleMotionTarget } from '../lib/route-continuity';
import type { CommittedRouteState } from '../lib/route-continuity';

export function useRouteArrival(main: RefObject<HTMLElement | null>, state: Readonly<CommittedRouteState>): void {
  const runtime = useMotionRuntime();
  const { animate, coarsePointer } = useMotionPolicy();
  const previous = useRef<CommittedRouteState | null>(null);
  const current = useRef(state);
  current.current = state;
  const { family, scopeEpoch, navigationEpoch, blocked } = state;

  useEffect(() => {
    const next = { family, scopeEpoch, navigationEpoch, blocked };
    const prior = previous.current;
    previous.current = next;
    if (!animate || !isRouteArrival(prior, next)) return;
    const session = runtime.startMotionSession({
      channel: 'route',
      guard: { isCurrent: () => !current.current.blocked && current.current.family === family &&
        current.current.scopeEpoch === scopeEpoch && current.current.navigationEpoch === navigationEpoch },
    });
    if (!session) return;
    const heading = [...(main.current?.querySelectorAll('[data-page-heading], h1') ?? [])].find(visibleMotionTarget);
    if (!heading) { session.finish(); return; }
    playArrival(session, heading, arrivalMotion('route', coarsePointer));
    return () => session.cancel();
  }, [main, runtime, family, scopeEpoch, navigationEpoch, blocked, animate, coarsePointer]);
}

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useMotionPolicy, useMotionRuntime } from '../motion';
import type { MotionSession } from '../motion';
import { arrivalMotion, playArrival, visibleMotionTarget } from '../lib/route-continuity';
import type { CommittedCue } from '../lib/route-continuity';

export function useCommittedCue(
  target: RefObject<HTMLElement | null>,
  cue: Readonly<CommittedCue> | null,
  active: boolean,
  guard: () => boolean,
): void {
  const runtime = useMotionRuntime();
  const { animate, coarsePointer } = useMotionPolicy();
  const seen = useRef<number | null>(null);
  const current = useRef({ cue, active, guard });
  const owned = useRef<MotionSession | null>(null);
  current.current = { cue, active, guard };
  const serial = cue?.serial;
  const kind = cue?.kind;
  const direction = cue?.direction;

  useEffect(() => {
    if (owned.current && (!current.current.active || !current.current.guard())) {
      owned.current.cancel('navigation');
      owned.current = null;
    }
  });

  useEffect(() => {
    if (serial === undefined || kind === undefined || direction === undefined || seen.current === serial) return;
    seen.current = serial;
    if (!active || !animate || !current.current.guard()) return;
    const session = runtime.startMotionSession({
      channel: 'route',
      guard: { isCurrent: () => current.current.active && current.current.cue?.serial === serial && current.current.guard() },
    });
    if (!session) return;
    const element = kind === 'library-page' ? target.current?.querySelector('.local-pager > p') ?? null : target.current;
    if (!visibleMotionTarget(element)) { session.finish(); return; }
    owned.current = session;
    session.addCleanup(() => { if (owned.current === session) owned.current = null; });
    playArrival(session, element, arrivalMotion(kind, coarsePointer, direction));
    return () => {
      session.cancel();
      if (owned.current === session) owned.current = null;
    };
  }, [target, runtime, serial, kind, direction, active, animate, coarsePointer]);
}

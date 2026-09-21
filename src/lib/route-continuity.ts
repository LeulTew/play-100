import type { MotionFrame, MotionSession, MotionTiming } from '../motion';
import type { AppPage } from './types';

export type RouteFamily = Exclude<AppPage, 'games' | 'library' | 'rankings'> | 'my-games';

export interface CommittedRouteState {
  readonly family: RouteFamily;
  readonly scopeEpoch: number;
  readonly navigationEpoch: number;
  readonly blocked: boolean;
}

export interface CommittedCue {
  readonly serial: number;
  readonly kind: 'tab' | 'library-page';
  readonly direction: -1 | 1;
}

export function routeFamily(page: AppPage): RouteFamily {
  return page === 'games' || page === 'library' || page === 'rankings' ? 'my-games' : page;
}

export function isRouteArrival(previous: CommittedRouteState | null, current: CommittedRouteState): boolean {
  return previous !== null && previous.family !== current.family &&
    previous.scopeEpoch === current.scopeEpoch && !current.blocked;
}

export function arrivalMotion(kind: 'route' | CommittedCue['kind'], coarse: boolean, direction: -1 | 1 = 1): {
  frames: readonly MotionFrame[]; timing: MotionTiming;
} {
  const distance = (coarse ? 2 : 4) * direction;
  const axis = kind === 'route' ? 'Y' : 'X';
  return {
    frames: [{ transform: `translate${axis}(${distance}px)` }, { transform: `translate${axis}(0px)` }],
    timing: { duration: kind === 'route' ? coarse ? 120 : 160 : coarse ? 100 : 120, easing: 'cubic-bezier(.16,1,.3,1)' },
  };
}

export function visibleMotionTarget(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected &&
    !element.closest('[hidden], [inert], dialog, .page-loading') &&
    !element.matches('button, a, input, textarea, select, [contenteditable]') &&
    !element.querySelector('button, a, input, textarea, select, [contenteditable]') &&
    element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible';
}

export function playArrival(session: MotionSession, target: HTMLElement, motion: ReturnType<typeof arrivalMotion>): void {
  const animation = session.animate(target, motion.frames, motion.timing);
  if (!animation) { session.finish(); return; }
  const finish = () => session.finish();
  animation.addEventListener('finish', finish, { once: true });
  session.addCleanup(() => animation.removeEventListener('finish', finish));
}

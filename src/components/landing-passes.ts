import { startTransition } from 'react';
import { afterNextPaint } from '../lib/after-paint';
import type { NavigationKind } from '../lib/navigation-kind';

/**
 * The cards a constrained device's landing renders before its first paint: the grid's first two rows on a desktop and
 * its first four on a phone, below the hero. The rest hold their places (render-containment.css) until the second pass.
 */
export const FIRST_PASS_CARDS = 8;

/**
 * Whether a landing that mounts now renders all its cards and its showcase at once. A constrained device renders them
 * in two passes, except where the browser restores a scroll position into them (a traversal) or a link opens the
 * films.
 */
export function rendersAtOnce({
  constrained,
  navigation,
  filmsLinked,
}: {
  constrained: boolean;
  navigation: NavigationKind;
  filmsLinked: boolean;
}): boolean {
  return !constrained || navigation === 'traverse' || filmsLinked;
}

/**
 * Schedules the second pass once the first has painted, in a transition: React builds its cards in slices that yield to
 * input, instead of one long task. Returns a cancel function.
 */
export function scheduleSecondPass(run: () => void, schedule: (run: () => void) => () => void = afterNextPaint) {
  return schedule(() => startTransition(run));
}

/**
 * Whether the first pass has its final content, so the second may follow it: the first cards, or the notice of a failed
 * load in their place. The showcase waits for the second pass, so a load that failed must release it too.
 */
export function firstPassSettled(status: 'loading' | 'ready' | 'error'): boolean {
  return status !== 'loading';
}

/** How long the page must go without scrolling before the 3D scene may take one of its start-up turns. */
export const SCROLL_QUIET_MS = 300;

export interface ScrollSettle {
  /** Whether the page has gone `quietMs` without a scroll, or has not scrolled since this started listening. */
  quiet(): boolean;
  /** Calls `ready` once the page has gone `quietMs` without a scroll, never synchronously; returns a cancel. */
  whenQuiet(ready: () => void): () => void;
  dispose(): void;
}

/**
 * Follows the page's scrolling, the page's own and any element's, so heavy work can wait for it to pause: a task
 * started mid-scroll holds the frames the scroll needs. A scroll only records its time, and a single timer rechecks
 * when the quiet period would end, so a long scroll costs no work per event.
 */
export function createScrollSettle(
  target: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'>,
  { quietMs = SCROLL_QUIET_MS, now = () => performance.now() }: { quietMs?: number; now?: () => number } = {},
): ScrollSettle {
  let last = Number.NEGATIVE_INFINITY;
  let timer: number | null = null;
  const waiting = new Set<() => void>();
  const onScroll = () => {
    last = now();
  };
  const remaining = () => last + quietMs - now();
  const arm = () => {
    if (timer !== null) return;
    timer = target.setTimeout(check, Math.max(0, remaining()));
  };
  function check() {
    timer = null;
    if (remaining() > 0) {
      arm();
      return;
    }
    const ready = [...waiting];
    waiting.clear();
    for (const callback of ready) callback();
  }
  target.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return {
    quiet: () => remaining() <= 0,
    whenQuiet(ready) {
      waiting.add(ready);
      arm();
      return () => {
        waiting.delete(ready);
        if (!waiting.size && timer !== null) {
          target.clearTimeout(timer);
          timer = null;
        }
      };
    },
    dispose() {
      target.removeEventListener('scroll', onScroll, { capture: true });
      waiting.clear();
      if (timer !== null) target.clearTimeout(timer);
      timer = null;
    },
  };
}

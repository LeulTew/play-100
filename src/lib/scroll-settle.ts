/** How long the page must go without scrolling before the 3D scene takes one of its start-up turns. */
export const SCROLL_QUIET_MS = 300;

/**
 * Follows the page's scrolling, the page's own and any element's, so heavy work can wait for it to pause: a long task
 * that starts mid-scroll holds the frames the scroll needs. `wait()` is how long until the page will have gone
 * SCROLL_QUIET_MS without a scroll: 0 once it has, or if it has not scrolled since this started following.
 */
export function followScrolling(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  now = () => performance.now(),
) {
  let last = Number.NEGATIVE_INFINITY;
  const onScroll = () => {
    last = now();
  };
  target.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return {
    wait: () => Math.max(0, last + SCROLL_QUIET_MS - now()),
    stop: () => target.removeEventListener('scroll', onScroll, { capture: true }),
  };
}

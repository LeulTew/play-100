import { describe, expect, it, vi } from 'vitest';
import { followScrolling, SCROLL_QUIET_MS } from './scroll-settle';

function page() {
  let time = 1000;
  const target = new EventTarget();
  const added = vi.spyOn(target, 'addEventListener');
  const scrolling = followScrolling(target, () => time);
  return {
    scrolling,
    added,
    scroll: () => target.dispatchEvent(new Event('scroll')),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('waiting for scrolling to pause', () => {
  it('follows every scroll, of the page or of any element, without blocking it', () => {
    const { added } = page();
    expect(added).toHaveBeenCalledWith('scroll', expect.any(Function), { capture: true, passive: true });
  });

  it('has nothing to wait for before the first scroll', () => {
    expect(page().scrolling.wait()).toBe(0);
  });

  it(`waits until ${SCROLL_QUIET_MS} ms have passed without a scroll, counted from the last one`, () => {
    const { scrolling, scroll, advance } = page();
    scroll();
    expect(scrolling.wait()).toBe(SCROLL_QUIET_MS);
    advance(200);
    expect(scrolling.wait()).toBe(100);
    scroll();
    expect(scrolling.wait()).toBe(SCROLL_QUIET_MS);
    advance(299);
    expect(scrolling.wait()).toBe(1);
    advance(1);
    expect(scrolling.wait()).toBe(0);
    advance(5000);
    expect(scrolling.wait()).toBe(0);
  });

  it('stops following scrolls once stopped', () => {
    const { scrolling, scroll, advance } = page();
    scroll();
    advance(SCROLL_QUIET_MS);
    scrolling.stop();
    scroll();
    expect(scrolling.wait()).toBe(0);
  });
});

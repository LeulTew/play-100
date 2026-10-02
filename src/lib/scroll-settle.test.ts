import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScrollSettle, SCROLL_QUIET_MS } from './scroll-settle';

afterEach(() => {
  vi.useRealTimers();
});

function page() {
  vi.useFakeTimers();
  const target = Object.assign(new EventTarget(), {
    setTimeout: (callback: () => void, ms?: number) => globalThis.setTimeout(callback, ms) as unknown as number,
    clearTimeout: (id?: number) => globalThis.clearTimeout(id),
  });
  const added = vi.spyOn(target, 'addEventListener');
  const settle = createScrollSettle(target, { now: () => Date.now() });
  const scroll = () => target.dispatchEvent(new Event('scroll'));
  return { settle, scroll, added };
}

describe('waiting for scrolling to pause', () => {
  it('follows every scroll, of the page or of any element, without blocking it', () => {
    const { added } = page();
    expect(added).toHaveBeenCalledWith('scroll', expect.any(Function), { capture: true, passive: true });
  });

  it('is quiet before any scroll, and still calls a waiter on a later turn, not synchronously', () => {
    const { settle } = page();
    const ready = vi.fn();
    expect(settle.quiet()).toBe(true);
    settle.whenQuiet(ready);
    expect(ready).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(ready).toHaveBeenCalledOnce();
  });

  it(`waits until ${SCROLL_QUIET_MS} ms have passed without a scroll, counted from the last one`, () => {
    const { settle, scroll } = page();
    const ready = vi.fn();
    scroll();
    expect(settle.quiet()).toBe(false);
    settle.whenQuiet(ready);
    vi.advanceTimersByTime(200);
    scroll();
    vi.advanceTimersByTime(299);
    expect(ready).not.toHaveBeenCalled();
    expect(settle.quiet()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(ready).toHaveBeenCalledOnce();
    expect(settle.quiet()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps one timer however many scrolls arrive', () => {
    const { settle, scroll } = page();
    scroll();
    settle.whenQuiet(vi.fn());
    for (let step = 0; step < 50; step += 1) {
      vi.advanceTimersByTime(10);
      scroll();
    }
    expect(vi.getTimerCount()).toBe(1);
  });

  it('drops a cancelled waiter and, with none left, its timer', () => {
    const { settle, scroll } = page();
    const ready = vi.fn();
    scroll();
    const cancel = settle.whenQuiet(ready);
    cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(ready).not.toHaveBeenCalled();
  });

  it('stops following scrolls and calls no waiter once disposed', () => {
    const { settle, scroll } = page();
    const ready = vi.fn();
    scroll();
    settle.whenQuiet(ready);
    settle.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(SCROLL_QUIET_MS);
    scroll();
    expect(settle.quiet()).toBe(true);
    expect(ready).not.toHaveBeenCalled();
  });
});

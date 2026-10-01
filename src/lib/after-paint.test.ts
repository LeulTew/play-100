import { describe, expect, it, vi } from 'vitest';
import { afterNextPaint } from './after-paint';
import type { PaintPage } from './after-paint';

function page(visibilityState: DocumentVisibilityState, withObserver = true) {
  const root = { tagName: 'HTML' } as unknown as Element;
  const observers: { callback: () => void; targets: Element[]; disconnected: boolean }[] = [];
  const timers = new Map<number, () => void>();
  let next = 0;
  class Observer {
    record: (typeof observers)[number];
    constructor(callback: () => void) {
      this.record = { callback, targets: [], disconnected: false };
      observers.push(this.record);
    }
    observe(target: Element) {
      this.record.targets.push(target);
    }
    disconnect() {
      this.record.disconnected = true;
    }
  }
  const fake: PaintPage = {
    document: { visibilityState, documentElement: root },
    IntersectionObserver: withObserver ? Observer : undefined,
    setTimeout: vi.fn((callback: () => void) => {
      timers.set(++next, callback);
      return next;
    }),
    clearTimeout: vi.fn((handle: number) => void timers.delete(handle)),
  };
  return { fake, root, observers, timers };
}

describe('after the next paint', () => {
  it("waits for the rendering update's first intersection notification, with no timer a test clock could hold", () => {
    const { fake, root, observers } = page('visible');
    const run = vi.fn();
    afterNextPaint(run, fake);
    expect(observers).toHaveLength(1);
    expect(observers[0]!.targets).toEqual([root]);
    expect(run).not.toHaveBeenCalled();
    expect(fake.setTimeout).not.toHaveBeenCalled();
    observers[0]!.callback();
    observers[0]!.callback();
    expect(run).toHaveBeenCalledOnce();
    expect(observers[0]!.disconnected).toBe(true);
  });

  it('runs nothing once cancelled', () => {
    const { fake, observers } = page('visible');
    const run = vi.fn();
    const cancel = afterNextPaint(run, fake);
    cancel();
    expect(observers[0]!.disconnected).toBe(true);
    observers[0]!.callback();
    expect(run).not.toHaveBeenCalled();
  });

  it('runs after a task in a hidden document, which paints nothing, or without IntersectionObserver', () => {
    for (const { fake, timers, observers } of [page('hidden'), page('visible', false)]) {
      const run = vi.fn();
      afterNextPaint(run, fake);
      expect(observers).toHaveLength(0);
      expect(run).not.toHaveBeenCalled();
      [...timers.values()].forEach((callback) => callback());
      expect(run).toHaveBeenCalledOnce();
    }
    const { fake, timers } = page('hidden');
    const run = vi.fn();
    afterNextPaint(run, fake)();
    expect(timers.size).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
});

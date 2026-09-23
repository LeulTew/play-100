import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterFrame } from './after-frame';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  let frame: FrameRequestCallback | undefined;
  let task: (() => void) | undefined;
  const cancelFrame = vi.fn();
  const clearTimer = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  vi.stubGlobal('window', {
    setTimeout: (callback: () => void) => { task = callback; return 2; },
    clearTimeout: clearTimer,
  });
  return { frame: () => frame?.(0), task: () => task?.(), cancelFrame, clearTimer };
}

describe('post-frame enrichment scheduling', () => {
  it('does not start enrichment in the open task or inside the paint-frame callback', () => {
    const timing = fixture();
    const work = vi.fn();
    afterFrame(work);
    expect(work).not.toHaveBeenCalled();
    timing.frame();
    expect(work).not.toHaveBeenCalled();
    timing.task();
    expect(work).toHaveBeenCalledOnce();
  });

  it.each(['before-frame', 'after-frame'] as const)('cancels a closed or superseded detail %s', phase => {
    const timing = fixture();
    const work = vi.fn();
    const cancel = afterFrame(work);
    if (phase === 'after-frame') timing.frame();
    cancel();
    timing.task();
    expect(work).not.toHaveBeenCalled();
    expect(timing.cancelFrame).toHaveBeenCalledWith(1);
    if (phase === 'after-frame') expect(timing.clearTimer).toHaveBeenCalledWith(2);
  });
});

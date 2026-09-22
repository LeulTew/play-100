import { describe, expect, it } from 'vitest';
import { COMPARE_CLICK_TAIL_MS, COMPARE_TOUCH_HOLD_MS, COMPARE_TOUCH_SLOP, matchesCompareClick, ownsCompareCaptureLoss } from './compare-drag-controller';
import type { CompareClickTail } from './compare-drag-controller';

const click = {
  button: 0, detail: 1, clientX: 120, clientY: 240, pointerId: 1,
  altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
};
const tail: CompareClickTail = { x: 120, y: 240, pointerId: 1, until: 1_000 + COMPARE_CLICK_TAIL_MS };

describe('Compare pointer capture ownership', () => {
  it('accepts only capture loss from the owned node and pointer, never a descendant or unrelated pointer', () => {
    const grip = new EventTarget();
    const descendant = new EventTarget();
    expect(ownsCompareCaptureLoss({ target: grip, pointerId: 7 }, grip, 7)).toBe(true);
    expect(ownsCompareCaptureLoss({ target: descendant, pointerId: 7 }, grip, 7)).toBe(false);
    expect(ownsCompareCaptureLoss({ target: grip, pointerId: 8 }, grip, 7)).toBe(false);
    expect(ownsCompareCaptureLoss({ target: null, pointerId: 7 }, grip, 7)).toBe(false);
  });
});

describe('Compare terminal click matching', () => {
  it('matches only the terminating pointer at the release position and bounded time', () => {
    expect(matchesCompareClick(click, tail, 1_000)).toBe(true);
    expect(matchesCompareClick(click, tail, tail.until)).toBe(true);
    expect(matchesCompareClick(click, tail, tail.until + 1)).toBe(false);
    expect(matchesCompareClick(click, null, 1_000)).toBe(false);
    expect(matchesCompareClick({ ...click, pointerId: 2 }, tail, 1_000)).toBe(false);
    expect(matchesCompareClick({ ...click, clientX: 120 + COMPARE_TOUCH_SLOP }, tail, 1_000)).toBe(true);
    expect(matchesCompareClick({ ...click, clientX: 129 }, tail, 1_000)).toBe(false);
    expect(matchesCompareClick({ ...click, clientY: 249 }, tail, 1_000)).toBe(false);
  });

  it('never consumes native keyboard, assistive technology, middle or modified activation', () => {
    for (const patch of [
      { detail: 0 }, { button: 1 }, { button: 2 },
      { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true },
    ]) expect(matchesCompareClick({ ...click, ...patch }, tail, 1_000)).toBe(false);
  });

  it('allows legacy mouse-event matching without assuming that every click has a pointer ID', () => {
    expect(matchesCompareClick({ ...click, pointerId: undefined }, tail, 1_000)).toBe(true);
    expect(matchesCompareClick(click, { ...tail, pointerId: undefined }, 1_000)).toBe(true);
    expect(matchesCompareClick({ ...click, detail: 0, pointerId: -1 }, tail, 1_000)).toBe(false);
  });

  it('keeps only input coordinates and lifetime in the click tail', () => {
    expect(Object.keys(tail).sort()).toEqual(['pointerId', 'until', 'x', 'y']);
    expect(COMPARE_CLICK_TAIL_MS).toBe(350);
    expect(COMPARE_TOUCH_HOLD_MS).toBe(280);
    expect(COMPARE_TOUCH_SLOP).toBe(8);
  });
});

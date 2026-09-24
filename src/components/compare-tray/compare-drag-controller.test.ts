import { describe, expect, it } from 'vitest';
import { COMPARE_CLICK_TAIL_MS, COMPARE_TOUCH_HOLD_MS, COMPARE_TOUCH_SLOP, isCompareSourceHidden, matchesCompareClick, ownsCompareCaptureLoss } from './compare-drag-controller';
import type { CompareClickTail } from './compare-drag-controller';

const click = {
  button: 0, detail: 1, clientX: 120, clientY: 240, pointerId: 1,
  altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
};
const tail: CompareClickTail = { x: 120, y: 240, pointerId: 1, until: 1_000 + COMPARE_CLICK_TAIL_MS };

class VisibilityNode {
  readonly selectors = new Set<string>();
  constructor(readonly parentElement: VisibilityNode | null = null) {}
  matches(selector: string): boolean {
    return selector.split(',').some(part => this.selectors.has(part));
  }
}

describe('Compare source visibility', () => {
  it('allows a grip with or without its own aria-hidden exclusion', () => {
    const grip = new VisibilityNode();
    grip.selectors.add('[data-compare-drag-grip]');
    expect(isCompareSourceHidden(grip)).toBe(false);
    grip.selectors.add('[aria-hidden="true"]');
    expect(isCompareSourceHidden(grip)).toBe(false);
    grip.selectors.delete('[data-compare-drag-grip]');
    expect(isCompareSourceHidden(grip)).toBe(true);
  });

  it.each(['[aria-hidden="true"]', '[inert]', '[hidden]'])('refuses a grip under a %s ancestor and recovers when it is cleared', selector => {
    const ancestor = new VisibilityNode();
    const grip = new VisibilityNode(new VisibilityNode(ancestor));
    grip.selectors.add('[data-compare-drag-grip]');
    grip.selectors.add('[aria-hidden="true"]');
    expect(isCompareSourceHidden(grip)).toBe(false);
    ancestor.selectors.add(selector);
    expect(isCompareSourceHidden(grip)).toBe(true);
    ancestor.selectors.delete(selector);
    expect(isCompareSourceHidden(grip)).toBe(false);
  });

  it.each(['[hidden]', '[inert]'])('refuses a grip with its own %s state and recovers when it is cleared', selector => {
    const grip = new VisibilityNode();
    grip.selectors.add('[data-compare-drag-grip]');
    grip.selectors.add('[aria-hidden="true"]');
    expect(isCompareSourceHidden(grip)).toBe(false);
    grip.selectors.add(selector);
    expect(isCompareSourceHidden(grip)).toBe(true);
    grip.selectors.delete(selector);
    expect(isCompareSourceHidden(grip)).toBe(false);
  });

  it('refuses an aria-hidden non-grip source and recovers when the attribute is cleared', () => {
    const source = new VisibilityNode();
    expect(isCompareSourceHidden(source)).toBe(false);
    source.selectors.add('[aria-hidden="true"]');
    expect(isCompareSourceHidden(source)).toBe(true);
    source.selectors.delete('[aria-hidden="true"]');
    expect(isCompareSourceHidden(source)).toBe(false);
  });
});

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

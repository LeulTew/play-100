import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CountUp from './CountUp';
import { stepCount } from './count-up';

describe('the bounded native queue counter', () => {
  it.each([0, 1, 10000])('renders the exact initial and accessible value without an intro (%s)', (to) => {
    expect(renderToStaticMarkup(createElement(CountUp, { to, animate: true, className: 'saved-count' }))).toBe(
      `<span class="saved-count"><span class="sr-only">${to}</span><span aria-hidden="true">${to}</span></span>`,
    );
  });

  it.each([
    [0, 1],
    [0, 10000],
    [10000, 0],
    [42, 2],
  ])('approaches %s to %s without an initial jump or overshoot', (from, to) => {
    const start = { value: from, velocity: 0 };
    expect(stepCount(start, to, 0).value).toBe(from);
    for (let elapsed = 0; elapsed <= 3000; elapsed += 16.7) {
      const value = stepCount(start, to, elapsed).value;
      expect(value).toBeGreaterThanOrEqual(Math.min(from, to));
      expect(value).toBeLessThanOrEqual(Math.max(from, to));
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(stepCount(start, to, 3000)).toEqual({ value: to, velocity: 0, done: true });
  });

  it('retargets from the current value and velocity, then settles exactly at zero', () => {
    const midway = stepCount({ value: 0, velocity: 0 }, 10000, 120);
    expect(midway.done).toBe(false);
    expect(stepCount(midway, 0, 0)).toMatchObject({ value: midway.value, velocity: midway.velocity });
    expect(stepCount(midway, 0, 3000)).toEqual({ value: 0, velocity: 0, done: true });
  });

  it('is already settled when there is nothing to interpolate', () => {
    expect(stepCount({ value: 42, velocity: 0 }, 42, 0)).toEqual({ value: 42, velocity: 0, done: true });
  });
});

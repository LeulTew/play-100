import { describe, expect, it } from 'vitest';
import { formatResultRange } from './result-range';

describe('readable result ranges', () => {
  it.each([
    [0, 0, 0, '0 matching games'],
    [1, 1, 1, '1 matching game'],
    [2, 1, 2, '1–2 of 2 matching games'],
    [26, 1, 25, '1–25 of 26 matching games'],
    [26, 26, 26, '26–26 of 26 matching games'],
  ] as const)('formats %i records at %i–%i', (total, start, end, expected) => {
    expect(formatResultRange(total, start, end, 'matching game')).toBe(expected);
  });

  it('uses singular wording for collection and ranking results too', () => {
    expect(formatResultRange(1, 1, 1)).toBe('1 game');
    expect(formatResultRange(1, 1, 1, 'ranked game')).toBe('1 ranked game');
  });

  it.each([
    [-1, 0, 0],
    [0, 1, 1],
    [2, 0, 2],
    [2, 1, 3],
    [2, 2, 1],
  ])('rejects invalid result range %j', (total, start, end) => {
    expect(() => formatResultRange(total, start, end)).toThrow(RangeError);
  });
});

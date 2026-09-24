import { describe, expect, it } from 'vitest';
import { getLocalPage } from './local-pagination';

describe('unordered Library uses the shared 25-row page contract', () => {
  it.each([
    [0, 0, { offset: 0, page: 0, pageCount: 0, start: 0, end: 0 }],
    [1, 0, { offset: 0, page: 1, pageCount: 1, start: 1, end: 1 }],
    [25, 25, { offset: 0, page: 1, pageCount: 1, start: 1, end: 25 }],
    [26, 25, { offset: 25, page: 2, pageCount: 2, start: 26, end: 26 }],
    [500, 475, { offset: 475, page: 20, pageCount: 20, start: 476, end: 500 }],
    [500, 501, { offset: 475, page: 20, pageCount: 20, start: 476, end: 500 }],
    [500, 37, { offset: 25, page: 2, pageCount: 20, start: 26, end: 50 }],
    [25, 475, { offset: 0, page: 1, pageCount: 1, start: 1, end: 25 }],
  ])('bounds %i matches at requested offset %i', (total, offset, expected) => {
    expect(getLocalPage(total, 25, offset)).toEqual(expected);
  });
  it.each([-1, NaN, Infinity, 1.25, Number.MAX_SAFE_INTEGER + 1])('does not mask invalid offset %s', (offset) => {
    expect(() => getLocalPage(500, 25, offset)).toThrow(RangeError);
  });
});

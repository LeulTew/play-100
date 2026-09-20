import { describe, expect, it } from 'vitest';
import { getLocalPage } from './local-pagination';

describe('known local page bounds', () => {
  it('keeps 24 records per page with 36 pages and five final records for the public catalog', () => {
    expect(getLocalPage(845, 24, 0)).toEqual({ offset: 0, page: 1, pageCount: 36, start: 1, end: 24 });
    expect(getLocalPage(845, 24, 24)).toEqual({ offset: 24, page: 2, pageCount: 36, start: 25, end: 48 });
    expect(getLocalPage(845, 24, 840)).toEqual({ offset: 840, page: 36, pageCount: 36, start: 841, end: 845 });
  });
  it('aligns old local offsets and clamps smaller filtered sets without inventing an empty page', () => {
    expect(getLocalPage(845, 24, 25).offset).toBe(24);
    expect(getLocalPage(845, 24, 10_000).offset).toBe(840);
    expect(getLocalPage(25, 24, 840)).toEqual({ offset: 24, page: 2, pageCount: 2, start: 25, end: 25 });
    expect(getLocalPage(3, 24, 840)).toEqual({ offset: 0, page: 1, pageCount: 1, start: 1, end: 3 });
    expect(getLocalPage(0, 24, 840)).toEqual({ offset: 0, page: 0, pageCount: 0, start: 0, end: 0 });
  });
  it('does not add an empty page to an exact multiple', () => {
    expect(getLocalPage(48, 24, 48)).toEqual({ offset: 24, page: 2, pageCount: 2, start: 25, end: 48 });
  });
  it.each([[1, 0, 0], [-1, 24, 0], [1, 24, -1], [1.5, 24, 0], [1, 24, Infinity], [1, NaN, 0]])('rejects invalid internal input %j', (total, pageSize, offset) => {
    expect(() => getLocalPage(total, pageSize, offset)).toThrow(RangeError);
  });
});

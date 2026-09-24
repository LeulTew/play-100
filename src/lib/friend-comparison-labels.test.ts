import { describe, expect, it } from 'vitest';
import { unrankedCellLabel } from './friend-comparison';

describe('comparison cell labels', () => {
  it('shows one distinct, readable label for every cell without a ranked entry', () => {
    const labels = {
      absent: unrankedCellLabel('absent'),
      unfetched: unrankedCellLabel('unfetched'),
      loading: unrankedCellLabel('loading'),
      unshared: unrankedCellLabel('unshared'),
      unavailable: unrankedCellLabel('unavailable'),
      error: unrankedCellLabel('error'),
    };
    expect(labels).toEqual({
      absent: 'Not in shared list',
      unfetched: 'Not loaded yet',
      loading: 'Loading…',
      unshared: 'Not shared',
      unavailable: 'Unavailable',
      error: 'Could not load',
    });
    expect(new Set(Object.values(labels)).size).toBe(6);
  });
});

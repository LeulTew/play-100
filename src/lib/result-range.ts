// The result count every listing shows. Only My games and Discover page their results (local-pagination.ts), so the
// count lives apart from the pager, which loads with those pages instead of with The 100.
export function formatResultRange(total: number, start: number, end: number, item = 'game'): string {
  if (
    ![total, start, end].every(Number.isSafeInteger) ||
    total < 0 ||
    (total === 0 ? start !== 0 || end !== 0 : start < 1 || end < start || end > total)
  ) {
    throw new RangeError('Result counts require a valid range within the nonnegative total.');
  }
  if (total < 2) return `${total} ${item}${total === 1 ? '' : 's'}`;
  return `${start}–${end} of ${total} ${item}s`;
}

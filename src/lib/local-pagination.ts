export interface LocalPage {
  offset: number;
  page: number;
  pageCount: number;
  start: number;
  end: number;
}

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

export function getLocalPage(total: number, pageSize: number, offset: number): LocalPage {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new RangeError('Local pagination requires a nonnegative total and offset, and a positive page size.');
  }
  const pageCount = Math.ceil(total / pageSize);
  const page = pageCount ? Math.min(Math.floor(offset / pageSize) + 1, pageCount) : 0;
  const boundedOffset = page ? (page - 1) * pageSize : 0;
  return {
    offset: boundedOffset,
    page,
    pageCount,
    start: total ? boundedOffset + 1 : 0,
    end: Math.min(boundedOffset + pageSize, total),
  };
}

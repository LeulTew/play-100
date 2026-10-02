export interface LocalPage {
  offset: number;
  page: number;
  pageCount: number;
  start: number;
  end: number;
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

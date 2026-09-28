import { describe, expect, it } from 'vitest';
import { resolveLibraryPageCursor } from './library-page-cursor';

const prior = { definition: 'all', query: '', input: 3, target: 3 };
const view = { ...prior, usesUrlPage: true, total: 100, pageSize: 25 };

describe('library page cursor', () => {
  it('keeps a deep-linked page and accepts browser back or forward independently of rendering', () => {
    expect(resolveLibraryPageCursor(prior, view).page.offset).toBe(50);
    expect(resolveLibraryPageCursor(prior, { ...view, input: 2 }).page.offset).toBe(25);
    expect(resolveLibraryPageCursor(prior, { ...view, input: 4 }).page.offset).toBe(75);
  });

  it('keeps a search reset effective until the URL replacement commits', () => {
    const searched = { ...view, query: 'game', definition: 'search' };
    const first = resolveLibraryPageCursor(prior, searched);
    expect(first.page.offset).toBe(0);
    expect(resolveLibraryPageCursor(first.cursor, searched).page.offset).toBe(0);
    const committed = resolveLibraryPageCursor(first.cursor, { ...searched, input: 1 });
    expect(committed.page.offset).toBe(0);
    expect(resolveLibraryPageCursor(committed.cursor, { ...searched, input: 2 }).page.offset).toBe(25);
  });

  it.each([true, false])('resets changed queries with URL-backed=%s paging', (usesUrlPage) => {
    expect(resolveLibraryPageCursor(prior, { ...view, usesUrlPage, query: 'new' }).page.offset).toBe(0);
  });

  it('resets local Queue filters but preserves a valid history-owned Library page', () => {
    expect(resolveLibraryPageCursor(prior, { ...view, definition: 'completed' }).page.offset).toBe(50);
    expect(resolveLibraryPageCursor(prior, { ...view, definition: 'completed', usesUrlPage: false }).page.offset).toBe(
      0,
    );
  });

  it('clamps deletion of the last page and keeps an empty view on page one', () => {
    const deleted = resolveLibraryPageCursor(prior, { ...view, total: 26 });
    expect(deleted.page.offset).toBe(25);
    expect(deleted.cursor.target).toBe(2);
    expect(resolveLibraryPageCursor(deleted.cursor, { ...view, total: 26 }).page.offset).toBe(25);
    expect(resolveLibraryPageCursor(prior, { ...view, total: 0 }).cursor.target).toBe(1);
  });
});

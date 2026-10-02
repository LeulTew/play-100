import { focusPendingEditor, visibleFocusTarget } from '../../lib/dialog-focus';
import type { LibraryRecord } from '../../lib/personal-types';

export type MoveDirection = 'up' | 'down';

export function removalReturnFocus(
  records: readonly LibraryRecord[],
  removedIds: readonly string[],
  heading: HTMLElement | null,
): () => HTMLElement | null {
  const removed = new Set(removedIds);
  const index = records.findIndex((record) => removed.has(record.id));
  const neighbors = [...records.slice(index + 1), ...records.slice(0, Math.max(0, index)).reverse()]
    .filter((record) => !removed.has(record.id))
    .map((record) => record.id);
  const section = heading?.closest('section');
  return () =>
    neighbors
      .map((id) => section?.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(id)}"] .record-title`) ?? null)
      .find(visibleFocusTarget) ?? (visibleFocusTarget(heading) ? heading : null);
}

export function focusMovedRecord(
  container: HTMLElement | null,
  id: string,
  direction?: MoveDirection | 'position',
  origin?: Element | null,
): boolean {
  if (direction && document.activeElement !== origin && document.activeElement !== document.body) return true;
  const row = container?.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(id)}"]`);
  if (direction === 'position') {
    const target =
      origin instanceof HTMLElement && row?.contains(origin) && origin.closest('.ranking-position-control')
        ? origin
        : row?.querySelector<HTMLElement>('.ranking-position-control > summary');
    return focusPendingEditor(target ?? null);
  }
  const arrow = direction
    ? (row?.querySelector<HTMLElement>(`[data-move-direction="${direction}"][aria-disabled="false"]`) ??
      row?.querySelector<HTMLElement>('[data-move-direction][aria-disabled="false"]'))
    : null;
  const target = arrow ?? row?.querySelector<HTMLElement>('.record-title');
  if (!target) return false;
  focusPendingEditor(target);
  return true;
}

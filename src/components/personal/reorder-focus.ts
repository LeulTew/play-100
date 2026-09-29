import { focusPendingEditor } from '../../lib/dialog-focus';

export type MoveDirection = 'up' | 'down';

export function focusMovedRecord(
  container: HTMLElement | null,
  id: string,
  direction?: MoveDirection,
  origin?: Element | null,
): boolean {
  if (direction && document.activeElement !== origin && document.activeElement !== document.body) return true;
  const row = container?.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(id)}"]`);
  const arrow = direction
    ? (row?.querySelector<HTMLElement>(`[data-move-direction="${direction}"][aria-disabled="false"]`) ??
      row?.querySelector<HTMLElement>('[data-move-direction][aria-disabled="false"]'))
    : null;
  const target = arrow ?? row?.querySelector<HTMLElement>('.record-title');
  if (!target) return false;
  focusPendingEditor(target);
  return true;
}

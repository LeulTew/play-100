import { useContext, useRef } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { CompareTrayContext } from './compare-tray-context';
import { CompareDragEnabledContext, CompareDragSourceContext } from './compare-drag-source-context';
import { useCompareDragSource } from './useCompareDragSource';
import { canonicalCatalogId } from '../../lib/catalog-identity';
import { useMotionPolicy } from '../../motion';

export function ComparePinButton({
  record,
  compact = false,
  disabled = false,
  variant = 'button',
  pinned: suppliedPinned,
  onPin,
  onUnpin,
}: {
  record: LibraryRecord;
  compact?: boolean;
  disabled?: boolean;
  variant?: 'button' | 'text';
  pinned?: boolean;
  onPin?: (record: LibraryRecord) => void;
  onUnpin?: (id: string) => void;
}) {
  const tray = useContext(CompareTrayContext);
  const enabled = useContext(CompareDragEnabledContext);
  const controller = useContext(CompareDragSourceContext);
  const { coarsePointer } = useMotionPolicy();
  const pin = onPin ?? tray?.pin;
  const unpin = onUnpin ?? tray?.unpin;
  const pinned = tray
    ? tray.items.some((item) => canonicalCatalogId(item.id) === canonicalCatalogId(record.id))
    : Boolean(suppliedPinned);
  const blocked = disabled || !enabled || !pin || (pinned && !unpin);
  const sourceRef = useRef<HTMLButtonElement>(null);
  const source = useCompareDragSource({ record, sourceRef, disabled: blocked });
  return (
    <button
      ref={sourceRef}
      {...source.surfaceProps}
      data-compare-drag-grip=""
      type="button"
      className={`compare-pin ${compact ? (coarsePointer ? 'text-button' : 'icon-button') : variant === 'text' ? 'text-button' : 'button button-outline'}`}
      aria-disabled={blocked || undefined}
      aria-pressed={pinned}
      aria-label={`Pin for comparison: ${record.title}`}
      title={compact ? (pinned ? 'Remove pin' : 'Pin for comparison') : undefined}
      draggable={false}
      onClick={(event) => {
        if (blocked || event.defaultPrevented || source.consumeClick(event) || (controller && !controller.canPin()))
          return;
        if (pinned) unpin?.(record.id);
        else pin?.(record);
      }}
    >
      <Icon name="stack" width="19" height="19" fill={pinned ? 'currentColor' : 'none'} />
      {(!compact || coarsePointer) && (pinned ? 'Pinned' : 'Pin')}
    </button>
  );
}

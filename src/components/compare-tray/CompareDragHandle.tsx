import { useContext, useRef } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { useMotionPolicy } from '../../motion';
import { useCompareTray } from './compare-tray-context';
import { CompareDragEnabledContext, CompareDragSourceContext } from './compare-drag-source-context';
import { useCompareDragSource } from './useCompareDragSource';
import './compare-tray.css';

export function CompareDragHandle({ record, compact = false }: { record: LibraryRecord; compact?: boolean }) {
  const { coarsePointer } = useMotionPolicy();
  const { pin } = useCompareTray();
  const controller = useContext(CompareDragSourceContext);
  const enabled = useContext(CompareDragEnabledContext);
  const sourceRef = useRef<HTMLButtonElement>(null);
  const source = useCompareDragSource({ record, sourceRef });
  return (
    <button
      ref={sourceRef}
      {...source.surfaceProps}
      data-compare-drag-grip=""
      type="button"
      className={`compare-drag-handle ${compact ? 'icon-button' : 'text-button'}`}
      hidden={coarsePointer}
      aria-hidden={compact || coarsePointer || undefined}
      tabIndex={compact || coarsePointer ? -1 : undefined}
      aria-label={
        compact
          ? undefined
          : `${coarsePointer ? 'Pin to tray' : 'Drag to tray'}: ${record.title}${coarsePointer ? '' : ', or click to pin for comparison'}`
      }
      title={compact ? 'Drag to tray' : undefined}
      draggable={false}
      disabled={!enabled}
      onClick={(event) => {
        if (!event.defaultPrevented && !source.consumeClick(event) && (!controller || controller.canPin())) pin(record);
      }}
    >
      <Icon name="stack" width="18" height="18" />
      {!compact && (coarsePointer ? 'Pin to tray' : 'Drag to tray')}
    </button>
  );
}

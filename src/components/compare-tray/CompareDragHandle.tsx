import { useContext, useRef } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { useMotionPolicy } from '../../motion';
import { useCompareTray } from './compare-tray-context';
import { CompareDragSourceContext } from './compare-drag-source-context';
import { useCompareDragSource } from './useCompareDragSource';
import './compare-tray.css';

export function CompareDragHandle({ record, compact = false }: { record: LibraryRecord; compact?: boolean }) {
  const { coarsePointer } = useMotionPolicy();
  const { pin } = useCompareTray();
  const controller = useContext(CompareDragSourceContext);
  const sourceRef = useRef<HTMLButtonElement>(null);
  const source = useCompareDragSource({ record, sourceRef });
  return <button ref={sourceRef} {...source.surfaceProps} data-compare-drag-grip="" type="button" className={`compare-drag-handle ${compact ? 'icon-button' : 'text-button'}`}
    hidden={coarsePointer} aria-hidden={coarsePointer || undefined} tabIndex={coarsePointer ? -1 : undefined}
    aria-label={compact ? coarsePointer ? `Pin ${record.title} to the Compare tray` : `Pin ${record.title} for comparison, or drag with a mouse` : `${coarsePointer ? 'Pin to tray' : 'Drag to tray'}: ${record.title}${coarsePointer ? '' : ', or click to pin for comparison'}`}
    draggable={false} disabled={controller ? !controller.canPin() : false}
    onClick={(event) => { if (!event.defaultPrevented && !source.consumeClick(event) && (!controller || controller.canPin())) pin(record); }}>
    <Icon name={coarsePointer ? 'stack' : 'grip'} width="18" height="18" />{!compact && (coarsePointer ? 'Pin to tray' : 'Drag to tray')}
  </button>;
}

import { useContext, useRef } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { useCompareTray } from './compare-tray-context';
import { CompareDragSourceContext } from './compare-drag-source-context';
import { useCompareDragSource } from './useCompareDragSource';
import './compare-tray.css';

export function CompareDragHandle({ record, compact = false }: { record: LibraryRecord; compact?: boolean }) {
  const { pin } = useCompareTray();
  const controller = useContext(CompareDragSourceContext);
  const sourceRef = useRef<HTMLButtonElement>(null);
  const source = useCompareDragSource({ record, sourceRef });
  return <button ref={sourceRef} {...source.surfaceProps} data-compare-drag-grip="" type="button" className={`compare-drag-handle ${compact ? 'icon-button' : 'text-button'}`}
    aria-label={`Pin ${record.title} for comparison, or drag to the tray`}
    title="Drag to the Compare tray, or click to pin" draggable={false} disabled={controller ? !controller.canPin() : false}
    onClick={(event) => { if (!event.defaultPrevented && !source.consumeClick(event) && (!controller || controller.canPin())) pin(record); }}>
    <Icon name="grip" width="18" height="18" />{!compact && 'Drag to tray'}
  </button>;
}

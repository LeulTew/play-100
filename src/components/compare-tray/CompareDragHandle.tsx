import { useEffect, useRef } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { COMPARE_DRAG_TYPE } from '../../lib/compare-tray';
import { Icon } from '../Icon';
import { useCompareTray } from './compare-tray-context';
import './compare-tray.css';

export function CompareDragHandle({ record, compact = false }: { record: LibraryRecord; compact?: boolean }) {
  const { beginDrag, cancelDrag, pin } = useCompareTray();
  const mouse = useRef(false);
  const started = useRef(false);
  useEffect(() => () => { if (started.current) cancelDrag(); }, [cancelDrag]);
  return <button type="button" className={`compare-drag-handle ${compact ? 'icon-button' : 'text-button'}`}
    aria-label={`Pin ${record.title} for comparison, or drag to the tray`}
    title="Drag to the Compare tray, or click to pin" draggable={false}
    onPointerDown={(event) => {
      mouse.current = event.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      event.currentTarget.draggable = mouse.current;
    }}
    onClick={() => { pin(record); }}
    onDragStart={(event) => {
      if (!mouse.current) { event.preventDefault(); return; }
      const token = beginDrag(record);
      if (!token) { event.preventDefault(); return; }
      started.current = true;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData(COMPARE_DRAG_TYPE, token);
    }}
    onDragEnd={(event) => { cancelDrag(); started.current = false; mouse.current = false; event.currentTarget.draggable = false; }}>
    <Icon name="grip" width="18" height="18" />{!compact && 'Drag to tray'}
  </button>;
}

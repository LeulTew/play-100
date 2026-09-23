import { useState } from 'react';
import type { ReactNode } from 'react';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';

interface ReorderListProps {
  records: LibraryRecord[];
  kind: 'queue' | 'ranking';
  canReorder: boolean;
  busy: boolean;
  animate: boolean;
  positionFor: (id: string) => number | null;
  onMove: (id: string, overId: string) => void;
  children: (record: LibraryRecord) => ReactNode;
}

export default function ReorderList({ records, kind, canReorder, busy, animate, positionFor, onMove, children }: ReorderListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeRecord = records.find((record) => record.id === activeId);
  return (
    <DndContext
      sensors={sensors} collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        if (canReorder && !busy && over && active.id !== over.id) onMove(String(active.id), String(over.id));
      }}
      accessibility={{
        screenReaderInstructions: { draggable: 'Press Space to pick up a game. Use arrow keys to move it. Press Space again to drop, or Escape to cancel. Move up and down buttons are also available.' },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${records.find((record) => record.id === active.id)?.title ?? 'game'}.`,
          onDragOver: ({ over }) => over ? `Over position ${records.findIndex((record) => record.id === over.id) + 1}.` : undefined,
          onDragEnd: ({ active, over }) => over && active.id !== over.id ? 'New order submitted for saving.' : 'Order unchanged.',
          onDragCancel: () => 'Move canceled. Order unchanged.',
        },
      }}
    >
      <SortableContext items={records.map((record) => record.id)} strategy={verticalListSortingStrategy}>
        <ol className="personal-records" aria-label={kind === 'queue' ? 'Your play order' : 'Your ranked games'}>
          {records.map((record, index) => (
            <ReorderRow key={record.id} id={record.id} title={record.title} position={positionFor(record.id)} disabled={!canReorder || busy} animate={animate} kind={kind} previous={records[index - 1]?.id} next={records[index + 1]?.id} onMove={onMove}>
              {children(record)}
            </ReorderRow>
          ))}
        </ol>
      </SortableContext>
      <DragOverlay dropAnimation={animate ? { duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' } : null}>
        {activeRecord ? <div className="drag-preview" aria-hidden="true"><Icon name="grip" />{activeRecord.title}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function ReorderRow({ id, title, position, disabled, animate, kind, previous, next, onMove, children }: {
  id: string; title: string; position: number | null; disabled: boolean; animate: boolean; kind: 'queue' | 'ranking';
  previous?: string; next?: string; onMove: (id: string, overId: string) => void; children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id, disabled, transition: animate ? { duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' } : null,
  });
  return (
    <li ref={setNodeRef} className={`personal-row ${isDragging ? 'is-dragging' : ''}`} data-record-id={id} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.25 : 1 }}>
      <div className="record-order">
        <button ref={setActivatorNodeRef} className="icon-button drag-handle" {...attributes} {...listeners} aria-label={`Drag ${title} to reorder your ${kind}`} disabled={disabled}><Icon name="grip" width="18" height="18" /></button>
        {position !== null && <span className="personal-position" aria-label={`Position ${position}`}>{String(position).padStart(2, '0')}</span>}
      </div>
      <div className="record-content">{children}</div>
      <div className="move-buttons">
        <button className="icon-button" disabled={disabled || !previous} aria-label={`Move ${title} up in ${kind}`} onClick={() => previous && onMove(id, previous)}><Icon name="up" width="17" height="17" /></button>
        <button className="icon-button" disabled={disabled || !next} aria-label={`Move ${title} down in ${kind}`} onClick={() => next && onMove(id, next)}><Icon name="down" width="17" height="17" /></button>
      </div>
    </li>
  );
}

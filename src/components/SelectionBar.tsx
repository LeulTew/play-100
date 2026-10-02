import { useLayoutEffect, useRef } from 'react';
import { Icon } from './Icon';

import type { SelectionAction } from '../lib/game-progress';
export type { SelectionAction } from '../lib/game-progress';

interface SelectionBarProps {
  count: number;
  total: number;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onAction: (action: SelectionAction) => void;
  onRemove?: () => void;
  context?: 'collection' | 'library' | 'discover';
  selectAllLabel?: string;
  selectionHelp?: string;
}

export function SelectionBar({
  count,
  total,
  busy,
  onSelectAll,
  onClear,
  onAction,
  onRemove,
  context = 'collection',
  selectAllLabel,
  selectionHelp,
}: SelectionBarProps) {
  const section = useRef<HTMLElement>(null);
  const selectAll = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!count && section.current?.querySelector('.selection-actions')?.contains(document.activeElement)) {
      selectAll.current?.focus({ preventScroll: true });
    }
  }, [count]);
  const act = (action: SelectionAction) => {
    if (count && !busy) onAction(action);
  };
  return (
    <section ref={section} className="selection-bar" aria-label="Bulk game actions">
      <div className="selection-summary">
        <strong role="status">{count} selected</strong>
        <button
          ref={selectAll}
          className="text-button"
          onClick={() => {
            if (!busy && total) (count === total ? onClear : onSelectAll)();
          }}
          aria-disabled={busy || !total || undefined}
        >
          {count === total ? 'Clear selection' : (selectAllLabel ?? `Select all ${total} in this view`)}
        </button>
      </div>
      <div className="selection-actions">
        <button className="button button-dark" aria-disabled={!count || busy || undefined} onClick={() => act('later')}>
          <Icon name="bookmark" width="18" height="18" />
          Add to Play later
        </button>
        <button
          className="button button-outline"
          aria-disabled={!count || busy || undefined}
          onClick={() => act('played')}
        >
          Mark played
        </button>
        <button
          className="button button-outline"
          aria-disabled={!count || busy || undefined}
          onClick={() => act('completed')}
        >
          <Icon name="check" width="18" height="18" />
          Mark completed
        </button>
        <button
          className="button button-outline"
          aria-disabled={!count || busy || undefined}
          onClick={() => act('ranking')}
        >
          <Icon name="rank" width="18" height="18" />
          Add to my ranking
        </button>
        {context === 'library' && (
          <>
            <button
              className="text-button"
              aria-disabled={!count || busy || undefined}
              onClick={() => act('remove-later')}
            >
              Remove from Play later
            </button>
            <button
              className="text-button"
              aria-disabled={!count || busy || undefined}
              onClick={() => act('uncomplete')}
            >
              Unmark completed
            </button>
            {onRemove && (
              <button
                className="text-button remove-library-action"
                aria-disabled={!count || busy || undefined}
                onClick={() => {
                  if (count && !busy) onRemove();
                }}
              >
                <Icon name="trash" width="17" height="17" />
                Remove from my library
              </button>
            )}
          </>
        )}
      </div>
      <p>
        {selectionHelp ??
          'Changing the page or filters clears this selection. Your original collection ranks never change.'}
      </p>
    </section>
  );
}

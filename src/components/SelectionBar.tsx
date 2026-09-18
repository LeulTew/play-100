import { Icon } from './Icon';

import type { SelectionAction } from '../lib/game-progress';
export type { SelectionAction } from '../lib/game-progress';

interface SelectionBarProps {
  count: number;
  total: number;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
  onAction: (action: SelectionAction) => void;
  onRemove?: () => void;
  context?: 'collection' | 'library' | 'discover';
}

export function SelectionBar({ count, total, busy, onSelectAll, onClear, onDone, onAction, onRemove, context = 'collection' }: SelectionBarProps) {
  return (
    <section className="selection-bar" aria-label="Bulk game actions">
      <div className="selection-summary">
        <strong role="status">{count} selected</strong>
        <button className="text-button" onClick={count === total ? onClear : onSelectAll} disabled={busy || !total}>{count === total ? 'Clear selection' : `Select all ${total} in this view`}</button>
        <button className="text-button selection-done" onClick={onDone}>Done selecting<Icon name="close" width="16" height="16" /></button>
      </div>
      <div className="selection-actions">
        <button className="button button-dark" disabled={!count || busy} onClick={() => onAction('later')}><Icon name="bookmark" width="18" height="18" />Add to play later</button>
        <button className="button button-outline" disabled={!count || busy} onClick={() => onAction('played')}>Mark played</button>
        <button className="button button-outline" disabled={!count || busy} onClick={() => onAction('completed')}><Icon name="check" width="18" height="18" />Mark completed</button>
        <button className="button button-outline" disabled={!count || busy} onClick={() => onAction('ranking')}><Icon name="rank" width="18" height="18" />Add to my ranking</button>
        {context === 'library' && <>
          <button className="text-button" disabled={!count || busy} onClick={() => onAction('remove-later')}>Remove from queue</button>
          <button className="text-button" disabled={!count || busy} onClick={() => onAction('uncomplete')}>Unmark completed</button>
          {onRemove && <button className="text-button remove-library-action" disabled={!count || busy} onClick={onRemove}><Icon name="trash" width="17" height="17" />Remove from my library</button>}
        </>}
      </div>
      <p>Changing the page or filters clears this selection. Your original collection ranks never change.</p>
    </section>
  );
}

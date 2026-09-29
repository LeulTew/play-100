import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { useCompareTray } from './compare-tray-context';
import { canonicalCatalogId } from '../../lib/catalog-identity';
import { useMotionPolicy } from '../../motion';

export function ComparePinButton({
  record,
  compact = false,
  disabled = false,
}: {
  record: LibraryRecord;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { items, pin, unpin } = useCompareTray();
  const { coarsePointer } = useMotionPolicy();
  const pinned = items.some((item) => canonicalCatalogId(item.id) === canonicalCatalogId(record.id));
  const label = pinned ? 'Unpin from comparison' : 'Pin for comparison';
  return (
    <button
      type="button"
      className={compact ? (coarsePointer ? 'text-button' : 'icon-button') : 'button button-outline'}
      aria-disabled={disabled || undefined}
      aria-pressed={pinned}
      aria-label={`${label}: ${record.title}`}
      title={compact ? label : undefined}
      onClick={() => {
        if (disabled) return;
        if (pinned) unpin(record.id);
        else pin(record);
      }}
    >
      <Icon name="stack" width="19" height="19" fill={pinned ? 'currentColor' : 'none'} />
      {compact ? coarsePointer && 'Pin' : label}
    </button>
  );
}

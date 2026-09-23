import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { useCompareTray } from './compare-tray-context';
import { canonicalCatalogId } from '../../lib/catalog-identity';

export function ComparePinButton({ record, compact = false, disabled = false }: { record: LibraryRecord; compact?: boolean; disabled?: boolean }) {
  const { items, pin, unpin } = useCompareTray();
  const pinned = items.some((item) => canonicalCatalogId(item.id) === canonicalCatalogId(record.id));
  return <button type="button" className={compact ? 'icon-button' : 'button button-outline'} disabled={disabled} aria-pressed={pinned} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${record.title} ${pinned ? 'from' : 'for'} comparison`} title={pinned ? 'Unpin from comparison' : 'Pin for comparison'} onClick={() => { if (pinned) unpin(record.id); else pin(record); }}><Icon name="stack" width="19" height="19" />{!compact && (pinned ? 'Pinned' : 'Pin to compare')}</button>;
}

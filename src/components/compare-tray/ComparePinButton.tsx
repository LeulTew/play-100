import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { useCompareTray } from './compare-tray-context';
import { canonicalCatalogId } from '../../lib/catalog-identity';

export function ComparePinButton({ record, compact = false, disabled = false }: { record: LibraryRecord; compact?: boolean; disabled?: boolean }) {
  const { items, pin, unpin } = useCompareTray();
  const pinned = items.some((item) => canonicalCatalogId(item.id) === canonicalCatalogId(record.id));
  return <button type="button" className={compact ? 'icon-button' : 'button button-outline'} disabled={disabled} aria-pressed={pinned} aria-label={`Pin for comparison: ${record.title}`} title={compact ? 'Pin for comparison' : undefined} onClick={() => { if (pinned) unpin(record.id); else pin(record); }}><Icon name="stack" width="19" height="19" fill={pinned ? 'currentColor' : 'none'} />{!compact && 'Pin for comparison'}</button>;
}

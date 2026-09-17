import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { useCompareTray } from './compare-tray-context';

export function ComparePinButton({ record, compact = false }: { record: LibraryRecord; compact?: boolean }) {
  const { items, pin, unpin } = useCompareTray();
  const pinned = items.some((item) => item.id === record.id);
  return <button type="button" className={compact ? 'icon-button' : 'button button-outline'} aria-pressed={pinned} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${record.title} ${pinned ? 'from' : 'for'} comparison`} title={pinned ? 'Unpin from comparison' : 'Pin for comparison'} onClick={() => { if (pinned) unpin(record.id); else pin(record); }}><Icon name="stack" width="19" height="19" />{!compact && (pinned ? 'Pinned' : 'Pin to compare')}</button>;
}

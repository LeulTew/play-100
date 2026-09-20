import type { LibraryRecord } from '../../lib/personal-types';
import { SOURCE_LABELS } from '../../lib/personal-types';

export function SavedCatalogCopies({ canonicalId, copies = [], onOpen }: {
  canonicalId: string; copies?: readonly LibraryRecord[]; onOpen?: (record: LibraryRecord) => void;
}) {
  const legacy = copies.filter(copy => copy.id !== canonicalId);
  if (!legacy.length) return null;
  return <div className="catalog-copy-note">
    <p>{copies.some(copy => copy.id === canonicalId) ? 'You also have a separate saved catalog copy.' : 'Progress and ratings use your existing saved catalog copy.'}</p>
    {legacy.map(copy => <button key={copy.id} className="text-button" disabled={!onOpen} onClick={() => onOpen?.(copy)} aria-label={`Open saved ${SOURCE_LABELS[copy.source]} copy of ${copy.title}`}>Open saved copy{legacy.length > 1 ? ` (${SOURCE_LABELS[copy.source]})` : ''}</button>)}
  </div>;
}

import type { FriendShelfEntry } from '../lib/friend-shelf-types';
import { SOURCE_LABELS } from '../lib/personal-types';

export function ShelfMetadata({ entry }: { entry: FriendShelfEntry }) {
  return (
    <span className="friend-shelf-metadata">
      {entry.year ?? 'Year not listed'}
      <span aria-hidden="true"> / </span>
      {entry.source === 'manual' ? 'Manual addition' : SOURCE_LABELS[entry.source]}
    </span>
  );
}

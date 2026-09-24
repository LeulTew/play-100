import { useState } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { Icon } from '../Icon';
import type { CompareTitleBinding } from '../compare-tray/compare-drag-types';

export function RecordIdentity({
  record,
  onOpen,
  compareDrag,
}: {
  record: LibraryRecord;
  onOpen: (id: string) => void;
  compareDrag?: CompareTitleBinding;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="record-identity">
      <div className="record-thumb" aria-hidden="true">
        {record.source === 'collection' && !imageFailed ? (
          <img
            src={`/covers/${record.id}.webp`}
            width="48"
            height="60"
            loading="lazy"
            alt=""
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Icon name="stack" width="25" height="25" />
        )}
      </div>
      <div className="record-label">
        <button
          className="record-title"
          {...compareDrag?.titleProps}
          onClick={(event) => {
            if (event.defaultPrevented || compareDrag?.consumeClick(event)) return;
            onOpen(record.id);
          }}
        >
          {record.title}
        </button>
        <p>
          {record.year ?? 'Year not provided'}
          <span> · </span>
          {SOURCE_LABELS[record.source]}
          {record.collectionRank !== null && ` #${record.collectionRank}`}
        </p>
      </div>
    </div>
  );
}

import type { LibraryRecord } from '../../lib/personal-types';
import type { CatalogArtwork } from '../../lib/discovery-catalog-shared';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { GameArtwork, GameArtworkCredit } from '../games/GameArtwork';
import type { CompareTitleBinding } from '../compare-tray/compare-drag-types';

export function RecordIdentity({
  record,
  artwork,
  onOpen,
  compareDrag,
}: {
  record: LibraryRecord;
  artwork?: CatalogArtwork | null;
  onOpen: (id: string) => void;
  compareDrag?: CompareTitleBinding;
}) {
  const providerArtwork = record.source === 'collection' ? null : artwork;
  return (
    <div className="record-identity">
      <GameArtwork record={record} artwork={providerArtwork} className="record-thumb" />
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
        <GameArtworkCredit artwork={providerArtwork} disclosureLabel={`Artwork credits for ${record.title}`} />
      </div>
    </div>
  );
}

import { useRef } from 'react';
import type { LibraryRecord, PersonalAction, PersonalProgress } from '../../lib/personal-types';
import type { CatalogArtwork } from '../../lib/discovery-catalog';
import type { MotionOriginLease } from '../../motion';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { Dialog } from '../Dialog';
import { Icon } from '../Icon';
import { PlayedToggle } from '../PlayedToggle';
import { GameArtwork, GameArtworkCredit } from '../games/GameArtwork';
import { PersonalRatingInput } from './PersonalRatingInput';
import { author } from '../../lib/author';
import { CATALOG_EDITION_HINTS } from '../../lib/collection-identities';
import { useCatalogEnrichment } from '../../hooks/useCatalogEnrichment';
import type { PublicCatalogLookup } from '../../hooks/useCatalogEnrichment';
import { CatalogEnrichment, ExternalCatalogArtwork, ExternalCatalogArtworkCredit } from '../catalog/CatalogEnrichment';
import './catalog-detail-motion.css';

export interface CatalogDetailProps {
  record: LibraryRecord;
  saved: boolean;
  progress: PersonalProgress | undefined;
  rankingPosition: number | null;
  rating: number | null;
  busy: boolean;
  artwork?: CatalogArtwork | null;
  motionOrigin?: MotionOriginLease;
  publicLookup?: PublicCatalogLookup;
  onClose: () => void;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onRankings: () => void;
}

export default function CatalogDetail({
  record,
  saved,
  progress,
  rankingPosition,
  rating,
  busy,
  artwork,
  motionOrigin,
  publicLookup,
  onClose,
  onAction,
  onRankings,
}: CatalogDetailProps) {
  const artRef = useRef<HTMLDivElement>(null);
  const enrichment = useCatalogEnrichment(record.id, publicLookup);
  const externalArtwork = artwork ? null : (enrichment.data?.artwork ?? null);
  return (
    <Dialog
      open
      titleId="catalog-game-title"
      onClose={onClose}
      className="info-dialog catalog-detail-dialog"
      motion={{ preset: 'dialog', continuity: { target: artRef, lease: motionOrigin } }}
    >
      <h2 id="catalog-game-title" data-autofocus tabIndex={-1}>
        {record.title}
      </h2>
      <p className="dialog-lead">
        {SOURCE_LABELS[record.source]}
        {record.collectionRank !== null
          ? ` · original rank #${record.collectionRank}`
          : ` · Unranked in ${author.shortName}'s collection`}
      </p>
      {CATALOG_EDITION_HINTS.has(record.id) && <p className="section-help">{CATALOG_EDITION_HINTS.get(record.id)}</p>}
      <div className="catalog-detail-visual">
        <div className="catalog-detail-sleeve" ref={artRef}>
          {artwork ? (
            <GameArtwork record={record} artwork={artwork} className="catalog-detail-artwork" />
          ) : externalArtwork ? (
            <ExternalCatalogArtwork artwork={externalArtwork} />
          ) : (
            <span className="catalog-detail-artwork catalog-detail-artwork-empty" aria-hidden="true">
              <Icon name="stack" width="28" height="28" />
            </span>
          )}
        </div>
        {!artwork && !externalArtwork && <p className="catalog-detail-art-caption">Artwork unavailable</p>}
      </div>
      {artwork && (
        <div className="catalog-detail-art-credits">
          <GameArtworkCredit artwork={artwork} disclosureLabel={`Artwork credits for ${record.title}`} />
        </div>
      )}
      {externalArtwork && <ExternalCatalogArtworkCredit artwork={externalArtwork} />}
      <dl className="catalog-facts">
        <div>
          <dt>Year</dt>
          <dd>{record.year ?? 'Not provided'}</dd>
        </div>
        <div>
          <dt>Studio</dt>
          <dd>{record.studio ?? 'Not provided'}</dd>
        </div>
        <div>
          <dt>Genre</dt>
          <dd>{record.genre ?? 'Not provided'}</dd>
        </div>
      </dl>
      {record.sourceUrl && (
        <a className="catalog-source-link" href={record.sourceUrl} target="_blank" rel="noreferrer">
          View on {SOURCE_LABELS[record.source]}
          <Icon name="up-right" width="17" height="17" />
        </a>
      )}
      <p className="section-help">Source metadata is not independently verified.</p>
      <CatalogEnrichment enrichment={enrichment} lookup={publicLookup} />
      <div className="detail-actions">
        <button
          className={`button ${progress?.later ? 'button-lime' : 'button-dark'}`}
          disabled={busy}
          aria-pressed={Boolean(progress?.later)}
          onClick={() => {
            void onAction({ type: 'toggle-progress', record, key: 'later' });
          }}
        >
          <Icon name="bookmark" fill={progress?.later ? 'currentColor' : 'none'} />
          Play later
        </button>
        <button
          className={`button ${progress?.completed ? 'button-lime' : 'button-outline'}`}
          disabled={busy}
          aria-pressed={Boolean(progress?.completed)}
          onClick={() => {
            void onAction({ type: 'set-progress', records: [record], key: 'completed', value: !progress?.completed });
          }}
        >
          <Icon name={progress?.completed ? 'check' : 'plus'} />
          Completed
        </button>
      </div>
      <div className="personal-detail-actions">
        <PlayedToggle
          id={record.id}
          title={record.title}
          played={Boolean(progress?.played)}
          completed={progress?.completed}
          busy={busy}
          onChange={(value) => {
            void onAction({ type: 'set-progress', records: [record], key: 'played', value });
          }}
        />
        {rankingPosition === null ? (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              void onAction({ type: 'add-ranking', records: [record] });
            }}
          >
            <Icon name="rank" width="18" height="18" />
            Add to my ranking
          </button>
        ) : (
          <button className="text-button" onClick={onRankings}>
            Your rank: #{rankingPosition}
            <Icon name="arrow" width="17" height="17" />
          </button>
        )}
      </div>
      <div className="catalog-detail-rating">
        <PersonalRatingInput
          key={record.id}
          title={record.title}
          value={rating}
          busy={busy}
          onCommit={(score) => onAction({ type: 'rate-game', record, score })}
        />
        <p>Rating adds this game to Ranking in My games. It does not mark it played or change a fixed position.</p>
      </div>
      <p className="device-note">
        {saved
          ? 'Saved in My games.'
          : 'Preview only. Add to My games from Discover, or rate or mark progress here to keep this game.'}{' '}
        The 100 stays unchanged.
      </p>
    </Dialog>
  );
}

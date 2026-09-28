import { useEffect, useRef, useState } from 'react';
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
import { catalogGenreLabel } from '../../lib/discovery-genres';
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
  feedback?: string;
  error?: string;
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
  feedback = '',
  error = '',
  artwork,
  motionOrigin,
  publicLookup,
  onClose,
  onAction,
  onRankings,
}: CatalogDetailProps) {
  const artRef = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const saving = useRef(false);
  const [result, setResult] = useState<'idle' | 'pending' | 'saved' | 'failed'>('idle');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const blocked = busy || result === 'pending';
  const enrichment = useCatalogEnrichment(record.id, publicLookup);
  const externalArtwork = artwork ? null : (enrichment.data?.artwork ?? null);
  const canAddToLibrary = record.source !== 'collection';
  const mutate = async (action: PersonalAction): Promise<boolean> => {
    // The rating's exit-save cleanup runs after this dialog's UI lifetime ends.
    if ((!active.current && action.type !== 'rate-game') || busy || saving.current) return false;
    saving.current = true;
    if (active.current) setResult('pending');
    // The rating field already owns its retryable error announcement.
    const failed = action.type === 'rate-game' ? 'idle' : 'failed';
    try {
      const saved = await onAction(action);
      if (active.current) setResult(saved ? 'saved' : failed);
      return saved;
    } catch (cause) {
      console.error('The catalog detail change could not be saved.', cause);
      if (active.current) setResult(failed);
      return false;
    } finally {
      saving.current = false;
    }
  };
  const failure =
    result === 'failed'
      ? error || feedback || 'This change could not be saved. Your library is unchanged. Try again.'
      : '';
  const status = result === 'pending' ? 'Saving changes…' : result === 'saved' ? feedback : '';
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
          <dd>{catalogGenreLabel(record) ?? 'Not provided'}</dd>
        </div>
      </dl>
      {record.source !== 'collection' && record.source !== 'manual' && (
        <details className="catalog-enrichment-sources catalog-source-classification">
          <summary>Source classification</summary>
          <p className="catalog-enrichment-note">{record.genre ?? 'Not provided'}</p>
        </details>
      )}
      {record.sourceUrl && (
        <a className="catalog-source-link" href={record.sourceUrl} target="_blank" rel="noreferrer">
          View on {SOURCE_LABELS[record.source]}
          <Icon name="up-right" width="17" height="17" />
        </a>
      )}
      <p className="section-help">Source metadata is not independently verified.</p>
      <div className="detail-actions" aria-busy={blocked || undefined}>
        {canAddToLibrary && (
          <button
            className={`button ${saved ? 'button-outline' : 'button-dark'}`}
            aria-disabled={blocked || saved || undefined}
            aria-label={`${saved ? 'In My games' : 'Add to My games'}: ${record.title}`}
            onClick={() => {
              if (!saved) void mutate({ type: 'add-records', records: [record] });
            }}
          >
            <Icon name={saved ? 'check' : 'plus'} width="16" height="16" />
            {saved ? 'In My games' : 'Add to My games'}
          </button>
        )}
        <button
          className={`button ${progress?.later ? 'button-lime' : 'button-dark'}`}
          aria-disabled={blocked || undefined}
          aria-pressed={Boolean(progress?.later)}
          onClick={() => {
            void mutate({ type: 'toggle-progress', record, key: 'later' });
          }}
        >
          <Icon name="bookmark" fill={progress?.later ? 'currentColor' : 'none'} />
          Play later
        </button>
        <button
          className={`button ${progress?.completed ? 'button-lime' : 'button-outline'}`}
          aria-disabled={blocked || undefined}
          aria-pressed={Boolean(progress?.completed)}
          onClick={() => {
            void mutate({ type: 'set-progress', records: [record], key: 'completed', value: !progress?.completed });
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
          busy={blocked}
          onChange={(value) => {
            void mutate({ type: 'set-progress', records: [record], key: 'played', value });
          }}
        />
        <button
          className="text-button"
          aria-disabled={(rankingPosition === null && blocked) || undefined}
          onClick={() => {
            if (rankingPosition === null) void mutate({ type: 'add-ranking', records: [record] });
            else onRankings();
          }}
        >
          {rankingPosition === null ? (
            <>
              <Icon name="rank" width="18" height="18" />
              Add to my ranking
            </>
          ) : (
            <>
              Your rank: #{rankingPosition}
              <Icon name="arrow" width="17" height="17" />
            </>
          )}
        </button>
      </div>
      <div className="catalog-detail-rating">
        <PersonalRatingInput
          key={record.id}
          title={record.title}
          value={rating}
          busy={blocked}
          onCommit={(score) => mutate({ type: 'rate-game', record, score })}
        />
        <p>Rating adds this game to Ranking in My games. It does not mark it played or change a fixed position.</p>
      </div>
      <p className="device-note">
        {saved
          ? 'Saved in My games.'
          : canAddToLibrary
            ? 'Preview only. Add to My games to keep this game without changing your progress, queue or ranking.'
            : 'Preview only. Rate or mark progress here to keep this game.'}{' '}
        The 100 stays unchanged.
      </p>
      {failure ? (
        <p className="inline-error" role="alert">
          {failure}
        </p>
      ) : status ? (
        <p className="detail-share-notice" role="status">
          {status}
        </p>
      ) : null}
      <CatalogEnrichment enrichment={enrichment} lookup={publicLookup} />
    </Dialog>
  );
}

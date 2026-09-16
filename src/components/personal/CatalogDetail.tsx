import type { LibraryRecord, PersonalAction, PersonalProgress } from '../../lib/personal-types';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { Dialog } from '../Dialog';
import { Icon } from '../Icon';
import { PlayedToggle } from '../PlayedToggle';
import { PersonalRatingInput } from './PersonalRatingInput';
import { author } from '../../lib/author';

export default function CatalogDetail({ record, saved, progress, rankingPosition, rating, busy, onClose, onAction, onRankings }: {
  record: LibraryRecord; saved: boolean; progress: PersonalProgress | undefined; rankingPosition: number | null; rating: number | null; busy: boolean;
  onClose: () => void; onAction: (action: PersonalAction) => Promise<boolean>; onRankings: () => void;
}) {
  return (
    <Dialog open titleId="catalog-game-title" onClose={onClose} className="info-dialog">
      <h2 id="catalog-game-title" data-autofocus tabIndex={-1}>{record.title}</h2>
      <p className="dialog-lead">{SOURCE_LABELS[record.source]}{record.collectionRank !== null ? ` · original rank #${record.collectionRank}` : ` · Unranked in ${author.shortName}'s collection`}</p>
      <div className="catalog-art" aria-hidden="true"><Icon name="stack" width="47" height="47" /><span>Game details</span></div>
      <dl className="catalog-facts"><div><dt>Year</dt><dd>{record.year ?? 'Not provided'}</dd></div><div><dt>Studio</dt><dd>{record.studio ?? 'Not provided'}</dd></div><div><dt>Genre</dt><dd>{record.genre ?? 'Not provided'}</dd></div></dl>
      {record.sourceUrl && <a className="catalog-source-link" href={record.sourceUrl} target="_blank" rel="noreferrer">View on {SOURCE_LABELS[record.source]}<Icon name="up-right" width="17" height="17" /></a>}
      <p className="section-help">Source metadata is not independently verified.</p>
      <div className="detail-actions"><button className={`button ${progress?.later ? 'button-lime' : 'button-dark'}`} disabled={busy} aria-pressed={Boolean(progress?.later)} onClick={() => { void onAction({ type: 'toggle-progress', record, key: 'later' }); }}><Icon name="bookmark" />{progress?.later ? 'Saved for later' : 'Play later'}</button><button className="button button-outline" disabled={busy} aria-pressed={Boolean(progress?.completed)} onClick={() => { void onAction({ type: 'toggle-progress', record, key: 'completed' }); }}><Icon name="check" />{progress?.completed ? 'Completed' : 'Mark completed'}</button></div>
      <div className="personal-detail-actions"><PlayedToggle id={record.id} title={record.title} played={Boolean(progress?.played)} completed={progress?.completed} busy={busy} onChange={() => { void onAction({ type: 'toggle-progress', record, key: 'played' }); }} />{rankingPosition === null ? <button className="text-button" disabled={busy} onClick={() => { void onAction({ type: 'add-ranking', records: [record] }); }}><Icon name="rank" width="18" height="18" />Add to my ranking</button> : <button className="text-button" onClick={onRankings}>Your rank: #{rankingPosition}<Icon name="arrow" width="17" height="17" /></button>}</div>
      <div className="catalog-detail-rating"><PersonalRatingInput key={record.id} title={record.title} value={rating} busy={busy} onCommit={(score) => onAction({ type: 'rate-game', record, score })} /><p>Rating adds to My rankings without marking played or moving a fixed position.</p></div>
      <p className="device-note">{saved ? 'Saved in your library.' : 'Preview only. Save or rate to keep this game.'}</p>
    </Dialog>
  );
}

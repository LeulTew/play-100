import { useState } from 'react';
import type { ReactNode } from 'react';
import type { CatalogArtwork } from '../../lib/discovery-catalog';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { PlayedToggle } from '../PlayedToggle';
import { CompletedToggle } from '../CompletedToggle';
import { PersonalRatingInput } from '../personal/PersonalRatingInput';
import type { Game } from '../../lib/types';
import { GameCover } from '../GameCover';
import { author, authorRatingText } from '../../lib/author';
import { SavedCatalogCopies } from './SavedCatalogCopies';
import { CATALOG_EDITION_HINTS } from '../../lib/collection-identities';
import './discover.css';

export interface DiscoveryCardProps {
  record: LibraryRecord;
  game?: Game;
  actionRecord?: LibraryRecord;
  ownedCopies?: readonly LibraryRecord[];
  artwork?: CatalogArtwork | null;
  state: PersonalLibraryState;
  busy: boolean;
  eager?: boolean;
  selecting?: boolean;
  selected?: boolean;
  pinned?: boolean;
  onSelect?: (id: string) => void;
  onPreview?: (record: LibraryRecord) => void;
  onPin?: (record: LibraryRecord) => void;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
  onAction: (action: PersonalAction) => Promise<boolean>;
}

export function DiscoveryCard({ record, game, actionRecord = record, ownedCopies, artwork, state, busy, eager = false, selecting, selected, pinned, onSelect, onPreview, onPin, renderDragHandle, onAction }: DiscoveryCardProps) {
  const [failedSrc, setFailedSrc] = useState('');
  const saved = Boolean(state.records[actionRecord.id]);
  const progress = state.progress[actionRecord.id];
  const ranking = state.ranking.find((entry) => entry.id === actionRecord.id);
  return (
    <li className={`discovery-card${selected ? ' is-selected' : ''}`} data-catalog-id={record.id} data-unranked-id={game ? undefined : record.id}>
      <div className="discovery-card-art">
        {game ? <GameCover game={game} eager={eager} /> : artwork && failedSrc !== artwork.src
          ? <img src={artwork.src} width={artwork.width} height={artwork.height} alt={artwork.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedSrc(artwork.src)} />
          : <div className="discovery-no-art"><span>{record.year ?? 'Game'}</span><span>Artwork unavailable</span></div>}
        {selecting && onSelect && <label className="discovery-select"><input type="checkbox" checked={Boolean(selected)} onChange={() => onSelect(record.id)} aria-label={`Select ${record.title}`} /></label>}
      </div>
      <div className="discovery-card-body">
        <h3>{onPreview ? <button type="button" onClick={() => onPreview(record)}>{record.title}</button> : record.title}</h3>
        {game && <p className="discovery-canonical">From The 100 · #{game.rank}<span>{author.shortName}'s rating <strong title={game.authorRating?.rawValue}>{authorRatingText(game.authorRating)}{game.authorRating ? ' / 10' : ''}</strong></span></p>}
        <p className="discovery-card-meta">{[CATALOG_EDITION_HINTS.get(record.id) ?? record.year, record.genre].filter((value) => value !== null).join(' · ') || 'Game'}</p>
        <div className="discovery-card-primary">
          <button className={`button ${saved ? 'button-outline' : 'button-dark'}`} disabled={busy || saved} aria-label={`${saved ? 'Saved' : 'Save'} ${record.title}`} onClick={() => { void onAction({ type: 'add-records', records: [actionRecord] }); }}>
            <Icon name={saved ? 'check' : 'plus'} width="16" height="16" />{saved ? 'Saved' : 'Save'}
          </button>
          {onPin && <button className="button button-outline" aria-label={`${pinned ? 'Pinned' : 'Pin'} ${record.title} for comparison`} aria-pressed={Boolean(pinned)} disabled={pinned} onClick={() => onPin(actionRecord)}><Icon name="stack" width="16" height="16" />{pinned ? 'Pinned' : 'Pin'}</button>}
          {renderDragHandle?.(actionRecord)}
        </div>
        {game && <SavedCatalogCopies canonicalId={record.id} copies={ownedCopies} onOpen={onPreview} />}
        <details className="discovery-card-details">
          <summary aria-label={`Actions and source for ${record.title}`}>Actions &amp; source</summary>
          <div className="discovery-card-secondary">
            <PlayedToggle key={`played:${actionRecord.id}`} id={actionRecord.id} title={record.title} played={Boolean(progress?.played)} completed={progress?.completed} busy={busy} onChange={value => { void onAction({ type: 'set-progress', records: [actionRecord], key: 'played', value }); }} />
            <CompletedToggle title={record.title} completed={Boolean(progress?.completed)} busy={busy} onChange={value => { void onAction({ type: 'set-progress', records: [actionRecord], key: 'completed', value }); }} />
            <button className="button button-outline" disabled={busy} aria-pressed={Boolean(progress?.later)} onClick={() => { void onAction({ type: 'toggle-progress', record: actionRecord, key: 'later' }); }}><Icon name="bookmark" width="16" height="16" />{progress?.later ? 'In your queue' : 'Play later'}</button>
            <button className="button button-outline" disabled={busy || Boolean(ranking)} onClick={() => { void onAction({ type: 'add-ranking', records: [actionRecord] }); }}><Icon name="rank" width="16" height="16" />{ranking ? 'In your ranking' : 'Add to ranking'}</button>
            <PersonalRatingInput key={`rating:${actionRecord.id}`} title={record.title} value={ranking?.score ?? null} busy={busy} onCommit={(score) => onAction({ type: 'rate-game', record: actionRecord, score })} />
          </div>
          <div className="discovery-card-source">
            {record.studio && <p>{record.studio}</p>}
            {record.sourceUrl ? <a href={record.sourceUrl} target="_blank" rel="noreferrer">Game data: {SOURCE_LABELS[record.source]}<Icon name="up-right" width="14" height="14" /></a> : <p>{SOURCE_LABELS[record.source]}</p>}
            {game ? <p>Original collection metadata and workbook artwork.</p> : artwork && <><p>{artwork.credit}</p><a href={artwork.sourceUrl} target="_blank" rel="noreferrer">Image source<Icon name="up-right" width="14" height="14" /></a><a href={artwork.licenseUrl} target="_blank" rel="noreferrer">{artwork.license}<Icon name="up-right" width="14" height="14" /></a></>}
          </div>
        </details>
      </div>
    </li>
  );
}

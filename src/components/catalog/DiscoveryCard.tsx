import { useState } from 'react';
import type { CatalogArtwork } from '../../lib/discovery-catalog';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { PlayedToggle } from '../PlayedToggle';
import { PersonalRatingInput } from '../personal/PersonalRatingInput';
import './discover.css';

export interface DiscoveryCardProps {
  record: LibraryRecord;
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
  onAction: (action: PersonalAction) => Promise<boolean>;
}

export function DiscoveryCard({ record, artwork, state, busy, eager = false, selecting, selected, pinned, onSelect, onPreview, onPin, onAction }: DiscoveryCardProps) {
  const [failedSrc, setFailedSrc] = useState('');
  const saved = Boolean(state.records[record.id]);
  const progress = state.progress[record.id];
  const ranking = state.ranking.find((entry) => entry.id === record.id);
  return (
    <li className={`discovery-card${selected ? ' is-selected' : ''}`} data-catalog-id={record.id} data-unranked-id={record.id}>
      <div className="discovery-card-art">
        {artwork && failedSrc !== artwork.src
          ? <img src={artwork.src} width={artwork.width} height={artwork.height} alt={artwork.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedSrc(artwork.src)} />
          : <div className="discovery-no-art"><span>{record.year ?? 'Game'}</span><span>Artwork unavailable</span></div>}
        {selecting && onSelect && <label className="discovery-select"><input type="checkbox" checked={Boolean(selected)} onChange={() => onSelect(record.id)} aria-label={`Select ${record.title}`} /></label>}
      </div>
      <div className="discovery-card-body">
        <h3>{onPreview ? <button type="button" onClick={() => onPreview(record)}>{record.title}</button> : record.title}</h3>
        <p className="discovery-card-meta">{[record.year, record.genre].filter((value) => value !== null).join(' · ') || 'Game'}</p>
        <div className="discovery-card-primary">
          <button className={`button ${saved ? 'button-outline' : 'button-dark'}`} disabled={busy || saved} aria-label={`${saved ? 'Saved' : 'Save'} ${record.title}`} onClick={() => { void onAction({ type: 'add-records', records: [record] }); }}>
            <Icon name={saved ? 'check' : 'plus'} width="16" height="16" />{saved ? 'Saved' : 'Save'}
          </button>
          {onPin && <button className="button button-outline" aria-label={`${pinned ? 'Pinned' : 'Pin'} ${record.title} for comparison`} aria-pressed={Boolean(pinned)} disabled={pinned} onClick={() => onPin(record)}><Icon name="stack" width="16" height="16" />{pinned ? 'Pinned' : 'Pin'}</button>}
        </div>
        <details className="discovery-card-details">
          <summary aria-label={`Actions and source for ${record.title}`}>Actions &amp; source</summary>
          <div className="discovery-card-secondary">
            <PlayedToggle id={record.id} title={record.title} played={Boolean(progress?.played)} completed={progress?.completed} busy={busy} onChange={() => { void onAction({ type: 'toggle-progress', record, key: 'played' }); }} />
            <button className="button button-outline" disabled={busy} aria-pressed={Boolean(progress?.later)} onClick={() => { void onAction({ type: 'toggle-progress', record, key: 'later' }); }}><Icon name="bookmark" width="16" height="16" />{progress?.later ? 'In your queue' : 'Play later'}</button>
            <button className="button button-outline" disabled={busy || Boolean(ranking)} onClick={() => { void onAction({ type: 'add-ranking', records: [record] }); }}><Icon name="rank" width="16" height="16" />{ranking ? 'In your ranking' : 'Add to ranking'}</button>
            <PersonalRatingInput title={record.title} value={ranking?.score ?? null} busy={busy} onCommit={(score) => onAction({ type: 'rate-game', record, score })} />
          </div>
          <div className="discovery-card-source">
            {record.studio && <p>{record.studio}</p>}
            {record.sourceUrl ? <a href={record.sourceUrl} target="_blank" rel="noreferrer">Game data: {SOURCE_LABELS[record.source]}<Icon name="up-right" width="14" height="14" /></a> : <p>{SOURCE_LABELS[record.source]}</p>}
            {artwork && <><p>{artwork.credit}</p><a href={artwork.sourceUrl} target="_blank" rel="noreferrer">Image source<Icon name="up-right" width="14" height="14" /></a><a href={artwork.licenseUrl} target="_blank" rel="noreferrer">{artwork.license}<Icon name="up-right" width="14" height="14" /></a></>}
          </div>
        </details>
      </div>
    </li>
  );
}

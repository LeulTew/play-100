import { useEffect, useMemo, useState } from 'react';
import type { useExtendedSearch } from '../../hooks/useExtendedSearch';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { author } from '../../lib/author';
import { Icon } from '../Icon';
import { PlayedToggle } from '../PlayedToggle';
import { PersonalRatingInput } from '../personal/PersonalRatingInput';

export default function ExtendedResults({ records, online, state, queryKey, busy, selecting, selected, onSelect, onPreview, onAction }: {
  records: LibraryRecord[]; online: ReturnType<typeof useExtendedSearch>; state: PersonalLibraryState; queryKey: string;
  busy: boolean; selecting: boolean; selected: Set<string>; onSelect: (id: string) => void;
  onPreview: (record: LibraryRecord) => void; onAction: (action: PersonalAction) => Promise<boolean>;
}) {
  const [localLimit, setLocalLimit] = useState(24);
  useEffect(() => { setLocalLimit(24); }, [queryKey]);
  const rankingById = useMemo(() => new Map(state.ranking.map((entry) => [entry.id, entry])), [state.ranking]);
  // Incoming source pages must not push a visible rating draft beyond the render limit.
  const limit = localLimit + online.records.length;
  const failed = online.sources.some((source) => source.status === 'error');
  return (
    <section className="extended-results" aria-labelledby="extended-results-title">
      <div className="extended-heading"><h2 id="extended-results-title">{online.eligible ? 'Beyond the 100' : 'Your additions'}</h2><span>{records.length} unranked {records.length === 1 ? 'game' : 'games'}</span></div>
      <p className="extended-intro">Outside {author.shortName}'s 100. Save or rate to keep a game. Sources and editions may appear separately.</p>
      {records.length > 0 && <ul className="unranked-list" aria-label="Unranked games in this view">
        {records.slice(0, limit).map((record) => <li key={record.id} data-unranked-id={record.id} className={selected.has(record.id) ? 'is-selected' : undefined}>
          {selecting && <label className="select-control"><input type="checkbox" checked={selected.has(record.id)} onChange={() => onSelect(record.id)} aria-label={`Select ${record.title}`} /></label>}
          <div className="unranked-copy">
            <div className="unranked-labels"><span className="unranked-label">Unranked</span>{state.records[record.id] && <span className="in-library"><Icon name="check" width="14" height="14" />In your library</span>}</div>
            <h3><button onClick={() => onPreview(record)}>{record.title}<Icon name="up-right" width="17" height="17" /></button></h3>
            <p>{[record.year, record.studio, record.genre].filter((value) => value !== null).join(' · ') || 'Metadata unavailable.'}</p>
            {record.sourceUrl ? <a className="unranked-source" href={record.sourceUrl} target="_blank" rel="noreferrer">View on {SOURCE_LABELS[record.source]}<Icon name="up-right" width="14" height="14" /></a> : <span className="unranked-source">{SOURCE_LABELS[record.source]}</span>}
          </div>
          <div className="unranked-actions">
            <PersonalRatingInput title={record.title} value={rankingById.get(record.id)?.score ?? null} busy={busy} onCommit={(score) => onAction({ type: 'rate-game', record, score })} />
            <PlayedToggle id={record.id} title={record.title} played={Boolean(state.progress[record.id]?.played)} completed={state.progress[record.id]?.completed} busy={busy} onChange={() => { void onAction({ type: 'toggle-progress', record, key: 'played' }); }} />
            <button className={`button ${state.progress[record.id]?.later ? 'button-lime' : 'button-outline'}`} disabled={busy} aria-pressed={Boolean(state.progress[record.id]?.later)} aria-label={`${state.progress[record.id]?.later ? 'Saved for later' : 'Play later'}: ${record.title}`} onClick={() => { void onAction({ type: 'toggle-progress', record, key: 'later' }); }}><Icon name="bookmark" width="17" height="17" />{state.progress[record.id]?.later ? 'Saved for later' : 'Play later'}</button>
          </div>
        </li>)}
      </ul>}
      {records.length > limit && <div className="extended-more"><p>Showing {limit} of {records.length} loaded unranked games.</p><button className="button button-outline" onClick={() => setLocalLimit((count) => count + 24)}>Show {Math.min(24, records.length - limit)} more unranked games<Icon name="down" width="17" height="17" /></button></div>}
      {online.eligible && <div className="source-searches" aria-label="Public catalog search status">
        {online.sources.map((source) => <div key={source.source} className="source-search">
          <div><a href={source.source === 'wikidata' ? 'https://www.wikidata.org/wiki/Wikidata:Data_access' : 'https://www.freetogame.com/'} target="_blank" rel="noreferrer">{SOURCE_LABELS[source.source]}<Icon name="up-right" width="14" height="14" /></a>
            <p role="status">{source.status === 'loading' ? 'Searching...' : source.status === 'error' ? 'Catalog unavailable' : `${source.records.length} source ${source.records.length === 1 ? 'record' : 'records'} loaded`}</p>
          </div>
          {source.error && <p className="source-search-error" role="alert">{source.error} Saved games remain available.</p>}
          {source.status === 'error' ? <button className="text-button" onClick={() => online.retry(source.source)}>Retry {SOURCE_LABELS[source.source]}<Icon name="arrow" width="16" height="16" /></button>
            : source.nextOffset !== null && <button className="text-button" disabled={source.status === 'loading'} onClick={() => online.more(source.source)}>More from {SOURCE_LABELS[source.source]}<Icon name="down" width="16" height="16" /></button>}
        </div>)}
      </div>}
      {!records.length && <p className="extended-empty" role="status">{online.loading ? 'Searching catalogs. Saved games remain available.' : failed ? 'Online search is incomplete. Retry a source or search your saved games.' : 'No unranked matches. Try a shorter title or broader filters.'}</p>}
      <p className="extended-footnote">Rating adds to My rankings without marking played. Source metadata is not independently verified.</p>
    </section>
  );
}

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { MotionOriginHint } from '../../motion';
import type { useExtendedSearch } from '../../hooks/useExtendedSearch';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { DiscoveryCard } from './DiscoveryCard';
import { CatalogSourceStatus } from './CatalogSourceStatus';

export default function ExtendedResults({ records, online, state, queryKey, busy, selecting, selected, onSelect, onPreview, onPin, pinnedIds, renderDragHandle, onAction }: {
  records: LibraryRecord[]; online: ReturnType<typeof useExtendedSearch>; state: PersonalLibraryState; queryKey: string;
  busy: boolean; selecting: boolean; selected: Set<string>; onSelect: (id: string) => void;
  onPreview?: (record: LibraryRecord, origin?: MotionOriginHint) => void; onPin?: (record: LibraryRecord) => void; pinnedIds?: ReadonlySet<string>;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
  onAction: (action: PersonalAction) => Promise<boolean>;
}) {
  const [localLimit, setLocalLimit] = useState(24);
  useEffect(() => { setLocalLimit(24); }, [queryKey]);
  const failed = online.sources.some((source) => source.status === 'error');
  // Keep mounted rating drafts in place when another provider finishes.
  const limit = localLimit + online.sources.reduce((count, source) => count + source.records.length, 0);
  return (
    <section className="extended-results discovery-extended" aria-labelledby="extended-results-title">
      <div className="extended-heading"><h2 id="extended-results-title">Beyond The 100</h2><span>{records.length} {records.length === 1 ? 'match' : 'matches'}{online.loading ? ' so far' : ''}</span></div>
      {records.length > 0 && <ul className="discovery-cards discovery-cards-list" aria-label="Unranked games in this view">
        {records.slice(0, limit).map((record) => <DiscoveryCard key={record.id} record={record} artwork={online.artwork.get(record.id)} state={state} busy={busy} selecting={selecting} selected={selected.has(record.id)} onSelect={onSelect} onPreview={onPreview} onPin={onPin} pinned={pinnedIds?.has(record.id)} renderDragHandle={renderDragHandle} onAction={onAction} />)}
      </ul>}
      {records.length > limit && <button className="text-button" onClick={() => setLocalLimit((count) => count + 24)}>Show {Math.min(24, records.length - limit)} more games</button>}
      {online.eligible && <div className="discovery-online">
        {online.seedError && <div className="discovery-notice" role="alert"><p>Local catalog unavailable. {online.seedError} Saved games remain available.</p><button className="text-button" onClick={online.seedRetry}>Reload local catalog</button></div>}
        {!online.remoteEnabled && <button className="text-button" onClick={online.searchOnline}>Search online</button>}
        <CatalogSourceStatus sources={online.sources} onRetry={online.retry} onMore={(source) => online.more(source)} />
      </div>}
      {!records.length && <p className="extended-empty" role="status">{online.loading ? 'Searching catalogs…' : failed ? 'Online search is incomplete. Retry a provider or search your saved games.' : 'No additional matches. Try a shorter title or broader filters.'}</p>}
    </section>
  );
}

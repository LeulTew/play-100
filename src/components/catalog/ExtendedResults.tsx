import { useEffect, useMemo, useState } from 'react';
import type { MotionOriginHint } from '../../motion';
import type { useExtendedSearch } from '../../hooks/useExtendedSearch';
import type { CatalogArtwork } from '../../lib/discovery-catalog-shared';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { DiscoveryCard } from './DiscoveryCard';
import { CatalogSourceStatus } from './CatalogSourceStatus';
import { collidingCatalogTitles, newOnlineMatchCounts } from '../../lib/catalog-identity';
import { ChunkRecovery } from '../ChunkRecovery';
import { loadSavedDiscoveryArtwork } from '../../lib/saved-discovery-artwork';

export default function ExtendedResults({
  records,
  online,
  state,
  queryKey,
  busy,
  selecting,
  selected,
  onSelect,
  onPreview,
  onPin,
  pinnedIds,
  onAction,
  embedded = false,
}: {
  records: LibraryRecord[];
  online: ReturnType<typeof useExtendedSearch>;
  state: PersonalLibraryState;
  queryKey: string;
  busy: boolean;
  selecting: boolean;
  selected: Set<string>;
  onSelect: (id: string) => void;
  onPreview?: (record: LibraryRecord, origin?: MotionOriginHint) => void;
  onPin?: (record: LibraryRecord) => void;
  pinnedIds?: ReadonlySet<string>;
  onAction: (action: PersonalAction) => Promise<boolean>;
  embedded?: boolean;
}) {
  const [page, setPage] = useState({ queryKey, limit: 24 });
  const [savedArtwork, setSavedArtwork] = useState<ReadonlyMap<string, CatalogArtwork> | null>(null);
  const [artworkFailed, setArtworkFailed] = useState(false);
  const localLimit = page.queryKey === queryKey ? page.limit : 24;
  if (page.queryKey !== queryKey) setPage({ queryKey, limit: 24 });
  const failed = online.sources.some((source) => source.status === 'error');
  // Keep mounted rating drafts in place when another provider finishes.
  const limit = localLimit + online.sources.reduce((count, source) => count + source.records.length, 0);
  const shown = records.slice(0, limit);
  const missingArtworkIds = useMemo(
    () =>
      records
        .slice(0, limit)
        .filter(
          (record) =>
            state.records[record.id] &&
            record.source !== 'manual' &&
            record.source !== 'collection' &&
            !online.artwork.has(record.id),
        )
        .map((record) => record.id),
    [records, limit, state.records, online.artwork],
  );
  useEffect(() => {
    if (!missingArtworkIds.length) return;
    const controller = new AbortController();
    void loadSavedDiscoveryArtwork(missingArtworkIds, controller.signal)
      .then((artwork) => {
        if (controller.signal.aborted) return;
        setSavedArtwork(artwork);
        setArtworkFailed(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Saved game artwork could not load.', error);
        setArtworkFailed(true);
      });
    return () => controller.abort();
  }, [missingArtworkIds]);
  const collisions = collidingCatalogTitles(records);
  const newMatches = newOnlineMatchCounts(
    online.sources,
    [...online.localRecords, ...Object.values(state.records)],
    shown,
  );
  const content = (
    <>
      {records.length > 0 && (
        <ul className="discovery-cards discovery-cards-list" aria-label="Unranked games in this view">
          {shown.map((record) => (
            <DiscoveryCard
              key={record.id}
              record={record}
              showSource={collisions.has(record.id)}
              artwork={online.artwork.get(record.id) ?? savedArtwork?.get(record.id)}
              state={state}
              busy={busy}
              selecting={selecting}
              selected={selected.has(record.id)}
              onSelect={onSelect}
              onPreview={onPreview}
              onPin={onPin}
              pinned={pinnedIds?.has(record.id)}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
      {artworkFailed && missingArtworkIds.length > 0 && (
        <ChunkRecovery message="Saved game artwork couldn't load. Your games are still available." />
      )}
      {records.length > limit && (
        <button className="text-button" onClick={() => setPage({ queryKey, limit: localLimit + 24 })}>
          Show {Math.min(24, records.length - limit)} more games
        </button>
      )}
      {online.eligible && (
        <div className="discovery-online">
          {online.seedError && (
            <div className="discovery-notice" role="alert">
              <p>{online.seedError} Saved games remain available.</p>
              <button className="text-button" onClick={online.seedRetry}>
                Reload local catalog
              </button>
            </div>
          )}
          {!online.remoteEnabled && (
            <button className="text-button" data-extended-search onClick={online.searchOnline}>
              Search online
            </button>
          )}
          <CatalogSourceStatus
            sources={online.sources}
            newMatches={newMatches}
            onRetry={online.retry}
            onMore={(source) => online.more(source)}
          />
        </div>
      )}
      {!records.length && (
        <p className="extended-empty" role="status">
          {online.loading
            ? 'Searching catalogs…'
            : failed
              ? 'Online search is incomplete. Retry a provider or search your saved games.'
              : 'No additional matches. Try a shorter title or broader filters.'}
        </p>
      )}
    </>
  );
  return embedded ? (
    content
  ) : (
    <section className="extended-results discovery-extended" aria-labelledby="extended-results-title">
      <div className="extended-heading">
        <h2 id="extended-results-title">Beyond The 100</h2>
        <span>
          {records.length} {records.length === 1 ? 'match' : 'matches'}
          {online.loading ? ' so far' : ''}
        </span>
      </div>
      {content}
    </section>
  );
}

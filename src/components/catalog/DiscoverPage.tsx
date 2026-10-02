import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { MotionOriginHint } from '../../motion';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { defaultDiscoveryFilters, DISCOVERY_PAGE_SIZE, discoverySelectionKey } from '../../lib/discovery-search';
import type { DiscoveryFilters } from '../../lib/discovery-search';
import { useDiscoverSearch } from '../../hooks/useDiscoverSearch';
import { useDiscoveryUrl } from '../../hooks/useDiscoveryUrl';
import { Icon } from '../Icon';
import { ChunkRecovery } from '../ChunkRecovery';
import { SelectionBar } from '../SelectionBar';
import type { SelectionAction } from '../SelectionBar';
import ManualGameForm from '../personal/ManualGameForm';
import { DiscoveryCard } from './DiscoveryCard';
import { DiscoverFilters, DiscoverSources } from './DiscoverControls';
import { selectionOperation } from '../../lib/game-progress';
import type { useCollection } from '../../hooks/useCollection';
import { catalogActionRecord, collectionGameForId } from '../../lib/catalog-identity';
import { collidingCatalogTitles, newOnlineMatchCounts } from '../../lib/catalog-matches';
import { LocalPager } from '../LocalPager';
import { gameDetailSearch } from '../../lib/my-games-navigation';
import './discover.css';
import './catalog-enrichment.css';

// Kept local rather than shared with the catalog detail: a module used by both lazy pages would become its own
// precache chunk, and the offline core is at its file budget.
function subscribeConnection(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}
export default function DiscoverPage({
  collection,
  state,
  busy,
  onAction,
  onLibrary,
  onCommunity,
  onPreview,
  onPin,
  pinnedIds,
}: {
  collection: ReturnType<typeof useCollection>;
  state: PersonalLibraryState;
  busy: boolean;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onLibrary: () => void;
  onCommunity?: () => void;
  onPreview?: (record: LibraryRecord, origin?: MotionOriginHint, opener?: HTMLElement) => void;
  onPin?: (record: LibraryRecord) => void;
  pinnedIds?: ReadonlySet<string>;
}) {
  const { filters, update, error: navigationError, saving, search: locationSearch } = useDiscoveryUrl();
  const connected = useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
    () => false,
  );
  const games = collection.data?.games ?? [];
  const search = useDiscoverSearch(filters, games, collection.status === 'ready', state);
  const progressView = filters.progress ?? 'all';
  const filterId = useId();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Any change of results clears the selection, including Back/Forward and other URL updates outside change().
  const selectionKey = discoverySelectionKey(filters);
  const [selectionScope, setSelectionScope] = useState(selectionKey);
  if (selectionScope !== selectionKey) {
    setSelectionScope(selectionKey);
    setSelected(new Set());
  }
  const editingRef = useRef(false);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const [pageRequest, setPageRequest] = useState<{ search: string; remote: boolean } | null>(null);
  const focusedRequest = useRef(pageRequest);
  const {
    seed,
    records,
    local,
    artwork,
    remote,
    remoteEnabled,
    items,
    ownership,
    localReady,
    localPage,
    collectionMatches,
    showCollection,
  } = search;
  const collisions = collidingCatalogTitles([...local.map((item) => item.record), ...records]);
  const newMatches = newOnlineMatchCounts(
    remote.sources,
    local.map((item) => item.record),
    records,
  );
  const selection = records
    .filter((record) => selected.has(record.id))
    .map((record) => catalogActionRecord(record, ownership));
  const change = useCallback(
    (patch: Partial<DiscoveryFilters>, method: 'push' | 'replace' = 'push', focusResults = false) => {
      void update(patch, method).then((changed) => {
        if (!changed) return;
        setSelected(new Set());
        if (focusResults) setPageRequest({ search: window.location.search, remote: patch.online === 'on' });
      });
    },
    [update],
  );
  useEffect(() => {
    if (localReady && filters.online === 'auto' && filters.offset !== localPage.offset)
      change({ offset: localPage.offset }, 'replace');
  }, [localReady, filters.online, filters.offset, localPage.offset, change]);
  useEffect(() => {
    if (!pageRequest || focusedRequest.current === pageRequest) return;
    if (pageRequest.search !== locationSearch) {
      focusedRequest.current = pageRequest;
      return;
    }
    if (pageRequest.remote && remote.loading) return;
    focusedRequest.current = pageRequest;
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [pageRequest, locationSearch, remote.loading]);
  const bulk = async (action: SelectionAction) => {
    if (!selection.length) return;
    if (await onAction(selectionOperation(action, selection))) setSelected(new Set());
  };
  const initialLoading = collection.status === 'loading';
  const catalogLoading = initialLoading || (collection.status === 'ready' && !localReady);
  const failed = remote.sources.some((source) => source.status === 'error');
  const localRange =
    localReady && filters.online === 'auto' && local.length > DISCOVERY_PAGE_SIZE
      ? `${localPage.start}–${localPage.end} of ${local.length} catalog games`
      : filters.q.trim() || filters.online === 'on'
        ? `${records.length} catalog ${records.length === 1 ? 'match' : 'matches'} shown`
        : `${local.length} ${local.length === 1 ? 'game' : 'games'} · Illustrated first`;
  const catalogStatus = catalogLoading
    ? 'Loading the catalog…'
    : collection.status === 'error'
      ? 'Catalog unavailable'
      : seed.error && filters.source !== 'collection'
        ? 'Catalog incomplete'
        : localRange;
  return (
    <section className="app-page discovery-page" aria-labelledby="discover-title">
      <header className="discovery-heading">
        <h1 id="discover-title" tabIndex={-1} data-page-heading>
          Discover
        </h1>
        <button className="text-button" onClick={onLibrary}>
          My games
          <Icon name="arrow" width="17" height="17" />
        </button>
      </header>
      <DiscoverFilters
        filters={filters}
        filterId={filterId}
        editingRef={editingRef}
        showCollection={showCollection}
        progressView={progressView}
        items={items}
        change={change}
      />
      <div className="discovery-results-heading">
        <div>
          <h2 ref={resultsHeading} id="discovery-results-title" tabIndex={-1}>
            Catalog games
          </h2>
          <p role="status" aria-live="polite" aria-atomic="true">
            {catalogStatus}
          </p>
        </div>
        <div className="view-switch discovery-view" role="group" aria-label="Catalog view">
          <button
            className={`icon-button ${filters.view === 'grid' ? 'is-active' : ''}`}
            aria-label="Grid view"
            aria-pressed={filters.view === 'grid'}
            onClick={() => change({ view: 'grid' })}
          >
            <Icon name="grid" />
          </button>
          <button
            className={`icon-button ${filters.view === 'list' ? 'is-active' : ''}`}
            aria-label="List view"
            aria-pressed={filters.view === 'list'}
            onClick={() => change({ view: 'list' })}
          >
            <Icon name="list" />
          </button>
        </div>
        <button
          className="text-button"
          disabled={catalogLoading && !records.length}
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
          }}
        >
          <Icon name="select" width="17" height="17" />
          {selecting ? 'Done selecting' : 'Select games'}
        </button>
      </div>
      <div role="region" aria-labelledby="discovery-results-title" aria-busy={catalogLoading}>
        {navigationError && (
          <p className="inline-error" role="alert">
            {navigationError}
          </p>
        )}
        {saving && (
          <p className="section-help" role="status">
            Saving your rating before changing results…
          </p>
        )}
        {!showCollection && filters.q.trim() && collectionMatches.length > 0 && (
          <section className="discovery-collection-matches" aria-labelledby="discovery-collection-matches-title">
            <h2 id="discovery-collection-matches-title">Already in The 100</h2>
            <p>
              Open the original collection entry. Its artwork, original scores and your existing opinions are unchanged.
            </p>
            <ul>
              {collectionMatches.slice(0, 8).map((record) => (
                <li key={record.id}>
                  <a
                    href={`/discover${gameDetailSearch(locationSearch, record.id)}`}
                    data-canonical-id={record.id}
                    onClick={(event) => {
                      if (
                        !onPreview ||
                        event.button !== 0 ||
                        event.ctrlKey ||
                        event.metaKey ||
                        event.altKey ||
                        event.shiftKey
                      )
                        return;
                      event.preventDefault();
                      onPreview(record, undefined, event.currentTarget);
                    }}
                  >
                    {record.title}
                    <Icon name="arrow" width="17" height="17" />
                  </a>
                </li>
              ))}
            </ul>
            {collectionMatches.length > 8 && (
              <button className="text-button" onClick={() => change({ include100: 'on', offset: 0 })}>
                Show all {collectionMatches.length} collection matches
              </button>
            )}
          </section>
        )}
        {selecting && (
          <p className="section-help">
            Selection applies to this page. Changing pages or filters clears the selection.
          </p>
        )}
        {selecting && (
          <SelectionBar
            context="discover"
            count={selection.length}
            total={records.length}
            busy={busy}
            onSelectAll={() => setSelected(new Set(records.map((record) => record.id)))}
            onClear={() => setSelected(new Set())}
            onDone={() => {
              setSelecting(false);
              setSelected(new Set());
            }}
            onAction={(action) => {
              void bulk(action);
            }}
          />
        )}
        {collection.status === 'error' && (
          <div className="discovery-notice" role="alert">
            <p>
              The 100 could not load. {collection.error} Reload it before browsing so matching catalog games use the
              original entry.
            </p>
            <button className="text-button" onClick={collection.retry}>
              Reload The 100
            </button>
          </div>
        )}
        {seed.moduleError ? (
          <ChunkRecovery message="The catalog tools didn't load." />
        ) : (
          seed.error && (
            <div className="discovery-notice" role="alert">
              <p>
                {seed.error} The 100 remains searchable.{' '}
                {!connected
                  ? 'Reconnect before reloading the catalog or searching online.'
                  : filters.catalogs === 'off'
                    ? 'Online lookup is off.'
                    : remoteEnabled
                      ? remote.loading
                        ? 'Trying online catalogs instead.'
                        : 'Online catalog results and source status are below.'
                      : 'Change your search or filters to look online.'}
              </p>
              <button className="text-button" onClick={seed.retry}>
                Reload local catalog
              </button>
            </div>
          )
        )}
        {catalogLoading && !records.length && (
          <ul className={`discovery-skeleton discovery-cards-${filters.view}`} aria-hidden="true" inert>
            {Array.from({ length: DISCOVERY_PAGE_SIZE }, (_, index) => (
              <li className="discovery-card-skeleton" key={index}>
                <div className="discovery-card-art">
                  <span className="discovery-skeleton-print" />
                </div>
                <div className="discovery-card-body">
                  <h3>
                    <span className="discovery-skeleton-line" />
                  </h3>
                  <p className="discovery-card-meta">
                    <span className="discovery-skeleton-line" />
                    <span className="discovery-skeleton-line" />
                  </p>
                  <div className="discovery-card-primary">
                    <span className="discovery-skeleton-action" />
                    <span className="discovery-skeleton-action" />
                  </div>
                  <div className="discovery-skeleton-source">
                    <span className="discovery-skeleton-line" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {records.length > 0 && (
          <ul className={`discovery-cards discovery-cards-${filters.view}`} aria-label="Discovered games">
            {records.map((record, index) => (
              <DiscoveryCard
                key={record.id}
                record={record}
                showSource={collisions.has(record.id)}
                game={collectionGameForId(games, record.id)}
                actionRecord={catalogActionRecord(record, ownership)}
                ownedCopies={ownership.get(record.id)}
                artwork={artwork.get(record.id)}
                state={state}
                busy={busy}
                eager={index < 4}
                selecting={selecting}
                selected={selected.has(record.id)}
                pinned={pinnedIds?.has(record.id)}
                onSelect={(id) =>
                  setSelected((prior) => {
                    const next = new Set(prior);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onPreview={onPreview}
                onPin={onPin}
                onAction={onAction}
              />
            ))}
          </ul>
        )}
        {collection.status === 'ready' && localReady && !records.length && (
          <div className="discovery-empty">
            <h2>
              {remote.loading
                ? 'Looking online…'
                : failed
                  ? 'Online search is incomplete'
                  : seed.error
                    ? 'The catalog could not load'
                    : filters.offset > 0
                      ? 'No games on this page'
                      : !showCollection && collectionMatches.length && filters.q.trim()
                        ? 'No additional games outside The 100'
                        : 'No matching games'}
            </h2>
            <p>
              {failed
                ? 'Retry a provider below or change your search.'
                : 'Try a shorter title, clear a filter, or add a game manually.'}
            </p>
            <button
              className="text-button"
              onClick={() => change({ ...defaultDiscoveryFilters, catalogs: filters.catalogs, view: filters.view })}
            >
              Reset search and filters
            </button>
          </div>
        )}
        {filters.online === 'auto' && localReady && localPage.pageCount > 1 && (
          <LocalPager
            label="Catalog pages"
            itemLabel="catalog game"
            total={local.length}
            offset={localPage.offset}
            pageSize={DISCOVERY_PAGE_SIZE}
            disabled={saving}
            onOffsetChange={(offset) => change({ offset }, 'push', true)}
          />
        )}
      </div>
      <DiscoverSources
        filters={filters}
        progressView={progressView}
        remote={remote}
        remoteEnabled={remoteEnabled}
        newMatches={newMatches}
        change={change}
      />
      <ManualGameForm
        busy={busy}
        onAdd={(record) => onAction({ type: 'add-records', records: [record] })}
        actionLabel="Add to My games"
      />
      {onCommunity && (
        <footer className="discovery-footer">
          <button className="text-button" onClick={onCommunity}>
            Explore shared rankings
            <Icon name="arrow" width="17" height="17" />
          </button>
        </footer>
      )}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MotionOriginHint } from '../../motion';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { defaultDiscoveryFilters, DISCOVERY_PAGE_SIZE, discoverySelectionKey } from '../../lib/discovery-search';
import type { DiscoveryFilters } from '../../lib/discovery-search';
import { DISCOVERY_GENRE_FAMILIES, parseDiscoveryGenreFamily } from '../../lib/discovery-genres';
import { useDiscoverSearch } from '../../hooks/useDiscoverSearch';
import { useDiscoveryUrl } from '../../hooks/useDiscoveryUrl';
import { Icon } from '../Icon';
import { ChunkRecovery } from '../ChunkRecovery';
import { SelectionBar } from '../SelectionBar';
import type { SelectionAction } from '../SelectionBar';
import ManualGameForm from '../personal/ManualGameForm';
import { DiscoveryCard } from './DiscoveryCard';
import { CatalogSourceStatus } from './CatalogSourceStatus';
import { ProgressFilter } from '../ProgressFilter';
import { selectionOperation } from '../../lib/game-progress';
import type { useCollection } from '../../hooks/useCollection';
import { catalogActionRecord, collectionGameForId } from '../../lib/catalog-identity';
import { LocalPager } from '../LocalPager';
import { BrowseFilters } from '../BrowseFilters';
import { gameDetailSearch } from '../../lib/my-games-navigation';
import './discover.css';
import './catalog-enrichment.css';

export default function DiscoverPage({ collection, state, busy, onAction, onLibrary, onCommunity, onPreview, onPin, pinnedIds, renderDragHandle }: {
  collection: ReturnType<typeof useCollection>;
  state: PersonalLibraryState; busy: boolean; onAction: (action: PersonalAction) => Promise<boolean>; onLibrary: () => void;
  onCommunity?: () => void; onPreview?: (record: LibraryRecord, origin?: MotionOriginHint) => void;
  onPin?: (record: LibraryRecord) => void; pinnedIds?: ReadonlySet<string>;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
}) {
  const { filters, update, error: navigationError, saving, search: locationSearch } = useDiscoveryUrl();
  const games = collection.data?.games ?? [];
  const search = useDiscoverSearch(filters, games, collection.status === 'ready', state);
  const progressView = filters.progress ?? 'all';
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Any change of results clears the selection, including Back/Forward and other URL updates outside change().
  const selectionKey = discoverySelectionKey(filters);
  const [selectionScope, setSelectionScope] = useState(selectionKey);
  if (selectionScope !== selectionKey) { setSelectionScope(selectionKey); setSelected(new Set()); }
  const editing = useRef(false);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const [pageRequest, setPageRequest] = useState<{ search: string; remote: boolean } | null>(null);
  const focusedRequest = useRef(pageRequest);
  const { seed, records, local, artwork, remote, remoteEnabled, items, ownership, localReady, localPage, collectionMatches, showCollection } = search;
  const selection = records.filter((record) => selected.has(record.id)).map(record => catalogActionRecord(record, ownership));
  const change = useCallback((patch: Partial<DiscoveryFilters>, method: 'push' | 'replace' = 'push', focusResults = false) => {
    void update(patch, method).then((changed) => {
      if (!changed) return;
      setSelected(new Set());
      if (focusResults) setPageRequest({ search: window.location.search, remote: patch.online === 'on' });
    });
  }, [update]);
  useEffect(() => {
    if (localReady && filters.online === 'auto' && filters.offset !== localPage.offset) change({ offset: localPage.offset }, 'replace');
  }, [localReady, filters.online, filters.offset, localPage.offset, change]);
  useEffect(() => {
    if (!pageRequest || focusedRequest.current === pageRequest) return;
    if (pageRequest.search !== locationSearch) { focusedRequest.current = pageRequest; return; }
    if (pageRequest.remote && remote.loading) return;
    focusedRequest.current = pageRequest;
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [pageRequest, locationSearch, remote.loading]);
  const bulk = async (action: SelectionAction) => {
    if (!selection.length) return;
    if (await onAction(selectionOperation(action, selection))) setSelected(new Set());
  };
  const genres = useMemo(() => [...new Set(items.flatMap(({ record }) => record.genre ? [record.genre] : []))].sort(), [items]);
  const years = useMemo(() => [...new Set(items.flatMap(({ record }) => record.year ? [record.year] : []))].sort((a, b) => b - a), [items]);
  const initialLoading = collection.status === 'loading';
  const catalogLoading = initialLoading || collection.status === 'ready' && !localReady;
  const failed = remote.sources.some((source) => source.status === 'error');
  const activeFilters = [progressView !== 'all', Boolean(filters.genreFamily), Boolean(filters.genre), Boolean(filters.year), filters.source !== 'all'].filter(Boolean).length;
  const localRange = localReady && filters.online === 'auto' && local.length > DISCOVERY_PAGE_SIZE
    ? `${localPage.start}–${localPage.end} of ${local.length} catalog games`
    : filters.q.trim() ? `${local.length} catalog ${local.length === 1 ? 'match' : 'matches'}` : `${local.length} games · Illustrated first`;
  const catalogStatus = catalogLoading ? 'Loading the catalog…' : collection.status === 'error' ? 'Catalog unavailable'
    : seed.error && filters.source !== 'collection' ? 'Catalog incomplete' : localRange;
  return (
    <section className="app-page discovery-page" aria-labelledby="discover-title">
      <header className="discovery-heading"><h1 id="discover-title" tabIndex={-1} data-page-heading>Discover</h1><button className="text-button" onClick={onLibrary}>My games<Icon name="arrow" width="17" height="17" /></button></header>
      <form className="discovery-search" onSubmit={(event) => { event.preventDefault(); editing.current = false; }}>
        <label htmlFor="catalog-search">Find a game</label>
        <div className="search-field"><Icon name="search" /><input id="catalog-search" type="search" value={filters.q} maxLength={80} placeholder="Search games, studios or aliases…" onFocus={() => { editing.current = false; }} onBlur={() => { editing.current = false; }} onChange={(event) => {
          change({ q: event.target.value, offset: 0, online: 'auto' }, editing.current ? 'replace' : 'push');
          editing.current = true;
        }} />{filters.q && <button className="icon-button" type="button" aria-label="Clear search" onClick={() => change({ q: '', offset: 0, online: 'auto' })}><Icon name="close" /></button>}</div>
      </form>
      <p className="section-help">{showCollection ? 'Including original entries from The 100 once, alongside other games.' : 'Discover games beyond The 100. Matches already in the collection open their original entry.'}</p>
      <BrowseFilters activeCount={activeFilters} className="discovery-filters">
        <label className="check-control"><input type="checkbox" checked={showCollection} onChange={event => change({
          include100: event.target.checked ? 'on' : 'off', source: !event.target.checked && filters.source === 'collection' ? 'all' : filters.source, offset: 0, online: 'auto',
        })} />Include The 100</label>
        <div className="discovery-toolbar">
        <ProgressFilter value={progressView} onChange={progress => change({ progress, offset: 0, online: 'auto' })} />
        <label>Genre family<select aria-describedby="discovery-genre-help" value={filters.genreFamily ?? ''} onChange={(event) => change({ genreFamily: parseDiscoveryGenreFamily(event.target.value), genre: '', offset: 0, online: 'auto' })}><option value="">All families</option>{DISCOVERY_GENRE_FAMILIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Year<select value={filters.year} onChange={(event) => change({ year: event.target.value, offset: 0, online: 'auto' })}><option value="">Any year</option>{filters.year && !years.includes(Number(filters.year)) && <option>{filters.year}</option>}{years.map((year) => <option key={year}>{year}</option>)}</select></label>
        <label>Source<select value={filters.source} onChange={(event) => change({ source: event.target.value === 'collection' ? 'collection' : event.target.value === 'wikidata' ? 'wikidata' : event.target.value === 'freetogame' ? 'freetogame' : 'all', offset: 0, online: 'auto' })}><option value="all">All sources</option><option value="collection">The 100</option><option value="wikidata">Wikidata</option><option value="freetogame">FreeToGame</option></select></label>
        </div>
        <p className="section-help" id="discovery-genre-help">Families group source labels and can overlap. Other includes unclear or missing genres. Changing family clears the exact source genre below.</p>
        <details className="discovery-help" open={Boolean(filters.genre)}>
          <summary>Exact source genre</summary>
          <div className="discovery-toolbar"><label>Exact source genre<select value={filters.genre} onChange={(event) => change({ genre: event.target.value, offset: 0, online: 'auto' })}><option value="">Any source genre</option>{filters.genre && !genres.includes(filters.genre) && <option>{filters.genre}</option>}{genres.map((genre) => <option key={genre}>{genre}</option>)}</select></label></div>
          <p>Original labels are unchanged. An exact genre narrows the selected family; choose All families to search every exact label.</p>
        </details>
        {activeFilters > 0 && <button className="text-button" onClick={() => change({ progress: 'all', genreFamily: '', genre: '', year: '', source: 'all', offset: 0, online: 'auto' })}>Clear filters</button>}
      </BrowseFilters>
      <div className="discovery-results-heading">
        <div><h2 ref={resultsHeading} id="discovery-results-title" tabIndex={-1}>Catalog games</h2><p role="status" aria-live="polite" aria-atomic="true">{catalogStatus}</p></div>
        <div className="discovery-view" role="group" aria-label="Catalog view"><button className="icon-button" aria-label="Grid view" aria-pressed={filters.view === 'grid'} onClick={() => change({ view: 'grid' })}><Icon name="grid" /></button><button className="icon-button" aria-label="List view" aria-pressed={filters.view === 'list'} onClick={() => change({ view: 'list' })}><Icon name="list" /></button></div>
        <button className="text-button" disabled={catalogLoading && !records.length} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}><Icon name="select" width="17" height="17" />{selecting ? 'Done selecting' : 'Select games'}</button>
      </div>
      <div role="region" aria-labelledby="discovery-results-title" aria-busy={catalogLoading}>
      {navigationError && <p className="inline-error" role="alert">{navigationError}</p>}
      {saving && <p className="section-help" role="status">Saving your rating before changing results…</p>}
      {!showCollection && filters.q.trim() && collectionMatches.length > 0 && <section className="discovery-collection-matches" aria-labelledby="discovery-collection-matches-title">
        <h2 id="discovery-collection-matches-title">Already in The 100</h2>
        <p>Open the original collection entry. Its artwork, original scores and your existing opinions are unchanged.</p>
        <ul>{collectionMatches.slice(0, 8).map(record => <li key={record.id}><a href={`/discover${gameDetailSearch(locationSearch, record.id)}`} data-canonical-id={record.id} onClick={event => {
          if (!onPreview || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
          event.preventDefault();
          onPreview(record);
        }}>{record.title}<Icon name="arrow" width="17" height="17" /></a></li>)}</ul>
        {collectionMatches.length > 8 && <button className="text-button" onClick={() => change({ include100: 'on', offset: 0 })}>Show all {collectionMatches.length} collection matches</button>}
      </section>}
      {selecting && <p className="section-help">Selection applies to this page. Changing pages or filters clears the selection.</p>}
      {selecting && <SelectionBar context="discover" count={selection.length} total={records.length} busy={busy} onSelectAll={() => setSelected(new Set(records.map((record) => record.id)))} onClear={() => setSelected(new Set())} onDone={() => { setSelecting(false); setSelected(new Set()); }} onAction={(action) => { void bulk(action); }} />}
      {collection.status === 'error' && <div className="discovery-notice" role="alert"><p>The 100 could not load. {collection.error} Reload it before browsing so matching catalog games use the original entry.</p><button className="text-button" onClick={collection.retry}>Reload The 100</button></div>}
      {seed.moduleError ? <ChunkRecovery message="The catalog tools didn't load." /> : seed.error && <div className="discovery-notice" role="alert"><p>{seed.error} The 100 remains searchable. {filters.catalogs === 'off' ? 'Online lookup is off.' : 'Trying online catalogs instead.'}</p><button className="text-button" onClick={seed.retry}>Reload local catalog</button></div>}
      {catalogLoading && !records.length && <ul className={`discovery-skeleton discovery-cards-${filters.view}`} aria-hidden="true" inert>
        {Array.from({ length: DISCOVERY_PAGE_SIZE }, (_, index) => <li className="discovery-card-skeleton" key={index}>
          <div className="discovery-card-art"><span className="discovery-skeleton-print" /></div>
          <div className="discovery-card-body">
            <h3><span className="discovery-skeleton-line" /></h3>
            <p className="discovery-card-meta"><span className="discovery-skeleton-line" /><span className="discovery-skeleton-line" /></p>
            <div className="discovery-card-primary"><span className="discovery-skeleton-action" /><span className="discovery-skeleton-action" />{renderDragHandle && <span className="discovery-skeleton-grip" />}</div>
            <div className="discovery-skeleton-source"><span className="discovery-skeleton-line" /></div>
          </div>
        </li>)}
      </ul>}
      {records.length > 0 && <ul className={`discovery-cards discovery-cards-${filters.view}`} aria-label="Discovered games">
        {records.map((record, index) => <DiscoveryCard key={record.id} record={record} game={collectionGameForId(games, record.id)} actionRecord={catalogActionRecord(record, ownership)} ownedCopies={ownership.get(record.id)} artwork={artwork.get(record.id)} state={state} busy={busy} eager={index < 4} selecting={selecting} selected={selected.has(record.id)} pinned={pinnedIds?.has(record.id)} onSelect={(id) => setSelected((prior) => {
          const next = new Set(prior); if (next.has(id)) next.delete(id); else next.add(id); return next;
        })} onPreview={onPreview} onPin={onPin} renderDragHandle={renderDragHandle} onAction={onAction} />)}
      </ul>}
      {collection.status === 'ready' && localReady && !records.length && <div className="discovery-empty"><h2>{remote.loading ? 'Looking online…' : failed ? 'Online search is incomplete' : seed.error ? 'The catalog could not load' : filters.offset > 0 ? 'No games on this page' : !showCollection && collectionMatches.length && filters.q.trim() ? 'No additional games outside The 100' : 'No matching games'}</h2><p>{failed ? 'Retry a provider below or change your search.' : 'Try a shorter title, clear a filter, or add a game manually.'}</p><button className="text-button" onClick={() => change({ ...defaultDiscoveryFilters, catalogs: filters.catalogs, view: filters.view })}>Reset search and filters</button></div>}
      {filters.online === 'auto' && localReady && localPage.pageCount > 1 && <LocalPager label="Catalog pages" itemLabel="catalog games" total={local.length} offset={localPage.offset} pageSize={DISCOVERY_PAGE_SIZE} disabled={saving} onOffsetChange={offset => change({ offset }, 'push', true)} />}
      </div>
      <div className="discovery-online">
        {filters.source === 'collection' ? <p>Showing entries from The 100. Choose another source to look beyond the collection.</p> : progressView !== 'all' ? <p>Online lookup is paused for this progress view. Your play history is not sent to providers.</p> : filters.catalogs === 'off' ? <p>Online lookup is off. <button className="text-button" onClick={() => change({ catalogs: 'on', online: 'on', offset: 0 })}>Search online</button></p>
          : !remoteEnabled && <button className="text-button" onClick={() => change({ online: 'on', offset: 0 })}>Search online<Icon name="arrow" width="17" height="17" /></button>}
        {filters.online === 'on' && progressView === 'all' && <button className="text-button" onClick={() => change({ online: 'auto', offset: 0 })}>Back to catalog</button>}
        <CatalogSourceStatus sources={remote.sources} onRetry={remote.retry} onMore={(source, offset) => change({ source, offset, online: 'on' }, 'push', true)} onPrevious={(source, offset) => change({ source, offset, online: 'on' }, 'push', true)} />
        <details className="discovery-help"><summary>Search options &amp; sources</summary><label className="check-control"><input type="checkbox" checked={filters.catalogs === 'on'} disabled={progressView !== 'all'} onChange={(event) => change({ catalogs: event.target.checked ? 'on' : 'off' })} />Look online when local matches are limited</label><p>Verified matches link to the original entry from The 100, including when found through Wikidata. Include The 100 to browse those entries here once. Other editions stay separate; titles alone are never merged. Provider counts describe their responses, before local genre/year filters and duplicate matching.</p><p>Only public search terms and exact public game IDs are sent to providers, not your saved progress, ratings or notes. Opening an eligible game can load separately labelled ratings and licensed artwork while online lookup is on. Metadata from <a href="https://www.wikidata.org/wiki/Wikidata:Data_access" target="_blank" rel="noreferrer">Wikidata (CC0)</a> and <a href="https://www.freetogame.com/" target="_blank" rel="noreferrer">FreeToGame</a>. Image credits are under each game's Actions &amp; source or in its details.</p></details>
      </div>
      <ManualGameForm busy={busy} onAdd={(record) => onAction({ type: 'add-records', records: [record] })} actionLabel="Add to my library" />
      {onCommunity && <footer className="discovery-footer"><button className="text-button" onClick={onCommunity}>Explore shared rankings<Icon name="arrow" width="17" height="17" /></button></footer>}
    </section>
  );
}

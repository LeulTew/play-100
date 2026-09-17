import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { defaultDiscoveryFilters, DISCOVERY_PAGE_SIZE } from '../../lib/discovery-search';
import type { DiscoveryFilters } from '../../lib/discovery-search';
import { useDiscoverSearch } from '../../hooks/useDiscoverSearch';
import { useDiscoveryUrl } from '../../hooks/useDiscoveryUrl';
import { Icon } from '../Icon';
import { SelectionBar } from '../SelectionBar';
import type { SelectionAction } from '../SelectionBar';
import ManualGameForm from '../personal/ManualGameForm';
import { DiscoveryCard } from './DiscoveryCard';
import { CatalogSourceStatus } from './CatalogSourceStatus';
import './discover.css';

export default function DiscoverPage({ state, busy, onAction, onLibrary, onCommunity, onPreview, onPin, pinnedIds, renderDragHandle }: {
  state: PersonalLibraryState; busy: boolean; onAction: (action: PersonalAction) => Promise<boolean>; onLibrary: () => void;
  onCommunity?: () => void; onPreview?: (record: LibraryRecord) => void;
  onPin?: (record: LibraryRecord) => void; pinnedIds?: ReadonlySet<string>;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
}) {
  const { filters, update } = useDiscoveryUrl();
  const search = useDiscoverSearch(filters);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const editing = useRef(false);
  const { seed, records, local, artwork, remote, remoteEnabled } = search;
  const selection = records.filter((record) => selected.has(record.id));
  const change = (patch: Partial<DiscoveryFilters>, method: 'push' | 'replace' = 'push') => {
    setSelected(new Set());
    update(patch, method);
  };
  const bulk = async (action: SelectionAction) => {
    if (!selection.length) return;
    if (await onAction(action === 'ranking' ? { type: 'add-ranking', records: selection } : {
      type: 'set-progress', records: selection, key: action === 'completed' ? 'completed' : 'later', value: true,
    })) setSelected(new Set());
  };
  const genres = [...new Set(seed.catalog?.items.flatMap(({ record }) => record.genre ? [record.genre] : []) ?? [])].sort();
  const years = [...new Set(seed.catalog?.items.flatMap(({ record }) => record.year ? [record.year] : []) ?? [])].sort((a, b) => b - a);
  const initialLoading = seed.status === 'idle' || seed.status === 'loading';
  const failed = remote.sources.some((source) => source.status === 'error');
  return (
    <section className="app-page discovery-page" aria-labelledby="discover-title">
      <header className="discovery-heading"><h1 id="discover-title" tabIndex={-1} data-page-heading>Discover</h1><button className="text-button" onClick={onLibrary}>My games<Icon name="arrow" width="17" height="17" /></button></header>
      <form className="discovery-search" onSubmit={(event) => { event.preventDefault(); editing.current = false; }}>
        <label htmlFor="catalog-search">Find a game</label>
        <div className="search-field"><Icon name="search" /><input id="catalog-search" type="search" value={filters.q} maxLength={80} placeholder="Search games, studios or aliases" onFocus={() => { editing.current = false; }} onBlur={() => { editing.current = false; }} onChange={(event) => {
          change({ q: event.target.value, offset: 0, online: 'auto' }, editing.current ? 'replace' : 'push');
          editing.current = true;
        }} />{filters.q && <button className="icon-button" type="button" aria-label="Clear search" onClick={() => change({ q: '', offset: 0, online: 'auto' })}><Icon name="close" /></button>}</div>
      </form>
      <div className="discovery-toolbar">
        <label>Genre<select value={filters.genre} onChange={(event) => change({ genre: event.target.value, offset: 0, online: 'auto' })}><option value="">All genres</option>{filters.genre && !genres.includes(filters.genre) && <option>{filters.genre}</option>}{genres.map((genre) => <option key={genre}>{genre}</option>)}</select></label>
        <label>Year<select value={filters.year} onChange={(event) => change({ year: event.target.value, offset: 0, online: 'auto' })}><option value="">Any year</option>{filters.year && !years.includes(Number(filters.year)) && <option>{filters.year}</option>}{years.map((year) => <option key={year}>{year}</option>)}</select></label>
        <label>Source<select value={filters.source} onChange={(event) => change({ source: event.target.value === 'wikidata' ? 'wikidata' : event.target.value === 'freetogame' ? 'freetogame' : 'all', offset: 0, online: 'auto' })}><option value="all">All sources</option><option value="wikidata">Wikidata</option><option value="freetogame">FreeToGame</option></select></label>
        <div className="discovery-view" role="group" aria-label="Catalog view"><button className="icon-button" aria-label="Grid view" aria-pressed={filters.view === 'grid'} onClick={() => change({ view: 'grid' })}><Icon name="grid" /></button><button className="icon-button" aria-label="List view" aria-pressed={filters.view === 'list'} onClick={() => change({ view: 'list' })}><Icon name="list" /></button></div>
      </div>
      <div className="discovery-results-heading">
        <p role="status">{initialLoading ? 'Loading catalog...' : seed.status === 'error' ? 'Online results' : filters.q.trim() ? `${local.length} catalog ${local.length === 1 ? 'match' : 'matches'}` : `${local.length} games · Illustrated first`}</p>
        <button className="text-button" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}><Icon name="select" width="17" height="17" />{selecting ? 'Done selecting' : 'Select games'}</button>
      </div>
      {selecting && <SelectionBar context="discover" count={selection.length} total={records.length} busy={busy} onSelectAll={() => setSelected(new Set(records.map((record) => record.id)))} onClear={() => setSelected(new Set())} onDone={() => { setSelecting(false); setSelected(new Set()); }} onAction={(action) => { void bulk(action); }} />}
      {seed.error && <div className="discovery-notice" role="alert"><p>Local catalog unavailable. {seed.error} {filters.catalogs === 'off' ? 'Online lookup is off.' : 'Trying online catalogs instead.'}</p><button className="text-button" onClick={seed.retry}>Reload local catalog</button></div>}
      {initialLoading && !records.length && <div className="discovery-skeleton" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div key={index} />)}</div>}
      {records.length > 0 && <ul className={`discovery-cards discovery-cards-${filters.view}`} aria-label="Discovered games">
        {records.map((record, index) => <DiscoveryCard key={record.id} record={record} artwork={artwork.get(record.id)} state={state} busy={busy} eager={index < 4} selecting={selecting} selected={selected.has(record.id)} pinned={pinnedIds?.has(record.id)} onSelect={(id) => setSelected((prior) => {
          const next = new Set(prior); if (next.has(id)) next.delete(id); else next.add(id); return next;
        })} onPreview={onPreview} onPin={onPin} renderDragHandle={renderDragHandle} onAction={onAction} />)}
      </ul>}
      {!initialLoading && !records.length && <div className="discovery-empty"><h2>{remote.loading ? 'Looking online…' : failed ? 'Online search is incomplete' : seed.error ? 'The catalog could not load' : filters.offset > 0 ? 'No games on this page' : 'No matching games'}</h2><p>{failed ? 'Retry a provider below or change your search.' : 'Try a shorter title, clear a filter, or add a game manually.'}</p><button className="text-button" onClick={() => change({ ...defaultDiscoveryFilters, catalogs: filters.catalogs, view: filters.view })}>Reset search and filters</button></div>}
      {filters.online === 'auto' && (local.length > DISCOVERY_PAGE_SIZE || filters.offset > 0) && <nav className="discovery-pagination" aria-label="Catalog pages"><button className="button button-outline" disabled={filters.offset === 0} onClick={() => change({ offset: Math.max(0, filters.offset - DISCOVERY_PAGE_SIZE) })}>Previous</button><span>{Math.min(filters.offset + 1, local.length)}–{Math.min(filters.offset + DISCOVERY_PAGE_SIZE, local.length)} of {local.length} catalog games</span><button className="button button-outline" disabled={filters.offset + DISCOVERY_PAGE_SIZE >= local.length} onClick={() => change({ offset: filters.offset + DISCOVERY_PAGE_SIZE })}>Next</button></nav>}
      <div className="discovery-online">
        {filters.catalogs === 'off' ? <p>Online lookup is off. <button className="text-button" onClick={() => change({ catalogs: 'on', online: 'on', offset: 0 })}>Search online</button></p>
          : !remoteEnabled && <button className="text-button" onClick={() => change({ online: 'on', offset: 0 })}>Search online<Icon name="arrow" width="17" height="17" /></button>}
        {filters.online === 'on' && <button className="text-button" onClick={() => change({ online: 'auto', offset: 0 })}>Back to catalog</button>}
        <CatalogSourceStatus sources={remote.sources} onRetry={remote.retry} onMore={(source, offset) => change({ source, offset, online: 'on' })} onPrevious={(source, offset) => change({ source, offset, online: 'on' })} />
        <details className="discovery-help"><summary>Search options &amp; sources</summary><label className="check-control"><input type="checkbox" checked={filters.catalogs === 'on'} onChange={(event) => change({ catalogs: event.target.checked ? 'on' : 'off' })} />Look online when local matches are limited</label><p>Only your search is sent to public providers. Saved games, ratings and notes stay private. Sources and editions remain separate.</p><p>Metadata from <a href="https://www.wikidata.org/wiki/Wikidata:Data_access" target="_blank" rel="noreferrer">Wikidata (CC0)</a> and <a href="https://www.freetogame.com/" target="_blank" rel="noreferrer">FreeToGame</a>. Image credits are under each game's Actions &amp; source.</p></details>
      </div>
      <ManualGameForm busy={busy} onAdd={(record) => onAction({ type: 'add-records', records: [record] })} actionLabel="Add to my library" />
      {onCommunity && <footer className="discovery-footer"><button className="text-button" onClick={onCommunity}>Explore shared rankings<Icon name="arrow" width="17" height="17" /></button></footer>}
    </section>
  );
}

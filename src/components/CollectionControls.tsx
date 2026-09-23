import { useMemo, useRef } from 'react';
import type { Filters, Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import { defaultFilters, SORT_ORDERS } from '../lib/url';
import { criticColumns } from '../lib/collection';
import { author } from '../lib/author';
import { Icon } from './Icon';
import { SelectField } from './SelectField';
import { ProgressFilter } from './ProgressFilter';
import { effectiveProgressFilter, progressFilterPatch } from '../lib/game-progress';
import { BrowseFilters } from './BrowseFilters';

interface CollectionControlsProps {
  games: Game[];
  filters: Filters;
  count: number;
  addedCount: number;
  unrankedCount: number;
  extraRecords: LibraryRecord[];
  onlineScope: boolean;
  searching: boolean;
  savedCount: number;
  completedCount: number;
  onChange: (patch: Partial<Filters>, method?: 'push' | 'replace') => void;
  onShare: () => void;
  selecting?: boolean;
  onSelectMode?: () => void;
  onFullLibrary?: () => void;
}

export function CollectionControls({ games, filters, count, addedCount, unrankedCount, extraRecords, onlineScope, searching, savedCount, completedCount, onChange, onShare, selecting, onSelectMode, onFullLibrary }: CollectionControlsProps) {
  const searchSession = useRef(false);
  const genres = useMemo(() => [...new Set([...games, ...extraRecords].map(game => game.genre).filter((genre): genre is string => genre !== null))].sort((a, b) => a.localeCompare(b)), [games, extraRecords]);
  const years = useMemo(() => [...new Set([...games, ...extraRecords].map(game => game.year).filter((year): year is number => year !== null))].sort((a, b) => b - a), [games, extraRecords]);
  const progress = effectiveProgressFilter(filters);
  const activeFilters = Boolean(filters.q || filters.genre || filters.year || filters.tier !== 'all' || filters.list !== 'all' || progress !== 'all');
  const secondaryCount = [Boolean(filters.genre), Boolean(filters.year), filters.tier !== 'all', filters.list !== 'all', progress !== 'all', filters.sort !== 'rank' || filters.direction === 'desc', filters.catalogs === 'off'].filter(Boolean).length;
  const Heading = filters.view === 'table' ? 'h1' : 'h2';
  return (
    <>
      <div className="collection-title-line">
        <Heading id="collection-title" tabIndex={-1} aria-label="The collection, 100">The collection<span>100</span></Heading>
        <button className="text-button share-view" onClick={onShare}><Icon name="share" />Share this view</button>
      </div>
      <div className="collection-search">
          <label className="field-label" htmlFor="game-search">Search games, studios or genres</label>
          <div className="search-field">
          <Icon name="search" />
          <input
            id="game-search" type="search" autoComplete="off" spellCheck={false}
            placeholder="Game, studio or genre"
            maxLength={160} value={filters.q}
            onChange={(event) => {
              onChange({ q: event.target.value }, searchSession.current ? 'replace' : 'push');
              searchSession.current = true;
            }}
            onBlur={() => { searchSession.current = false; }}
          />
          {filters.q ? <button className="icon-button" aria-label="Clear search" onClick={() => onChange({ q: '' })}><Icon name="close" width="18" height="18" /></button> : <kbd aria-hidden="true">/</kbd>}
          </div>
      </div>
      <BrowseFilters activeCount={secondaryCount} label="Filters & sort" className="collection-filters">
          <div className="collection-tabs" role="group" aria-label="Your collection views">
            <button className={filters.list === 'all' ? 'is-active' : ''} aria-label={`All games, ${games.length + addedCount}`} aria-pressed={filters.list === 'all'} onClick={() => onChange({ list: 'all', progress: 'all' })}>All games<span>{games.length + addedCount}</span></button>
            <button className={filters.list === 'later' ? 'is-active' : ''} aria-label={`Play later, ${savedCount}`} aria-pressed={filters.list === 'later'} onClick={() => onChange({ list: 'later' })}>Play later<span>{savedCount}</span></button>
            <button className={filters.list === 'completed' ? 'is-active' : ''} aria-label={`Completed, ${completedCount}`} aria-pressed={filters.list === 'completed'} onClick={() => onChange({ list: 'completed', progress: 'all' })}>Completed<span>{completedCount}</span></button>
          </div>
          {(filters.list !== 'all' || progress !== 'all') && <div className="list-privacy"><Icon name="bookmark" width="16" height="16" /><p>Your progress, including games you added beyond the 100.</p>{onFullLibrary && <button className="text-button" onClick={onFullLibrary}>Open my full library<Icon name="arrow" width="16" height="16" /></button>}</div>}
        <div className="search-and-filters">
        <SelectField id="genre-filter" label="Genre" value={filters.genre} onChange={(genre) => onChange({ genre })}>
            <option value="">All genres</option>
            {filters.genre && !genres.includes(filters.genre) && <option value={filters.genre}>{filters.genre} (not loaded)</option>}
            {genres.map((genre) => <option key={genre}>{genre}</option>)}
        </SelectField>
        <SelectField id="year-filter" label="Year" className="year-select" value={filters.year} onChange={(year) => onChange({ year })}>
            <option value="">All years</option>
            {filters.year && !years.includes(Number(filters.year)) && <option value={filters.year}>{filters.year} (not loaded)</option>}
            {years.map((year) => <option key={year}>{year}</option>)}
        </SelectField>
        <SelectField id="tier-filter" label="Collection" className="tier-select" value={filters.tier} onChange={(tier) => onChange({ tier: tier === 'core' ? 'core' : tier === 'essential' ? 'essential' : 'all' })}>
          <option value="all">All games</option><option value="core">Core 50 · #1-50</option><option value="essential">Essential 50 · #51-100</option>
        </SelectField>
        <ProgressFilter value={progress} onChange={value => onChange(progressFilterPatch(value, filters))} />
        <SelectField id="sort-order" label="Sort" className="sort-control" value={filters.sort} onChange={(value) => {
            onChange({ sort: SORT_ORDERS.find((option) => option === value) ?? 'rank', direction: 'auto' });
          }}>
            <option value="rank">Collection rank</option><option value="title">Title</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="score">Critic snapshot average</option>
            <option value="author-rating">{author.shortName}'s original rating</option>
            {criticColumns.map(({ key, label }) => <option key={key} value={key}>{label} score</option>)}
            {filters.sort === 'rank-index' && <option value="rank-index">Legacy rank-derived index</option>}
        </SelectField>
      </div>
      <div className="search-scope">
        <label className="check-control"><input type="checkbox" checked={filters.catalogs === 'on'} disabled={!onlineScope} aria-describedby="catalog-search-help" onChange={(event) => onChange({ catalogs: event.target.checked ? 'on' : 'off' })} />Search public catalogs</label>
        <p id="catalog-search-help">{!onlineScope ? 'Online lookup is paused in this view. Matching saved games still appear.' : filters.catalogs === 'off' ? 'Online lookup is off. Only the 100 and saved additions are searched.' : filters.q.trim().length > 80 ? 'Online lookup: 80 characters maximum. Local games are still searched.' : 'Enter 2+ characters to search Wikidata and FreeToGame. Only your query is sent.'}</p>
      </div>
      </BrowseFilters>
      <div className="collection-utilities">
        <div className="result-summary">
          <p role="status" aria-live="polite" aria-atomic="true"><strong>{count - unrankedCount}</strong> in The 100{unrankedCount > 0 ? <> · {unrankedCount} beyond The 100</> : !activeFilters && filters.sort === 'rank' && filters.direction !== 'desc' ? ', in the author\'s order' : ''}{searching && <span className="result-breakdown">Searching public catalogs…</span>}</p>
          {activeFilters && <button className="text-button clear-filters" onClick={() => onChange({ ...defaultFilters, catalogs: filters.catalogs, sort: filters.sort, view: filters.view })}>Reset filters<Icon name="close" width="15" height="15" /></button>}
        </div>
        <div className="view-controls">
          <div className="view-switch" role="group" aria-label="Display layout">
            <button className={`icon-button ${filters.view === 'grid' ? 'is-active' : ''}`} aria-label="Grid view" aria-pressed={filters.view === 'grid'} onClick={() => onChange({ view: 'grid' })}><Icon name="grid" width="19" height="19" /></button>
            <button className={`icon-button ${filters.view === 'list' ? 'is-active' : ''}`} aria-label="List view" aria-pressed={filters.view === 'list'} onClick={() => onChange({ view: 'list' })}><Icon name="list" width="21" height="21" /></button>
            <button className={`icon-button ${filters.view === 'table' ? 'is-active' : ''}`} aria-label="Ratings table view" aria-pressed={filters.view === 'table'} onClick={() => onChange({ view: 'table' })}><Icon name="table" width="21" height="21" /></button>
          </div>
        </div>
      </div>
      <div className="collection-extra-actions"><button className="text-button" onClick={onSelectMode}><Icon name="select" width="18" height="18" />{selecting ? 'Exit selection mode' : 'Select multiple games'}</button><a className="text-button" href="/downloads/Play-100-Collection.xlsx" download><Icon name="download" width="18" height="18" />Download Excel</a></div>
      {filters.sort === 'score' && <p className="sort-note">Workbook snapshot, not live scores.</p>}
    </>
  );
}

import { useRef } from 'react';
import type { Filters, Game } from '../lib/types';
import { defaultFilters, SORT_ORDERS } from '../lib/url';
import { criticColumns } from '../lib/collection';
import { author } from '../lib/author';
import { Icon } from './Icon';

interface CollectionControlsProps {
  games: Game[];
  filters: Filters;
  count: number;
  savedCount: number;
  completedCount: number;
  onChange: (patch: Partial<Filters>, method?: 'push' | 'replace') => void;
  onShare: () => void;
  selecting?: boolean;
  onSelectMode?: () => void;
  onFullLibrary?: () => void;
}

export function CollectionControls({ games, filters, count, savedCount, completedCount, onChange, onShare, selecting, onSelectMode, onFullLibrary }: CollectionControlsProps) {
  const searchSession = useRef(false);
  const genres = [...new Set(games.map((game) => game.genre))].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(games.map((game) => game.year))].sort((a, b) => b - a);
  const activeFilters = Boolean(filters.q || filters.genre || filters.year || filters.tier !== 'all' || filters.list !== 'all');
  const Heading = filters.view === 'table' ? 'h1' : 'h2';
  return (
    <>
      <div className="collection-title-line">
        <Heading id="collection-title" tabIndex={-1}>The collection<span>100</span></Heading>
        <button className="text-button share-view" onClick={onShare}><Icon name="share" />Share this view</button>
      </div>
      <div className="collection-tabs" aria-label="Your collection views">
        <button className={filters.list === 'all' ? 'is-active' : ''} aria-pressed={filters.list === 'all'} onClick={() => onChange({ list: 'all' })}>All games<span>100</span></button>
        <button className={filters.list === 'later' ? 'is-active' : ''} aria-pressed={filters.list === 'later'} onClick={() => onChange({ list: 'later' })}>Play later<span>{savedCount}</span></button>
        <button className={filters.list === 'completed' ? 'is-active' : ''} aria-pressed={filters.list === 'completed'} onClick={() => onChange({ list: 'completed' })}>Completed<span>{completedCount}</span></button>
        <button className={filters.list === 'unplayed' ? 'is-active' : ''} aria-pressed={filters.list === 'unplayed'} onClick={() => onChange({ list: 'unplayed' })}>Not completed</button>
      </div>
      {filters.list !== 'all' && <div className="list-privacy"><Icon name="bookmark" width="16" height="16" /><p>This filter covers games in the author's 100. Your full library also includes imported games.</p>{onFullLibrary && <button className="text-button" onClick={onFullLibrary}>Open my full library<Icon name="arrow" width="16" height="16" /></button>}</div>}
      <div className="search-and-filters">
        <div className="search-field">
          <Icon name="search" />
          <label className="sr-only" htmlFor="game-search">Search games, studios or genres</label>
          <input
            id="game-search" type="search" autoComplete="off" spellCheck={false}
            placeholder="A game, a studio, a whole new world..."
            maxLength={160} value={filters.q}
            onChange={(event) => {
              onChange({ q: event.target.value }, searchSession.current ? 'replace' : 'push');
              searchSession.current = true;
            }}
            onBlur={() => { searchSession.current = false; }}
          />
          {filters.q ? <button className="icon-button" aria-label="Clear search" onClick={() => onChange({ q: '' })}><Icon name="close" width="18" height="18" /></button> : <kbd aria-hidden="true">/</kbd>}
        </div>
        <div className="filter-select">
          <label htmlFor="genre-filter">Genre</label>
          <select id="genre-filter" value={filters.genre} onChange={(event) => onChange({ genre: event.target.value })}>
            <option value="">All genres</option>
            {filters.genre && !genres.includes(filters.genre) && <option value={filters.genre}>{filters.genre} (not found)</option>}
            {genres.map((genre) => <option key={genre}>{genre}</option>)}
          </select>
        </div>
        <div className="filter-select year-select">
          <label htmlFor="year-filter">Year</label>
          <select id="year-filter" value={filters.year} onChange={(event) => onChange({ year: event.target.value })}>
            <option value="">All years</option>
            {filters.year && !years.includes(Number(filters.year)) && <option value={filters.year}>{filters.year} (not found)</option>}
            {years.map((year) => <option key={year}>{year}</option>)}
          </select>
        </div>
        <div className="filter-select tier-select">
          <label htmlFor="tier-filter">Collection</label>
          <select id="tier-filter" value={filters.tier} onChange={(event) => onChange({ tier: event.target.value === 'core' ? 'core' : event.target.value === 'essential' ? 'essential' : 'all' })}>
            <option value="all">All 100</option><option value="core">Core 50 · #1-50</option><option value="essential">Essential 50 · #51-100</option>
          </select>
        </div>
      </div>
      <div className="collection-utilities">
        <div className="result-summary">
          <p role="status" aria-live="polite" aria-atomic="true"><strong>{count}</strong> {count === 1 ? 'game' : 'games'}{activeFilters ? ' found' : filters.sort === 'rank' && filters.direction !== 'desc' ? ', in the author\'s order' : ''}</p>
          {activeFilters && <button className="text-button clear-filters" onClick={() => onChange({ ...defaultFilters, sort: filters.sort, view: filters.view })}>Reset filters<Icon name="close" width="15" height="15" /></button>}
        </div>
        <div className="view-controls">
          <div className="sort-control">
            <label htmlFor="sort-order">Sort</label>
            <select id="sort-order" value={filters.sort} onChange={(event) => {
              const value = event.target.value;
              onChange({ sort: SORT_ORDERS.find((option) => option === value) ?? 'rank', direction: 'auto' });
            }}>
              <option value="rank">Collection rank</option><option value="title">Title</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="score">Critic snapshot average</option>
              <option value="author-rating">{author.shortName}'s original rating</option>
              {criticColumns.map(({ key, label }) => <option key={key} value={key}>{label} score</option>)}
              {filters.sort === 'rank-index' && <option value="rank-index">Legacy rank-derived index</option>}
            </select>
          </div>
          <div className="view-switch" aria-label="Display layout">
            <button className={`icon-button ${filters.view === 'grid' ? 'is-active' : ''}`} aria-label="Grid view" aria-pressed={filters.view === 'grid'} onClick={() => onChange({ view: 'grid' })}><Icon name="grid" width="19" height="19" /></button>
            <button className={`icon-button ${filters.view === 'list' ? 'is-active' : ''}`} aria-label="List view" aria-pressed={filters.view === 'list'} onClick={() => onChange({ view: 'list' })}><Icon name="list" width="21" height="21" /></button>
            <button className={`icon-button ${filters.view === 'table' ? 'is-active' : ''}`} aria-label="Ratings table view" aria-pressed={filters.view === 'table'} onClick={() => onChange({ view: 'table' })}><Icon name="table" width="21" height="21" /></button>
          </div>
        </div>
      </div>
      <div className="collection-extra-actions"><button className="text-button" aria-pressed={Boolean(selecting)} onClick={onSelectMode}><Icon name="select" width="18" height="18" />{selecting ? 'Exit selection mode' : 'Select multiple games'}</button><a className="text-button" href="/downloads/Play-100-Collection.xlsx" download><Icon name="download" width="18" height="18" />Download Excel</a></div>
      {filters.sort === 'score' && <p className="sort-note">Normalized average of available workbook columns, not a live score. Original rank stays on every game.</p>}
    </>
  );
}

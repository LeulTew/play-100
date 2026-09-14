import { useEffect, useMemo, useState } from 'react';
import type { useCollection } from '../hooks/useCollection';
import type { Filters, MotionPreference } from '../lib/types';
import type { PersonalAction, PersonalLibraryState } from '../lib/personal-types';
import { recordFromGame } from '../lib/personal-types';
import { filterGames } from '../lib/collection';
import { createSearch, defaultFilters } from '../lib/url';
import CollectionArtifact from './CollectionArtifact';
import { CollectionControls } from './CollectionControls';
import { GameCard } from './GameCard';
import RatingsTable from './RatingsTable';
import { SelectionBar } from './SelectionBar';
import type { SelectionAction } from './SelectionBar';
import { Icon } from './Icon';
import Magnet from './bits/Magnet';
import AnimatedContent from './bits/AnimatedContent';
import { author } from '../lib/author';

const PAGE_SIZE = 24;

interface CollectionPageProps {
  collection: ReturnType<typeof useCollection>;
  state: PersonalLibraryState;
  filters: Filters;
  busy: boolean;
  motion: MotionPreference;
  animate: boolean;
  reducedMotion: boolean;
  coarsePointer: boolean;
  constrained: boolean;
  onFilters: (patch: Partial<Filters>, method?: 'push' | 'replace') => void;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onOpen: (id: string) => void;
  onShare: () => void;
  onFullLibrary: () => void;
  notify: (message: string) => void;
}

export default function CollectionPage({ collection, state, filters, busy, motion, animate, reducedMotion, coarsePointer, constrained, onFilters, onAction, onOpen, onShare, onFullLibrary, notify }: CollectionPageProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const games = collection.data?.games;
  const results = useMemo(() => filterGames(games ?? [], filters, state.progress), [games, filters, state.progress]);
  const signature = createSearch(filters);
  useEffect(() => { setVisibleCount(PAGE_SIZE); setSelected(new Set()); }, [signature]);
  const savedCount = games?.filter((game) => state.progress[game.slug]?.later).length ?? 0;
  const completedCount = games?.filter((game) => state.progress[game.slug]?.completed).length ?? 0;
  const browse = () => document.getElementById('collection')?.scrollIntoView({ behavior: animate ? 'smooth' : 'instant' });
  const toggle = (id: string, key: 'later' | 'completed' | 'played') => {
    const game = games?.find((candidate) => candidate.slug === id);
    if (game) void onAction({ type: 'toggle-progress', record: recordFromGame(game), key });
  };
  const toggleSelection = (id: string) => setSelected((prior) => {
    const next = new Set(prior);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const bulk = async (action: SelectionAction) => {
    const records = results.filter((game) => selected.has(game.slug)).map(recordFromGame);
    const change: PersonalAction = action === 'ranking' ? { type: 'add-ranking', records } : {
      type: 'set-progress', records, key: action === 'completed' ? 'completed' : 'later', value: true,
    };
    if (await onAction(change)) setSelected(new Set());
  };
  const pick = () => {
    const candidates = filters.list === 'completed' ? results : results.filter((game) => !state.progress[game.slug]?.completed);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    if (chosen) onOpen(chosen.slug);
    else notify(results.length ? 'You have completed every game in this view. Change a filter to discover more.' : 'No games match this view. Reset filters for a fresh pick.');
  };
  return (
    <>
      {filters.view !== 'table' && <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">GOOD GAMES.<br /><span>GREAT ESCAPES.</span></h1>
          <p>One hundred games worth making time for.<br className="desktop-break" /> Find your next world.</p>
          <div className="hero-actions"><a className="button button-dark" href="#collection" onClick={(event) => { event.preventDefault(); onFilters({ ...defaultFilters, view: filters.view }); browse(); }}>Explore all 100<Icon name="down" width="19" height="19" /></a><Magnet disabled={!animate || coarsePointer}><button className="button button-quiet" onClick={pick} disabled={!games}><Icon name="shuffle" width="19" height="19" />Pick for me</button></Magnet></div>
          <p className="hero-footnote"><span className="collection-dot" />The Core 50. And 50 more essentials.</p>
        </div>
        <div className="hero-art"><CollectionArtifact quality={motion} reducedMotion={reducedMotion} constrained={constrained} /></div>
      </section>}
      <section className="collection-section" id="collection" aria-labelledby="collection-title">
        {collection.status === 'ready' ? <>
          {!collection.data.collection.authorRatingsAreOriginal && <div className="source-version-notice" role="status"><p>This cached collection does not include {author.shortName}'s original ratings yet. No substitute values are shown.</p><button className="text-button" onClick={collection.retry}>Refresh original ratings<Icon name="arrow" width="16" height="16" /></button></div>}
          <CollectionControls games={collection.data.games} filters={filters} count={results.length} savedCount={savedCount} completedCount={completedCount} onChange={onFilters} onShare={onShare} selecting={selecting} onSelectMode={() => { setSelecting((value) => !value); setSelected(new Set()); }} onFullLibrary={onFullLibrary} />
          {selecting && <SelectionBar count={selected.size} total={results.length} busy={busy} onSelectAll={() => setSelected(new Set(results.map((game) => game.slug)))} onClear={() => setSelected(new Set())} onDone={() => { setSelecting(false); setSelected(new Set()); }} onAction={(action) => { void bulk(action); }} />}
          {results.length ? <>
            {filters.view === 'table' ? <RatingsTable games={results.slice(0, visibleCount)} filters={filters} progress={state.progress} selecting={selecting} selected={selected} busy={busy} onSelect={toggleSelection} onOpen={onOpen} onToggle={toggle} onSort={onFilters} /> : <div className={`games ${filters.view === 'list' ? 'games-list' : 'games-grid'}`} aria-label="Games in this view">
              {results.slice(0, visibleCount).map((game, index) => <GameCard key={game.slug} game={game} filters={filters} state={state.progress[game.slug]} onOpen={onOpen} onSave={(id) => toggle(id, 'later')} onPlayed={(id) => toggle(id, 'played')} eager={index < 4} selecting={selecting} selected={selected.has(game.slug)} onSelect={toggleSelection} busy={busy} />)}
            </div>}
            <div className="collection-end"><p>Showing {Math.min(visibleCount, results.length)} of {results.length} games</p>{visibleCount < results.length ? <button className="button button-outline" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, results.length - visibleCount)} more<Icon name="down" width="18" height="18" /></button> : <span className="end-mark"><Icon name="check" width="17" height="17" />You're at the end of this view.</span>}</div>
          </> : <div className="empty-state"><div className="empty-jacket" aria-hidden="true"><Icon name={filters.list === 'later' ? 'bookmark' : 'search'} width="40" height="40" /></div><h3>{filters.list === 'later' && savedCount === 0 ? 'Your next great game goes here.' : filters.list === 'completed' && completedCount === 0 ? 'Every collection starts somewhere.' : 'No worlds found. Yet.'}</h3><p>{filters.list === 'later' && savedCount === 0 ? 'Tap a bookmark on any game to save it for later. Your full queue can also include games from other catalogs.' : filters.list === 'completed' && completedCount === 0 ? 'Open a game and mark it completed. Your personal progress never changes its place in the collection.' : 'Try a shorter search or loosen a filter. A hundred games means there is plenty left to explore.'}</p><button className="button button-dark" onClick={() => onFilters({ ...defaultFilters, view: filters.view })}>Browse all 100<Icon name="arrow" width="18" height="18" /></button></div>}
        </> : collection.status === 'error' ? <div className="data-error" role="alert"><h2 id="collection-title">The collection couldn't load.</h2><p>{collection.error}</p><div className="button-row"><button className="button button-dark" onClick={collection.retry}>Try again<Icon name="arrow" /></button><a className="button button-outline" href="/downloads/Play-100-Collection.xlsx" download>Download the workbook</a></div></div> : <div className="collection-loading" aria-busy="true" role="status"><h2 id="collection-title">Opening the collection...</h2><p>One hundred games. Just a moment.</p><div className="loading-jackets" aria-hidden="true"><span /><span /><span /><span /></div></div>}
      </section>
      <AnimatedContent animate={animate} className="workbook-section">
        <div className="workbook-art" aria-hidden="true"><div className="workbook-sheet sheet-back" /><div className="workbook-sheet"><div className="sheet-head"><span>PLAY 100</span><Icon name="grid" width="23" height="23" /></div><div className="sheet-rule" /><div className="sheet-row"><span>01</span><span>Red Dead Redemption 2</span><span>2018</span></div><div className="sheet-row"><span>02</span><span>Mass Effect 2</span><span>2010</span></div><div className="sheet-row"><span>03</span><span>The Witcher 3</span><span>2015</span></div><div className="sheet-lines" /><span className="sheet-footer">THE COMPLETE COLLECTION / .XLSX</span></div></div>
        <div className="workbook-copy"><h2>OFFLINE.<br />STILL ON YOUR LIST.</h2><p>Take all 100 with you. The enhanced workbook keeps the original order, complete score snapshots and notes in one filterable collection.</p><a className="button button-dark" href="/downloads/Play-100-Collection.xlsx" download><Icon name="download" width="19" height="19" />Download the workbook<span className="file-badge">XLSX</span></a><span className="download-note">The curated collection, not your device-only progress.</span><a className="original-download" href="/downloads/AAA_games_u_have_to_play_list_top_100.xlsx" download>Or download the untouched original Excel<Icon name="download" width="14" height="14" /></a></div>
      </AnimatedContent>
    </>
  );
}

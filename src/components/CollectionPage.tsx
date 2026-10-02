import { memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { useCollection } from '../hooks/useCollection';
import { PAGE_SIZE, useCollectionView } from '../hooks/useCollectionView';
import type { Filters, MotionPreference } from '../lib/types';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../lib/personal-types';
import { recordFromGame } from '../lib/personal-types';
import { defaultFilters } from '../lib/url';
import CollectionArtifact from './CollectionArtifact';
import { CollectionControls } from './CollectionControls';
import { CollectionCard } from './CollectionCard';
import { DeferredCollection } from './DeferredCollection';
import { SelectionBar } from './SelectionBar';
import { Icon } from './Icon';
import Magnet from './bits/Magnet';
import AnimatedContent from './bits/AnimatedContent';
import { AfterFirstPaint } from './AfterFirstPaint';
import { FIRST_PASS_CARDS, firstPassSettled, rendersAtOnce, scheduleSecondPass } from './landing-passes';
import { navigationKind } from '../lib/navigation-kind';
import { author } from '../lib/author';
import { preloadCollectionExtras } from '../lib/collection-extras-preload';
import './collection-films.css';
import './catalog/discover.css';
import { catalogActionRecord } from '../lib/catalog-identity';
import { SavedCatalogCopies } from './catalog/SavedCatalogCopies';
import type { MotionOriginHint } from '../motion';
import { formatResultRange } from '../lib/result-range';

interface CollectionPageProps {
  collection: ReturnType<typeof useCollection>;
  state: PersonalLibraryState;
  filters: Filters;
  busy: boolean;
  motion: MotionPreference;
  /** motion is the provisional 'lite' of a visitor with no known visual preference yet (motionPreferencePending). */
  motionPending: boolean;
  animate: boolean;
  reducedMotion: boolean;
  coarsePointer: boolean;
  constrained: boolean;
  onFilters: (patch: Partial<Filters>, method?: 'push' | 'replace') => void;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onOpen: (id: string, origin?: MotionOriginHint, opener?: HTMLElement) => void;
  onPreview: (record: LibraryRecord, origin?: MotionOriginHint, opener?: HTMLElement) => void;
  onShare: () => void;
  onFullLibrary: () => void;
  notify: (message: string) => void;
  onPin?: (record: LibraryRecord) => void;
  pinnedIds?: ReadonlySet<string>;
  comparisonTray?: ReactNode;
}

function CollectionPage({
  collection,
  state,
  filters,
  busy,
  motion,
  motionPending,
  animate,
  reducedMotion,
  coarsePointer,
  constrained,
  onFilters,
  onAction,
  onOpen,
  onPreview,
  onShare,
  onFullLibrary,
  notify,
  onPin,
  pinnedIds,
  comparisonTray,
}: CollectionPageProps) {
  const {
    visibleCount,
    setVisibleCount,
    selecting,
    setSelecting,
    selected,
    setSelected,
    collectionRef,
    appendedFocusRef,
    markExtrasReady,
    games,
    ownership,
    progress,
    onlineScope,
    online,
    results,
    extras,
    extraResults,
    resultRecords,
    currentSelection,
    showExtended,
    additions,
    signature,
    savedCount,
    completedCount,
    browse,
    toggle,
    toggleSelection,
    bulk,
    pick,
  } = useCollectionView({ collection, state, filters, animate, onAction, onOpen, onPreview, notify });
  // A link to the films opens with them in place, for useCollectionView to scroll to and focus.
  const [filmsLinked] = useState(() => typeof location !== 'undefined' && location.hash === '#collection-films');
  // On a constrained device the cards past the first pass and the showcase below them render after the first pass has
  // painted (landing-passes.ts). When The 100 opened again on a 2 GB phone its commit ran as one task of over a second,
  // and most of the elements that commit builds are cards below the fold.
  const [secondPass, setSecondPass] = useState(() =>
    rendersAtOnce({ constrained, navigation: navigationKind(), filmsLinked }),
  );
  const settled = firstPassSettled(collection.status);
  useEffect(() => {
    if (secondPass || !settled) return;
    return scheduleSecondPass(() => setSecondPass(true));
  }, [secondPass, settled]);
  const showcaseReserve = <div className="first-paint-reserve" aria-hidden="true" />;
  return (
    <>
      {filters.view !== 'table' && (
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              GOOD GAMES.
              <br />
              <span>GREAT ESCAPES.</span>
            </h1>
            <p>
              One hundred games worth making time for.
              <br className="desktop-break" /> Find your next world.
            </p>
            <div className="hero-actions">
              <a
                className="button button-dark"
                href="#collection"
                onClick={(event) => {
                  event.preventDefault();
                  onFilters({ ...defaultFilters, catalogs: filters.catalogs, view: filters.view });
                  browse();
                }}
              >
                Explore all 100
                <Icon name="down" width="19" height="19" />
              </a>
              <Magnet disabled={!animate || coarsePointer}>
                <button
                  className="button button-quiet"
                  onClick={(event) => pick(event.currentTarget)}
                  disabled={!games}
                >
                  <Icon name="shuffle" width="19" height="19" />
                  Pick for me
                </button>
              </Magnet>
            </div>
            <p className="hero-footnote">
              <span className="collection-dot" />
              Leul's 100: the Core 50 and 50 more essentials.
            </p>
          </div>
          <div className="hero-art">
            <CollectionArtifact
              quality={motion}
              pending={motionPending}
              reducedMotion={reducedMotion}
              constrained={constrained}
            />
          </div>
        </section>
      )}
      <section
        ref={collectionRef}
        className="collection-section"
        id="collection"
        aria-labelledby="collection-title"
        data-empty={collection.status === 'ready' && resultRecords.length === 0}
      >
        {collection.status === 'ready' ? (
          <>
            {!collection.data.collection.authorRatingsAreOriginal && (
              <div className="source-version-notice" role="status">
                <p>
                  This collection copy does not include {author.shortName}'s original ratings yet. No substitute values
                  are shown.
                </p>
                <button className="text-button" onClick={collection.retry}>
                  Refresh original ratings
                  <Icon name="arrow" width="16" height="16" />
                </button>
              </div>
            )}
            <CollectionControls
              games={collection.data.games}
              filters={filters}
              count={resultRecords.length}
              addedCount={additions.length}
              unrankedCount={extraResults.length}
              extraRecords={extras}
              onlineScope={onlineScope}
              searching={online.loading}
              savedCount={savedCount}
              completedCount={completedCount}
              onChange={onFilters}
              onShare={onShare}
              selecting={selecting}
              onSelectMode={() => {
                setSelecting((value) => !value);
                setSelected(new Set());
              }}
              onFullLibrary={onFullLibrary}
              onTableIntent={preloadCollectionExtras}
            />
            {selecting && (
              <SelectionBar
                count={currentSelection.size}
                total={resultRecords.length}
                busy={busy}
                onSelectAll={() => setSelected(new Set(resultRecords.map((record) => record.id)))}
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
            {results.length ? (
              <>
                {filters.view === 'table' ? (
                  <DeferredCollection
                    onReady={markExtrasReady}
                    input={{
                      kind: 'table',
                      props: {
                        games: results.slice(0, visibleCount),
                        filters,
                        progress,
                        selecting,
                        selected,
                        busy,
                        onSelect: toggleSelection,
                        onOpen,
                        onToggle: toggle,
                        onSort: onFilters,
                        comparisonTray,
                        getCompareRecord: onPin
                          ? (game) => catalogActionRecord(recordFromGame(game), ownership)
                          : undefined,
                        savedCopies: (game) => (
                          <SavedCatalogCopies
                            canonicalId={game.slug}
                            copies={ownership.get(game.slug)}
                            onOpen={onPreview}
                          />
                        ),
                      },
                    }}
                  />
                ) : (
                  <ul
                    className={`games ${filters.view === 'list' ? 'games-list' : 'games-grid'}`}
                    role="list"
                    aria-label="Games in this view"
                  >
                    {results.slice(0, visibleCount).map((game, index) =>
                      secondPass || index < FIRST_PASS_CARDS ? (
                        <CollectionCard
                          key={game.slug}
                          game={game}
                          filters={filters}
                          state={progress[game.slug]}
                          ownership={ownership}
                          pinnable={Boolean(onPin)}
                          onOpen={onOpen}
                          onToggle={toggle}
                          onPreview={onPreview}
                          eager={index < 4}
                          selecting={selecting}
                          selected={selected.has(game.slug)}
                          onSelect={toggleSelection}
                          busy={busy}
                        />
                      ) : (
                        // Holds its card's place, at the card's estimated size, until the second pass renders it.
                        <li key={game.slug} className="game-card-reserve" aria-hidden="true" />
                      ),
                    )}
                  </ul>
                )}
                <div className="collection-end">
                  <p>
                    {results.length > 1 ? 'Showing ' : ''}
                    {formatResultRange(results.length, 1, Math.min(visibleCount, results.length))} from The 100
                  </p>
                  {visibleCount < results.length ? (
                    <button
                      className="button button-outline"
                      onClick={(event) => {
                        const next = results[visibleCount];
                        appendedFocusRef.current =
                          event.detail === 0 && next
                            ? { id: next.slug, signature, trigger: event.currentTarget }
                            : null;
                        setVisibleCount((count) => count + PAGE_SIZE);
                      }}
                    >
                      Show {Math.min(PAGE_SIZE, results.length - visibleCount)} more
                      <Icon name="down" width="18" height="18" />
                    </button>
                  ) : (
                    <span className="end-mark">
                      <Icon name="check" width="17" height="17" />
                      {showExtended ? 'End of the curated matches.' : "You're at the end of this view."}
                    </span>
                  )}
                </div>
              </>
            ) : showExtended ? (
              <p className="curated-empty">No matches in {author.shortName}'s original 100 for this view.</p>
            ) : (
              <div className="empty-state">
                <div className="empty-jacket" aria-hidden="true">
                  <Icon name={filters.list === 'later' ? 'bookmark' : 'search'} width="40" height="40" />
                </div>
                <h3>
                  {filters.list === 'later' && savedCount === 0
                    ? 'Your next great game goes here.'
                    : filters.list === 'completed' && completedCount === 0
                      ? 'Every collection starts somewhere.'
                      : 'No worlds found. Yet.'}
                </h3>
                <p>
                  {filters.list === 'later' && savedCount === 0
                    ? 'Choose a bookmark to add a game to Play later, including games from other catalogs.'
                    : filters.list === 'completed' && completedCount === 0
                      ? 'Open a game and mark it completed. Your personal progress never changes its place in the collection.'
                      : 'Try a shorter search or loosen a filter. Your saved additions are searched alongside the original 100.'}
                </p>
                <button
                  className="button button-dark"
                  onClick={() => onFilters({ ...defaultFilters, catalogs: filters.catalogs, view: filters.view })}
                >
                  Browse all 100
                  <Icon name="arrow" width="18" height="18" />
                </button>
              </div>
            )}
            {!results.length && comparisonTray}
            {showExtended && (
              <DeferredCollection
                input={{
                  kind: 'extended',
                  props: {
                    records: extraResults,
                    online,
                    state,
                    queryKey: signature,
                    busy,
                    selecting,
                    selected: currentSelection,
                    onSelect: toggleSelection,
                    onPreview,
                    onAction,
                    onPin,
                    pinnedIds,
                  },
                }}
              />
            )}
          </>
        ) : collection.status === 'error' ? (
          <div className="data-error" role="alert">
            <h2 id="collection-title">The collection couldn't load.</h2>
            <p>{collection.error}</p>
            <div className="button-row">
              <button className="button button-dark" onClick={collection.retry}>
                Try again
                <Icon name="arrow" />
              </button>
              <a className="button button-outline" href="/downloads/Play-100-Collection.xlsx" download>
                Download the workbook
              </a>
            </div>
          </div>
        ) : (
          <div className="collection-loading" aria-busy="true" role="status">
            <h2 id="collection-title">Opening the collection…</h2>
            <p>One hundred games. Just a moment.</p>
            <div className="loading-jackets" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </section>
      {/* The films and workbook start below the fold of every window (landing-loading-shift.spec.ts), so they wait for the
          first paint, and on a constrained device for the second pass, while the page keeps its scroll height. */}
      <AfterFirstPaint now={filmsLinked} reserve={showcaseReserve}>
        {secondPass ? (
          <>
            <DeferredCollection
              near
              input={{ kind: 'films', props: { postersReady: collection.status !== 'loading' } }}
            />
            <AnimatedContent animate={animate} className="workbook-section">
              <div className="workbook-art" aria-hidden="true">
                <div className="workbook-sheet sheet-back" />
                <div className="workbook-sheet">
                  <div className="sheet-head">
                    <span>PLAY 100</span>
                    <Icon name="grid" width="23" height="23" />
                  </div>
                  <div className="sheet-rule" />
                  <div className="sheet-row">
                    <span>01</span>
                    <span>Red Dead Redemption 2</span>
                    <span>2018</span>
                  </div>
                  <div className="sheet-row">
                    <span>02</span>
                    <span>Mass Effect 2</span>
                    <span>2010</span>
                  </div>
                  <div className="sheet-row">
                    <span>03</span>
                    <span>The Witcher 3</span>
                    <span>2015</span>
                  </div>
                  <div className="sheet-lines" />
                  <span className="sheet-footer">THE COMPLETE COLLECTION / .XLSX</span>
                </div>
              </div>
              <div className="workbook-copy">
                <h2>
                  THE WORKBOOK.
                  <br />
                  ALL 100 TO KEEP.
                </h2>
                <p>
                  Take all 100 with you. The enhanced workbook keeps the original order, complete score snapshots and
                  notes in one filterable collection.
                </p>
                <a
                  className="button button-dark"
                  href="/downloads/Play-100-Collection.xlsx"
                  download
                  aria-label="Download the workbook, XLSX"
                >
                  <Icon name="download" width="19" height="19" />
                  Download the workbook <span className="file-badge">XLSX</span>
                </a>
                <span className="download-note">The curated collection, not your personal progress.</span>
                <a className="original-download" href="/downloads/AAA_games_u_have_to_play_list_top_100.xlsx" download>
                  Or download the untouched original Excel
                  <Icon name="download" width="14" height="14" />
                </a>
              </div>
            </AnimatedContent>
          </>
        ) : (
          showcaseReserve
        )}
      </AfterFirstPaint>
    </>
  );
}

/** Memoised: App re-renders for dialogs, the tray and notices without changing the collection's props. */
export default memo(CollectionPage);

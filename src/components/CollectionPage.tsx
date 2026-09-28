import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { useCollection } from '../hooks/useCollection';
import type { Filters, MotionPreference } from '../lib/types';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../lib/personal-types';
import { recordFromGame } from '../lib/personal-types';
import { filterGames } from '../lib/collection';
import { createSearch, defaultFilters } from '../lib/url';
import CollectionArtifact from './CollectionArtifact';
import { CollectionControls } from './CollectionControls';
import { GameCard } from './GameCard';
import { SelectionBar } from './SelectionBar';
import type { SelectionAction } from './SelectionBar';
import { Icon } from './Icon';
import Magnet from './bits/Magnet';
import AnimatedContent from './bits/AnimatedContent';
import { author } from '../lib/author';
import { useExtendedSearch } from '../hooks/useExtendedSearch';
import { filterUnranked, unrankedRecords } from '../lib/extended-search';
import type { CollectionExtrasProps } from './CollectionExtras';
import { TableFallback, ExtendedFallback, FilmsFallback } from './CollectionExtrasFallback';
import { collectionExtrasModule, preloadCollectionExtras } from '../lib/collection-extras-preload';
import { ChunkRecovery } from './ChunkRecovery';
import { ChunkBoundary } from './ChunkBoundary';
import './collection-films.css';
import './catalog/discover.css';
import { effectiveProgressFilter, pickCandidates, selectionOperation } from '../lib/game-progress';
import { catalogActionRecord, catalogOwnership, catalogProgress } from '../lib/catalog-identity';
import { SavedCatalogCopies } from './catalog/SavedCatalogCopies';
import type { MotionOriginHint } from '../motion';
import { scrollCollectionIntoView } from './collection-landing';
import { ComparePinButton } from './compare-tray/ComparePinButton';
import { formatResultRange } from '../lib/local-pagination';

const PAGE_SIZE = 24;

function DeferredCollection({ input, near = false }: { input: CollectionExtrasProps; near?: boolean }) {
  const [module, setModule] = useState(collectionExtrasModule.peek);
  const [requested, setRequested] = useState(!near);
  const [failed, setFailed] = useState(false);
  const [film, setFilm] = useState<'the-100' | 'discover-compare'>();
  const root = useRef<HTMLDivElement>(null);
  const focusedFilm = useRef<string | null>(null);
  const pendingSearch = useRef<{ queryKey: string; trigger: HTMLButtonElement; activate: boolean } | null>(null);
  const ready = input.kind !== 'films' || input.props.postersReady;
  useEffect(() => {
    if (!ready || requested || module || !root.current) return;
    if (!near || typeof IntersectionObserver === 'undefined') {
      setRequested(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRequested(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [ready, requested, module, near]);
  useEffect(() => {
    if (!requested || module) return;
    let current = true;
    void collectionExtrasModule.load().then(
      (loaded) => {
        if (current) setModule(loaded);
      },
      (cause) => {
        console.error('The requested collection tools did not load.', cause);
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [requested, module]);
  useLayoutEffect(() => {
    if (module && focusedFilm.current && document.activeElement === document.body) {
      const selector =
        focusedFilm.current === 'heading' ? '#collection-films-title' : `button[data-film-id="${focusedFilm.current}"]`;
      root.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    }
  }, [module]);
  useLayoutEffect(() => {
    const pending = pendingSearch.current;
    if (!pending) return;
    if (input.kind !== 'extended' || pending.queryKey !== input.props.queryKey) {
      pendingSearch.current = null;
      return;
    }
    if (!module) return;
    pendingSearch.current = null;
    const retainFocus = document.activeElement === pending.trigger || document.activeElement === document.body;
    if (pending.activate) {
      if (retainFocus) {
        root.current?.querySelector<HTMLElement>('#extended-results-title')?.focus({ preventScroll: true });
      }
      if (input.props.online.eligible && !input.props.online.remoteEnabled) input.props.online.searchOnline();
    } else if (retainFocus) {
      const target =
        root.current?.querySelector<HTMLButtonElement>('[data-extended-search]') ??
        root.current?.querySelector<HTMLElement>('#extended-results-title');
      target?.focus({ preventScroll: true });
    }
  }, [input, module]);
  const Loaded = module?.default;
  const fallback =
    input.kind === 'table' ? (
      <TableFallback {...input.props} />
    ) : input.kind === 'extended' ? (
      <ExtendedFallback
        {...input.props}
        onSearchIntent={(trigger, activate) => {
          const prior = pendingSearch.current;
          pendingSearch.current = {
            queryKey: input.props.queryKey,
            trigger,
            activate: activate || (prior?.queryKey === input.props.queryKey && prior.activate),
          };
          setRequested(true);
        }}
      />
    ) : (
      <FilmsFallback
        onWatch={(id) => {
          setFilm(id);
          setRequested(true);
        }}
      />
    );
  const body = failed ? (
    <div className="data-error">
      <ChunkRecovery message="These collection tools didn't load." />
    </div>
  ) : Loaded ? (
    <ChunkBoundary fallback={<ChunkRecovery message="These collection tools didn't load." />}>
      {input.kind === 'films' ? (
        <Loaded kind="films" props={{ ...input.props, initialFilmId: film, embedded: true }} />
      ) : input.kind === 'extended' ? (
        <Loaded kind="extended" props={{ ...input.props, embedded: true }} />
      ) : (
        <Loaded {...input} />
      )}
    </ChunkBoundary>
  ) : (
    fallback
  );
  return (
    <div
      ref={root}
      data-collection-extras={input.kind}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement) {
          focusedFilm.current =
            event.target.id === 'collection-films-title' ? 'heading' : (event.target.dataset.filmId ?? null);
        }
        setRequested(true);
      }}
    >
      {input.kind === 'films' ? (
        <section
          id="collection-films"
          className="collection-films"
          aria-labelledby="collection-films-title"
          aria-busy={requested && !Loaded && !failed}
        >
          <div className="films-heading">
            <h2 id="collection-films-title" tabIndex={-1}>
              Watch films
            </h2>
            <p>Short tours. Play only when you choose.</p>
          </div>
          {body}
        </section>
      ) : input.kind === 'extended' ? (
        <section
          className="extended-results discovery-extended"
          aria-labelledby="extended-results-title"
          aria-busy={requested && !Loaded && !failed}
        >
          <div className="extended-heading">
            <h2 id="extended-results-title" tabIndex={-1}>
              Beyond The 100
            </h2>
            <span>
              {input.props.records.length} {input.props.records.length === 1 ? 'match' : 'matches'}
              {input.props.online.loading ? ' so far' : ''}
            </span>
          </div>
          {body}
        </section>
      ) : (
        body
      )}
    </div>
  );
}

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
  onOpen: (id: string, origin?: MotionOriginHint) => void;
  onPreview: (record: LibraryRecord, origin?: MotionOriginHint) => void;
  onShare: () => void;
  onFullLibrary: () => void;
  notify: (message: string) => void;
  onPin?: (record: LibraryRecord) => void;
  pinnedIds?: ReadonlySet<string>;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
  comparisonTray?: ReactNode;
}

export default function CollectionPage({
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
  renderDragHandle,
  comparisonTray,
}: CollectionPageProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [browseRequest, setBrowseRequest] = useState(0);
  const handledBrowseRequest = useRef(0);
  const collectionRef = useRef<HTMLElement>(null);
  const appendedFocus = useRef<{ id: string; signature: string; trigger: HTMLButtonElement } | null>(null);
  const games = collection.data?.games;
  const ownership = useMemo(() => catalogOwnership(state.records), [state.records]);
  const progress = useMemo(() => catalogProgress(state, ownership), [state, ownership]);
  const onlineScope = filters.tier === 'all' && filters.list !== 'later' && effectiveProgressFilter(filters) === 'all';
  const online = useExtendedSearch(filters.q, Boolean(games) && onlineScope && filters.catalogs === 'on', games ?? []);
  const onlineIds = useMemo(() => new Set(online.records.map((record) => record.id)), [online.records]);
  const results = useMemo(
    () => filterGames(games ?? [], filters, progress, onlineIds),
    [games, filters, progress, onlineIds],
  );
  const extras = useMemo(
    () => unrankedRecords(games ?? [], state.records, online.records),
    [games, state.records, online.records],
  );
  const extraResults = useMemo(
    () => filterUnranked(extras, filters, state.progress, onlineIds),
    [extras, filters, state.progress, onlineIds],
  );
  const resultRecords = useMemo(() => [...results.map(recordFromGame), ...extraResults], [results, extraResults]);
  const currentSelection = useMemo(
    () => new Set(resultRecords.filter((record) => selected.has(record.id)).map((record) => record.id)),
    [resultRecords, selected],
  );
  const showExtended = extraResults.length > 0 || online.eligible;
  const additions = useMemo(() => unrankedRecords(games ?? [], state.records, []), [games, state.records]);
  const signature = createSearch(filters);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setSelected(new Set());
  }, [signature]);
  useLayoutEffect(() => {
    const requested = appendedFocus.current;
    if (!requested) return;
    appendedFocus.current = null;
    if (
      requested.signature !== signature ||
      (document.activeElement !== requested.trigger && document.activeElement !== document.body)
    )
      return;
    const title = collectionRef.current?.querySelector<HTMLAnchorElement>(
      `[data-game="${CSS.escape(requested.id)}"] ${filters.view === 'table' ? '.table-game a' : '.game-link'}`,
    );
    if (!title) return;
    title.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    title.focus({ preventScroll: true });
  }, [visibleCount, signature, filters.view]);
  useEffect(() => {
    if (collection.status === 'loading' || location.hash !== '#collection-films') return;
    const frame = requestAnimationFrame(() => {
      document.getElementById('collection-films')?.scrollIntoView({ behavior: 'instant' });
      document.getElementById('collection-films-title')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [collection.status]);
  const { savedCount, completedCount } = useMemo(
    () => ({
      savedCount: Object.values(state.progress).filter((progress) => progress.later).length,
      completedCount: Object.values(state.progress).filter((progress) => progress.completed).length,
    }),
    [state.progress],
  );
  useLayoutEffect(() => {
    if (browseRequest === handledBrowseRequest.current) return;
    handledBrowseRequest.current = browseRequest;
    scrollCollectionIntoView(animate ? 'smooth' : 'instant');
  }, [browseRequest, animate]);
  const browse = () => setBrowseRequest((request) => request + 1);
  const toggle = (id: string, key: 'later' | 'completed' | 'played', value?: boolean) => {
    const game = games?.find((candidate) => candidate.slug === id);
    if (game) {
      const record = catalogActionRecord(recordFromGame(game), ownership);
      void onAction(
        value === undefined
          ? { type: 'toggle-progress', record, key }
          : { type: 'set-progress', records: [record], key, value },
      );
    }
  };
  const toggleSelection = (id: string) =>
    setSelected((prior) => {
      const next = new Set(prior);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulk = async (action: SelectionAction) => {
    const records = resultRecords
      .filter((record) => currentSelection.has(record.id))
      .map((record) => catalogActionRecord(record, ownership));
    if (!records.length) {
      notify('Select a matching game before applying a bulk action.');
      return;
    }
    const change = selectionOperation(action, records);
    if (await onAction(change)) setSelected(new Set());
  };
  const pick = () => {
    const candidates = pickCandidates(resultRecords, progress, filters);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    if (chosen && chosen.collectionRank !== null) onOpen(chosen.id);
    else if (chosen) onPreview(chosen);
    else
      notify(
        resultRecords.length
          ? 'You have completed every game in this view. Change a filter to discover more.'
          : 'No loaded games match this view. Reset filters for a fresh pick.',
      );
  };
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
                <button className="button button-quiet" onClick={pick} disabled={!games}>
                  <Icon name="shuffle" width="19" height="19" />
                  Pick for me
                </button>
              </Magnet>
            </div>
            <p className="hero-footnote">
              <span className="collection-dot" />
              The Core 50. And 50 more essentials.
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
                  This cached collection does not include {author.shortName}'s original ratings yet. No substitute
                  values are shown.
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
                    {results.slice(0, visibleCount).map((game, index) => {
                      const actionRecord = catalogActionRecord(recordFromGame(game), ownership);
                      return (
                        <GameCard
                          key={game.slug}
                          game={game}
                          filters={filters}
                          state={progress[game.slug]}
                          onOpen={onOpen}
                          onSave={(id) => toggle(id, 'later')}
                          onPlayed={(id, value) => toggle(id, 'played', value)}
                          onCompleted={(id, value) => toggle(id, 'completed', value)}
                          eager={index < 4}
                          selecting={selecting}
                          selected={selected.has(game.slug)}
                          onSelect={toggleSelection}
                          busy={busy}
                          compareRecord={onPin ? actionRecord : undefined}
                          savedCopies={
                            <SavedCatalogCopies
                              canonicalId={game.slug}
                              copies={ownership.get(game.slug)}
                              onOpen={onPreview}
                            />
                          }
                          compareActions={
                            onPin && (
                              <>
                                <ComparePinButton record={actionRecord} compact disabled={busy} />
                                {renderDragHandle?.(actionRecord)}
                              </>
                            )
                          }
                        />
                      );
                    })}
                  </ul>
                )}
                <div className="collection-end">
                  <p>
                    {results.length > 1 ? 'Showing ' : ''}
                    {formatResultRange(results.length, 1, Math.min(visibleCount, results.length))} from the 100
                  </p>
                  {visibleCount < results.length ? (
                    <button
                      className="button button-outline"
                      onClick={(event) => {
                        const next = results[visibleCount];
                        appendedFocus.current =
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
                    ? 'Tap a bookmark on any game to save it for later. Your full queue can also include games from other catalogs.'
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
                    renderDragHandle,
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
      <DeferredCollection near input={{ kind: 'films', props: { postersReady: collection.status !== 'loading' } }} />
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
            OFFLINE.
            <br />
            STILL ON YOUR LIST.
          </h2>
          <p>
            Take all 100 with you. The enhanced workbook keeps the original order, complete score snapshots and notes in
            one filterable collection.
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
  );
}

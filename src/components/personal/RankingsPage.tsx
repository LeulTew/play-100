import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { Icon } from '../Icon';
import ReorderList from './ReorderList';
import AddGamesPanel from './AddGamesPanel';
import type { AddGamesPanelState } from './AddGamesPanel';
import type { ProgressFilter } from '../../lib/game-progress';
import { RemoveRankingDialog } from './RemoveRankingDialog';
import { formatResultRange } from '../../lib/local-pagination';
import { LocalPager } from '../LocalPager';
import { RANKING_PAGE_SIZE, useRankingsPage } from './useRankingsPage';
import { RankingRow } from './RankingRow';
import './my-games.css';
import './ranking-safety.css';

export interface RankingViewState {
  searchInput: string;
  query: string;
  offset: number;
  picker?: AddGamesPanelState;
}

export interface RankingsPageProps {
  state: PersonalLibraryState;
  availableRecords: LibraryRecord[];
  busy: boolean;
  persistent: boolean;
  animate: boolean;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onOpen: (id: string) => void;
  onDiscover: () => void;
  onPublish?: () => void;
  embedded?: boolean;
  active?: boolean;
  completedOnly?: boolean;
  progressFilter?: ProgressFilter;
  onClearProgress?: () => void;
  onPin?: (record: LibraryRecord) => void;
  onUnpin?: (id: string) => void;
  pinnedIds?: ReadonlySet<string>;
  viewState?: RankingViewState;
  onViewStateChange?: (state: RankingViewState) => void;
}

export default function RankingsPage(props: RankingsPageProps) {
  const {
    state,
    availableRecords,
    busy,
    persistent,
    animate,
    onAction,
    onOpen,
    onDiscover,
    onPublish,
    embedded = false,
    active = true,
    onClearProgress,
    onPin,
    onUnpin,
    pinnedIds,
  } = props;
  const {
    mode,
    view,
    searchInput,
    updateView,
    changing,
    error,
    searchHeld,
    search,
    showFullRanking,
    removal,
    setRemoval,
    rankingById,
    rankedIds,
    records,
    page,
    visibleRecords,
    artwork,
    results,
    heading,
    changePage,
    move,
    applyRatingOrder,
    editorBusy,
    canReorder,
    manualCount,
    removalCurrent,
  } = useRankingsPage(props);
  return (
    <section className={embedded ? 'my-games-editor' : 'app-page'} aria-labelledby="rankings-title">
      <div className={embedded ? 'my-games-ranking-heading' : 'page-heading'}>
        <div>
          {embedded ? (
            <h2 id="rankings-title" className="sr-only">
              Ranking
            </h2>
          ) : (
            <h1 id="rankings-title" data-page-heading tabIndex={-1}>
              My rankings
            </h1>
          )}
        </div>
        <div className="ranking-sharing">
          <div className="private-label">
            <Icon name="bookmark" width="17" height="17" />
            {persistent
              ? mode.scope === 'guest'
                ? 'Private · saved on this device'
                : mode.label
              : 'Private · temporary tab data'}
          </div>
          {onPublish && (
            <button className="text-button" onClick={onPublish}>
              <Icon name="share" width="18" height="18" />
              Publish a ranking
            </button>
          )}
        </div>
      </div>
      <AddGamesPanel
        records={availableRecords}
        ownedRecords={state.records}
        existingIds={rankedIds}
        onAdd={(recordsToAdd) => onAction({ type: 'add-ranking', records: recordsToAdd })}
        onDiscover={onDiscover}
        busy={editorBusy}
        viewState={view.picker}
        onViewStateChange={(picker) => updateView({ picker })}
      />
      {state.ranking.length > 0 && (
        <>
          <div className="ranking-order-info">
            <div className="ranking-order-copy">
              <p>
                <strong>
                  {manualCount
                    ? `${manualCount} fixed ${manualCount === 1 ? 'position' : 'positions'}.`
                    : 'Highest ratings first.'}
                </strong>{' '}
                {manualCount ? 'Other games follow ratings.' : 'Unrated last, not zero.'}{' '}
                {!canReorder && 'Clear search and filters to reorder.'}
              </p>
              <details className="ranking-order-help">
                <summary>How ranking order works</summary>
                <p>
                  Games without a fixed position follow scores, highest first. Unrated comes last, not zero. Drag or use
                  arrows to set a position when search and filters are clear. Manual positions stay fixed until you
                  choose Use rating order for a game or for all. Scores save automatically. Ranking or rating never
                  marks a game played. Drag within this page, or use the arrows to move across pages.
                </p>
              </details>
            </div>
            {manualCount > 0 && (
              <button className="button button-outline" disabled={editorBusy} onClick={() => applyRatingOrder()}>
                Use rating order for all
              </button>
            )}
          </div>
          <div className="personal-tools">
            <div className="search-field">
              <Icon name="search" />
              <label className="sr-only" htmlFor="ranking-search">
                Search your ranking
              </label>
              <input
                id="ranking-search"
                type="search"
                value={searchInput}
                onChange={(event) => search(event.target.value)}
                placeholder="Find a game in your ranking…"
              />
            </div>
            <span className="section-help" role="status">
              {' '}
              {searchHeld ? (
                'Search waits for your unsaved edit. Fix the highlighted field or retry.'
              ) : (
                <>
                  {records.length} ranked {records.length === 1 ? 'game' : 'games'} in this view
                </>
              )}
            </span>
          </div>
        </>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div ref={results} className="ranking-results-boundary">
        <h3 ref={heading} tabIndex={-1}>
          Your ranking results
        </h3>
        <p role="status" aria-atomic="true" className={page.pageCount > 1 ? 'sr-only' : 'section-help'}>
          {records.length > 1 ? 'Showing ' : ''}
          {formatResultRange(records.length, page.start, page.end, 'ranked game')}
        </p>
        <LocalPager
          label="Ranking pages"
          itemLabel="ranked game"
          total={records.length}
          offset={page.offset}
          pageSize={RANKING_PAGE_SIZE}
          disabled={!active || changing}
          onOffsetChange={changePage}
        />
        {visibleRecords.length ? (
          <ReorderList
            records={visibleRecords}
            kind="ranking"
            canReorder={canReorder}
            busy={editorBusy}
            animate={animate}
            positionFor={(id) => rankingById.get(id)?.position ?? null}
            totalItems={state.ranking.length}
            neighborsFor={(id) => {
              const position = rankingById.get(id)?.position ?? 0;
              return { previous: state.ranking[position - 2]?.id, next: state.ranking[position]?.id };
            }}
            onMove={(id, overId, direction) => {
              void move(id, overId, direction);
            }}
          >
            {(record) => {
              const entry = rankingById.get(record.id)?.entry;
              if (!entry) return null;
              return (
                <RankingRow
                  key={record.id}
                  record={record}
                  artwork={artwork.get(record.id)}
                  entry={entry}
                  played={Boolean(state.progress[record.id]?.played)}
                  completed={Boolean(state.progress[record.id]?.completed)}
                  busy={editorBusy}
                  active={active}
                  onOpen={onOpen}
                  onAction={onAction}
                  position={rankingById.get(record.id)?.position ?? 1}
                  total={state.ranking.length}
                  canReorder={canReorder}
                  onMoveToPosition={(position) => move(record.id, position)}
                  onUseRatingOrder={() => applyRatingOrder(record.id)}
                  onRemove={() => setRemoval({ record, scope: mode.scope })}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  pinned={pinnedIds?.has(record.id)}
                />
              );
            }}
          </ReorderList>
        ) : (
          <div className="empty-state">
            <Icon name="rank" width="43" height="43" />
            <h2>{state.ranking.length ? 'No matches' : 'No ranked games yet'}</h2>
            <p>
              {state.ranking.length
                ? 'Clear search or change the progress filter.'
                : 'Open Add games to start. You can rank games you have not played.'}
            </p>
            {state.ranking.length > 0 && (
              <button
                className="button button-dark"
                onClick={() => {
                  showFullRanking();
                  onClearProgress?.();
                }}
              >
                Show my full ranking
              </button>
            )}
          </div>
        )}
      </div>
      {!persistent && (
        <p className="personal-storage-footnote" role="alert">
          <strong>Device storage is unavailable.</strong> Export these temporary changes from Settings before closing
          this tab.
        </p>
      )}
      {removal && removalCurrent && (
        <RemoveRankingDialog
          key={`${removal.scope}:${removal.record.id}`}
          record={removal.record}
          state={state}
          busy={busy}
          onAction={onAction}
          onClose={() => setRemoval(null)}
        />
      )}
    </section>
  );
}

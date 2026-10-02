import type { Filters } from '../../lib/types';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { SelectionBar } from '../SelectionBar';
import ReorderList from './ReorderList';
import ManualGameForm from './ManualGameForm';
import { progressFilterPatch } from '../../lib/game-progress';
import type { ProgressFilter } from '../../lib/game-progress';
import { RemoveGamesDialog } from './RemoveGamesDialog';
import { LocalPager } from '../LocalPager';
import { formatResultRange } from '../../lib/local-pagination';
import { LIBRARY_PAGE_SIZE, useLibraryPage } from './useLibraryPage';
import { LibraryRecordRow } from './LibraryRecordRow';
import './library-pagination.css';

export interface LibraryPageProps {
  state: PersonalLibraryState;
  filters: Filters;
  busy: boolean;
  animate: boolean;
  onFilters: (patch: Partial<Filters>, method?: 'push' | 'replace') => void;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onOpen: (id: string, opener?: HTMLElement) => void;
  onDiscover: () => void;
  onBrowse: () => void;
  onPresentationChange: (commit: () => void) => Promise<boolean>;
  embedded?: boolean;
  active?: boolean;
  workspaceView?: 'library' | 'queue';
  completedOnly?: boolean;
  progressFilter?: ProgressFilter;
  onPin?: (record: LibraryRecord) => void;
  onUnpin?: (id: string) => void;
  pinnedIds?: ReadonlySet<string>;
}

export default function LibraryPage(props: LibraryPageProps) {
  const {
    state,
    filters,
    busy,
    animate,
    onFilters,
    onAction,
    onDiscover,
    onBrowse,
    embedded = false,
    active = true,
    workspaceView,
  } = props;
  const {
    selecting,
    setSelecting,
    selected,
    setSelected,
    query,
    setQuery,
    removing,
    setRemoving,
    tab,
    progressView,
    records,
    page,
    visibleRecords,
    artwork,
    selectedRecords,
    pendingEdits,
    moving,
    moveError,
    queuePositions,
    rankedIds,
    pageBoundary,
    resultsHeading,
    queueResults,
    canReorder,
    move,
    changePage,
    requestRemoval,
    removeFromQueue,
    removeRecords,
    filtered,
    firstRunEmpty,
    clearView,
    toggleSelected,
    bulkAction,
    completedCount,
  } = useLibraryPage(props);
  const renderRecord = (record: LibraryRecord) => (
    <LibraryRecordRow
      {...props}
      record={record}
      artwork={artwork.get(record.id)}
      active={active}
      selecting={selecting}
      selected={selected.has(record.id)}
      ranked={rankedIds.has(record.id)}
      tab={tab}
      onSelect={toggleSelected}
      requestRemoval={requestRemoval}
      removeFromQueue={removeFromQueue}
    />
  );
  return (
    <section className={embedded ? 'my-games-editor' : 'app-page'} aria-labelledby="library-title">
      {embedded ? (
        <h2 id="library-title" className="sr-only">
          {workspaceView === 'queue' ? 'Play later' : 'Library'}
        </h2>
      ) : (
        <div className="page-heading">
          <div>
            <h1 id="library-title" tabIndex={-1} data-page-heading>
              My library
            </h1>
          </div>
          <button className="button button-dark" onClick={onDiscover}>
            <Icon name="plus" width="18" height="18" />
            Find more games
          </button>
        </div>
      )}
      {!embedded && (
        <div className="personal-tabs" role="group" aria-label="Personal library views">
          <button
            aria-label={`Play later, ${state.queueOrder.length}`}
            aria-pressed={tab === 'later'}
            onClick={() => onFilters({ list: 'later', q: '' })}
          >
            Play later <span>{state.queueOrder.length}</span>
          </button>
          <button
            aria-label={`Completed, ${completedCount}`}
            aria-pressed={tab === 'completed'}
            onClick={() => onFilters({ list: 'completed', q: '' })}
          >
            Completed <span>{completedCount}</span>
          </button>
          <button
            aria-label={`All my games, ${Object.keys(state.records).length}`}
            aria-pressed={tab === 'all'}
            onClick={() => onFilters({ list: 'all', q: '' })}
          >
            All my games <span>{Object.keys(state.records).length}</span>
          </button>
        </div>
      )}
      {!firstRunEmpty && (
        <div className="personal-tools">
          <div className="search-field">
            <Icon name="search" />
            <label className="sr-only" htmlFor="library-search">
              {tab === 'later' ? 'Search Play later' : 'Search your library'}
            </label>
            <input
              id="library-search"
              type="search"
              placeholder={tab === 'later' ? 'Search Play later…' : 'Search your library…'}
              value={query}
              maxLength={160}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            className="button button-outline"
            onClick={() => {
              setSelecting((value) => !value);
              setSelected(new Set());
            }}
          >
            <Icon name="select" width="18" height="18" />
            {selecting ? 'Done selecting' : 'Select games'}
          </button>
        </div>
      )}
      {progressView !== 'all' && (
        <p className="section-help" role="status">
          {records.length} {records.length === 1 ? 'game matches' : 'games match'} this progress view.{' '}
          <button className="text-button" onClick={() => onFilters(progressFilterPatch('all', filters))}>
            Clear progress filter
          </button>
        </p>
      )}
      {tab === 'later' && records.length > 0 && (
        <p className="queue-instructions">
          {canReorder
            ? 'Drag within this page, or use the arrows to move across pages.'
            : 'Clear search, progress filters and selection to reorder.'}
        </p>
      )}
      {tab === 'later' && pendingEdits && (
        <p className="section-help" role="status">
          Finish or retry your unsaved edit to update the Play later results.
        </p>
      )}
      {selecting && (
        <SelectionBar
          context="library"
          count={selectedRecords.length}
          total={records.length}
          busy={busy}
          selectAllLabel={`Select all ${records.length} matching ${records.length === 1 ? 'game' : 'games'}${page.pageCount > 1 ? ` (all ${page.pageCount} pages)` : ''}`}
          selectionHelp="Selection includes matching games on other pages. Changing filters or tabs clears it."
          onSelectAll={() => setSelected(new Set(records.map((record) => record.id)))}
          onClear={() => setSelected(new Set())}
          onAction={(action) => {
            void bulkAction(action);
          }}
          onRemove={() => requestRemoval(selectedRecords)}
        />
      )}
      <div ref={pageBoundary} className="library-results-boundary">
        <h3 ref={resultsHeading} tabIndex={-1}>
          {tab === 'later' ? 'Play later results' : 'Your library results'}
        </h3>
        <p className={page.pageCount > 1 ? 'sr-only' : 'library-results-count'} role="status" aria-atomic="true">
          {records.length > 1 ? 'Showing ' : ''}
          {formatResultRange(
            records.length,
            page.start,
            page.end,
            tab === 'later' ? 'Play later game' : 'matching game',
          )}
        </p>
        <LocalPager
          total={records.length}
          pageSize={LIBRARY_PAGE_SIZE}
          offset={page.offset}
          disabled={tab === 'later' ? !active || moving : busy}
          label={tab === 'later' ? 'Play later pages' : 'Library pages'}
          itemLabel={tab === 'later' ? 'Play later game' : 'matching game'}
          onOffsetChange={changePage}
        />
      </div>
      {moveError && tab === 'later' && (
        <p className="inline-error" role="alert">
          {moveError}
        </p>
      )}
      {visibleRecords.length ? (
        tab === 'later' ? (
          <div ref={queueResults}>
            <ReorderList
              records={visibleRecords}
              kind="queue"
              canReorder={canReorder}
              busy={busy || moving}
              animate={animate}
              positionFor={(id) => queuePositions.get(id) ?? null}
              totalItems={state.queueOrder.length}
              neighborsFor={(id) => {
                const index = (queuePositions.get(id) ?? 0) - 1;
                return { previous: state.queueOrder[index - 1], next: state.queueOrder[index + 1] };
              }}
              onMove={(id, overId, direction) => {
                void move(id, overId, direction);
              }}
            >
              {renderRecord}
            </ReorderList>
          </div>
        ) : (
          <ul className="personal-records" aria-label="Your games">
            {visibleRecords.map((record) => (
              <li key={record.id} className="personal-row personal-row-static" data-record-id={record.id}>
                <div className="record-content">{renderRecord(record)}</div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="empty-state">
          <Icon name={tab === 'completed' ? 'check' : 'bookmark'} width="42" height="42" />
          <h2>{filtered ? 'No matches' : tab === 'later' ? 'Play later is empty' : 'No games yet'}</h2>
          <p>
            {filtered
              ? 'Try another progress filter or clear your search. Your saved games are unchanged.'
              : tab === 'later'
                ? 'Choose Play later on a game to add it here.'
                : 'Add games from The 100 or Discover, or choose Add a game manually below.'}
          </p>
          <div className="button-row">
            <button className="button button-dark" onClick={filtered ? clearView : onBrowse}>
              {filtered ? 'Clear search and progress filter' : 'Choose from The 100'}
            </button>
            <button className="button button-outline" onClick={onDiscover}>
              Discover more games
            </button>
          </div>
        </div>
      )}
      <LocalPager
        total={records.length}
        pageSize={LIBRARY_PAGE_SIZE}
        offset={page.offset}
        disabled={tab === 'later' ? !active || moving : busy}
        label={tab === 'later' ? 'Play later pages, end of list' : 'Library pages, end of list'}
        itemLabel={tab === 'later' ? 'Play later game' : 'matching game'}
        onOffsetChange={changePage}
      />
      <ManualGameForm
        busy={busy}
        actionLabel={tab === 'later' ? 'Add to Play later' : 'Add to My games'}
        onAdd={(record) =>
          onAction(
            tab === 'later'
              ? { type: 'set-progress', records: [record], key: 'later', value: true }
              : { type: 'add-records', records: [record] },
          )
        }
      />
      {removing.length > 0 && (
        <RemoveGamesDialog
          records={removing}
          state={state}
          busy={busy}
          onClose={() => setRemoving([])}
          onRemove={removeRecords}
        />
      )}
    </section>
  );
}

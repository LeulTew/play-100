import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LibraryRecord, PersonalAction, PersonalLibraryState, PersonalRanking } from '../../lib/personal-types';
import { searchText } from '../../lib/collection';
import { Icon } from '../Icon';
import { RecordIdentity } from './RecordIdentity';
import ReorderList from './ReorderList';
import AddGamesPanel from './AddGamesPanel';
import type { AddGamesPanelState } from './AddGamesPanel';
import { PlayedToggle } from '../PlayedToggle';
import { CompletedToggle } from '../CompletedToggle';
import { matchesProgress } from '../../lib/game-progress';
import type { ProgressFilter } from '../../lib/game-progress';
import { PersonalRatingInput } from './PersonalRatingInput';
import { RemoveRankingDialog } from './RemoveRankingDialog';
import { CompareDragSource } from '../compare-tray/CompareDragSource';
import { flushPendingEdits, hasPendingEdits, useExitSave, usePendingEdits } from '../../hooks/useExitSave';
import { useLibraryMode } from '../../lib/library-mode';
import { useNavigationScope } from '../../hooks/useNavigationScope';
import { focusPendingEditor } from '../../lib/dialog-focus';
import { getLocalPage } from '../../lib/local-pagination';
import { LocalPager } from '../LocalPager';
import './my-games.css';
import './ranking-safety.css';

const RANKING_PAGE_SIZE = 25;

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
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
  viewState?: RankingViewState;
  onViewStateChange?: (state: RankingViewState) => void;
}

export default function RankingsPage({
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
  completedOnly = false,
  progressFilter,
  onClearProgress,
  onPin,
  onUnpin,
  pinnedIds,
  renderDragHandle,
  viewState,
  onViewStateChange,
}: RankingsPageProps) {
  const mode = useLibraryMode();
  const [localView, setLocalView] = useState<RankingViewState>({ searchInput: '', query: '', offset: 0 });
  const view = viewState ?? localView;
  const { searchInput, query } = view;
  const latestView = useRef(view);
  latestView.current = view;
  const updateView = useCallback(
    (patch: Partial<RankingViewState>) => {
      const next = { ...latestView.current, ...patch };
      latestView.current = next;
      if (onViewStateChange) onViewStateChange(next);
      else setLocalView(next);
    },
    [onViewStateChange],
  );
  const mounted = useRef(true);
  const current = useRef({ active, state });
  current.current = { active, state };
  const { captureFocusGuard } = useNavigationScope(mode.scope);
  const [changing, setChanging] = useState(false);
  const command = useRef(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<{ target: HTMLElement | null; isCurrent: () => boolean } | null>(null);
  const [followMove, setFollowMove] = useState<{
    id: string;
    position: number | null;
    manualBefore: number | null;
    offset: number;
    revision: number;
    isCurrent: () => boolean;
  } | null>(null);
  const results = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterPage = useRef(false);
  const wasActive = useRef(active);
  const [searchHeld, setSearchHeld] = useState(searchInput !== query);
  const searchRequest = useRef(0);
  const pendingEdits = usePendingEdits();
  // A narrower search can unmount a row whose rating or note has not saved, so it waits for that save.
  const search = (value: string) => {
    const request = ++searchRequest.current;
    updateView({ searchInput: value });
    if (!hasPendingEdits()) {
      updateView({ query: value, offset: 0 });
      setSearchHeld(false);
      return;
    }
    const isCurrent = captureFocusGuard();
    flushPendingEdits().then(
      (saved) => {
        if (!mounted.current || !current.current.active || !isCurrent() || request !== searchRequest.current) return;
        if (saved) updateView({ query: value, offset: 0 });
        setSearchHeld(!saved);
      },
      (cause: unknown) => {
        console.error(
          'Ranking search could not save a pending edit.',
          cause instanceof Error ? cause.message : 'Unknown editor failure.',
        );
        if (mounted.current && isCurrent() && request === searchRequest.current) setSearchHeld(true);
      },
    );
  };
  const showFullRanking = () => {
    searchRequest.current += 1;
    updateView({ searchInput: '', query: '', offset: 0 });
    setSearchHeld(false);
  };
  useEffect(() => {
    if (active && searchHeld && !pendingEdits) {
      setSearchHeld(false);
      updateView({ query: searchInput, offset: 0 });
    }
  }, [active, searchHeld, pendingEdits, searchInput, updateView]);
  const [removal, setRemoval] = useState<{ record: LibraryRecord; scope: string } | null>(null);
  const progressView = progressFilter ?? (completedOnly ? 'completed' : 'all');
  const rankingById = useMemo(
    () => new Map(state.ranking.map((entry, index) => [entry.id, { entry, position: index + 1 }])),
    [state.ranking],
  );
  const rankedIds = useMemo(() => new Set(state.ranking.map((entry) => entry.id)), [state.ranking]);
  const records = useMemo(() => {
    const term = searchText(query);
    return state.ranking.flatMap((entry) => {
      const record = state.records[entry.id];
      if (
        !record ||
        !matchesProgress(state.progress[entry.id], progressView) ||
        !searchText(record.title).includes(term)
      )
        return [];
      return [record];
    });
  }, [state, query, progressView]);
  const page = getLocalPage(records.length, RANKING_PAGE_SIZE, view.offset);
  const priorProgress = useRef(progressView);
  const visible = useRef<LibraryRecord[]>([]);
  // A score can reorder its row while another field is still dirty. Keep this bounded page
  // mounted until all pending edits settle, rather than evicting an unsaved editor.
  if (!pendingEdits || visible.current.length === 0) {
    visible.current = records.slice(page.offset, page.offset + RANKING_PAGE_SIZE);
  }
  useEffect(() => {
    if (!active || pendingEdits) return;
    const offset = priorProgress.current !== progressView ? 0 : page.offset;
    priorProgress.current = progressView;
    if (view.offset !== offset) updateView({ offset });
  }, [active, pendingEdits, progressView, page.offset, view.offset, updateView]);
  useLayoutEffect(() => {
    if (active && !wasActive.current && pendingEdits) {
      focusPendingEditor(results.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? null);
    }
    wasActive.current = active;
  }, [active, pendingEdits]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchRequest.current += 1;
    };
  }, []);
  useLayoutEffect(() => {
    if (busy || changing || !recovery) return;
    if (recovery.isCurrent()) focusPendingEditor(recovery.target);
    setRecovery(null);
  }, [busy, changing, recovery]);
  useLayoutEffect(() => {
    if (!active || busy || changing) return;
    if (followMove) {
      if (!followMove.isCurrent()) {
        setFollowMove(null);
        return;
      }
      const moved = rankingById.get(followMove.id);
      if (state.revision <= followMove.revision || !moved) return;
      if (
        followMove.position === null
          ? moved.entry.manualPosition === followMove.manualBefore
          : moved.entry.manualPosition !== followMove.position
      ) {
        return;
      }
      const offset = Math.floor((moved.position - 1) / RANKING_PAGE_SIZE) * RANKING_PAGE_SIZE;
      if (offset === followMove.offset) {
        setFollowMove(null);
        return;
      }
      if (page.offset !== offset) {
        updateView({ offset });
        return;
      }
      const title = results.current?.querySelector<HTMLElement>(
        `[data-record-id="${CSS.escape(followMove.id)}"] .record-title`,
      );
      if (!title) return;
      focusPendingEditor(title);
      setFollowMove(null);
    } else if (focusAfterPage.current) {
      focusAfterPage.current = false;
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [active, busy, changing, followMove, state.revision, rankingById, page.offset, pendingEdits, updateView]);
  const change = async (work: (isCurrent: () => boolean) => Promise<boolean> | boolean) => {
    if (!active || busy || command.current) return false;
    const scopeAndNavigation = captureFocusGuard();
    const inputAtStart = latestView.current.searchInput;
    const searchAtStart = searchRequest.current;
    const isCurrent = () =>
      mounted.current &&
      current.current.active &&
      scopeAndNavigation() &&
      searchRequest.current === searchAtStart &&
      latestView.current.searchInput === inputAtStart;
    command.current = true;
    setChanging(true);
    setError('');
    setRecovery(null);
    try {
      const saved = await flushPendingEdits((target) => {
        if (isCurrent()) setRecovery({ target, isCurrent });
      });
      if (!isCurrent()) return false;
      if (!saved) {
        setError('Your edit has not saved. Correct the highlighted field or retry before changing this ranking.');
        return false;
      }
      return await work(isCurrent);
    } catch (cause) {
      console.error('The Ranking change could not finish.', cause);
      if (isCurrent()) setError('The ranking could not be changed. Your current view is still open; retry.');
      return false;
    } finally {
      command.current = false;
      if (mounted.current) setChanging(false);
    }
  };
  const changePage = (offset: number) => {
    void change(() => {
      updateView({ offset: getLocalPage(records.length, RANKING_PAGE_SIZE, offset).offset });
      focusAfterPage.current = true;
      return true;
    });
  };
  const move = (id: string, destination: string | number) =>
    change(async (isCurrent) => {
      const ranking = current.current.state.ranking;
      const from = ranking.findIndex((entry) => entry.id === id);
      const to =
        typeof destination === 'number' ? destination - 1 : ranking.findIndex((entry) => entry.id === destination);
      const target = ranking[to];
      if (from < 0 || !target || !Number.isInteger(to)) {
        setError('That ranking position is no longer available. Choose a current position and retry.');
        return false;
      }
      if (from === to && typeof destination !== 'number') return true;
      const revision = current.current.state.revision;
      const saved = await onAction(
        typeof destination === 'number'
          ? { type: 'move-item', list: 'ranking', id, position: destination }
          : { type: 'move-item', list: 'ranking', id, overId: target.id },
      );
      if (!isCurrent()) return false;
      if (!saved) {
        setError('The position could not be saved. Your ranking has not moved; retry.');
        return false;
      }
      setFollowMove({
        id,
        position: typeof destination === 'number' ? destination : null,
        manualBefore: ranking[from]?.manualPosition ?? null,
        offset: page.offset,
        revision,
        isCurrent,
      });
      return true;
    });
  const applyRatingOrder = (id?: string) => {
    void change(async (isCurrent) => {
      const saved = await onAction(id ? { type: 'use-rating-order', id } : { type: 'use-rating-order' });
      if (isCurrent() && !saved) setError('Rating order could not be saved. Your current order is unchanged; retry.');
      return saved;
    });
  };
  const editorBusy = busy || changing;
  const canReorder = !query && !searchInput && progressView === 'all';
  const manualCount = state.ranking.filter((entry) => entry.manualPosition !== null).length;
  const removalCurrent =
    removal !== null &&
    active &&
    removal.scope === mode.scope &&
    state.records[removal.record.id]?.title === removal.record.title &&
    rankedIds.has(removal.record.id);
  useEffect(() => {
    if (!removalCurrent) setRemoval(null);
  }, [removalCurrent]);
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
                  marks a game played. Drag and keyboard sorting stay on this page; move arrows and Move to position can
                  cross pages.
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
          Showing {page.start}–{page.end} of {records.length} ranked games
        </p>
        <LocalPager
          label="Ranking pages"
          itemLabel="ranked games"
          total={records.length}
          offset={page.offset}
          pageSize={RANKING_PAGE_SIZE}
          disabled={editorBusy}
          onOffsetChange={changePage}
        />
        {visible.current.length ? (
          <ReorderList
            records={visible.current}
            kind="ranking"
            canReorder={canReorder}
            busy={editorBusy}
            animate={animate}
            positionFor={(id) => rankingById.get(id)?.position ?? null}
            totalItems={state.ranking.length}
            neighborsFor={(id) => {
              const position = rankingById.get(id)?.position ?? 0;
              return {
                previous: state.ranking[position - 2]?.id,
                next: state.ranking[position]?.id,
              };
            }}
            onMove={(id, overId) => {
              void move(id, overId);
            }}
          >
            {(record) => {
              const entry = rankingById.get(record.id)?.entry;
              if (!entry) return null;
              return (
                <RankingRow
                  key={record.id}
                  record={record}
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
                  renderDragHandle={renderDragHandle}
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

function RankingRow({
  record,
  entry,
  played,
  completed,
  busy,
  active,
  onOpen,
  onAction,
  position,
  total,
  canReorder,
  onMoveToPosition,
  onUseRatingOrder,
  onRemove,
  onPin,
  onUnpin,
  pinned = false,
  renderDragHandle,
}: {
  record: LibraryRecord;
  entry: PersonalRanking;
  played: boolean;
  completed: boolean;
  busy: boolean;
  active: boolean;
  onOpen: (id: string) => void;
  onAction: (action: PersonalAction) => Promise<boolean>;
  position: number;
  total: number;
  canReorder: boolean;
  onMoveToPosition: (position: number) => Promise<boolean>;
  onUseRatingOrder: () => void;
  onRemove: () => void;
  onPin?: (record: LibraryRecord) => void;
  onUnpin?: (id: string) => void;
  pinned?: boolean;
  renderDragHandle?: (record: LibraryRecord) => ReactNode;
}) {
  const [note, setNote] = useState(entry.note);
  const [noteError, setNoteError] = useState('');
  const [noteEdited, setNoteEdited] = useState(false);
  const noteSaving = useRef<Promise<boolean> | null>(null);
  const noteEdits = useRef(0);
  const committedNote = useRef(-1);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!noteEdited) setNote(entry.note);
  }, [entry.note, noteEdited]);
  useEffect(() => {
    if (!noteEdited) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [noteEdited]);
  const saveNote = (): Promise<boolean> => {
    if (noteSaving.current) return noteSaving.current;
    if (!noteEdited || committedNote.current === noteEdits.current) return Promise.resolve(true);
    setNoteError('');
    if (note === entry.note) {
      committedNote.current = noteEdits.current;
      setNoteEdited(false);
      return Promise.resolve(true);
    }
    const version = noteEdits.current;
    const task = (async () => {
      if (await onAction({ type: 'edit-ranking', id: entry.id, note })) {
        if (version === noteEdits.current) {
          committedNote.current = version;
          setNoteEdited(false);
        }
        return version === noteEdits.current;
      }
      setNoteError('The note could not be saved. Keep this field open to retry or copy your text.');
      return false;
    })();
    noteSaving.current = task;
    void task.finally(() => {
      if (noteSaving.current === task) noteSaving.current = null;
    });
    return task;
  };
  useExitSave(() => (noteError ? Promise.resolve(false) : saveNote()), noteEdited, noteRef);
  return (
    <div className="ranking-row-content">
      <CompareDragSource record={record} disabled={!active}>
        {(binding) => (
          <div ref={binding.sourceRef} {...binding.surfaceProps} className="ranking-game-identity">
            <RecordIdentity record={record} onOpen={onOpen} compareDrag={binding} />
            {(onPin || renderDragHandle) && (
              <div className="ranking-compare-actions">
                {onPin && (
                  <button
                    className="text-button"
                    disabled={pinned && !onUnpin}
                    aria-pressed={onUnpin ? pinned : undefined}
                    aria-label={`${pinned && !onUnpin ? 'Pinned' : 'Pin'} for comparison: ${record.title}`}
                    onClick={() => {
                      if (pinned) onUnpin?.(record.id);
                      else onPin(record);
                    }}
                  >
                    <Icon name="stack" width="17" height="17" fill={pinned ? 'currentColor' : 'none'} />
                    {pinned && !onUnpin ? 'Pinned for comparison' : 'Pin for comparison'}
                  </button>
                )}
                {renderDragHandle?.(record)}
              </div>
            )}
          </div>
        )}
      </CompareDragSource>
      <PersonalRatingInput
        title={record.title}
        value={entry.score}
        busy={busy}
        onCommit={(score) => onAction({ type: 'edit-ranking', id: entry.id, score })}
      />
      <div className="played-check">
        <PlayedToggle
          id={record.id}
          title={record.title}
          played={played}
          completed={completed}
          busy={busy}
          onChange={(value) => {
            void onAction({ type: 'set-progress', records: [record], key: 'played', value });
          }}
        />
        <CompletedToggle
          title={record.title}
          completed={completed}
          busy={busy}
          onChange={(value) => {
            void onAction({ type: 'set-progress', records: [record], key: 'completed', value });
          }}
        />
      </div>
      <button className="icon-button" aria-label={`Remove ${record.title} from my ranking`} onClick={onRemove}>
        <Icon name="close" width="18" height="18" />
      </button>
      {entry.manualPosition !== null && (
        <div className="manual-rank">
          <span>Fixed at #{entry.manualPosition}</span>
          <button
            className="text-button"
            disabled={busy}
            aria-label={`Use rating order for ${record.title}`}
            onClick={onUseRatingOrder}
          >
            Use rating order
            <Icon name="rank" width="16" height="16" />
          </button>
        </div>
      )}
      <RankingPosition
        title={record.title}
        position={position}
        total={total}
        disabled={busy || !canReorder}
        onMove={onMoveToPosition}
      />
      <details className="ranking-note">
        <summary>
          {entry.note ? 'Your note' : 'Add a note'}
          <Icon name="plus" width="15" height="15" />
        </summary>
        <label htmlFor={`note-${entry.id}`} className="sr-only">
          Your note for {record.title}
        </label>
        <textarea
          ref={noteRef}
          id={`note-${entry.id}`}
          rows={3}
          maxLength={2000}
          value={note}
          disabled={busy}
          aria-invalid={Boolean(noteError)}
          aria-describedby={noteError ? `note-error-${entry.id}` : undefined}
          onChange={(event) => {
            noteEdits.current += 1;
            setNoteEdited(true);
            setNoteError('');
            setNote(event.target.value);
          }}
          onBlur={() => {
            // A recovered focus followed by another navigation attempt is not an explicit retry.
            if (!noteError) void saveNote();
          }}
          placeholder="Why this game belongs here…"
        />
        <span>Saves on exit. Not included in published rankings.</span>
      </details>
      {noteError && (
        <p id={`note-error-${entry.id}`} className="inline-error" role="alert">
          {noteError}
        </p>
      )}
    </div>
  );
}

function RankingPosition({
  title,
  position,
  total,
  disabled,
  onMove,
}: {
  title: string;
  position: number;
  total: number;
  disabled: boolean;
  onMove: (position: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const applying = useRef(false);
  useExitSave(
    () => {
      if (!draft || applying.current) return Promise.resolve(true);
      const details = input.current?.closest('details');
      if (details) details.open = true;
      setError('Apply this position or clear it before leaving the editor.');
      return Promise.resolve(false);
    },
    Boolean(draft),
    input,
  );
  useEffect(() => {
    if (!draft) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [draft]);
  return (
    <details className="ranking-position-control">
      <summary>Move to position</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = Number(draft);
          if (!Number.isInteger(next) || next < 1 || next > total) {
            setError(`Choose a position from 1 to ${total}.`);
            return;
          }
          setError('');
          applying.current = true;
          void onMove(next).then((saved) => {
            applying.current = false;
            if (saved) setDraft('');
          });
        }}
      >
        <label>
          Position
          <input
            ref={input}
            type="number"
            min="1"
            max={total}
            step="1"
            aria-label={`Position for ${title}`}
            value={draft}
            placeholder={String(position)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            disabled={disabled}
            onChange={(event) => {
              setDraft(event.target.value);
              setError('');
            }}
          />
        </label>
        <button className="button button-outline" type="submit" disabled={disabled}>
          Move
        </button>
        {error && (
          <p id={errorId} className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
